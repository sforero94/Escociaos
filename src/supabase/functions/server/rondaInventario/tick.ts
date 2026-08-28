// ARCHIVO: src/supabase/functions/server/rondaInventario/tick.ts
// GENERADO por docs/inventario/regenerar-copias-ronda-inventario.py -- NUNCA
// edites este archivo a mano. Editá `src/utils/rondaInventario/tick.ts` y volvé a correr el script.
//
// POR QUÉ EXISTE ESTE DUPLICADO: el pipeline de voz de la ronda de
// inventario (`ronda-voz-pipeline.ts`, `ronda-inventario-tick.ts` -- de una
// fase posterior) corre en el árbol de despliegue de la edge function y no
// puede importar desde `src/utils/` -- cruzaría la frontera del árbol de
// despliegue de Deno. Misma restricción que ya produjo `calculos-hato.ts`,
// `priorizacion-scouting.ts` y `importHato/*`.
//
// Contenido idéntico al original salvo los especificadores de import
// (reescritos para Deno: `./xxx` -> `./xxx.ts`).
// `src/__tests__/rondaInventarioParidadServidor.test.ts` corre este mismo
// script en modo `--check` y falla si alguien hand-editó una copia en vez de
// regenerarla.

// ARCHIVO: utils/rondaInventario/tick.ts
// DESCRIPCIÓN: Fase 5 (recordatorio, alerta del día 15, reporte de cierre) de
// docs/brief_tecnico_verificacion_inventario.md §8/§13 -- lógica PURA de los
// CUATRO trabajos del tick diario (`ronda-inventario-tick.ts`, I/O, de una
// fase posterior en el mismo commit). Cero I/O: el llamador ya leyó
// `rondas_inventario`/`rondas_avisos`/`rondas_excepciones`/`productos` y le
// pasa a estas funciones los valores ya resueltos (fechas Bogotá, booleanos,
// listas ya filtradas) -- exactamente el mismo reparto que
// `resolverHallazgos.ts`/`interpretarNota.ts` ya establecieron para este
// módulo.
//
// Las CUATRO decisiones de §8.1 del brief técnico, cada una con su propia
// clave de idempotencia para `rondas_avisos` (`clave TEXT PRIMARY KEY`,
// migración 125) -- el I/O hace
// `INSERT ... ON CONFLICT (clave) DO NOTHING`/verifica el 23505 ANTES de
// mandar el mensaje; acá sólo se decide SI corresponde y CUÁL clave reclamar.
//
// Los dos bloques del día 15 (mes omitido + excepciones vencidas, P-2) son
// dos trabajos con condición propia y clave propia -- §8.1 es literal: "el
// bloque de excepciones vencidas NO cuelga del de mes omitido". Se componen
// en UN mensaje cuando los dos aplican en el mismo tick
// (`construirMensajeRevisionDia15`), pero cada uno reclama su clave por
// separado -- el I/O es quien decide, según qué clave se reclamó de verdad,
// qué bloque entra al mensaje de hoy.

// ---------------------------------------------------------------------------
// Constantes con nombre -- nunca un número mágico repetido entre el código y
// el mensaje (mismo criterio que MAX_INTENTOS_PREVIEW en preview.ts).
// ---------------------------------------------------------------------------

/** M-4, literal: "ninguna abierta > 30 días". */
export const DIAS_UMBRAL_EXCEPCION_VENCIDA = 30;

/** §8.4, literal: "hasta 5, y 'y N más' si sobran". */
export const MAX_EXCEPCIONES_VENCIDAS_EN_MENSAJE = 5;

// ---------------------------------------------------------------------------
// 1. Claves de `rondas_avisos` -- un solo dueño del formato, para que el I/O
//    que reclama la clave y el que la vuelve a leer (p. ej. para resolver
//    `posponer_hasta`) nunca la construyan de dos formas distintas.
// ---------------------------------------------------------------------------

/** `AAAA-MM` a partir de un `periodo` 'AAAA-MM-01' -- el mes, sin el día. */
function mesDePeriodo(periodo: string): string {
  return periodo.slice(0, 7);
}

/** Clave de la primera vez que se manda el recordatorio de un período
 * (día 1 del mes, A-1). El I/O UPDATEa esta MISMA fila cuando Uriel pospone
 * (`detalle.posponer_hasta`) -- esta clave no cambia con eso, sigue siendo
 * la del envío original. */
export function claveRecordatorioBase(periodo: string): string {
  return `recordatorio:${mesDePeriodo(periodo)}`;
}

/** Clave de un recordatorio REENVIADO tras una postergación (A-4) -- una
 * clave nueva por cada fecha distinta a la que Uriel pospuso, para que cada
 * reenvío tenga su propia idempotencia sin pisar la del envío original ni la
 * de una postergación anterior. */
export function claveRecordatorioPospuesto(periodo: string, fechaPospuesta: string): string {
  return `recordatorio:${mesDePeriodo(periodo)}:posp:${fechaPospuesta}`;
}

/** R-11/CA-23/CA-24: una sola vez por mes omitido. */
export function claveMesOmitido(periodo: string): string {
  return `mes_omitido:${mesDePeriodo(periodo)}`;
}

/** P-2/M-4: una sola vez por mes en el que el bloque de excepciones vencidas
 * se envía -- independiente de `claveMesOmitido` (§8.1: "NO cuelga del de
 * mes omitido"). */
export function claveExcepcionesVencidas(periodo: string): string {
  return `excepciones_vencidas:${mesDePeriodo(periodo)}`;
}

// ---------------------------------------------------------------------------
// 2. Las decisiones -- una función por trabajo, todas devuelven la MISMA
//    forma (`enviar` + `clave`), para que el I/O las trate uniformemente:
//    si `enviar`, reclamar `clave` con INSERT y sólo mandar el mensaje si el
//    INSERT insertó de verdad.
// ---------------------------------------------------------------------------

export interface DecisionAviso {
  enviar: boolean;
  /** Cadena vacía si `enviar` es `false` -- nunca se usa, documentado para
   * que un test que compare el objeto entero no tenga que hacer un `if`. */
  clave: string;
}

/** A-1/A-4/CA-3, literal de §8.1: "día 1 del mes, o la fecha a la que Uriel
 * pospuso (A-4), y no hay ronda `cerrada` del período". `posponerHasta` es
 * el ÚLTIMO valor que el I/O leyó de `detalle.posponer_hasta` de la clave
 * base para este período -- `null` si Uriel nunca pospuso. Una postergación
 * NUNCA salta CA-24: si la ronda del período ya cerró, no se envía aunque
 * hoy coincida con una fecha pospuesta vieja. */
export function decidirRecordatorio(params: {
  hoy: string;
  periodo: string;
  rondaCerradaDelPeriodo: boolean;
  posponerHasta: string | null;
}): DecisionAviso {
  if (params.rondaCerradaDelPeriodo) return { enviar: false, clave: '' };
  const esDiaUno = params.hoy === params.periodo;
  const esDiaPospuesto = params.posponerHasta !== null && params.hoy === params.posponerHasta;
  if (!esDiaUno && !esDiaPospuesto) return { enviar: false, clave: '' };
  return {
    enviar: true,
    clave: esDiaPospuesto ? claveRecordatorioPospuesto(params.periodo, params.hoy) : claveRecordatorioBase(params.periodo),
  };
}

/** R-11/CA-23, literal: "día ≥ 15 y no hay ronda `cerrada` del período".
 * `≥` y no `= 15` a propósito -- red de seguridad si el cron no corrió
 * exactamente el día 15 (mismo criterio que ya usan otras alertas
 * diarias del repo para no perder la alerta entera por un fallo puntual del
 * disparador); la clave por mes es lo que sigue garantizando CA-24 ("una
 * sola vez por mes omitido"), nunca la condición del día. */
export function decidirMesOmitido(params: { hoy: string; periodo: string; rondaCerradaDelPeriodo: boolean }): DecisionAviso {
  const dia = Number(params.hoy.slice(8, 10));
  if (dia < 15 || params.rondaCerradaDelPeriodo) return { enviar: false, clave: '' };
  return { enviar: true, clave: claveMesOmitido(params.periodo) };
}

/** P-2/M-4: "día 15 y existe ≥ 1 excepción sin desenlace terminal con más de
 * 30 días desde `reportada_en`". Mismo `≥ 15` que `decidirMesOmitido` y por
 * la misma razón -- ver ese comentario. `hayExcepcionesVencidas` ya viene
 * filtrado por el I/O (estado no terminal + `reportada_en` más viejo que
 * `DIAS_UMBRAL_EXCEPCION_VENCIDA`) -- esta función no conoce esa lista,
 * sólo si hay al menos una. */
export function decidirExcepcionesVencidas(params: {
  hoy: string;
  periodo: string;
  hayExcepcionesVencidas: boolean;
}): DecisionAviso {
  const dia = Number(params.hoy.slice(8, 10));
  if (dia < 15 || !params.hayExcepcionesVencidas) return { enviar: false, clave: '' };
  return { enviar: true, clave: claveExcepcionesVencidas(params.periodo) };
}

// ---------------------------------------------------------------------------
// 3. Posponer (A-4) -- aritmética de calendario para los tres botones
//    rápidos ("Mañana"/"En 3 días"/"La próxima semana"). `Date.UTC` ancla el
//    cálculo a la fecha calendario tal cual, sin que ninguna zona horaria lo
//    corra un día -- Bogotá no tiene horario de verano (mismo criterio que
//    el resto del repo), así que sumar días de calendario es una operación
//    de fecha pura, nunca de instante.
// ---------------------------------------------------------------------------

export function sumarDiasFecha(fechaIso: string, dias: number): string {
  const [anio, mes, dia] = fechaIso.split('-').map(Number);
  const base = new Date(Date.UTC(anio, mes - 1, dia));
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// 4. Movimientos ocurridos con la ronda abierta (R-9/CA-19, P-3 §15.3) --
//    clasifica UN movimiento ya traído por el I/O (dentro de la ventana
//    [abierta_en, cerrada_en]) en uno de los TRES orígenes que
//    `reporteCierre.ts` declara (`OrigenMovimientoRondaAbierta`). Reimplementa
//    el tipo acá en vez de importarlo -- mismo motivo que el resto del
//    módulo evita import cruzado innecesario entre archivos hermanos: es un
//    string-union de tres literales, no vale la pena una dependencia por
//    tres palabras, y el test de paridad de tipos lo cubre si alguna vez
//    diverge (`reporteCierre.ts` es la fuente de la verdad del NOMBRE de los
//    tres orígenes).
// ---------------------------------------------------------------------------

export type OrigenMovimientoRondaAbierta = 'captura_excepcion' | 'ajuste_puntual' | 'entrada_fuera_de_alcance';

/**
 * Un movimiento ligado a CUALQUIER excepción de esta ronda (por
 * `captura_movimiento_id` O `aplicacion_movimiento_id` -- las dos vías de
 * R-14 que terminan en un movimiento real) es `captura_excepcion`: nació de
 * resolver un hallazgo que Uriel reportó en esta ronda, sea cual sea el
 * camino. Si NO está ligado a ninguna excepción y su producto tampoco
 * estaba en el alcance congelado, es una entrada fuera de alcance (P-3). Si
 * no está ligado a nada y su producto SÍ estaba en el alcance, es un ajuste
 * puntual del camino (b) de §5.1 -- `NuevoMovimientoModal`, sin relación con
 * la ronda -- exactamente lo que el comentario de `OrigenMovimientoRondaAbierta`
 * en `reporteCierre.ts` describe para ese bucket.
 */
export function clasificarMovimientoRondaAbierta(params: {
  movimientoId: string;
  productoId: string;
  movimientoIdsDeExcepcion: ReadonlySet<string>;
  productoIdsEnAlcance: ReadonlySet<string>;
}): OrigenMovimientoRondaAbierta {
  if (params.movimientoIdsDeExcepcion.has(params.movimientoId)) return 'captura_excepcion';
  if (!params.productoIdsEnAlcance.has(params.productoId)) return 'entrada_fuera_de_alcance';
  return 'ajuste_puntual';
}

// ---------------------------------------------------------------------------
// 5. Valor total del inventario (§8.3 punto 2, CA-20) -- MISMA fórmula que
//    `MovementsDashboard.tsx:195-201` ("mismo criterio que el resto del repo
//    para 'valor de inventario'", instrucción de la tarea): Σ cantidad_actual
//    × precio_unitario sobre productos ACTIVOS, NULL tratado como 0 en
//    cualquiera de los dos factores. Sólo se llama cuando
//    `inventario_parametros.valoracion_publicable = true` -- el I/O nunca
//    invoca esto si no, así que el costo de calcularlo no se paga en el caso
//    común de hoy.
// ---------------------------------------------------------------------------

export interface ProductoParaValoracion {
  cantidadActual: number | null;
  precioUnitario: number | null;
  activo: boolean | null;
}

export function calcularValorInventario(productos: readonly ProductoParaValoracion[]): number {
  return productos.filter((p) => p.activo).reduce((acc, p) => acc + (p.cantidadActual ?? 0) * (p.precioUnitario ?? 0), 0);
}

// ---------------------------------------------------------------------------
// 6. El mensaje del día 15 (§8.4, R-11/CA-23/CA-24 + P-2) -- los DOS
//    bloques, cada uno se incluye sólo si el I/O lo trae (porque SU clave se
//    reclamó). `null` si ninguno aplica: "un día 15 con la ronda hecha y sin
//    deuda no genera ruido" (literal).
// ---------------------------------------------------------------------------

export interface BloqueMesOmitido {
  mesActualNombre: string;
  /** `null` si nunca hubo una ronda cerrada -- CA-21 aplicado acá también:
   * "—", nunca inventar un mes. */
  ultimaRondaCerradaNombre: string | null;
}

export interface ExcepcionVencidaResumen {
  productoNombre: string;
  /** Fecha YA legible (el I/O la formatea, este módulo no conoce
   * `obtenerFechaHoy`/Bogotá -- mismo criterio que el resto de `tick.ts`). */
  reportadaEn: string;
  /** §8.4, regla 1: "nombra el estado en el que está trabada cada
   * excepción, no sólo el conteo" -- ver `etiquetaEstadoPendienteExcepcion`. */
  estadoEtiqueta: string;
  dias: number;
}

export interface InputRevisionDia15 {
  /** `null` si el bloque A (mes omitido) no aplica HOY -- ya sea porque la
   * condición no se cumple, o porque su clave ya se había reclamado un día
   * anterior (CA-24: no se repite). */
  bloqueMesOmitido: BloqueMesOmitido | null;
  /** Vacío si el bloque B no aplica hoy, por la misma razón de arriba. */
  excepcionesVencidas: readonly ExcepcionVencidaResumen[];
}

/**
 * Construye el texto completo del mensaje del día 15, orden y contenido
 * LITERAL de §8.4. `null` si ningún bloque aplica -- el I/O no debe mandar
 * nada en ese caso.
 */
export function construirMensajeRevisionDia15(input: InputRevisionDia15): string | null {
  if (input.bloqueMesOmitido === null && input.excepcionesVencidas.length === 0) return null;

  const bloques: string[] = ['⚠️ Revisión del 15'];

  if (input.bloqueMesOmitido !== null) {
    bloques.push('', `La ronda de ${input.bloqueMesOmitido.mesActualNombre} no se ha cerrado.`);
    bloques.push(`Última ronda cerrada: ${input.bloqueMesOmitido.ultimaRondaCerradaNombre ?? '—'}.`);
  }

  if (input.excepcionesVencidas.length > 0) {
    bloques.push('', `Hay ${input.excepcionesVencidas.length} excepción(es) abiertas hace más de ${DIAS_UMBRAL_EXCEPCION_VENCIDA} días:`);
    const visibles = input.excepcionesVencidas.slice(0, MAX_EXCEPCIONES_VENCIDAS_EN_MENSAJE);
    for (const e of visibles) {
      bloques.push(`  • ${e.productoNombre} — reportada el ${e.reportadaEn}, ${e.estadoEtiqueta} (${e.dias} días)`);
    }
    const restantes = input.excepcionesVencidas.length - visibles.length;
    if (restantes > 0) bloques.push(`  y ${restantes} más`);
  }

  bloques.push('', 'Ver el detalle en Inventario → Rondas.');
  return bloques.join('\n');
}

/** §8.4, regla 1, literal: "'Esperando la explicación de David' y 'esperando
 * tu aprobación' requieren acciones de personas distintas, y fundirlas en
 * '5 abiertas' le deja a Santiago el trabajo de averiguar a quién apurar."
 * Una entrada por cada estado NO terminal de `estado_excepcion_inventario`
 * (los cuatro terminales -- CA-10 -- nunca llegan acá: una excepción vencida
 * por definición todavía no tiene desenlace). Un estado desconocido no
 * revienta: se muestra tal cual, nunca un genérico que esconda el dato. */
const ETIQUETAS_ESTADO_PENDIENTE: Readonly<Record<string, string>> = {
  reportada: 'esperando la explicación de David',
  explicacion_precargada: 'esperando que David confirme la cita',
  explicada: 'explicada, sin ajuste propuesto',
  ajuste_propuesto: 'esperando tu aprobación',
  ajuste_aprobado: 'aprobado, pendiente de aplicar',
};

export function etiquetaEstadoPendienteExcepcion(estado: string): string {
  return ETIQUETAS_ESTADO_PENDIENTE[estado] ?? estado;
}

// ---------------------------------------------------------------------------
// 7. El recordatorio (A-1) -- texto simple, con el período nombrado para que
//    nunca se lea como un aviso genérico.
// ---------------------------------------------------------------------------

export function construirMensajeRecordatorio(periodoNombre: string): string {
  return [
    `🧮 Es hora de la ronda de inventario de ${periodoNombre}.`,
    '',
    'Recorre bodega y contrasta lo físico contra lo que dice el sistema. Cuando estés listo, toca Empezar.',
  ].join('\n');
}
