// acciones-paquete.ts — el ensamblador del motor de acciones recomendadas
// (Fase 2, docs/brief_tecnico_motor_acciones.md §3, §5, §10 Fase 2).
//
// Construye el `PaqueteAcciones` (§3.2) que la Fase 3 le dará al modelo, y
// que esta fase persiste directo con CERO acciones (todavía no hay LLM).
//
// Arquitectura -- PURO, cero imports de Deno/Supabase, mismo patrón (y
// mismo motivo) que `hato-aggregation.ts`/`ganado-inventario.ts`/
// `priorizacion-scouting.ts`: este archivo se importa desde
// `src/__tests__/accionesPaquete.test.ts` (Vitest/Node), así que un import
// de `jsr:`/`npm:` aquí rompería `tsc`/Vitest para cualquier test que lo
// importe transitivamente (se intentó al escribir este archivo, ver el
// reporte de la sesión).
//   - `construirHechos*` reciben filas YA CONSULTADAS y devuelven
//     `Hecho[]` -- son las que prueba `accionesPaquete.test.ts` con filas
//     mock.
//   - `ensamblarPaquete` recibe un objeto `DependenciasEnsamblador`
//     (fetchers inyectables) -- así el test puede probar el AISLAMIENTO POR
//     NEGOCIO (un `try/catch` por negocio, §10 Fase 2) y la cota de §3.6
//     sin abrir una conexión real.
//   - El I/O real (consultas a Supabase) vive en un archivo HERMANO,
//     `acciones-paquete-io.ts` -- ese SÍ importa `jsr:@supabase/supabase-js@2`
//     como valor, y por eso NINGÚN test lo importa (mismo criterio que
//     `hato-alertas-tick.ts`/`hato-chequeo-commit.ts`: I/O puro, verificado
//     por inspección). `crearDependenciasSupabase`, exportada desde ese
//     archivo, es el único punto que conecta las dos mitades -- lo usa
//     `acciones-tick.ts`.
//
// R-5 / aislamiento del motor: el ensamblador (este archivo + su mitad de
// I/O) SÍ consulta la base -- es el data layer, §1.2 del brief lo
// distingue explícitamente de "el motor" (`acciones-motor.ts`, Fase 3, ese
// NO importa el cliente de Supabase). No hay ninguna llamada a un modelo
// aquí ni en `acciones-tick.ts` en esta fase -- ver el comentario de
// cabecera de ese archivo.
//
// Reutiliza, no reimplementa (instrucción explícita del encargo de esta
// sesión):
//   - `src/utils/accionesHechos.ts` (espejado aquí como `acciones-hechos.ts`)
//     para CADA constructor de `Hecho` -- este archivo nunca arma un `Hecho`
//     a mano.
//   - `hato-aggregation.ts`: `resolverEtapaEfectiva`/`categorizarAnimal`
//     (exportadas en esta misma sesión, ver su comentario) para no
//     reimplementar la resolución de etapa/categoría una tercera vez, y
//     `construirUmbralesCategoriaHatoDesdeFilas`.
//   - `calculos-hato.ts`: `derivarEstadoReproductivo`, `calcularProductividad`.
//   - `hato-config-desde-tabla.ts`: `construirHatoConfigDesdeFilas` (explota
//     si falta una clave -- nunca un default inventado, mismo contrato que
//     `hato-alertas-tick.ts`).
//   - `priorizacion-scouting.ts`: `priorizarMonitoreo`, `calcularCoberturaRonda`.
//   - `ganado-inventario.ts`: `buildGanadoInventorySummary`.
//
// -----------------------------------------------------------------------
// `agu.insumo_faltante` y la ruta `aplicaciones -> aplicaciones_mezclas ->
// aplicaciones_productos` (§3.3 bis): verificada contra `src/types/database.ts`
// (`aplicaciones_productos.mezcla_id` -- NO tiene `aplicacion_id` propio;
// `aplicaciones_mezclas.aplicacion_id` es el puente). La agregación por
// (aplicacion_id, producto_id) ANTES de comparar contra `productos.cantidad_actual`
// vive en `agregarNecesidadesPorProducto`, PURA y testeada aparte -- comparar
// mezcla a mezcla fabricaría faltantes que no existen (§3.3 bis).
//
// A-7(i) de `agu.insumo_faltante` (¿hay una compra en curso?): el brief pide
// cotejar `compras_productos`/`aplicaciones_lotes_compras` contra el catálogo
// VIVO antes de escribir esa consulta -- ninguna de las dos aparece en
// `src/types/database.ts`, y esta sesión no tiene acceso a
// `information_schema` en vivo (sin herramienta de Supabase MCP autenticada
// en este entorno; ver el reporte de la sesión). Por eso esta fase deja la
// guarda SIN POBLAR (`atendidoPorPorClave` nunca se pasa) en vez de adivinar
// la consulta -- exactamente la salida que el propio brief autoriza cuando
// no se puede verificar. `construirHechosInsumoFaltante` ya acepta ese
// parámetro como opcional para el día que se confirme la tabla.
// -----------------------------------------------------------------------

import type {
  Destino,
  DestinoId,
  Hecho,
  NegocioAccion,
  PaqueteAcciones,
} from './acciones-tipos.ts';
import {
  construirHechoAplicacionesColgadas,
  construirHechoCoberturaPesaje,
  construirHechoCoberturaRonda,
  construirHechoGanadoConcentracion,
  construirHechoGanadoFincasSinHa,
  construirHechoGanadoInventario,
  construirHechoGanadoVariacion30d,
  construirHechoJornalesSemana,
  construirHechoLitrosPorVaca,
  construirHechoLluviaConfianza,
  construirHechoProximasASecar,
  construirHechoRechequeoVencido,
  construirHechoRevisionPeriodica,
  construirHechoRondaEdad,
  construirHechoSecadoVencido,
  construirHechoServicios90d,
  construirHechoSinRaza,
  construirHechoTareaAtascada,
  construirHechoUltimoChequeo,
  construirHechoVaciasLargas,
  construirHechosAplicacionArranca,
  construirHechosInsumoFaltante,
  construirHechosPlaga,
  evaluarDisparo,
  type AnimalHatoParaAcciones,
  type EntradaSelectores,
  type FilaAplicacionArranca,
  type FilaAplicacionColgada,
  type FilaAplicacionInsumo,
  type FilaTareaAtascada,
  type GanadoInventarioParaAcciones,
  type PriorizacionEntryParaAcciones,
  type RevisionPeriodicaFila,
} from './acciones-hechos.ts';
import {
  categorizarAnimal,
  resolverEtapaEfectiva,
  construirUmbralesCategoriaHatoDesdeFilas,
  type HatoEstadoActualRow,
  type UmbralesCategoriaHato,
} from './hato-aggregation.ts';
import { derivarEstadoReproductivo, calcularProductividad, type HatoConfig } from './calculos-hato.ts';
import { construirHatoConfigDesdeFilas, type FilaHatoConfig } from './hato-config-desde-tabla.ts';
import {
  priorizarMonitoreo,
  calcularCoberturaRonda,
  type EventoFumigacion,
  type HistorialSublotePlaga,
  type PerfilEstacional,
  type SubloteEnAlcance,
  type UmbralEconomico,
} from './priorizacion-scouting.ts';
import {
  buildGanadoInventorySummary,
  type GanFincaRow,
  type GanInventarioRow,
  type GanMovimientoRow,
  type GanPotreroRow,
  type GanUbicacionRow,
} from './ganado-inventario.ts';

// ============================================================================
// Fecha Bogotá -- ver CLAUDE.md, "Hoy siempre en hora LOCAL, nunca UTC".
// Ese aviso deja los edge functions fuera de alcance porque ninguno
// necesitaba, hasta ahora, una fecha Bogotá EXPLÍCITA (Deno corre en UTC).
// Este handler sí la necesita: `acciones_corridas.fecha_referencia` y
// `PaqueteAcciones.fecha_referencia` son por contrato la fecha Bogotá del
// paquete (097, comentario de columna), no la fecha UTC del servidor.
// ============================================================================

const ZONA_BOGOTA = 'America/Bogota';

/** `AAAA-MM-DD` de "hoy" en Bogotá, sin importar en qué UTC corra el proceso. */
export function obtenerFechaHoyBogota(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_BOGOTA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}

/** ISO con offset `-05:00` literal -- Bogotá no tiene horario de verano
 *  (mismo criterio que 030/036/060: UTC-5 fijo todo el año). */
export function obtenerGeneradoAtBogota(ahora: Date = new Date()): string {
  const fecha = obtenerFechaHoyBogota(ahora);
  const hora = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA_BOGOTA,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(ahora);
  return `${fecha}T${hora}-05:00`;
}

/** Exportada para que `acciones-paquete-io.ts` (la mitad de I/O, ver el
 *  header del archivo) construya sus ventanas de consulta con la MISMA
 *  aritmética de calendario -- nunca una segunda implementación. */
export function sumarDiasISO(fechaISO: string, dias: number): string {
  const [y, m, d] = fechaISO.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

function diasEntreISO(desde: string, hasta: string): number {
  const [y1, m1, d1] = desde.split('-').map(Number);
  const [y2, m2, d2] = hasta.split('-').map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000);
}

function mensajeDeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ============================================================================
// §3.5 -- catálogo de destinos. TODAS las rutas verificadas contra
// `src/App.tsx` en esta sesión (no contra la fixture de `accionesAntiInvento`
// -- ver el reporte de la sesión: dos rutas de esa fixture eran de PRUEBA,
// no reales -- `/configuracion/ganado` no existe como *path* propio
// (`ConfiguracionDashboard` resuelve su pestaña "ganado" con estado de React,
// no con la URL) y `/inventario/producto/x` requeriría un `:id` real que
// este ensamblador no puede resolver de forma única -- ver la nota siguiente).
//
// `inv.producto`/`agu.tarea_detalle`/`agu.monitoreo_sublote` apuntan a la
// pantalla COMPLETA (sin filtrar), no al detalle de un registro específico
// -- exactamente lo que §3.5 autoriza para la Fase 2 ("el catálogo de la
// Fase 2 arranca con los destinos 'pantalla completa'"). Motivo técnico,
// no sólo el de producto: `Destino`/`accionesValidador.ts`/`accionesRender.ts`
// resuelven un destino por el PAR (`id`, `negocio`) -- un único registro por
// par, tal como ya lo explota `fin.presupuesto` (una fila por negocio). Si
// este ensamblador emitiera un `Destino` DISTINTO por cada aplicación/
// producto/tarea (para llevar un `:id` real en la ruta), habría VARIAS filas
// compartiendo el mismo (`id`,`negocio`) y tanto el validador como el
// renderizador sólo pueden resolver la PRIMERA -- el botón de una acción
// sobre "Magister" podría enlazar a la ficha de "Silicalmag". Es un hueco
// real del contrato §3.2/§3.5 (`Destino.ruta` es fija por catálogo, no por
// instancia de `Hecho`) que Fase 4 tendría que cerrar (p. ej. permitiendo
// que el propio `Hecho`/`AccionRenderizada` cargue una ruta calculada) antes
// de deep-linkear con seguridad -- reportado explícitamente al orquestador,
// no forzado aquí.
// ============================================================================

export const CATALOGO_DESTINOS: Destino[] = [
  { id: 'hato.lista_vacias', negocio: 'hato_lechero', etiqueta_boton: 'Ver las vacías', ruta: '/hato-lechero/hato?filtro=vacias_90d', familia: 'consulta' },
  { id: 'hato.lista_secado', negocio: 'hato_lechero', etiqueta_boton: 'Ver secado', ruta: '/hato-lechero/hato?filtro=secado', familia: 'consulta' },
  { id: 'hato.lista_hato', negocio: 'hato_lechero', etiqueta_boton: 'Ver el hato', ruta: '/hato-lechero/hato', familia: 'consulta' },
  { id: 'hato.chequeos', negocio: 'hato_lechero', etiqueta_boton: 'Ir a chequeos', ruta: '/hato-lechero/chequeos', familia: 'captura' },
  { id: 'hato.pesaje', negocio: 'hato_lechero', etiqueta_boton: 'Registrar pesaje', ruta: '/hato-lechero/produccion?tab=pesaje', familia: 'captura' },
  { id: 'hato.produccion', negocio: 'hato_lechero', etiqueta_boton: 'Ver producción', ruta: '/hato-lechero/produccion', familia: 'consulta', es_titular_pulso: true },
  { id: 'hato.ranking_vacas', negocio: 'hato_lechero', etiqueta_boton: 'Ver ranking', ruta: '/hato-lechero?tab=ranking', familia: 'consulta' },
  { id: 'agu.monitoreo', negocio: 'aguacate', etiqueta_boton: 'Ir a monitoreo', ruta: '/monitoreo', familia: 'consulta' },
  { id: 'agu.monitoreo_sublote', negocio: 'aguacate', etiqueta_boton: 'Ver sublote', ruta: '/monitoreo', familia: 'consulta' },
  { id: 'agu.aplicacion_cierre', negocio: 'aguacate', etiqueta_boton: 'Ir al cierre', ruta: '/aplicaciones', familia: 'consulta' },
  { id: 'agu.aplicacion_detalle', negocio: 'aguacate', etiqueta_boton: 'Ver aplicación', ruta: '/aplicaciones', familia: 'consulta' },
  { id: 'agu.labores', negocio: 'aguacate', etiqueta_boton: 'Ir a labores', ruta: '/labores', familia: 'captura' },
  { id: 'agu.clima', negocio: 'aguacate', etiqueta_boton: 'Ver clima', ruta: '/clima', familia: 'consulta' },
  { id: 'agu.tarea_detalle', negocio: 'aguacate', etiqueta_boton: 'Ver tarea', ruta: '/labores', familia: 'consulta' },
  { id: 'inv.producto', negocio: 'aguacate', etiqueta_boton: 'Ver producto', ruta: '/inventario', familia: 'captura' },
  { id: 'fin.presupuesto', negocio: 'aguacate', etiqueta_boton: 'Ir al presupuesto', ruta: '/finanzas/presupuesto', familia: 'consulta', requiere_rol: 'Gerencia' },
  { id: 'fin.presupuesto', negocio: 'hato_lechero', etiqueta_boton: 'Ir al presupuesto', ruta: '/finanzas/presupuesto', familia: 'consulta', requiere_rol: 'Gerencia' },
  { id: 'fin.presupuesto', negocio: 'ganado', etiqueta_boton: 'Ir al presupuesto', ruta: '/finanzas/presupuesto', familia: 'consulta', requiere_rol: 'Gerencia' },
  { id: 'gan.dashboard', negocio: 'ganado', etiqueta_boton: 'Ver ganado', ruta: '/ganado', familia: 'consulta' },
  { id: 'gan.movimientos', negocio: 'ganado', etiqueta_boton: 'Ver movimientos', ruta: '/ganado/movimientos', familia: 'consulta' },
  { id: 'gan.config_fincas', negocio: 'ganado', etiqueta_boton: 'Configurar fincas', ruta: '/configuracion', familia: 'captura' },
];

// ============================================================================
// §3.6 -- cotas del paquete. `limitarHechosPorCupo` trunca por el MISMO
// orden determinístico de §4.6 (fecha encima → antigüedad → tamaño), pero
// operando sobre `Hecho[]` crudo -- `ordenarAcciones` (accionesOrden.ts) no
// sirve aquí porque exige `AccionValidada[]` (acciones YA generadas por el
// modelo, que en esta fase todavía no existen). Comparador DUPLICADO a
// propósito, con la MISMA semántica de tres criterios -- si algún día se
// unifica, hace falta una prueba de paridad como la de los 5 módulos
// espejados; por ahora es un criterio compartido, no un módulo compartido.
// ============================================================================

export const MAX_HECHOS_POR_NEGOCIO = 12; // §3.6
const DIAS_VENTANA_FECHA_ENCIMA = 7; // idéntico a accionesOrden.ts

function tieneFechaEncima(hecho: Hecho, hoy: string): boolean {
  if (!hecho.fecha_limite) return false;
  return diasEntreISO(hoy, hecho.fecha_limite) <= DIAS_VENTANA_FECHA_ENCIMA;
}

export function limitarHechosPorCupo(hechos: Hecho[], hoy: string, maximo: number = MAX_HECHOS_POR_NEGOCIO): Hecho[] {
  if (hechos.length <= maximo) return hechos;
  const maxTamano = Math.max(1, ...hechos.map((h) => h.tamano_conjunto ?? 0));

  function claveOrden(h: Hecho) {
    return {
      fechaEncima: tieneFechaEncima(h, hoy),
      vencida: h.fecha_limite ? h.fecha_limite < hoy : false,
      fechaLimite: h.fecha_limite,
      diasEsperando: h.dias_esperando ?? -Infinity,
      tamanoNormalizado: (h.tamano_conjunto ?? 0) / maxTamano,
    };
  }

  const conIndice = hechos.map((h, i) => ({ h, i, c: claveOrden(h) }));
  conIndice.sort((a, b) => {
    if (a.c.fechaEncima !== b.c.fechaEncima) return a.c.fechaEncima ? -1 : 1;
    if (a.c.fechaEncima && b.c.fechaEncima) {
      if (a.c.vencida !== b.c.vencida) return a.c.vencida ? 1 : -1;
      if (a.c.fechaLimite !== b.c.fechaLimite) return (a.c.fechaLimite ?? '') < (b.c.fechaLimite ?? '') ? -1 : 1;
    }
    if (a.c.diasEsperando !== b.c.diasEsperando) return b.c.diasEsperando - a.c.diasEsperando;
    if (a.c.tamanoNormalizado !== b.c.tamanoNormalizado) return b.c.tamanoNormalizado - a.c.tamanoNormalizado;
    return a.i - b.i; // estable: orden de llegada como último desempate
  });

  return conIndice.slice(0, maximo).map((x) => x.h);
}

// ============================================================================
// HATO LECHERO -- construcción pura de hechos a partir de filas YA
// consultadas. Ver el header del archivo para el porqué de cada fuente.
// ============================================================================

export interface FilaPesajeParaPaquete {
  fecha: string;
  litros_total: number;
}

export interface FilaEventoHatoParaPaquete {
  tipo: string; // 'servicio' | 'confirmacion_prenez' | ... (filtrado por el fetcher)
  fecha: string;
}

export interface DatosHatoParaPaquete {
  filasHatoConfig: FilaHatoConfig[]; // clave/valor -- alimenta HatoConfig Y UmbralesCategoriaHato
  filasEstadoActual: HatoEstadoActualRow[]; // v_hato_estado_actual, sin filtrar
  fechaUltimoChequeo: string | null; // MAX(hato_chequeos.fecha)
  /** Pesajes de una ventana reciente (30 días basta: la cadencia es semanal,
   *  §3.3 "no pesada = sin dato, nunca 0"). El MAX(fecha) de este conjunto
   *  es "el último día de pesaje" que pide `hato.cobertura_pesaje`. */
  pesajesRecientes: FilaPesajeParaPaquete[];
  /** `hato_eventos` de los últimos 90 días, tipo IN ('servicio','confirmacion_prenez'). */
  eventosRecientes: FilaEventoHatoParaPaquete[];
  cantidadSinRaza: number;
  /** Ya filtradas a `negocio === 'hato_lechero'` por el llamador (o no --
   *  esta función las vuelve a filtrar por seguridad). */
  revisiones: RevisionPeriodicaFila[];
  hoy: string;
}

/** Vacas ACTIVAS con `dias_espera_voluntaria_post_parto` días o más sin
 *  servicio/preñez -- PUERTO LOCAL de `vaciasMasDeNDias`
 *  (`src/utils/hatoAlertasTablero.ts`, Fase 0a). Esa función es
 *  FRONTEND-only (no tiene copia en el árbol de Deno, a diferencia de
 *  `calculosHato.ts`/`hatoAlertas.ts`), así que el ensamblador del paquete
 *  -- que corre en Deno -- no puede importarla. Se reproduce aquí la MISMA
 *  regla, verbatim: si `vaciasMasDeNDias` cambia, este bloque tiene que
 *  cambiar en el mismo commit. Reportado como hueco de espejo al
 *  orquestador -- no es un `CotejoSpec` roto, es un candidato a mirroring
 *  formal (`docs/acciones/regenerar-copias-acciones.sh` sólo cubre los 5
 *  módulos de accionesTipos/Hechos/Validador/Orden/Render, no éste). */
function filtrarVaciasLargas(animales: AnimalHatoParaAcciones[], umbralDias: number, hoy: string): AnimalHatoParaAcciones[] {
  return animales.filter((a) => {
    if (a.estadoAnimal !== 'activa') return false;
    if (a.derivado.estado !== 'parida_reciente' && a.derivado.estado !== 'vacia_por_servir') return false;
    if (!a.ultimoPartoFecha) return false;
    return diasEntreISO(a.ultimoPartoFecha, hoy) >= umbralDias;
  });
}

/** PUERTO LOCAL de `derivarAlertasTablero` (mismo archivo/motivo que
 *  `filtrarVaciasLargas` arriba) -- separa secado VENCIDO de PRÓXIMO y
 *  aparta rechequeo pendiente. */
function derivarAlertasHatoLocal(animales: AnimalHatoParaAcciones[]) {
  return {
    secadoVencido: animales.filter((a) => a.derivado.alertas.secado_due),
    proximasASecar: animales.filter((a) => a.derivado.estado === 'proxima_a_secar' && !a.derivado.alertas.secado_due),
    rechequeoPendiente: animales.filter((a) => a.derivado.alertas.rechequeo_due),
  };
}

/** Construye la lista `AnimalHatoParaAcciones[]` que el resto de esta
 *  sección consume, resolviendo etapa/estado con las MISMAS funciones que
 *  `buildReproduccionSummary` (`hato-aggregation.ts`) -- nunca una tercera
 *  implementación de esa resolución. */
function construirAnimalesParaAcciones(
  filas: HatoEstadoActualRow[],
  config: HatoConfig,
  umbralesCategoria: UmbralesCategoriaHato,
  hoy: string,
): AnimalHatoParaAcciones[] {
  return filas.map((fila) => {
    const etapaEfectiva = resolverEtapaEfectiva(fila, umbralesCategoria, hoy);
    const derivado = derivarEstadoReproductivo({ ...fila, etapa: etapaEfectiva.etapa }, config, hoy);
    return {
      animalId: fila.animal_id,
      numero: fila.numero,
      nombre: fila.nombre,
      estadoAnimal: fila.estado,
      ultimoPartoFecha: fila.ultimo_parto_fecha,
      ultimoChequeoFecha: fila.ultimo_chequeo_fecha,
      derivado: {
        estado: derivado.estado,
        fecha_secar: derivado.fecha_secar,
        alertas: {
          secado_due: derivado.alertas.secado_due,
          rechequeo_due: derivado.alertas.rechequeo_due,
          parto_proximo: derivado.alertas.parto_proximo,
        },
      },
    };
  });
}

/** "Vacas en ordeño" -- denominador de `hato.cobertura_pesaje` y
 *  `hato.servicios_90d`. Simplificación DOCUMENTADA de esta fase: §3.3 cita
 *  `contarVacasEnOrdenoAFecha` (`src/utils/hatoProduccion.ts`) como fuente,
 *  una función que RECONSTRUYE el estado histórico a una fecha pasada para
 *  el backfill de producción -- es FRONTEND-only, no espejada a Deno, y su
 *  reconstrucción histórica no tiene contraparte server-side hoy. Este
 *  ensamblador usa en su lugar el conteo de HOY (`categorizarAnimal`,
 *  reutilizada de `hato-aggregation.ts`) como proxy: dado que el pesaje es
 *  semanal, la composición del hato en ordeño rara vez cambia de un día
 *  para otro, así que la desviación esperada es pequeña -- pero es una
 *  desviación real frente a la fuente que el brief cita, y queda reportada
 *  como tal al orquestador en vez de callada.
 */
function contarVacasEnOrdenoHoy(
  filas: HatoEstadoActualRow[],
  config: HatoConfig,
  umbralesCategoria: UmbralesCategoriaHato,
  hoy: string,
): number {
  let total = 0;
  for (const fila of filas) {
    const etapaEfectiva = resolverEtapaEfectiva(fila, umbralesCategoria, hoy);
    const derivado = derivarEstadoReproductivo({ ...fila, etapa: etapaEfectiva.etapa }, config, hoy);
    if (categorizarAnimal(fila, etapaEfectiva.etapa, derivado.estado) === 'hato_ordeno') total += 1;
  }
  return total;
}

export function construirHechosHatoLechero(datos: DatosHatoParaPaquete): Hecho[] {
  const { hoy } = datos;
  // `construirHatoConfigDesdeFilas`/`construirUmbralesCategoriaHatoDesdeFilas`
  // EXPLOTAN si falta una clave -- se deja propagar, mismo contrato que
  // `hato-alertas-tick.ts` (nunca un default inventado). El `try/catch` por
  // negocio de `ensamblarPaquete` lo convierte en `incidencias[]`.
  const config = construirHatoConfigDesdeFilas(datos.filasHatoConfig);
  const umbralesCategoria = construirUmbralesCategoriaHatoDesdeFilas(datos.filasHatoConfig);

  const animales = construirAnimalesParaAcciones(datos.filasEstadoActual, config, umbralesCategoria, hoy);
  const { secadoVencido, proximasASecar, rechequeoPendiente } = derivarAlertasHatoLocal(animales);
  const vacias = filtrarVaciasLargas(animales, config.dias_espera_voluntaria_post_parto, hoy);

  const hechos: Hecho[] = [];

  const hVacias = construirHechoVaciasLargas(vacias, config.dias_espera_voluntaria_post_parto, animales.length, hoy);
  if (hVacias) hechos.push(hVacias);

  const hSecado = construirHechoSecadoVencido(secadoVencido, hoy);
  if (hSecado) hechos.push(hSecado);

  const hProximas = construirHechoProximasASecar(proximasASecar, hoy);
  if (hProximas) hechos.push(hProximas);

  const hRechequeo = construirHechoRechequeoVencido(rechequeoPendiente, hoy);
  if (hRechequeo) hechos.push(hRechequeo);

  hechos.push(construirHechoUltimoChequeo(datos.fechaUltimoChequeo, hoy));

  const totalEnOrdeno = contarVacasEnOrdenoHoy(datos.filasEstadoActual, config, umbralesCategoria, hoy);

  let fechaUltimoPesaje: string | null = null;
  for (const p of datos.pesajesRecientes) {
    if (fechaUltimoPesaje === null || p.fecha > fechaUltimoPesaje) fechaUltimoPesaje = p.fecha;
  }
  if (fechaUltimoPesaje) {
    const pesajesDelDia = datos.pesajesRecientes.filter((p) => p.fecha === fechaUltimoPesaje);
    const pesadas = pesajesDelDia.length;

    const hCobertura = construirHechoCoberturaPesaje(pesadas, totalEnOrdeno, fechaUltimoPesaje, hoy);
    if (hCobertura) hechos.push(hCobertura);

    const sumaLitros = pesajesDelDia.reduce((s, p) => s + p.litros_total, 0);
    const promedio = calcularProductividad(sumaLitros, pesadas);
    // A-8: `hato.produccion` (destino de este hecho) ES titular del pulso
    // (bloque 3, §3.5) -- ver el comentario de `CATALOGO_DESTINOS`.
    const hLitros = construirHechoLitrosPorVaca(promedio, fechaUltimoPesaje, pesadas > 0 ? pesadas : null, hoy, {
      titularPulso: true,
    });
    if (hLitros) hechos.push(hLitros);
  }

  const servicios = datos.eventosRecientes.filter((e) => e.tipo === 'servicio').length;
  const prenadas = datos.eventosRecientes.filter((e) => e.tipo === 'confirmacion_prenez').length;
  const hServicios = construirHechoServicios90d(servicios, prenadas, totalEnOrdeno, hoy);
  if (hServicios) hechos.push(hServicios);

  const hSinRaza = construirHechoSinRaza(datos.cantidadSinRaza, hoy);
  if (hSinRaza) hechos.push(hSinRaza);

  // O-8 -- sólo `hato_lechero.productividad` (disparo por evento) usa la
  // entrada de selectores; las de calendario no la tocan (evaluarDisparo).
  const entradaSelectores: EntradaSelectores = {
    animalesHato: animales,
    priorizacion: null,
    ganado: null,
    config: { dias_espera_voluntaria_post_parto: config.dias_espera_voluntaria_post_parto },
    hoy,
  };
  for (const rev of datos.revisiones.filter((r) => r.negocio === 'hato_lechero')) {
    const resultado = evaluarDisparo(rev, entradaSelectores, hoy);
    const hRev = construirHechoRevisionPeriodica(rev, resultado, hoy, revisionOpts(rev));
    if (hRev) hechos.push(hRev);
  }

  return hechos;
}

/** `visibilidad` de un hecho O-8 -- 'gerencia' si su destino la exige
 *  (§3.2: "Deriva del destino"). Sólo `fin.presupuesto` la exige hoy. */
function revisionOpts(rev: RevisionPeriodicaFila) {
  return rev.destinoId === 'fin.presupuesto' ? { visibilidad: 'gerencia' as const } : undefined;
}

// ============================================================================
// AGUACATE HASS
// ============================================================================

export interface FilaMonitoreoParaPaquete {
  fecha_monitoreo: string;
  ronda_id: string;
  lote_id: string;
  sublote_id: string | null;
  plaga_enfermedad_id: string;
  arboles_monitoreados: number;
  arboles_afectados: number;
  incidencia: number;
  lote_nombre?: string;
  sublote_nombre?: string;
  pest_nombre?: string;
}

export interface FilaAplicacionParaPaquete {
  id: string;
  nombre: string;
  estado: 'Calculada' | 'En ejecución' | 'Cerrada';
  fechaInicioPlaneada: string | null;
  createdAt: string;
}

export interface FilaAplicacionMezclaParaPaquete {
  id: string;
  aplicacionId: string;
}

export interface FilaAplicacionProductoParaPaquete {
  mezclaId: string;
  productoId: string;
  productoNombre: string;
  productoUnidad: string;
  cantidadNecesaria: number;
}

export interface FilaTareaParaPaquete {
  id: string;
  nombre: string;
  estado: string;
  fechaEstimadaInicio: string | null;
  createdAt: string;
}

export interface FilaRegistroTrabajoParaPaquete {
  fecha: string;
  fraccionJornal: number;
}

export interface FilaClimaParaPaquete {
  fecha: string;
  lluviaConfianza: 'ok' | 'contador_congelado' | 'sin_time_piezo' | null;
}

export interface DatosAguacateParaPaquete {
  filasMonitoreo: FilaMonitoreoParaPaquete[]; // ventana de lookback ya aplicada por el fetcher
  umbrales: UmbralEconomico[];
  perfilesEstacionales: PerfilEstacional[];
  ultimasFumigaciones: EventoFumigacion[];
  rondaActualId: string | null;
  sublotesEnAlcance: SubloteEnAlcance[]; // sublotes cuyo lote tiene `activo=true`
  /** Aplicaciones `Calculada` o `En ejecución` -- cubre insumo_faltante,
   *  aplicaciones_colgadas y aplicacion_arranca de una sola consulta. */
  aplicaciones: FilaAplicacionParaPaquete[];
  aplicacionesMezclas: FilaAplicacionMezclaParaPaquete[];
  aplicacionesProductos: FilaAplicacionProductoParaPaquete[];
  /** `productos.cantidad_actual` -- SÓLO de los productos que aparecen en
   *  `aplicacionesProductos`. `null` = `cantidad_actual` es NULL en la fila
   *  real (§3.3 bis, regla 2: "sin dato registrado", nunca 0). Un
   *  `productoId` ausente de este arreglo se trata igual que `null` --
   *  `construirHechosAguacate` no distingue "no vino" de "vino en null". */
  stockProductos: Array<{ productoId: string; cantidadActual: number | null }>;
  tareasAbiertas: FilaTareaParaPaquete[];
  registrosTrabajo: FilaRegistroTrabajoParaPaquete[]; // últimos 14 días
  climaReciente: FilaClimaParaPaquete[];
  revisiones: RevisionPeriodicaFila[];
  hoy: string;
}

/** §3.3 bis, regla de agregación: "agregar por producto_id DENTRO DE LA
 *  APLICACIÓN antes de comparar contra el stock -- comparar mezcla por
 *  mezcla contaría el stock varias veces y fabricaría faltantes que no
 *  existen". Pura y exportada para que `accionesPaquete.test.ts` la
 *  ejercite con el caso de oro (un producto repetido en dos mezclas de la
 *  MISMA aplicación no debe duplicar la necesidad). */
export function agregarNecesidadesPorProducto(
  mezclas: FilaAplicacionMezclaParaPaquete[],
  productos: FilaAplicacionProductoParaPaquete[],
): Array<{ aplicacionId: string; productoId: string; productoNombre: string; productoUnidad: string; cantidadNecesaria: number }> {
  const aplicacionPorMezcla = new Map(mezclas.map((m) => [m.id, m.aplicacionId]));
  const agregados = new Map<
    string,
    { aplicacionId: string; productoId: string; productoNombre: string; productoUnidad: string; cantidadNecesaria: number }
  >();
  for (const fp of productos) {
    const aplicacionId = aplicacionPorMezcla.get(fp.mezclaId);
    if (!aplicacionId) continue; // mezcla huérfana -- no debería pasar, se ignora sin inventar
    const clave = `${aplicacionId}|${fp.productoId}`;
    const actual = agregados.get(clave);
    if (actual) {
      actual.cantidadNecesaria += fp.cantidadNecesaria;
    } else {
      agregados.set(clave, {
        aplicacionId,
        productoId: fp.productoId,
        productoNombre: fp.productoNombre,
        productoUnidad: fp.productoUnidad,
        cantidadNecesaria: fp.cantidadNecesaria,
      });
    }
  }
  return Array.from(agregados.values());
}

const TOP_PLAGAS_PAQUETE = 8; // "el top de la ronda" -- §3.3, acotado antes del cupo general de §3.6

function agruparHistorialesMonitoreo(filas: FilaMonitoreoParaPaquete[]): HistorialSublotePlaga[] {
  const grupos = new Map<string, HistorialSublotePlaga>();
  for (const row of filas) {
    if (!row.sublote_id) continue; // el ranking es a nivel sublote (mismo criterio que chat.tsx)
    const key = `${row.sublote_id}|${row.plaga_enfermedad_id}`;
    let grupo = grupos.get(key);
    if (!grupo) {
      grupo = {
        sublote_id: row.sublote_id,
        sublote_nombre: row.sublote_nombre,
        lote_id: row.lote_id,
        lote_nombre: row.lote_nombre,
        pest_id: row.plaga_enfermedad_id,
        pest_nombre: row.pest_nombre,
        rondas: [],
      };
      grupos.set(key, grupo);
    }
    grupo.rondas.push({
      fecha_monitoreo: row.fecha_monitoreo,
      ronda_id: row.ronda_id,
      incidencia: Number(row.incidencia) || 0,
      arboles_monitoreados: row.arboles_monitoreados,
      arboles_afectados: row.arboles_afectados,
    });
  }
  return Array.from(grupos.values());
}

export function construirHechosAguacate(datos: DatosAguacateParaPaquete): Hecho[] {
  const { hoy } = datos;
  const hechos: Hecho[] = [];

  const historiales = agruparHistorialesMonitoreo(datos.filasMonitoreo);

  if (datos.rondaActualId) {
    const ranked: PriorizacionEntryParaAcciones[] = priorizarMonitoreo({
      historiales,
      umbrales: datos.umbrales,
      perfilesEstacionales: datos.perfilesEstacionales,
      ultimasFumigaciones: datos.ultimasFumigaciones,
      rondaActualId: datos.rondaActualId,
      fechaReferencia: new Date(`${hoy}T12:00:00Z`),
    });

    let fechaRonda: string | null = null;
    for (const f of datos.filasMonitoreo) {
      if (f.ronda_id !== datos.rondaActualId) continue;
      if (fechaRonda === null || f.fecha_monitoreo > fechaRonda) fechaRonda = f.fecha_monitoreo;
    }

    hechos.push(...construirHechosPlaga(ranked.slice(0, TOP_PLAGAS_PAQUETE), fechaRonda, hoy));
    hechos.push(construirHechoRondaEdad(fechaRonda, hoy));

    const cobertura = calcularCoberturaRonda(datos.sublotesEnAlcance, historiales, datos.rondaActualId);
    const hCobertura = construirHechoCoberturaRonda(
      cobertura.revisados,
      cobertura.totalEnAlcance,
      cobertura.noRevisados.map((s) => s.sublote_nombre ?? s.sublote_id),
      hoy,
    );
    if (hCobertura) hechos.push(hCobertura);
  } else {
    hechos.push(construirHechoRondaEdad(null, hoy));
  }

  // -- insumo faltante (§3.3 bis) ------------------------------------------
  const necesidades = agregarNecesidadesPorProducto(datos.aplicacionesMezclas, datos.aplicacionesProductos);
  if (necesidades.length > 0) {
    const aplicacionesPorId = new Map(datos.aplicaciones.map((a) => [a.id, a]));
    const stockPorProducto = new Map(datos.stockProductos.map((s) => [s.productoId, s.cantidadActual]));
    const filasInsumo: FilaAplicacionInsumo[] = [];
    for (const n of necesidades) {
      const ap = aplicacionesPorId.get(n.aplicacionId);
      if (!ap) continue; // aplicación fuera del universo consultado (p. ej. Cerrada) -- no aplica
      filasInsumo.push({
        aplicacionId: n.aplicacionId,
        aplicacionNombre: ap.nombre,
        aplicacionEstado: ap.estado,
        fechaInicioPlaneada: ap.fechaInicioPlaneada,
        productoId: n.productoId,
        productoNombre: n.productoNombre,
        productoUnidad: n.productoUnidad,
        cantidadNecesaria: n.cantidadNecesaria,
        // `.has(...)` distingue "no vino en stockProductos" de "vino en
        // null" -- ambos casos son "sin dato" para el hecho (§3.3 bis regla
        // 2), así que el `?? null` de abajo basta para los dos.
        cantidadDisponible: stockPorProducto.get(n.productoId) ?? null,
      });
    }
    // A-7(i) (¿ya hay una compra en curso?) se deja SIN POBLAR -- ver el
    // comentario de cabecera del archivo.
    hechos.push(...construirHechosInsumoFaltante(filasInsumo, hoy, undefined));
  }

  // -- tarea atascada --------------------------------------------------------
  const hTarea = construirHechoTareaAtascada(
    datos.tareasAbiertas.map((t): FilaTareaAtascada => ({
      id: t.id,
      nombre: t.nombre,
      estado: t.estado,
      fechaEstimadaInicio: t.fechaEstimadaInicio,
      createdAt: t.createdAt,
    })),
    hoy,
  );
  if (hTarea) hechos.push(hTarea);

  // -- aplicaciones colgadas ---------------------------------------------
  const enEjecucion = datos.aplicaciones.filter((a) => a.estado === 'En ejecución');
  const hColgadas = construirHechoAplicacionesColgadas(
    enEjecucion.map((a): FilaAplicacionColgada => ({ id: a.id, nombre: a.nombre, createdAt: a.createdAt })),
    hoy,
  );
  if (hColgadas) hechos.push(hColgadas);

  // -- aplicación arranca ---------------------------------------------------
  const calculadasConFecha = datos.aplicaciones.filter(
    (a): a is FilaAplicacionParaPaquete & { fechaInicioPlaneada: string } =>
      a.estado === 'Calculada' && a.fechaInicioPlaneada !== null,
  );
  hechos.push(
    ...construirHechosAplicacionArranca(
      calculadasConFecha.map((a): FilaAplicacionArranca => ({ id: a.id, nombre: a.nombre, fechaInicioPlaneada: a.fechaInicioPlaneada })),
      hoy,
    ),
  );

  // -- jornales semana --------------------------------------------------------
  // Ventana rodante de 7+7 días (no semana-calendario ISO): asunción
  // documentada de esta fase -- `registros_trabajo` no trae una función de
  // frontera de semana espejada a Deno. Reportado al orquestador.
  const inicioSemanaActual = sumarDiasISO(hoy, -6);
  const inicioSemanaPrevia = sumarDiasISO(hoy, -13);
  const finSemanaPrevia = sumarDiasISO(hoy, -7);
  const registrosEstaSemana = datos.registrosTrabajo.filter((r) => r.fecha >= inicioSemanaActual && r.fecha <= hoy);
  const registrosSemanaPrevia = datos.registrosTrabajo.filter((r) => r.fecha >= inicioSemanaPrevia && r.fecha <= finSemanaPrevia);
  const jornalesEstaSemana = registrosEstaSemana.length > 0 ? registrosEstaSemana.reduce((s, r) => s + r.fraccionJornal, 0) : null;
  const jornalesSemanaPrevia = registrosSemanaPrevia.reduce((s, r) => s + r.fraccionJornal, 0);
  const ultimoRegistro = datos.registrosTrabajo.reduce<string | null>(
    (max, r) => (max === null || r.fecha > max ? r.fecha : max),
    null,
  );
  hechos.push(construirHechoJornalesSemana(jornalesEstaSemana, jornalesSemanaPrevia, ultimoRegistro, hoy));

  // -- lluvia_confianza -------------------------------------------------------
  const diasCongelados = datos.climaReciente.filter((c) => c.lluviaConfianza === 'contador_congelado').length;
  const diasOk = datos.climaReciente.filter((c) => c.lluviaConfianza === 'ok').length;
  const hLluvia = construirHechoLluviaConfianza(diasOk, datos.climaReciente.length, diasCongelados, hoy);
  if (hLluvia) hechos.push(hLluvia);

  // -- O-8 ejecución presupuestal (aguacate) ---------------------------------
  const entradaSelectoresVacia: EntradaSelectores = { animalesHato: null, priorizacion: null, ganado: null, config: null, hoy };
  for (const rev of datos.revisiones.filter((r) => r.negocio === 'aguacate')) {
    const resultado = evaluarDisparo(rev, entradaSelectoresVacia, hoy);
    const hRev = construirHechoRevisionPeriodica(rev, resultado, hoy, revisionOpts(rev));
    if (hRev) hechos.push(hRev);
  }

  return hechos;
}

// ============================================================================
// GANADO
// ============================================================================

export interface DatosGanadoParaPaquete {
  ubicaciones: GanUbicacionRow[];
  fincas: GanFincaRow[];
  potreros: GanPotreroRow[];
  inventario: GanInventarioRow[];
  movimientos30d: GanMovimientoRow[];
  pendientes: GanMovimientoRow[];
  revisiones: RevisionPeriodicaFila[];
  hoy: string;
}

export function construirHechosGanado(datos: DatosGanadoParaPaquete): Hecho[] {
  const { hoy } = datos;
  const summary = buildGanadoInventorySummary({
    ubicaciones: datos.ubicaciones,
    fincas: datos.fincas,
    potreros: datos.potreros,
    inventario: datos.inventario,
    movimientos30d: datos.movimientos30d,
    pendientes: datos.pendientes,
  });

  const hechos: Hecho[] = [];
  hechos.push(construirHechoGanadoInventario(summary.total.cabezas, summary.total.novillos, summary.total.toros, hoy));

  const ganadoParaAcciones: GanadoInventarioParaAcciones = {
    total: summary.total,
    por_finca: summary.por_finca,
    variacion_30_dias: summary.variacion_30_dias,
    pendientes_confirmacion: summary.pendientes_confirmacion,
  };

  const hVariacion = construirHechoGanadoVariacion30d(
    ganadoParaAcciones.variacion_30_dias.entradas,
    ganadoParaAcciones.variacion_30_dias.salidas,
    ganadoParaAcciones.variacion_30_dias.neto,
    hoy,
  );
  if (hVariacion) hechos.push(hVariacion);

  const fincasSinHa = ganadoParaAcciones.por_finca.filter((f) => f.hectareas === 0).map((f) => f.finca);
  const hFincas = construirHechoGanadoFincasSinHa(fincasSinHa, hoy);
  if (hFincas) hechos.push(hFincas);

  const hConcentracion = construirHechoGanadoConcentracion(
    ganadoParaAcciones.por_finca.map((f) => ({ finca: f.finca, cabezas: f.cabezas })),
    ganadoParaAcciones.total.cabezas,
    hoy,
  );
  if (hConcentracion) hechos.push(hConcentracion);

  const entradaSelectoresVacia: EntradaSelectores = { animalesHato: null, priorizacion: null, ganado: null, config: null, hoy };
  for (const rev of datos.revisiones.filter((r) => r.negocio === 'ganado')) {
    const resultado = evaluarDisparo(rev, entradaSelectoresVacia, hoy);
    const hRev = construirHechoRevisionPeriodica(rev, resultado, hoy, revisionOpts(rev));
    if (hRev) hechos.push(hRev);
  }

  return hechos;
}

// ============================================================================
// Ensamblador -- inyección de dependencias para que `accionesPaquete.test.ts`
// pruebe el AISLAMIENTO POR NEGOCIO y las cotas de §3.6 sin un Supabase real.
// ============================================================================

export interface DependenciasEnsamblador {
  fetchHato(hoy: string, revisiones: RevisionPeriodicaFila[]): Promise<DatosHatoParaPaquete>;
  fetchAguacate(hoy: string, revisiones: RevisionPeriodicaFila[]): Promise<DatosAguacateParaPaquete>;
  fetchGanado(hoy: string, revisiones: RevisionPeriodicaFila[]): Promise<DatosGanadoParaPaquete>;
  fetchRevisiones(): Promise<RevisionPeriodicaFila[]>;
}

/** Bloque 1 ("Requiere tu decisión") del tablero todavía no existe en el
 *  producto (verificado: sin componente, sin hook, sin consulta en todo el
 *  árbol -- sólo aparece en `docs/plan_dashboard_centro_control.md` y en el
 *  propio tipo `ExclusionBloque1`). `exclusiones` empieza vacío por eso, no
 *  por omisión -- `DUPLICA_BLOQUE_1` simplemente no dispara todavía. */
const EXCLUSIONES_BLOQUE_1: PaqueteAcciones['exclusiones'] = [];

/** Notion es v1.1 (D-1 (a), §8 del brief) -- `contexto_comite` queda fijo en
 *  `no_disponible` hasta esa fase, tal como el tipo ya lo previó. */
const CONTEXTO_COMITE_V1: PaqueteAcciones['contexto_comite'] = {
  estado: 'no_disponible',
  ventana_dias: 0,
  senales: [],
};

export async function ensamblarPaquete(deps: DependenciasEnsamblador, ahora: Date = new Date()): Promise<PaqueteAcciones> {
  const hoy = obtenerFechaHoyBogota(ahora);
  const generadoAt = obtenerGeneradoAtBogota(ahora);

  let revisiones: RevisionPeriodicaFila[] = [];
  try {
    revisiones = await deps.fetchRevisiones();
  } catch (err) {
    // No es un negocio caído (§10 Fase 2: "un negocio caído no tumba a los
    // otros") -- es un origen (O-8) que se degrada solo. Se registra en el
    // log del handler; no entra a `incidencias[]` porque esa lista es por
    // NEGOCIO y esto no tumba ninguno -- los otros orígenes (O-1/O-2) de
    // los tres negocios siguen produciendo con normalidad.
    console.error('[acciones-paquete] no se pudo leer revisiones_periodicas -- O-8 no producirá hechos esta corrida:', mensajeDeError(err));
  }

  const negocios: NegocioAccion[] = [];
  const hechos: Hecho[] = [];
  const incidencias: PaqueteAcciones['incidencias'] = [];

  try {
    const datos = await deps.fetchHato(hoy, revisiones);
    hechos.push(...limitarHechosPorCupo(construirHechosHatoLechero(datos), hoy));
    negocios.push('hato_lechero');
  } catch (err) {
    incidencias.push({ negocio: 'hato_lechero', error: mensajeDeError(err) });
  }

  try {
    const datos = await deps.fetchAguacate(hoy, revisiones);
    hechos.push(...limitarHechosPorCupo(construirHechosAguacate(datos), hoy));
    negocios.push('aguacate');
  } catch (err) {
    incidencias.push({ negocio: 'aguacate', error: mensajeDeError(err) });
  }

  try {
    const datos = await deps.fetchGanado(hoy, revisiones);
    hechos.push(...limitarHechosPorCupo(construirHechosGanado(datos), hoy));
    negocios.push('ganado');
  } catch (err) {
    incidencias.push({ negocio: 'ganado', error: mensajeDeError(err) });
  }

  return {
    version: 1,
    generado_at: generadoAt,
    fecha_referencia: hoy,
    negocios,
    hechos,
    destinos: CATALOGO_DESTINOS,
    exclusiones: EXCLUSIONES_BLOQUE_1,
    contexto_comite: CONTEXTO_COMITE_V1,
    incidencias,
  };
}
