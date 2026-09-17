/**
 * Hechos y selectores del motor de acciones recomendadas -- la capa de
 * evidencia (§3.3, §3.3 bis, §3.3 ter y §6.2 de
 * `docs/brief_tecnico_motor_acciones.md`).
 *
 * Dos familias de exports, las dos PURAS -- sin red, sin Supabase, sin LLM:
 *
 *   1. `evaluarSelector`/`evaluarSelectorFecha` (§6.2): funciones nombradas
 *      que leen datos YA CARGADOS -- los derivados que el pulso (bloque 3)
 *      trae a memoria, o el paquete que el ensamblador Deno construyó -- y
 *      devuelven un conteo/booleano o una fecha ISO. Un solo cuerpo, dos
 *      consumidores: el ensamblador (Fase 2, produce `Hecho.valores`) y el
 *      cotejo del navegador (Fase 4, revalida un `Hecho` ya publicado contra
 *      datos frescos, §6). `null` = "no se pudo evaluar" (el negocio no
 *      cargó, o el dato no está dentro del alcance de `EntradaSelectores`);
 *      regla dura del brief: `null` NUNCA invalida una acción.
 *   2. Los constructores `construirHecho*`: reciben datos YA CONSULTADOS --
 *      filas ya filtradas/agregadas por el llamador -- y devuelven un
 *      `Hecho` completamente formado (`texto` ya renderizado, `valores`
 *      direccionables, `fecha_limite`/`dias_esperando`/`tamano_conjunto`
 *      para `accionesOrden.ts`). Nunca deciden QUÉ filtrar -- ese criterio
 *      ya lo aplicó quien construyó su input (el ensamblador, Fase 2). En
 *      particular, para `hato.vacias_90d`/`hato.secado_vencido`/
 *      `hato.proximas_a_secar`/`hato.rechequeo_vencido` el filtrado YA lo
 *      hicieron `vaciasMasDeNDias`/`derivarAlertasTablero`
 *      (`src/utils/hatoAlertasTablero.ts`, Fase 0a) -- este módulo no
 *      reimplementa ese umbral, sólo formatea lo que ya llegó filtrado.
 *
 * Espejado byte-idéntico en `src/supabase/functions/server/acciones-hechos.ts`
 * y `supabase/functions/make-server-1ccce916/acciones-hechos.ts` (regenerar
 * con `bash docs/acciones/regenerar-copias-acciones.sh`, nunca a mano). Por
 * eso este módulo NO importa nada fuera de `./accionesTipos` y
 * `./accionesValidador` (los dos son de los cinco módulos que el generador
 * conoce y reescribe a rutas Deno): ni `@/utils/fechas`, ni `@/utils/format`,
 * ni `@/utils/calculosHato`, ni el hook `useHatoAnimales` (React puro, sin
 * espejo Deno) -- Deno no resuelve el alias `@/` y ninguno de esos módulos
 * tiene copia bajo `src/supabase/functions/server/`. Toda utilidad de
 * fecha/número que hace falta vive DUPLICADA aquí abajo, a propósito --
 * mismo patrón que el propio `diasEntre` local de `accionesOrden.ts`. La
 * única excepción es `FECHAS_EN_LETRA` (los 12 nombres de mes), reutilizada
 * de `accionesValidador.ts` en vez de duplicada otra vez, porque SÍ es uno
 * de los módulos espejados y su ruta relativa la reescribe el generador.
 *
 * --------------------------------------------------------------------------
 * Tres puentes deliberados hacia partes que el brief da por sentadas pero
 * cuyo esquema real no cierra tal cual está escrito -- documentados aquí
 * (no en el reporte de la sesión) para que quien lea el código primero los
 * encuentre sin tener que ir a buscar el reporte:
 *
 *   1. `EntradaSelectores` (§6.2) tipa `animalesHato`/`priorizacion`/
 *      `ganado`/`config`/`hoy` -- el brief define el `SelectorId`
 *      `'hato.sin_pesar' | 'agu.aplicaciones_colgadas' |
 *      'agu.insumo_faltante' | 'agu.tarea_atascada'` en la MISMA unión sin
 *      darle a `EntradaSelectores` ningún campo de donde sacarlos (pesajes,
 *      aplicaciones, tareas). No se inventa el campo que falta:
 *      `evaluarSelector` devuelve `null` para esos cuatro, con un
 *      comentario en el `switch` explicando el hueco. Es exactamente la
 *      regla dura del propio brief ("null = no se pudo evaluar... null NO
 *      invalida la acción") funcionando como estaba previsto -- el cotejo
 *      de esos cuatro hechos queda "indeterminado" (se muestra) hasta que
 *      una fase futura decida qué carga el pulso para ellos. `evaluarSelector`
 *      SÍ resuelve `'hato.ultimo_chequeo_fecha'` (la única fecha que el
 *      brief pide) porque `MAX(animalesHato[].ultimoChequeoFecha)` es una
 *      derivación honesta de `MAX(hato_chequeos.fecha)` con los datos que
 *      `EntradaSelectores` ya trae -- no hace falta el campo extra.
 *   2. El brief tipa `evaluarSelector(id, e): number | null` pero en el
 *      mismo párrafo dice "Selectores de FECHA -- devuelven un ISO, no un
 *      conteo" para `hato.ultimo_chequeo_fecha`. Es contradictorio tal cual
 *      está escrito. Se resuelve con DOS funciones: `evaluarSelector`
 *      (conteos, para cotejo de hechos de conteo) y `evaluarSelectorFecha`
 *      (fechas ISO, consumida por `evaluarDisparo` para O-8). Mismo
 *      `SelectorId` cerrado en las dos; cada una ignora (devuelve `null`)
 *      los ids que no le corresponden.
 *   3. `agu.tarea_atascada` (§3.3): la tabla dice `estado IN ('Banco',
 *      'Programada')`, pero el hecho real que motiva este módulo --
 *      "Preparación y aplicación microbiología", dado en el encargo de esta
 *      sesión -- está en estado **'En Proceso'**, que esa condición excluye.
 *      `estado_tarea` (generado, `src/types/database.ts:3511`) es
 *      `'Banco'|'Programada'|'En Proceso'|'Completada'|'Cancelada'`.
 *      Implementado contra `estado IN ('Banco','Programada','En Proceso')`
 *      -- cualquier tarea todavía no cerrada -- porque la condición literal
 *      del brief no puede producir el propio caso de oro que el brief cita.
 *      Ver el reporte de la sesión para más detalle.
 */

import type {
  ConfianzaHecho,
  DestinoId,
  Hecho,
  NegocioAccion,
  TrabajoAbierto,
  ValorHecho,
} from './accionesTipos';
import { FECHAS_EN_LETRA } from './accionesValidador';

// ============================================================================
// Utilidades locales de fecha/número -- DUPLICADAS a propósito (ver cabecera,
// puente sobre el alcance del módulo). Nunca reintroducir un import a
// `@/utils/fechas` o `@/utils/format` aquí.
// ============================================================================

/** Los 12 nombres de mes en minúscula, enero..diciembre -- reutilizados de
 *  `FECHAS_EN_LETRA` (los primeros 12 de sus 19 entradas) en vez de
 *  duplicar la lista una tercera vez en el repo. */
const MESES_ES: readonly string[] = FECHAS_EN_LETRA.slice(0, 12);

/** Diferencia con signo en días de calendario (`hasta` - `desde`), sobre
 *  fechas `AAAA-MM-DD` ya conocidas (nunca `new Date()` -- este módulo no
 *  deriva "hoy", lo recibe siempre como parámetro). Idéntica semántica al
 *  `diasEntre` privado de `accionesOrden.ts`, duplicada aquí porque ese
 *  módulo no la exporta y este archivo no puede depender de su forma
 *  interna. */
function diasEntre(desde: string, hasta: string): number {
  const [y1, m1, d1] = desde.split('-').map(Number);
  const [y2, m2, d2] = hasta.split('-').map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000);
}

function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const fechaUTC = new Date(Date.UTC(y, m - 1, d + dias));
  return fechaUTC.toISOString().slice(0, 10);
}

function ultimoDiaDeMes(anio: number, mesUno: number): number {
  // `mesUno` es 1..12. `new Date(anio, mesUno, 0)` da el último día del mes
  // `mesUno` en horario LOCAL -- aquí sólo se usa `.getDate()`, que no
  // depende de zona horaria para este cálculo puramente de calendario.
  return new Date(anio, mesUno, 0).getDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Formatea con separador de miles/decimales "es-CO" (puntos de miles,
 *  coma decimal -- CLAUDE.md). Entero cuando `valor` es entero, 2
 *  decimales cuando no lo es -- así "12.694" se ve entero y "3,05" no
 *  pierde su fracción. */
function formatearNumeroCO(valor: number): string {
  const decimales = Number.isInteger(valor) ? 0 : 2;
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(valor);
}

function formatearFechaLargaCO(fechaISO: string): string {
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  return `${dia} de ${MESES_ES[mes - 1]} de ${anio}`;
}

/** "hace N días" / "hoy" / "en N días" -- fraseo de edad para el `texto`
 *  de evidencia (§3.1: "<afirmación> -- <fuente>, <fecha o edad>"). */
function fraseEdad(fecha: string, hoy: string): string {
  const dias = diasEntre(fecha, hoy); // positivo si `fecha` es pasada
  if (dias === 0) return 'hoy';
  if (dias > 0) return dias === 1 ? 'hace 1 día' : `hace ${dias} días`;
  const enDias = -dias;
  return enDias === 1 ? 'en 1 día' : `en ${enDias} días`;
}

/** §3.6: máximo 5 nombres listados por hecho, con "y N más". */
const MAX_NOMBRES_LISTADOS = 5;

function formatearListaNombres(nombres: string[]): string {
  if (nombres.length <= MAX_NOMBRES_LISTADOS) return nombres.join(', ');
  const visibles = nombres.slice(0, MAX_NOMBRES_LISTADOS);
  const resto = nombres.length - MAX_NOMBRES_LISTADOS;
  return `${visibles.join(', ')} y ${resto} más`;
}

/** Normaliza un texto libre a un fragmento de id legible: minúsculas, sin
 *  tildes/eñe, espacios y símbolos a `_`. Usado para los sufijos de los
 *  hechos multi-instancia (`agu.plaga.<slug>`, `agu.insumo_faltante.<...>`,
 *  `agu.aplicacion_arranca.<...>`). */
function slug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'sin_nombre';
}

function valorNumero(crudo: number, unidad: string | null = null): ValorHecho {
  return { crudo, render: formatearNumeroCO(crudo), unidad };
}

function valorTexto(crudo: string): ValorHecho {
  return { crudo, render: crudo, unidad: null };
}

function valorFecha(fechaISO: string): ValorHecho {
  return { crudo: fechaISO, render: formatearFechaLargaCO(fechaISO), unidad: null };
}

function valorSinDato(unidad: string | null = null): ValorHecho {
  return { crudo: null, render: 's/d', unidad };
}

/** Mapea `unidad_medida` (enum de la BD, "Kilos"|"Litros"|"Unidades") a la
 *  abreviatura que ya usa el resto del tablero. */
function abreviarUnidad(unidadMedida: string): string {
  switch (unidadMedida) {
    case 'Kilos':
      return 'kg';
    case 'Litros':
      return 'L';
    case 'Unidades':
      return 'u';
    default:
      return unidadMedida;
  }
}

/**
 * Defecto 1 (verificación visual de la primera corrida, 2026-08-17): la
 * ranura `{unidad}` de una plantilla no tenía NINGÚN campo que resolverla
 * -- `ValorHecho.unidad` vive DENTRO de cada valor numérico, no es
 * direccionable por sí solo -- así que el modelo, forzado a apuntarla a
 * algún campo existente, la apuntó a `necesario` y la pantalla mostró
 * "4.694 12.694 de Silicalmag" (un número donde iba "kg").
 *
 * Arreglo mecánico, aplicado en `baseHecho` a TODO hecho (no sólo
 * `agu.insumo_faltante`, "y donde aplique en el resto"): si TODOS los
 * valores no-nulos de `unidad` dentro de un mismo hecho coinciden en una
 * única unidad, esa unidad se expone como su propio campo `valores.unidad`
 * -- referenciable por una ranura `{unidad}` como cualquier otro campo.
 *
 * Si el hecho mezcla MÁS de una unidad (p. ej. `hato.vacias_90d`: 'vacas' en
 * `cantidad`/`total_hato` y 'días' en `dias_umbral`), NO se expone -- un
 * campo `unidad` único ahí sería ambiguo y reproduciría el mismo defecto
 * disfrazado. En ese caso el modelo sigue sin poder referenciar "la"
 * unidad porque no hay una sola; puede escribirla en texto libre si hace
 * falta (no es un dígito, `%` ni `$`, así que R-2 no la bloquea).
 *
 * Nunca pisa una clave `unidad` que el constructor ya haya declarado a
 * mano -- ningún constructor de este archivo lo hace hoy, pero la guarda
 * es gratis y evita una colisión silenciosa si alguno lo hiciera mañana.
 * `render`/`crudo` de los valores numéricos NO cambian -- la unidad viaja
 * SÓLO en el campo nuevo, nunca pegada al número, para que una plantilla
 * `{falta} {unidad}` no pueda terminar en "4.694 kg kg" (§3.3, defecto 1).
 */
function conUnidadReferenciable(valores: Record<string, ValorHecho>): Record<string, ValorHecho> {
  if ('unidad' in valores) return valores;
  const unidades = new Set(
    Object.values(valores)
      .map((v) => v.unidad)
      .filter((u): u is string => u != null),
  );
  if (unidades.size !== 1) return valores;
  const [unica] = unidades;
  return { ...valores, unidad: valorTexto(unica) };
}

// ============================================================================
// §6.2 -- selectores nombrados
// ============================================================================

/**
 * Unión cerrada de selectores (§6.2). El puente 1 del header explica por
 * qué cuatro de ellos (`hato.sin_pesar`, `agu.aplicaciones_colgadas`,
 * `agu.insumo_faltante`, `agu.tarea_atascada`) siempre devuelven `null` en
 * `evaluarSelector`: `EntradaSelectores`, tal cual la define el brief, no
 * trae de dónde derivarlos.
 */
export type SelectorId =
  | 'hato.vacias_90d'
  | 'hato.secado_vencido'
  | 'hato.rechequeo_vencido'
  | 'hato.sin_pesar'
  | 'agu.plaga_sobre_umbral'
  | 'agu.aplicaciones_colgadas'
  | 'agu.insumo_faltante'
  | 'agu.tarea_atascada'
  | 'gan.pendientes'
  | 'gan.fincas_sin_ha'
  | 'hato.ultimo_chequeo_fecha';

/** Subconjunto estructural de `AnimalHatoDerivado`
 *  (`@/components/hato/hooks/useHatoAnimales.ts`) -- ver el header sobre
 *  por qué este módulo no puede importar ese tipo directamente. Cualquier
 *  animal real (o el resultado de `vaciasMasDeNDias`/`derivarAlertasTablero`,
 *  `hatoAlertasTablero.ts`) satisface esta forma sin adaptación: mismos
 *  nombres de campo. */
export interface AnimalHatoParaAcciones {
  animalId: string;
  numero: number | null;
  nombre: string | null;
  estadoAnimal: string; // 'activa' | 'vendida' | 'muerta' | 'descartada'
  ultimoPartoFecha: string | null;
  ultimoChequeoFecha: string | null;
  derivado: {
    estado: string; // EstadoReproductivo
    fecha_secar: string | null;
    alertas: {
      secado_due: boolean;
      rechequeo_due: boolean;
      parto_proximo: boolean;
    };
  };
}

/** Subconjunto estructural de `PriorizacionEntry`
 *  (`@/utils/priorizacionMonitoreo.ts`). NO incluye `afectados`/
 *  `monitoreados` -- ese tipo real no los trae (sólo la incidencia ya
 *  calculada); ver el reporte de la sesión sobre la fila `agu.plaga.<slug>`
 *  de §3.3. */
export interface PriorizacionEntryParaAcciones {
  sublote_id: string;
  sublote_nombre?: string;
  lote_id: string;
  lote_nombre?: string;
  pest_id: string;
  pest_nombre: string;
  tier: 'A' | 'B';
  estadoUmbral?: 'over' | 'approaching' | 'under';
  umbralPct?: number;
  incidenciaActual: number;
  tendencia: 'subiendo' | 'bajando' | 'estable';
  numRondas: number;
}

/** Subconjunto estructural de `GanadoInventorySummary`
 *  (`src/supabase/functions/server/ganado-inventario.ts`). */
export interface GanadoInventarioParaAcciones {
  total: { cabezas: number; novillos: number; toros: number };
  por_finca: Array<{
    finca: string;
    hectareas: number;
    cabezas: number;
    novillos: number;
    toros: number;
  }>;
  variacion_30_dias: { entradas: number; salidas: number; neto: number };
  pendientes_confirmacion: { total: number };
}

export interface EntradaSelectores {
  /** Lo que ya cargó la tarjeta del hato (bloque 3). `null` = el negocio no
   *  cargó (falla del pulso, no ausencia de datos). */
  animalesHato: AnimalHatoParaAcciones[] | null;
  /** Lo que ya cargó la tarjeta de aguacate. */
  priorizacion: PriorizacionEntryParaAcciones[] | null;
  /** Lo que ya cargó la tarjeta de ganado. */
  ganado: GanadoInventarioParaAcciones | null;
  /** Sólo el umbral que `evaluarSelector` necesita -- no todo `HatoConfig`. */
  config: { dias_espera_voluntaria_post_parto: number } | null;
  hoy: string;
}

/**
 * Cuenta de vacas ACTIVAS con `dias_espera_voluntaria_post_parto` días o
 * más sin servicio/preñez, replicando `vaciasMasDeNDias`
 * (`hatoAlertasTablero.ts`) -- este módulo no puede importarla (puente 3
 * del header general de arriba / mirroring a Deno), así que la MISMA regla
 * queda duplicada aquí: `estadoAnimal==='activa'`, `derivado.estado` en
 * `('parida_reciente','vacia_por_servir')`, `ultimoPartoFecha` no nulo, y
 * `diasEntre(ultimoPartoFecha, hoy) >= umbral`. Si `vaciasMasDeNDias`
 * cambia su regla, este bloque tiene que cambiar en el mismo commit.
 */
function contarVaciasLargas(animales: AnimalHatoParaAcciones[], umbralDias: number, hoy: string): number {
  return animales.filter((a) => {
    if (a.estadoAnimal !== 'activa') return false;
    if (a.derivado.estado !== 'parida_reciente' && a.derivado.estado !== 'vacia_por_servir') return false;
    if (!a.ultimoPartoFecha) return false;
    return diasEntre(a.ultimoPartoFecha, hoy) >= umbralDias;
  }).length;
}

/**
 * `evaluarSelector(id, entrada) -> número o null`. `null` = "no se pudo
 * evaluar" (el negocio no cargó, o -- puente 1 del header -- el dato no
 * está en el alcance de `EntradaSelectores` tal cual la define el brief).
 * NUNCA `0` por defecto cuando falta el dato de entrada.
 */
export function evaluarSelector(id: SelectorId, entrada: EntradaSelectores): number | null {
  switch (id) {
    case 'hato.vacias_90d': {
      if (!entrada.animalesHato || !entrada.config) return null;
      return contarVaciasLargas(entrada.animalesHato, entrada.config.dias_espera_voluntaria_post_parto, entrada.hoy);
    }
    case 'hato.secado_vencido': {
      if (!entrada.animalesHato) return null;
      return entrada.animalesHato.filter((a) => a.derivado.alertas.secado_due).length;
    }
    case 'hato.rechequeo_vencido': {
      if (!entrada.animalesHato) return null;
      return entrada.animalesHato.filter((a) => a.derivado.alertas.rechequeo_due).length;
    }
    case 'agu.plaga_sobre_umbral': {
      if (!entrada.priorizacion) return null;
      return entrada.priorizacion.filter((p) => p.tier === 'A' && p.estadoUmbral === 'over').length;
    }
    case 'gan.pendientes': {
      if (!entrada.ganado) return null;
      return entrada.ganado.pendientes_confirmacion.total;
    }
    case 'gan.fincas_sin_ha': {
      if (!entrada.ganado) return null;
      return entrada.ganado.por_finca.filter((f) => f.hectareas === 0).length;
    }
    // `hato.sin_pesar` / `agu.aplicaciones_colgadas` / `agu.insumo_faltante`
    // / `agu.tarea_atascada`: `EntradaSelectores` no trae pesajes,
    // aplicaciones ni tareas (puente 1 del header) -- devolver `null` es la
    // regla correcta del propio brief ("null no invalida la acción"), no un
    // placeholder pendiente de completar sin más contexto.
    case 'hato.sin_pesar':
    case 'agu.aplicaciones_colgadas':
    case 'agu.insumo_faltante':
    case 'agu.tarea_atascada':
      return null;
    // Fecha, no conteo -- resuelve en `evaluarSelectorFecha` (puente 2).
    case 'hato.ultimo_chequeo_fecha':
      return null;
    default: {
      const _exhaustivo: never = id;
      return _exhaustivo;
    }
  }
}

/**
 * `evaluarSelectorFecha(id, entrada) -> ISO AAAA-MM-DD o null`. Complemento
 * de `evaluarSelector` para los selectores que el brief describe como
 * "devuelven una fecha, no un conteo" (puente 2 del header) -- hoy sólo
 * `hato.ultimo_chequeo_fecha`, consumido por `evaluarDisparo` para el
 * `evento_selector` de la revisión O-8 de productividad del hato.
 */
export function evaluarSelectorFecha(id: SelectorId, entrada: EntradaSelectores): string | null {
  if (id !== 'hato.ultimo_chequeo_fecha') return null;
  if (!entrada.animalesHato) return null;
  let maxFecha: string | null = null;
  for (const a of entrada.animalesHato) {
    if (a.ultimoChequeoFecha && (maxFecha === null || a.ultimoChequeoFecha > maxFecha)) {
      maxFecha = a.ultimoChequeoFecha;
    }
  }
  return maxFecha;
}

// ============================================================================
// Opciones comunes -- lo que sólo el ensamblador (Fase 2) sabe porque tiene
// el catálogo completo de `Destino[]` (A-7(i)/A-8/`visibilidad`, §3.2). Los
// constructores de abajo las reciben como parámetro en vez de adivinarlas.
// ============================================================================

export interface OpcionesHechoComunes {
  /** A-7(i): trabajos abiertos que ya atienden este hecho. */
  atendidoPor?: TrabajoAbierto[];
  /** A-8: `true` si el destino principal de este hecho ya es titular del
   *  pulso (bloque 3). */
  titularPulso?: boolean;
  /** Heredada del destino elegido -- `'gerencia'` si `requiere_rol==='Gerencia'`. */
  visibilidad?: 'todos' | 'gerencia';
}

function completarOpciones(opts?: OpcionesHechoComunes): Required<OpcionesHechoComunes> {
  return {
    atendidoPor: opts?.atendidoPor ?? [],
    titularPulso: opts?.titularPulso ?? false,
    visibilidad: opts?.visibilidad ?? 'todos',
  };
}

/** Construye los diez campos comunes a todo `Hecho` (§3.2) a partir de las
 *  piezas específicas del dominio -- para no repetir la forma completa en
 *  cada constructor. */
function baseHecho(params: {
  id: string;
  negocio: NegocioAccion;
  origen: Hecho['origen'];
  categoria: string;
  texto: string;
  valores: Record<string, ValorHecho>;
  fuente: string;
  fecha_dato: string | null;
  edad_dias: number | null;
  confianza: ConfianzaHecho;
  destinos: DestinoId[];
  cotejo: Hecho['cotejo'];
  fecha_limite?: string | null;
  dias_esperando?: number | null;
  tamano_conjunto?: number | null;
  verbos_permitidos?: string[] | null;
  opts?: OpcionesHechoComunes;
}): Hecho {
  const opciones = completarOpciones(params.opts);
  return {
    id: params.id,
    negocio: params.negocio,
    origen: params.origen,
    categoria: params.categoria,
    texto: params.texto,
    valores: conUnidadReferenciable(params.valores),
    fuente: params.fuente,
    fecha_dato: params.fecha_dato,
    edad_dias: params.edad_dias,
    confianza: params.confianza,
    destinos: params.destinos,
    cotejo: params.cotejo,
    atendido_por: opciones.atendidoPor,
    titular_pulso: opciones.titularPulso,
    fecha_limite: params.fecha_limite ?? null,
    dias_esperando: params.dias_esperando ?? null,
    tamano_conjunto: params.tamano_conjunto ?? null,
    visibilidad: opciones.visibilidad,
    ...(params.verbos_permitidos ? { verbos_permitidos: params.verbos_permitidos } : {}),
  };
}

function nombreAnimal(nombre: string | null, numero: number | null): string {
  if (nombre) return nombre;
  if (numero != null) return `#${numero}`;
  return 'sin nombre';
}

// ============================================================================
// §3.3 -- Hato Lechero
// ============================================================================

/** `hato.vacias_90d`. `animalesVacias` YA viene filtrado por
 *  `vaciasMasDeNDias` (Fase 0a) -- este constructor sólo formatea. `null`
 *  si el conjunto está vacío: cero vacías largas no es una acción. */
export function construirHechoVaciasLargas(
  animalesVacias: AnimalHatoParaAcciones[],
  umbralDias: number,
  totalHato: number,
  hoy: string,
  opts?: OpcionesHechoComunes,
): Hecho | null {
  if (animalesVacias.length === 0) return null;
  const nombres = animalesVacias.map((a) => nombreAnimal(a.nombre, a.numero));
  const diasMax = Math.max(
    ...animalesVacias.map((a) => diasEntre(a.ultimoPartoFecha as string, hoy)),
  );
  return baseHecho({
    id: 'hato.vacias_90d',
    negocio: 'hato_lechero',
    origen: 'O1_senal',
    categoria: 'reproduccion',
    texto: `${animalesVacias.length} de ${totalHato} vacas llevan ${umbralDias} días o más vacías, la más rezagada hace ${diasMax} días — v_hato_estado_actual, hoy`,
    valores: {
      cantidad: valorNumero(animalesVacias.length, 'vacas'),
      dias_umbral: valorNumero(umbralDias, 'días'),
      total_hato: valorNumero(totalHato, 'vacas'),
      nombres: { crudo: animalesVacias.length, render: formatearListaNombres(nombres), unidad: null },
    },
    fuente: 'v_hato_estado_actual',
    fecha_dato: hoy,
    edad_dias: 0,
    confianza: 'ok',
    destinos: ['hato.lista_vacias'],
    cotejo: { tipo: 'conteo_min', selector: 'hato.vacias_90d', minimo: 1 },
    dias_esperando: diasMax,
    tamano_conjunto: animalesVacias.length,
    opts,
  });
}

/** `hato.secado_vencido`. `animalesSecadoVencido` ya viene de
 *  `derivarAlertasTablero(animales).secadoVencido` (Fase 0a). */
export function construirHechoSecadoVencido(
  animalesSecadoVencido: AnimalHatoParaAcciones[],
  hoy: string,
  opts?: OpcionesHechoComunes,
): Hecho | null {
  if (animalesSecadoVencido.length === 0) return null;
  const nombres = animalesSecadoVencido.map((a) => nombreAnimal(a.nombre, a.numero));
  const fechasSecar = animalesSecadoVencido
    .map((a) => a.derivado.fecha_secar)
    .filter((f): f is string => f != null);
  const diasMax = fechasSecar.length > 0 ? Math.max(...fechasSecar.map((f) => diasEntre(f, hoy))) : null;
  const fechaMasVencida = fechasSecar.length > 0 ? fechasSecar.reduce((a, b) => (a < b ? a : b)) : null;
  return baseHecho({
    id: 'hato.secado_vencido',
    negocio: 'hato_lechero',
    origen: 'O1_senal',
    categoria: 'reproduccion',
    texto:
      diasMax != null
        ? `${animalesSecadoVencido.length} vacas con secado vencido, la más antigua hace ${diasMax} días — v_hato_estado_actual, hoy`
        : `${animalesSecadoVencido.length} vacas con secado vencido — v_hato_estado_actual, hoy`,
    valores: {
      cantidad: valorNumero(animalesSecadoVencido.length, 'vacas'),
      dias_max_vencido: diasMax != null ? valorNumero(diasMax, 'días') : valorSinDato('días'),
      nombres: { crudo: animalesSecadoVencido.length, render: formatearListaNombres(nombres), unidad: null },
    },
    fuente: 'v_hato_estado_actual',
    fecha_dato: hoy,
    edad_dias: 0,
    confianza: 'ok',
    destinos: ['hato.lista_secado'],
    cotejo: { tipo: 'conteo_min', selector: 'hato.secado_vencido', minimo: 1 },
    fecha_limite: fechaMasVencida,
    dias_esperando: diasMax,
    tamano_conjunto: animalesSecadoVencido.length,
    opts,
  });
}

/** `hato.proximas_a_secar`. `animalesProximas` ya viene de
 *  `derivarAlertasTablero(animales).proximasASecar` (Fase 0a) -- disjunto
 *  de `secadoVencido` por construcción. */
export function construirHechoProximasASecar(
  animalesProximas: AnimalHatoParaAcciones[],
  hoy: string,
  opts?: OpcionesHechoComunes,
): Hecho | null {
  if (animalesProximas.length === 0) return null;
  const fechasSecar = animalesProximas
    .map((a) => a.derivado.fecha_secar)
    .filter((f): f is string => f != null);
  const diasMin = fechasSecar.length > 0 ? Math.min(...fechasSecar.map((f) => diasEntre(hoy, f))) : null;
  const fechaMasCercana = fechasSecar.length > 0 ? fechasSecar.reduce((a, b) => (a < b ? a : b)) : null;
  return baseHecho({
    id: 'hato.proximas_a_secar',
    negocio: 'hato_lechero',
    origen: 'O1_senal',
    categoria: 'reproduccion',
    texto:
      diasMin != null
        ? `${animalesProximas.length} vacas próximas a secar, la más cercana en ${diasMin} días — v_hato_estado_actual, hoy`
        : `${animalesProximas.length} vacas próximas a secar — v_hato_estado_actual, hoy`,
    valores: {
      cantidad: valorNumero(animalesProximas.length, 'vacas'),
      dias_min_restantes: diasMin != null ? valorNumero(diasMin, 'días') : valorSinDato('días'),
    },
    fuente: 'v_hato_estado_actual',
    fecha_dato: hoy,
    edad_dias: 0,
    confianza: 'ok',
    destinos: ['hato.lista_secado'],
    cotejo: { tipo: 'conteo_min', selector: 'hato.secado_vencido', minimo: 1 },
    fecha_limite: fechaMasCercana,
    tamano_conjunto: animalesProximas.length,
    opts,
  });
}

/** `hato.rechequeo_vencido`. `animalesRechequeo` ya viene de
 *  `derivarAlertasTablero(animales).rechequeoPendiente` (Fase 0a). */
export function construirHechoRechequeoVencido(
  animalesRechequeo: AnimalHatoParaAcciones[],
  hoy: string,
  opts?: OpcionesHechoComunes,
): Hecho | null {
  if (animalesRechequeo.length === 0) return null;
  const fechas = animalesRechequeo.map((a) => a.ultimoChequeoFecha).filter((f): f is string => f != null);
  const diasMax = fechas.length > 0 ? Math.max(...fechas.map((f) => diasEntre(f, hoy))) : null;
  return baseHecho({
    id: 'hato.rechequeo_vencido',
    negocio: 'hato_lechero',
    origen: 'O1_senal',
    categoria: 'sanidad',
    texto: `${animalesRechequeo.length} vacas con rechequeo vencido — v_hato_estado_actual, hoy`,
    valores: { cantidad: valorNumero(animalesRechequeo.length, 'vacas') },
    fuente: 'v_hato_estado_actual',
    fecha_dato: hoy,
    edad_dias: 0,
    confianza: 'ok',
    destinos: ['hato.chequeos'],
    cotejo: { tipo: 'conteo_min', selector: 'hato.rechequeo_vencido', minimo: 1 },
    dias_esperando: diasMax,
    tamano_conjunto: animalesRechequeo.length,
    opts,
  });
}

/** `hato.ultimo_chequeo`. `fechaUltimoChequeo` es `MAX(hato_chequeos.fecha)`
 *  ya consultado -- `null` = nunca hubo chequeo (`confianza='sin_dato'`,
 *  §3.3, "sin chequeos → sin_dato, texto dice 'nunca'"). */
export function construirHechoUltimoChequeo(
  fechaUltimoChequeo: string | null,
  hoy: string,
  opts?: OpcionesHechoComunes,
): Hecho {
  if (fechaUltimoChequeo === null) {
    return baseHecho({
      id: 'hato.ultimo_chequeo',
      negocio: 'hato_lechero',
      origen: 'O2_hueco',
      categoria: 'sanidad',
      texto: 'El hato nunca ha tenido un chequeo veterinario registrado — hato_chequeos',
      valores: { fecha: valorSinDato(), dias: valorSinDato('días') },
      fuente: 'hato_chequeos',
      fecha_dato: null,
      edad_dias: null,
      confianza: 'sin_dato',
      destinos: ['hato.chequeos'],
      cotejo: { tipo: 'sin_cotejo' },
      opts,
    });
  }
  const dias = diasEntre(fechaUltimoChequeo, hoy);
  return baseHecho({
    id: 'hato.ultimo_chequeo',
    negocio: 'hato_lechero',
    origen: 'O1_senal',
    categoria: 'sanidad',
    texto: `Último chequeo veterinario ${formatearFechaLargaCO(fechaUltimoChequeo)}, ${fraseEdad(fechaUltimoChequeo, hoy)} — hato_chequeos`,
    valores: { fecha: valorFecha(fechaUltimoChequeo), dias: valorNumero(dias, 'días') },
    fuente: 'hato_chequeos',
    fecha_dato: fechaUltimoChequeo,
    edad_dias: dias,
    confianza: 'ok',
    destinos: ['hato.chequeos'],
    cotejo: { tipo: 'existe', selector: 'hato.ultimo_chequeo_fecha' },
    dias_esperando: dias,
    opts,
  });
}

/** `hato.cobertura_pesaje`. Se emite sólo cuando hay un denominador real
 *  (`total > 0`) Y hay un hueco (`pesadas < total`) -- una cobertura
 *  completa no es una acción (mismo criterio que "sin tareas ⇒ no se
 *  emite" de §3.3). `confianza='parcial'` SIEMPRE que haya hueco, aunque
 *  falte una sola vaca (regla explícita de §3.3). */
export function construirHechoCoberturaPesaje(
  pesadas: number,
  total: number,
  fechaPesaje: string | null,
  hoy: string,
  opts?: OpcionesHechoComunes,
): Hecho | null {
  if (total === 0 || pesadas >= total) return null;
  const faltan = total - pesadas;
  return baseHecho({
    id: 'hato.cobertura_pesaje',
    negocio: 'hato_lechero',
    origen: 'O2_hueco',
    categoria: 'captura',
    texto:
      fechaPesaje != null
        ? `${faltan} de ${total} vacas en ordeño sin pesar — hato_pesajes_leche, ${fraseEdad(fechaPesaje, hoy)}`
        : `${faltan} de ${total} vacas en ordeño sin pesar — hato_pesajes_leche`,
    valores: {
      pesadas: valorNumero(pesadas, 'vacas'),
      total: valorNumero(total, 'vacas'),
      fecha_pesaje: fechaPesaje != null ? valorFecha(fechaPesaje) : valorSinDato(),
    },
    fuente: 'hato_pesajes_leche',
    fecha_dato: fechaPesaje,
    edad_dias: fechaPesaje != null ? diasEntre(fechaPesaje, hoy) : null,
    confianza: 'parcial',
    destinos: ['hato.pesaje'],
    cotejo: { tipo: 'sin_cotejo' },
    tamano_conjunto: faltan,
    opts,
  });
}

/** `hato.litros_por_vaca`. "sin pesajes ⇒ no se emite el hecho" (§3.3). */
export function construirHechoLitrosPorVaca(
  litrosPromedio: number | null,
  fechaPesaje: string | null,
  denominador: number | null,
  hoy: string,
  opts?: OpcionesHechoComunes,
): Hecho | null {
  if (litrosPromedio === null || fechaPesaje === null) return null;
  return baseHecho({
    id: 'hato.litros_por_vaca',
    negocio: 'hato_lechero',
    origen: 'O1_senal',
    categoria: 'produccion',
    texto: `${formatearNumeroCO(litrosPromedio)} L/vaca promedio — hato_pesajes_leche, ${fraseEdad(fechaPesaje, hoy)}`,
    valores: {
      litros: valorNumero(litrosPromedio, 'L/vaca'),
      fecha: valorFecha(fechaPesaje),
      denominador: denominador != null ? valorNumero(denominador, 'vacas') : valorSinDato('vacas'),
    },
    fuente: 'hato_pesajes_leche',
    fecha_dato: fechaPesaje,
    edad_dias: diasEntre(fechaPesaje, hoy),
    confianza: denominador != null ? 'ok' : 'parcial',
    destinos: ['hato.produccion'],
    cotejo: { tipo: 'sin_cotejo' },
    opts,
  });
}

/** `hato.servicios_90d`. `confianza='parcial'` OBLIGATORIO (§3.3: "el
 *  sistema no distingue hueco de captura de problema reproductivo real"). */
export function construirHechoServicios90d(
  servicios: number,
  prenadas: number,
  totalOrdeno: number,
  hoy: string,
  opts?: OpcionesHechoComunes,
): Hecho | null {
  if (totalOrdeno === 0) return null;
  return baseHecho({
    id: 'hato.servicios_90d',
    negocio: 'hato_lechero',
    origen: 'O1_senal',
    categoria: 'reproduccion',
    texto: `${servicios} servicios y ${prenadas} preñeces confirmadas en los últimos 90 días, sobre ${totalOrdeno} vacas en ordeño — hato_eventos (no distingue hueco de captura de problema real)`,
    valores: {
      servicios: valorNumero(servicios, 'vacas'),
      prenadas: valorNumero(prenadas, 'vacas'),
      total_ordeno: valorNumero(totalOrdeno, 'vacas'),
    },
    fuente: 'hato_eventos',
    fecha_dato: hoy,
    edad_dias: 0,
    confianza: 'parcial',
    destinos: ['hato.lista_hato'],
    cotejo: { tipo: 'sin_cotejo' },
    opts,
  });
}

/** `hato.sin_raza`. */
export function construirHechoSinRaza(cantidad: number, hoy: string, opts?: OpcionesHechoComunes): Hecho | null {
  if (cantidad === 0) return null;
  return baseHecho({
    id: 'hato.sin_raza',
    negocio: 'hato_lechero',
    origen: 'O2_hueco',
    categoria: 'captura',
    texto: `${cantidad} vacas activas sin raza registrada — hato_animales`,
    valores: { cantidad: valorNumero(cantidad, 'vacas') },
    fuente: 'hato_animales',
    fecha_dato: hoy,
    edad_dias: 0,
    confianza: 'sin_dato',
    destinos: ['hato.lista_hato'],
    cotejo: { tipo: 'sin_cotejo' },
    tamano_conjunto: cantidad,
    opts,
  });
}

// ============================================================================
// §3.3 -- Aguacate Hass
// ============================================================================

/** `agu.plaga.<slug>` -- uno por entrada de `priorizarMonitoreo` que el
 *  llamador decida incluir (el "top de la ronda", ya recortado antes de
 *  llamar aquí -- este constructor no decide cuántas entradas entran). NO
 *  incluye `afectados`/`monitoreados` en `valores`: `PriorizacionEntry` no
 *  los trae (ver el puente en la definición de `PriorizacionEntryParaAcciones`
 *  más arriba y el reporte de la sesión). */
export function construirHechosPlaga(
  entradas: PriorizacionEntryParaAcciones[],
  fechaRonda: string | null,
  hoy: string,
  opts?: OpcionesHechoComunes,
): Hecho[] {
  return entradas.map((p) => {
    const sublote = p.sublote_nombre ?? p.sublote_id;
    const lote = p.lote_nombre ?? p.lote_id;
    const incidenciaTxt = formatearNumeroCO(p.incidenciaActual) + '%';
    return baseHecho({
      id: `agu.plaga.${slug(p.pest_nombre)}`,
      negocio: 'aguacate',
      origen: 'O1_senal',
      categoria: 'plagas',
      texto: `${p.pest_nombre} en ${sublote} (${lote}): ${incidenciaTxt} de incidencia, tendencia ${p.tendencia} — monitoreos (ronda_id), ronda más reciente`,
      valores: {
        incidencia: valorNumero(p.incidenciaActual, '%'),
        tendencia: valorTexto(p.tendencia),
        ...(p.umbralPct != null ? { umbral_pct: valorNumero(p.umbralPct, '%') } : {}),
        sublote: valorTexto(sublote),
        lote: valorTexto(lote),
      },
      fuente: 'monitoreos (ronda_id)',
      fecha_dato: fechaRonda,
      edad_dias: fechaRonda != null ? diasEntre(fechaRonda, hoy) : null,
      confianza: 'ok',
      destinos: ['agu.monitoreo', 'agu.monitoreo_sublote'],
      cotejo: { tipo: 'conteo_min', selector: 'agu.plaga_sobre_umbral', minimo: 1 },
      tamano_conjunto: p.numRondas,
      opts,
    });
  });
}

/** `agu.ronda_edad`. `fechaRonda === null` ⇒ `sin_dato` (§3.3). */
export function construirHechoRondaEdad(
  fechaRonda: string | null,
  hoy: string,
  opts?: OpcionesHechoComunes,
): Hecho {
  if (fechaRonda === null) {
    return baseHecho({
      id: 'agu.ronda_edad',
      negocio: 'aguacate',
      origen: 'O2_hueco',
      categoria: 'plagas',
      texto: 'No hay ninguna ronda de monitoreo registrada — rondas_monitoreo',
      valores: { fecha: valorSinDato(), dias: valorSinDato('días') },
      fuente: 'rondas_monitoreo',
      fecha_dato: null,
      edad_dias: null,
      confianza: 'sin_dato',
      destinos: ['agu.monitoreo'],
      cotejo: { tipo: 'sin_cotejo' },
      opts,
    });
  }
  const dias = diasEntre(fechaRonda, hoy);
  return baseHecho({
    id: 'agu.ronda_edad',
    negocio: 'aguacate',
    origen: 'O1_senal',
    categoria: 'plagas',
    texto: `La última ronda de monitoreo es del ${formatearFechaLargaCO(fechaRonda)}, ${fraseEdad(fechaRonda, hoy)} — rondas_monitoreo`,
    valores: { fecha: valorFecha(fechaRonda), dias: valorNumero(dias, 'días') },
    fuente: 'rondas_monitoreo',
    fecha_dato: fechaRonda,
    edad_dias: dias,
    confianza: 'ok',
    destinos: ['agu.monitoreo'],
    cotejo: { tipo: 'sin_cotejo' },
    dias_esperando: dias,
    opts,
  });
}

/** `agu.cobertura_ronda`. `revisados < total` ⇒ `parcial` (§3.3). */
export function construirHechoCoberturaRonda(
  revisados: number,
  total: number,
  noRevisados: string[],
  hoy: string,
  opts?: OpcionesHechoComunes,
): Hecho | null {
  if (total === 0 || revisados >= total) return null;
  const faltan = total - revisados;
  return baseHecho({
    id: 'agu.cobertura_ronda',
    negocio: 'aguacate',
    origen: 'O2_hueco',
    categoria: 'captura',
    texto: `${revisados} de ${total} sublotes revisados en la ronda más reciente — monitoreos (ronda_id), hoy`,
    valores: {
      revisados: valorNumero(revisados, 'sublotes'),
      total: valorNumero(total, 'sublotes'),
      no_revisados: { crudo: faltan, render: formatearListaNombres(noRevisados), unidad: null },
    },
    fuente: 'monitoreos (ronda_id)',
    fecha_dato: hoy,
    edad_dias: 0,
    confianza: 'parcial',
    destinos: ['agu.monitoreo'],
    cotejo: { tipo: 'sin_cotejo' },
    tamano_conjunto: faltan,
    opts,
  });
}

/**
 * `agu.insumo_faltante` (§3.3 bis) -- el hecho bloqueante. Filas YA
 * agregadas por (aplicación, producto) -- el llamador tiene que sumar
 * `cantidad_total_necesaria` entre mezclas de la MISMA aplicación antes de
 * pasarlas aquí (§3.3 bis: "agregar por producto_id dentro de la
 * aplicación... comparar mezcla por mezcla contaría el stock varias veces
 * y fabricaría faltantes que no existen"). Este constructor no reagrupa --
 * confía en que `filas` ya viene una fila por (aplicacionId, productoId).
 */
export interface FilaAplicacionInsumo {
  aplicacionId: string;
  aplicacionNombre: string;
  aplicacionEstado: 'Calculada' | 'En ejecución' | 'Cerrada';
  fechaInicioPlaneada: string | null;
  productoId: string;
  productoNombre: string;
  /** "Kilos" | "Litros" | "Unidades" -- el enum `unidad_medida` tal cual. */
  productoUnidad: string;
  /** Cantidad necesaria YA SUMADA entre mezclas de esta aplicación. */
  cantidadNecesaria: number;
  /** `null` = `productos.cantidad_actual` es NULL -- "sin dato", nunca 0. */
  cantidadDisponible: number | null;
}

/** Piso de ruido (§3.3 bis, regla 3): un faltante por debajo de este
 *  porcentaje del necesario no se publica -- sin él, un faltante de 0,13 L
 *  sobre 9,13 L necesarios (1,4%) compite de igual a igual con 4.694 kg. Es
 *  una decisión del dueño; migra a configuración en la Ola 3 del tablero. */
export const UMBRAL_FALTANTE_RELATIVO = 0.02;

/** Ventana de la regla 1 de §3.3 bis: una aplicación `Calculada` sólo entra
 *  si arranca dentro de estos días. `En ejecución` entra siempre. */
export const VENTANA_APLICACION_CALCULADA_DIAS = 14;

export function construirHechosInsumoFaltante(
  filas: FilaAplicacionInsumo[],
  hoy: string,
  atendidoPorPorClave?: Record<string, TrabajoAbierto[]>,
): Hecho[] {
  const hechos: Hecho[] = [];
  for (const fila of filas) {
    // Regla 1 -- sólo aplicaciones con fecha encima.
    const enVentana =
      fila.aplicacionEstado === 'En ejecución' ||
      (fila.aplicacionEstado === 'Calculada' &&
        fila.fechaInicioPlaneada != null &&
        diasEntre(hoy, fila.fechaInicioPlaneada) >= 0 &&
        diasEntre(hoy, fila.fechaInicioPlaneada) <= VENTANA_APLICACION_CALCULADA_DIAS);
    if (!enVentana) continue;

    const unidad = abreviarUnidad(fila.productoUnidad);
    const id = `agu.insumo_faltante.${slug(fila.aplicacionNombre)}.${slug(fila.productoNombre)}`;
    const clave = `${fila.aplicacionId}|${fila.productoId}`;
    const atendidoPor = atendidoPorPorClave?.[clave] ?? [];

    // Regla 2 -- stock desconocido ⇒ sin_dato, nunca "faltan N".
    if (fila.cantidadDisponible === null) {
      hechos.push(
        baseHecho({
          id,
          negocio: 'aguacate',
          origen: 'O2_hueco',
          categoria: 'insumos',
          texto: `${fila.aplicacionNombre} necesita ${formatearNumeroCO(fila.cantidadNecesaria)} ${unidad} de ${fila.productoNombre}, sin stock registrado — productos.cantidad_actual`,
          valores: {
            producto: valorTexto(fila.productoNombre),
            necesario: valorNumero(fila.cantidadNecesaria, unidad),
            disponible: valorSinDato(unidad),
            falta: valorSinDato(unidad),
            aplicacion: valorTexto(fila.aplicacionNombre),
            ...(fila.fechaInicioPlaneada != null ? { fecha_inicio: valorFecha(fila.fechaInicioPlaneada) } : {}),
          },
          fuente: 'aplicaciones_productos × productos.cantidad_actual',
          fecha_dato: hoy,
          edad_dias: 0,
          confianza: 'sin_dato',
          destinos: ['agu.aplicacion_detalle', 'inv.producto'],
          cotejo: { tipo: 'sin_cotejo' },
          fecha_limite: fila.fechaInicioPlaneada,
          verbos_permitidos: ['Confirmar', 'Verificar'],
          opts: { atendidoPor },
        }),
      );
      continue;
    }

    const falta = fila.cantidadNecesaria - fila.cantidadDisponible;
    if (falta <= 0) continue; // no hay faltante real
    const relativo = fila.cantidadNecesaria > 0 ? falta / fila.cantidadNecesaria : 0;
    if (relativo < UMBRAL_FALTANTE_RELATIVO) continue; // regla 3 -- piso de ruido

    hechos.push(
      baseHecho({
        id,
        negocio: 'aguacate',
        origen: 'O1_senal',
        categoria: 'insumos',
        texto: `${fila.aplicacionNombre} necesita ${formatearNumeroCO(fila.cantidadNecesaria)} ${unidad} de ${fila.productoNombre} y en inventario hay ${formatearNumeroCO(fila.cantidadDisponible)} — productos.cantidad_actual, hoy`,
        valores: {
          producto: valorTexto(fila.productoNombre),
          necesario: valorNumero(fila.cantidadNecesaria, unidad),
          disponible: valorNumero(fila.cantidadDisponible, unidad),
          falta: valorNumero(falta, unidad),
          aplicacion: valorTexto(fila.aplicacionNombre),
          ...(fila.fechaInicioPlaneada != null ? { fecha_inicio: valorFecha(fila.fechaInicioPlaneada) } : {}),
        },
        fuente: 'aplicaciones_productos × productos.cantidad_actual',
        fecha_dato: hoy,
        edad_dias: 0,
        confianza: 'ok',
        destinos: ['agu.aplicacion_detalle', 'inv.producto'],
        cotejo: { tipo: 'sin_cotejo' },
        fecha_limite: fila.fechaInicioPlaneada,
        tamano_conjunto: falta,
        verbos_permitidos: ['Confirmar', 'Verificar'],
        opts: { atendidoPor },
      }),
    );
  }
  return hechos;
}

/**
 * `agu.tarea_atascada` (§3.3, corregido -- puente 3 del header). Reloj =
 * `fechaEstimadaInicio` con fallback a `createdAt`. Se agrega TODO el
 * conjunto en un solo `Hecho` (cantidad, dias_max, nombres[]), igual que
 * `hato.secado_vencido`/`hato.vacias_90d`.
 */
export interface FilaTareaAtascada {
  id: string;
  nombre: string;
  estado: string; // 'Banco' | 'Programada' | 'En Proceso' | 'Completada' | 'Cancelada'
  fechaEstimadaInicio: string | null;
  createdAt: string; // timestamp; sólo se usa la parte AAAA-MM-DD
}

/** Estados de `estado_tarea` que cuentan como "todavía sin terminar" para
 *  este hecho -- ver el puente 3 del header: la tabla de §3.3 dice
 *  `('Banco','Programada')`, pero el caso real que el brief mismo cita
 *  ("Preparación y aplicación microbiología", 200 días) está en 'En
 *  Proceso'. */
const ESTADOS_TAREA_ABIERTA: readonly string[] = ['Banco', 'Programada', 'En Proceso'];

export function construirHechoTareaAtascada(
  tareas: FilaTareaAtascada[],
  hoy: string,
  opts?: OpcionesHechoComunes,
): Hecho | null {
  const atascadas = tareas
    .filter((t) => ESTADOS_TAREA_ABIERTA.includes(t.estado))
    .map((t) => {
      const reloj = t.fechaEstimadaInicio ?? t.createdAt.slice(0, 10);
      return { tarea: t, reloj, dias: diasEntre(reloj, hoy) };
    })
    .filter((x) => x.dias > 0); // sólo lo que YA está atrasado

  if (atascadas.length === 0) return null;
  const diasMax = Math.max(...atascadas.map((x) => x.dias));
  const nombres = atascadas.map((x) => x.tarea.nombre);
  return baseHecho({
    id: 'agu.tarea_atascada',
    negocio: 'aguacate',
    origen: 'O1_senal',
    categoria: 'labor',
    texto: `${atascadas.length} tarea(s) sin avanzar, la más antigua lleva ${diasMax} días de atraso sobre su fecha estimada de inicio — tareas, hoy`,
    valores: {
      cantidad: valorNumero(atascadas.length),
      dias_max: valorNumero(diasMax, 'días'),
      nombres: { crudo: atascadas.length, render: formatearListaNombres(nombres), unidad: null },
    },
    fuente: 'tareas',
    fecha_dato: hoy,
    edad_dias: 0,
    confianza: 'ok',
    destinos: ['agu.labores', 'agu.tarea_detalle'],
    cotejo: { tipo: 'sin_cotejo' },
    dias_esperando: diasMax,
    tamano_conjunto: atascadas.length,
    opts,
  });
}

/**
 * `agu.aplicaciones_colgadas` (§3.3). `atendido_por` se llena CON EL
 * PROPIO conjunto -- por diseño (A-7(ii)): estas aplicaciones ya están en
 * curso, así que este hecho nunca puede sostener una acción por sí solo,
 * sólo servir de evidencia de apoyo (molesta #1 del dueño).
 */
export interface FilaAplicacionColgada {
  id: string;
  nombre: string;
  createdAt: string;
}

/** Umbral de "colgada" -- NO está en el brief (que sólo dice "created_at
 *  antiguo" sin número). Asunción documentada, pendiente de confirmación
 *  del dueño; migra a configuración junto con `UMBRAL_FALTANTE_RELATIVO`. */
export const DIAS_APLICACION_COLGADA_UMBRAL = 5;

export function construirHechoAplicacionesColgadas(
  aplicacionesEnEjecucion: FilaAplicacionColgada[],
  hoy: string,
): Hecho | null {
  const colgadas = aplicacionesEnEjecucion
    .map((a) => ({ a, dias: diasEntre(a.createdAt.slice(0, 10), hoy) }))
    .filter((x) => x.dias >= DIAS_APLICACION_COLGADA_UMBRAL);
  if (colgadas.length === 0) return null;

  const diasMax = Math.max(...colgadas.map((x) => x.dias));
  const nombres = colgadas.map((x) => x.a.nombre);
  const atendidoPor: TrabajoAbierto[] = colgadas.map((x) => ({
    tipo: 'aplicacion',
    referencia: x.a.id,
    etiqueta: x.a.nombre,
    desde: x.a.createdAt.slice(0, 10),
  }));

  return baseHecho({
    id: 'agu.aplicaciones_colgadas',
    negocio: 'aguacate',
    origen: 'O1_senal',
    categoria: 'aplicaciones',
    texto: `${colgadas.length} aplicaciones en ejecución hace ${diasMax} días o más — aplicaciones, hoy`,
    valores: {
      cantidad: valorNumero(colgadas.length),
      dias_max: valorNumero(diasMax, 'días'),
      nombres: { crudo: colgadas.length, render: formatearListaNombres(nombres), unidad: null },
    },
    fuente: 'aplicaciones',
    fecha_dato: hoy,
    edad_dias: 0,
    confianza: 'ok',
    destinos: ['agu.aplicacion_cierre'],
    cotejo: { tipo: 'conteo_min', selector: 'agu.aplicaciones_colgadas', minimo: 1 },
    dias_esperando: diasMax,
    tamano_conjunto: colgadas.length,
    // A-7(ii): siempre atendido por sí mismo -- nunca puede sostener una
    // acción como primer hecho (el validador lo rechaza con A7_YA_ATENDIDO
    // si algún día se cita como sustentador).
    opts: { atendidoPor },
  });
}

/** `agu.aplicacion_arranca`. Una por aplicación `Calculada` cuya
 *  `fecha_inicio_planeada` cae dentro de la ventana. */
export interface FilaAplicacionArranca {
  id: string;
  nombre: string;
  fechaInicioPlaneada: string;
}

export const VENTANA_APLICACION_ARRANCA_DIAS = 14;

export function construirHechosAplicacionArranca(
  aplicacionesCalculadas: FilaAplicacionArranca[],
  hoy: string,
  opts?: OpcionesHechoComunes,
): Hecho[] {
  return aplicacionesCalculadas
    .map((a) => ({ a, dias: diasEntre(hoy, a.fechaInicioPlaneada) }))
    .filter((x) => x.dias >= 0 && x.dias <= VENTANA_APLICACION_ARRANCA_DIAS)
    .map(({ a, dias }) =>
      baseHecho({
        id: `agu.aplicacion_arranca.${slug(a.nombre)}`,
        negocio: 'aguacate',
        origen: 'O1_senal',
        categoria: 'aplicaciones',
        texto: `${a.nombre} arranca ${formatearFechaLargaCO(a.fechaInicioPlaneada)}, ${fraseEdad(a.fechaInicioPlaneada, hoy)} — aplicaciones`,
        valores: {
          nombre: valorTexto(a.nombre),
          dias: valorNumero(dias, 'días'),
          fecha: valorFecha(a.fechaInicioPlaneada),
        },
        fuente: 'aplicaciones',
        fecha_dato: hoy,
        edad_dias: 0,
        confianza: 'ok',
        destinos: ['agu.aplicacion_detalle'],
        cotejo: { tipo: 'sin_cotejo' },
        fecha_limite: a.fechaInicioPlaneada,
        opts,
      }),
    );
}

/** `agu.jornales_semana`. `jornalesEstaSemana === null` ⇒ `sin_dato`,
 *  texto literal "sin jornales registrados esta semana" (§3.3, nunca 0). */
export function construirHechoJornalesSemana(
  jornalesEstaSemana: number | null,
  jornalesSemanaPrevia: number,
  ultimoRegistro: string | null,
  hoy: string,
  opts?: OpcionesHechoComunes,
): Hecho {
  if (jornalesEstaSemana === null) {
    return baseHecho({
      id: 'agu.jornales_semana',
      negocio: 'aguacate',
      origen: 'O2_hueco',
      categoria: 'labor',
      texto: 'Sin jornales registrados esta semana — registros_trabajo',
      valores: {
        jornales: valorSinDato('jornales'),
        jornales_semana_previa: valorNumero(jornalesSemanaPrevia, 'jornales'),
        variacion_pct: valorSinDato('%'),
        ultimo_registro: ultimoRegistro != null ? valorFecha(ultimoRegistro) : valorSinDato(),
      },
      fuente: 'registros_trabajo',
      fecha_dato: hoy,
      edad_dias: 0,
      confianza: 'sin_dato',
      destinos: ['agu.labores'],
      cotejo: { tipo: 'sin_cotejo' },
      opts,
    });
  }
  const variacionPct =
    jornalesSemanaPrevia > 0 ? ((jornalesEstaSemana - jornalesSemanaPrevia) / jornalesSemanaPrevia) * 100 : null;
  return baseHecho({
    id: 'agu.jornales_semana',
    negocio: 'aguacate',
    origen: 'O1_senal',
    categoria: 'labor',
    texto: `${formatearNumeroCO(jornalesEstaSemana)} jornales esta semana (${formatearNumeroCO(jornalesSemanaPrevia)} la semana previa) — registros_trabajo`,
    valores: {
      jornales: valorNumero(jornalesEstaSemana, 'jornales'),
      jornales_semana_previa: valorNumero(jornalesSemanaPrevia, 'jornales'),
      variacion_pct: variacionPct != null ? valorNumero(variacionPct, '%') : valorSinDato('%'),
      ultimo_registro: ultimoRegistro != null ? valorFecha(ultimoRegistro) : valorSinDato(),
    },
    fuente: 'registros_trabajo',
    fecha_dato: hoy,
    edad_dias: 0,
    confianza: 'ok',
    destinos: ['agu.labores'],
    cotejo: { tipo: 'sin_cotejo' },
    opts,
  });
}

/** `agu.lluvia_confianza`. `diasCongelados > 0` ⇒ `parcial` (§3.3). */
export function construirHechoLluviaConfianza(
  diasOk: number,
  diasTotales: number,
  diasCongelados: number,
  hoy: string,
  opts?: OpcionesHechoComunes,
): Hecho | null {
  if (diasCongelados === 0) return null;
  return baseHecho({
    id: 'agu.lluvia_confianza',
    negocio: 'aguacate',
    origen: 'O2_hueco',
    categoria: 'captura',
    texto: `${diasCongelados} de ${diasTotales} días con el contador de lluvia congelado — clima_resumen_diario, últimos ${diasTotales} días`,
    valores: {
      dias_ok: valorNumero(diasOk, 'días'),
      dias_totales: valorNumero(diasTotales, 'días'),
      dias_congelados: valorNumero(diasCongelados, 'días'),
    },
    fuente: 'clima_resumen_diario',
    fecha_dato: hoy,
    edad_dias: 0,
    confianza: 'parcial',
    destinos: ['agu.clima'],
    cotejo: { tipo: 'sin_cotejo' },
    tamano_conjunto: diasCongelados,
    opts,
  });
}

// ============================================================================
// §3.3 -- Ganado
// ============================================================================

/** `gan.inventario`. El llamador decide no llamarlo si la consulta cayó
 *  (§3.3: "consulta caída ⇒ no se emite el hecho... jamás 0"). */
export function construirHechoGanadoInventario(
  cabezas: number,
  novillos: number,
  toros: number,
  hoy: string,
  opts?: OpcionesHechoComunes,
): Hecho {
  return baseHecho({
    id: 'gan.inventario',
    negocio: 'ganado',
    origen: 'O1_senal',
    categoria: 'inventario',
    texto: `${cabezas} cabezas en inventario (${novillos} novillos, ${toros} toros) — gan_inventario, hoy`,
    valores: {
      cabezas: valorNumero(cabezas, 'cabezas'),
      novillos: valorNumero(novillos, 'cabezas'),
      toros: valorNumero(toros, 'cabezas'),
    },
    fuente: 'gan_inventario',
    fecha_dato: hoy,
    edad_dias: 0,
    confianza: 'ok',
    destinos: ['gan.dashboard'],
    cotejo: { tipo: 'sin_cotejo' },
    tamano_conjunto: cabezas,
    opts,
  });
}

/** `gan.variacion_30d`. */
export function construirHechoGanadoVariacion30d(
  entradas: number,
  salidas: number,
  neto: number,
  hoy: string,
  opts?: OpcionesHechoComunes,
): Hecho | null {
  if (entradas === 0 && salidas === 0) return null;
  return baseHecho({
    id: 'gan.variacion_30d',
    negocio: 'ganado',
    origen: 'O1_senal',
    categoria: 'inventario',
    texto: `${entradas} entradas y ${salidas} salidas en los últimos 30 días (neto ${neto >= 0 ? '+' : ''}${neto}) — gan_movimientos`,
    valores: {
      entradas: valorNumero(entradas, 'cabezas'),
      salidas: valorNumero(salidas, 'cabezas'),
      neto: valorNumero(neto, 'cabezas'),
    },
    fuente: 'gan_movimientos',
    fecha_dato: hoy,
    edad_dias: 0,
    confianza: 'ok',
    destinos: ['gan.movimientos'],
    cotejo: { tipo: 'sin_cotejo' },
    opts,
  });
}

/** `gan.fincas_sin_ha`. */
export function construirHechoGanadoFincasSinHa(
  fincasSinHa: string[],
  hoy: string,
  opts?: OpcionesHechoComunes,
): Hecho | null {
  if (fincasSinHa.length === 0) return null;
  return baseHecho({
    id: 'gan.fincas_sin_ha',
    negocio: 'ganado',
    origen: 'O2_hueco',
    categoria: 'captura',
    texto: `${fincasSinHa.length} finca(s) sin hectáreas registradas — no se puede calcular cabezas/ha — gan_fincas`,
    valores: {
      cantidad: valorNumero(fincasSinHa.length),
      nombres: { crudo: fincasSinHa.length, render: formatearListaNombres(fincasSinHa), unidad: null },
    },
    fuente: 'gan_fincas',
    fecha_dato: hoy,
    edad_dias: 0,
    confianza: 'sin_dato',
    destinos: ['gan.config_fincas'],
    cotejo: { tipo: 'conteo_min', selector: 'gan.fincas_sin_ha', minimo: 1 },
    tamano_conjunto: fincasSinHa.length,
    opts,
  });
}

/** `gan.concentracion`. La finca con más cabezas, como % del total. */
export function construirHechoGanadoConcentracion(
  porFinca: Array<{ finca: string; cabezas: number }>,
  totalCabezas: number,
  hoy: string,
  opts?: OpcionesHechoComunes,
): Hecho | null {
  if (totalCabezas === 0 || porFinca.length === 0) return null;
  const top = [...porFinca].sort((a, b) => b.cabezas - a.cabezas)[0];
  if (top.cabezas === 0) return null;
  const pct = (top.cabezas / totalCabezas) * 100;
  return baseHecho({
    id: 'gan.concentracion',
    negocio: 'ganado',
    origen: 'O1_senal',
    categoria: 'inventario',
    texto: `${top.finca} concentra ${formatearNumeroCO(pct)}% del inventario (${top.cabezas} de ${totalCabezas} cabezas) — gan_inventario, hoy`,
    valores: {
      finca: valorTexto(top.finca),
      cabezas: valorNumero(top.cabezas, 'cabezas'),
      pct_del_total: valorNumero(pct, '%'),
    },
    fuente: 'gan_inventario',
    fecha_dato: hoy,
    edad_dias: 0,
    confianza: 'ok',
    destinos: ['gan.dashboard'],
    cotejo: { tipo: 'sin_cotejo' },
    opts,
  });
}

// ============================================================================
// §3.3 ter -- O-8, revisión periódica
// ============================================================================

export type DisparoRevision = 'cada_n_dias' | 'al_cerrar_periodo' | 'al_ocurrir_evento';

/** Fila de `revisiones_periodicas` (migración 101, aplicada como 097), ya consultada. */
export interface RevisionPeriodicaFila {
  clave: string;
  negocio: NegocioAccion;
  nombre: string;
  destinoId: DestinoId;
  activa: boolean;
  disparo: DisparoRevision;
  cadenciaDias: number | null;
  periodo: 'quincenal' | 'mensual' | 'trimestral' | null;
  diasGracia: number;
  eventoSelector: SelectorId | null;
  /** ISO con hora, o `null` si nunca se ha revisado. */
  ultimaRevisionAt: string | null;
}

export interface ResultadoDisparo {
  vencida: boolean;
  fechaLimite: string | null;
  diasEsperando: number | null;
  /** Sólo `al_cerrar_periodo`: el período que motiva el disparo, ya
   *  direccionable (`crudo` = 'AAAA-MM', `render` = 'julio'). */
  periodo: ValorHecho | null;
  /** Sólo `al_ocurrir_evento`: la fecha del evento que dispara, ya
   *  direccionable. */
  evento: ValorHecho | null;
}

interface PeriodoCerrado {
  fin: string; // AAAA-MM-DD, último día del período
  crudo: string;
  render: string;
}

/** El período CERRADO más reciente respecto de `hoy`, para las tres formas
 *  de `periodo`. Sólo `'mensual'` está ejercitado contra datos reales
 *  (única forma que siembra la migración 101); `'quincenal'`/`'trimestral'`
 *  están implementados para sostener el `CHECK` del esquema, no porque haya
 *  hoy una revisión sembrada de esa forma. */
function periodoCerradoMasReciente(
  periodo: 'quincenal' | 'mensual' | 'trimestral',
  hoy: string,
): PeriodoCerrado {
  const [anioHoy, mesHoy, diaHoy] = hoy.split('-').map(Number);

  if (periodo === 'mensual') {
    let anio = anioHoy;
    let mes = mesHoy - 1;
    if (mes === 0) {
      mes = 12;
      anio -= 1;
    }
    const fin = `${anio}-${pad2(mes)}-${pad2(ultimoDiaDeMes(anio, mes))}`;
    return { fin, crudo: `${anio}-${pad2(mes)}`, render: MESES_ES[mes - 1] };
  }

  if (periodo === 'trimestral') {
    const trimestreActual = Math.ceil(mesHoy / 3);
    let trimestre = trimestreActual - 1;
    let anio = anioHoy;
    if (trimestre === 0) {
      trimestre = 4;
      anio -= 1;
    }
    const mesFin = trimestre * 3;
    const fin = `${anio}-${pad2(mesFin)}-${pad2(ultimoDiaDeMes(anio, mesFin))}`;
    const nombresTrimestre = ['primer', 'segundo', 'tercer', 'cuarto'];
    return { fin, crudo: `${anio}-Q${trimestre}`, render: `${nombresTrimestre[trimestre - 1]} trimestre de ${anio}` };
  }

  // quincenal
  if (diaHoy >= 16) {
    const fin = `${anioHoy}-${pad2(mesHoy)}-15`;
    return { fin, crudo: `${anioHoy}-${pad2(mesHoy)}-Q1`, render: `1ª quincena de ${MESES_ES[mesHoy - 1]}` };
  }
  let anio = anioHoy;
  let mes = mesHoy - 1;
  if (mes === 0) {
    mes = 12;
    anio -= 1;
  }
  const fin = `${anio}-${pad2(mes)}-${pad2(ultimoDiaDeMes(anio, mes))}`;
  return { fin, crudo: `${anio}-${pad2(mes)}-Q2`, render: `2ª quincena de ${MESES_ES[mes - 1]}` };
}

/**
 * `evaluarDisparo` (§3.3 ter): decide si una revisión periódica está
 * vencida hoy, y con qué fecha/antigüedad. NO construye el `Hecho` --
 * `construirHechoRevisionPeriodica` hace eso a partir de este resultado.
 * `revision.activa === false` ⇒ nunca vencida (G-1: "sin fila declarada
 * activa, la revisión no existe").
 */
export function evaluarDisparo(
  revision: RevisionPeriodicaFila,
  entrada: EntradaSelectores,
  hoy: string,
): ResultadoDisparo {
  if (!revision.activa) {
    return { vencida: false, fechaLimite: null, diasEsperando: null, periodo: null, evento: null };
  }

  if (revision.disparo === 'cada_n_dias') {
    const cadencia = revision.cadenciaDias as number; // el CHECK del esquema lo garantiza
    if (revision.ultimaRevisionAt === null) {
      // Nunca se ha revisado: vencida desde el día uno, sin fecha ancla.
      return { vencida: true, fechaLimite: null, diasEsperando: null, periodo: null, evento: null };
    }
    const anclaFecha = revision.ultimaRevisionAt.slice(0, 10);
    const fechaLimite = sumarDias(anclaFecha, cadencia);
    const vencida = fechaLimite <= hoy;
    return {
      vencida,
      fechaLimite,
      diasEsperando: vencida ? diasEntre(fechaLimite, hoy) : null,
      periodo: null,
      evento: null,
    };
  }

  if (revision.disparo === 'al_cerrar_periodo') {
    const periodo = revision.periodo as 'quincenal' | 'mensual' | 'trimestral';
    const cerrado = periodoCerradoMasReciente(periodo, hoy);
    const fechaLimite = sumarDias(cerrado.fin, revision.diasGracia);
    const ultimaFecha = revision.ultimaRevisionAt?.slice(0, 10) ?? null;
    const yaRevisadoEstePeriodo = ultimaFecha != null && ultimaFecha >= cerrado.fin;
    const vencida = fechaLimite <= hoy && !yaRevisadoEstePeriodo;
    return {
      vencida,
      fechaLimite: vencida ? fechaLimite : null,
      diasEsperando: vencida ? diasEntre(fechaLimite, hoy) : null,
      periodo: vencida ? { crudo: cerrado.crudo, render: cerrado.render, unidad: null } : null,
      evento: null,
    };
  }

  // al_ocurrir_evento
  const selector = revision.eventoSelector as SelectorId;
  const fechaEvento = evaluarSelectorFecha(selector, entrada);
  if (fechaEvento === null) {
    // "sin evento no hay reloj que vencer" -- §7.5, nunca "vencida hace mucho".
    return { vencida: false, fechaLimite: null, diasEsperando: null, periodo: null, evento: null };
  }
  const ultimaFecha = revision.ultimaRevisionAt?.slice(0, 10) ?? null;
  const vencida = ultimaFecha === null || fechaEvento > ultimaFecha;
  return {
    vencida,
    fechaLimite: vencida ? fechaEvento : null,
    diasEsperando: vencida ? diasEntre(fechaEvento, hoy) : null,
    periodo: null,
    evento: vencida ? valorFecha(fechaEvento) : null,
  };
}

/** Construye el `Hecho` `rev.<clave>` a partir del resultado de
 *  `evaluarDisparo` -- `null` si no está vencida (nada que publicar). */
export function construirHechoRevisionPeriodica(
  revision: RevisionPeriodicaFila,
  resultado: ResultadoDisparo,
  hoy: string,
  opts?: OpcionesHechoComunes,
): Hecho | null {
  if (!resultado.vencida) return null;

  const ultimaTxt =
    revision.ultimaRevisionAt != null ? formatearFechaLargaCO(revision.ultimaRevisionAt.slice(0, 10)) : 'nunca';
  const dias = resultado.diasEsperando;

  let texto: string;
  const valores: Record<string, ValorHecho> = {
    dias_esperando: dias != null ? valorNumero(dias, 'días') : valorSinDato('días'),
    ultima: valorTexto(ultimaTxt),
  };
  if (revision.disparo === 'al_cerrar_periodo' && resultado.periodo) {
    valores.periodo = resultado.periodo;
    texto = `${capitalizar(resultado.periodo.render)} cerró hace ${dias ?? '—'} días y no se ha revisado — revisiones_periodicas, ${resultado.fechaLimite ? formatearFechaLargaCO(resultado.fechaLimite) : ''}`.trim();
  } else if (revision.disparo === 'al_ocurrir_evento' && resultado.evento) {
    valores.evento = resultado.evento;
    texto = `Entró un nuevo evento el ${resultado.evento.render} y "${revision.nombre}" todavía no se revisó, hace ${dias ?? '—'} días — revisiones_periodicas`;
  } else {
    texto = `"${revision.nombre}" lleva ${dias ?? '—'} días sin revisarse — revisiones_periodicas`;
  }

  return baseHecho({
    id: `rev.${revision.clave}`,
    negocio: revision.negocio,
    origen: 'O8_revision',
    categoria: 'revision',
    texto,
    valores,
    fuente: 'revisiones_periodicas',
    fecha_dato: resultado.fechaLimite,
    edad_dias: dias,
    confianza: 'ok',
    destinos: [revision.destinoId],
    cotejo: { tipo: 'sin_cotejo' },
    fecha_limite: resultado.fechaLimite,
    dias_esperando: dias,
    opts,
  });
}

function capitalizar(texto: string): string {
  if (!texto) return texto;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
