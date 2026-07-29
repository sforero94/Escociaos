// ARCHIVO: utils/hatoProduccionBackfill.ts
// DESCRIPCIÓN: Motor puro del backfill de quincenas históricas de venta de
// leche -- SOW 4 de `docs/plan_hato_produccion_rework.md` §5 (leer §5.2
// COMPLETO antes de tocar este archivo: fue reescrito tras revisión del
// dueño y la premisa original "44 filas mensuales -> 88 quincenas" del
// brief es FALSA).
//
// Regla dura del brief (§4.1, "Dónde vive la lógica nueva"): TODA la lógica
// pura de este rework vive fuera de `src/utils/calculosHato.ts` (espejado
// byte-a-byte en dos árboles de servidor). Este archivo importa (nunca
// copia) de `calculosHato.ts` (`resolverQuincena`, `rangoQuincena`) y de
// `hatoProduccion.ts` (`reconstruirEstadoAFecha`, `contarVacasEnOrdenoAFecha`,
// SOW 2 -- §4.2e exige explícitamente reusar esa reconstrucción, nunca
// escribir una segunda).
//
// 100% puro: cero imports de Supabase, cero I/O. La única capa que abre un
// cliente de Supabase es el runner `scripts/import-hato/backfill-quincenas-
// leche.ts`, y ni siquiera ese -- ver la cabecera de ese archivo: no hay
// `SUPABASE_SERVICE_ROLE_KEY` en disco en esta sesión, así que el runner es
// JSON-in/JSON-out puro (precedente `recompute-partos-cercanos.ts`), y
// TODO el cómputo real vive aquí, testeado con Vitest.
//
// ============================================================================
// La cascada de clasificación (§5.2) -- LEER ANTES DE MODIFICAR
// ============================================================================
// La historia real de 44 filas `fin_ingresos` (Hato Lechero, venta de
// leche) NO tiene un grano uniforme: algunos meses ya vienen partidos en
// 2-3 filas sub-mensuales (2023-01/02/04), un mes trae un volumen de solo
// ~medio mes (2023-03, 6.291 L), y el resto son un consolidado mensual de
// volumen completo. Partir cada fila en dos fabricaría datos en los meses
// que ya vienen desagregados o en el mes de medio volumen. Por eso el
// backfill CLASIFICA antes de partir, mes por mes:
//
//   1. Mes con >1 fila con `cantidad` -> ya es sub-mensual. Cada fila se
//      asigna a su quincena vía `resolverQuincena(fecha)` (desfase
//      pago->producción medido en 0, decisión del dueño 2026-07-28 --
//      ver comentario de la migración 070). NUNCA se parte una fila.
//      Si dos filas caen en la misma quincena, se SUMAN. Siempre marcado
//      para revisión humana (el dueño lo pidió explícito para los meses
//      multi-fila de 2023, aun con el desfase ya resuelto).
//   2. Mes con exactamente 1 fila, volumen "de mes completo" (según el
//      umbral de abajo) -> se parte 15/N vía `dividirMensualEnQuincenas`.
//   3. Mes con exactamente 1 fila, volumen "de medio mes" -> se carga
//      como UNA sola quincena (la que indique `resolverQuincena` sobre su
//      fecha), SIN partir; la quincena hermana queda SIN FILA = sin dato.
//      Nunca se fabrica una segunda fila con la mitad del volumen.
//   4. El umbral "medio mes" es una fracción declarada y testeada de la
//      MEDIANA de los meses vecinos (nunca un juicio caso por caso). Un
//      mes cuya razón cae DENTRO del margen alrededor del umbral no se
//      decide en automático -- se reporta como 'ambiguo', sin fila
//      derivada, para revisión humana.
//
// Un mes cuya única fila NO trae `cantidad` (histórico sin parsear, ver
// migración 042) produce 0 filas y 1 entrada en `omitidas` -- nunca se
// estima el volumen a partir de `valor`.
//
// ============================================================================
// CORRECCIÓN (2026-07-28, decisión del dueño) -- `num_vacas_ordeno` ya NO
// se deriva de chequeos para este backfill. LEER ANTES DE MODIFICAR.
// ============================================================================
// La primera versión de este motor derivaba `num_vacas_ordeno` para CADA
// quincena vía `reconstruirEstadoAFecha`/`contarVacasEnOrdenoAFecha` (SOW 2,
// §4.2e), reconstruyendo el estado reproductivo desde el histórico de
// chequeos. Contra producción real (171 animales, 768 eventos, 1.479
// chequeos) eso dio 35 vacas en ordeño para 2026. La correlación
// pesaje/factura -- que cuadra con lo facturado al 0,1% en junio 2026 --
// da 27-28. Causa raíz verificada: `hato_eventos` NO tiene NINGÚN evento
// `secado_real` (0 de 768). Sin un solo secado registrado,
// `derivarEstadoReproductivo` nunca puede devolver `'seca'`, así que
// `clasificarCategoriaHato` clasifica TODAS las 35 vacas `activa` como
// `'hato'` (en ordeño) -- sobreestimación sistemática de ~25% en TODO el
// histórico derivado. El código de esa vía es correcto; el insumo
// (secados) simplemente no existe en la base.
//
// Decisión del dueño: MEDIDO donde se pueda, NULL en el resto.
//   - Quincenas desde 2026-03 (pesaje semanal existe desde 2026-03-04,
//     `INICIO_ERA_PESAJES_MEDIDOS` abajo): `num_vacas_ordeno` = conteo de
//     animales DISTINTOS con al menos un pesaje dentro del rango de fechas
//     de esa quincena, `num_vacas_ordeno_origen = 'medido'`.
//   - Cualquier quincena anterior: `num_vacas_ordeno = null` y
//     `num_vacas_ordeno_origen = null` -- NUNCA se escribe el conteo
//     derivado de chequeos. El CHECK `hato_prod_quincenal_vacas_origen_
//     coherente` (migración 070: `num_vacas_ordeno IS NULL OR
//     num_vacas_ordeno_origen IS NOT NULL`) permite explícitamente un
//     conteo NULL con un origen NULL -- verificado contra el archivo de la
//     migración aplicada.
//
// `derivarNumVacasOrdeno` (más abajo) SIGUE DEFINIDA y SIGUE TESTEADA --
// no se borra lógica que funciona. Si algún día empieza a fluir dato real
// de `secado_real`, esa vía vuelve a ser la fuente correcta para el
// histórico pre-2026-03. Hoy simplemente NADIE la llama desde
// `construirFilaDerivada`.

import type { HatoConfig } from '@/utils/calculosHato';
import { resolverQuincena, rangoQuincena } from '@/utils/calculosHato';
import {
  reconstruirEstadoAFecha,
  contarVacasEnOrdenoAFecha,
  type AnimalHistorico,
  type EventoHistorico,
  type ChequeoVacaHistorico,
} from '@/utils/hatoProduccion';

// ============================================================================
// Constantes declaradas del umbral "medio mes" (§5.2, punto 4) -- nunca un
// juicio caso por caso.
// ============================================================================

/** Ventana de meses vecinos (hacia atrás y hacia adelante, hasta 2*N) usada
 * para calcular la mediana de referencia de un mes de 1 fila. */
export const VENTANA_VECINOS_MEDIO_MES = 2;

/** Fracción de la mediana de los meses vecinos por debajo de la cual un mes
 * de 1 fila se clasifica como "medio mes" (caso 3). Calibrada contra el
 * caso real conocido: 2023-03 = 6.291 L vs. una mediana de vecinos de
 * ~12.9k L -> razón ~0,49, muy por debajo de este umbral. */
export const FRACCION_UMBRAL_MEDIO_MES = 0.65;

/** Margen (en la misma escala de fracción) alrededor del umbral que fuerza
 * `caso: 'ambiguo'` en vez de decidir en automático. Una razón en
 * `[UMBRAL - MARGEN, UMBRAL + MARGEN]` no se resuelve sola. */
export const MARGEN_REVISION_UMBRAL_MEDIO_MES = 0.1;

export const FUENTE_BACKFILL = 'backfill_mensual' as const;
export const ORIGEN_DATO_BACKFILL = 'derivado_mensual' as const;

// ============================================================================
// num_vacas_ordeno MEDIDO -- decisión del dueño 2026-07-28 (ver cabecera
// del archivo). Única fuente que este backfill usa hoy.
// ============================================================================

/** Primer (anio, mes) de la "era de pesaje medido": `hato_pesajes_leche`
 * tiene datos desde 2026-03-04, dentro de la quincena 2026-03 Q1. Toda
 * quincena ANTERIOR a esta no tiene ningún pesaje que contar -- ver
 * `estaEnEraPesajesMedidos`. */
export const INICIO_ERA_PESAJES_MEDIDOS = { anio: 2026, mes: 3 } as const;

function ordenCronologicoMes(anio: number, mes: number): number {
  return anio * 12 + mes;
}

/** `true` si (anio, mes) cae en o después de `INICIO_ERA_PESAJES_MEDIDOS`.
 * Nunca se evalúa mirando si esa quincena ESPECÍFICA tiene pesajes (una
 * quincena dentro de la era con 0 pesajes sigue siendo `null`, ver
 * `numVacasOrdenoMedidoQuincena`, pero por ausencia de dato, no porque la
 * era no haya empezado -- son dos motivos distintos, aunque el resultado
 * visible sea el mismo `null`). */
export function estaEnEraPesajesMedidos(anio: number, mes: number): boolean {
  return (
    ordenCronologicoMes(anio, mes) >=
    ordenCronologicoMes(INICIO_ERA_PESAJES_MEDIDOS.anio, INICIO_ERA_PESAJES_MEDIDOS.mes)
  );
}

/** Subconjunto de `hato_pesajes_leche` que este conteo necesita -- solo
 * identidad y fecha, nunca litros (los litros del pesaje son de SOW 2,
 * ajenos a este conteo de "quién fue pesada esta quincena"). */
export interface PesajeMinimo {
  animal_id: string;
  /** ISO `yyyy-mm-dd`. Comparable como texto contra `fecha_inicio`/
   * `fecha_fin` (mismo truco que el resto del módulo). */
  fecha: string;
}

/**
 * `num_vacas_ordeno` MEDIDO de una quincena: cuenta de animales DISTINTOS
 * con al menos un pesaje dentro de `[fechaInicio, fechaFin]` (inclusive).
 * Cero pesajes en el rango -> `{ numVacasOrdeno: null, origen: null }`,
 * NUNCA `0` -- un 0 aquí sería indistinguible de "cero vacas en ordeño esa
 * quincena", que no es lo que significa "no se pesó ninguna" (regla de
 * módulo "sin dato, nunca 0").
 */
export function numVacasOrdenoMedidoQuincena(
  pesajes: PesajeMinimo[],
  fechaInicio: string,
  fechaFin: string,
): { numVacasOrdeno: number | null; origen: 'medido' | null } {
  const distintas = new Set(
    pesajes.filter((p) => p.fecha >= fechaInicio && p.fecha <= fechaFin).map((p) => p.animal_id),
  );
  if (distintas.size === 0) return { numVacasOrdeno: null, origen: null };
  return { numVacasOrdeno: distintas.size, origen: 'medido' };
}

// ============================================================================
// Entrada: filas de fin_ingresos (venta de leche, negocio Hato Lechero)
// ============================================================================

/** Subconjunto de `fin_ingresos` que este motor consume. `cantidad` es
 * litros (poblado por la migración 042 para las filas de venta de leche del
 * Hato) -- `null` cuando el histórico nunca lo parseó; esas filas se omiten
 * y se reportan, nunca se estiman a partir de `valor` (§5.2bis). */
export interface FilaIngresoMensualCruda {
  id: string;
  /** ISO `yyyy-mm-dd`. Es la fecha de pago/cierre de `fin_ingresos`, NO una
   * frontera de periodo -- el desfase pago->producción medido es 0
   * (decisión del dueño, migración 070), así que el MES CALENDARIO de esta
   * fecha se trata como el mes de producción, pero el DÍA nunca se asume
   * como límite de quincena salvo a través de `resolverQuincena`. */
  fecha: string;
  cantidad: number | null;
}

// ============================================================================
// Salida: filas derivadas de `hato_produccion_quincenal`
// ============================================================================

/** Fila lista para insertar en `hato_produccion_quincenal` vía el mismo
 * patrón SELECT-luego-UPDATE/INSERT que el resto del módulo (nunca upsert
 * de PostgREST) -- construida por este motor, escrita por el runner/humano
 * con acceso a Supabase. Shape alineado 1:1 con `HatoProduccionQuincenal`
 * (`src/types/hato.ts`) para los campos que el backfill puebla. */
export interface FilaProduccionQuincenalDerivada {
  anio: number;
  mes: number;
  quincena: 1 | 2;
  fecha_inicio: string;
  fecha_fin: string;
  /** NUNCA null para una fila derivada -- CHECK
   * `hato_prod_quincenal_litros_origen_coherente` (migración 070) lo exige. */
  litros_total: number;
  /** Conteo de vacas distintas pesadas dentro de la quincena (era desde
   * 2026-03, ver `INICIO_ERA_PESAJES_MEDIDOS`), o `null` -- NUNCA el
   * conteo derivado de chequeos (ver cabecera del archivo, corrección
   * 2026-07-28: esa vía sobreestimaba ~25% por ausencia total de eventos
   * `secado_real`). */
  num_vacas_ordeno: number | null;
  num_vacas_ordeno_origen: 'medido' | null;
  fin_ingreso_id: string;
  origen_dato: typeof ORIGEN_DATO_BACKFILL;
  fuente: typeof FUENTE_BACKFILL;
  notas: string;
}

// ============================================================================
// Clasificación por mes -- reportada íntegra, no solo el resultado
// ============================================================================

export type ClasificacionMes =
  | { caso: 'multi_fila'; anio: number; mes: number; idsFilas: string[]; litrosTotalMes: number }
  | { caso: 'mes_completo'; anio: number; mes: number; idFila: string; litros: number; ratioVecinos: number | null }
  | { caso: 'medio_mes'; anio: number; mes: number; idFila: string; litros: number; ratioVecinos: number }
  | {
      caso: 'ambiguo';
      anio: number;
      mes: number;
      idFila: string;
      litros: number;
      ratioVecinos: number | null;
      motivo: string;
    };

export interface FilaOmitida {
  id: string;
  anio: number;
  mes: number;
  motivo: string;
}

export interface ReporteBackfillProduccionQuincenal {
  filasDerivadas: FilaProduccionQuincenalDerivada[];
  clasificaciones: ClasificacionMes[];
  /** Subconjunto de `clasificaciones` que NO se decidió en automático:
   * `multi_fila` (siempre, decisión del dueño) y `ambiguo` (cerca del
   * umbral). `mes_completo`/`medio_mes` quedan fuera -- se decidieron solos. */
  paraRevisionHumana: ClasificacionMes[];
  omitidas: FilaOmitida[];
  resumen: {
    totalMesesConDatos: number;
    totalFilasDerivadas: number;
    totalOmitidas: number;
    totalParaRevisionHumana: number;
  };
}

// ============================================================================
// Entrada completa del motor
// ============================================================================

export interface EntradaBackfillProduccionQuincenal {
  /** TODAS las filas de `fin_ingresos` de venta de leche del negocio Hato
   * Lechero (44 en el histórico verificado 2026-07-28). Coordinador: ver el
   * runner para la forma exacta del dump JSON y el criterio de selección
   * SQL (negocio + categoría por nombre, nunca UUID hardcodeado). */
  filasIngresoMensual: FilaIngresoMensualCruda[];
  /** TODA la tabla `hato_pesajes_leche` (solo `animal_id` + `fecha` --
   * litros no hace falta para este conteo). Única fuente de
   * `num_vacas_ordeno` que este backfill usa (corrección 2026-07-28, ver
   * cabecera del archivo). `animales`/`eventos`/`chequeoVacas`/`config`
   * DEJARON de ser parte de esta entrada: el motor ya no llama
   * `derivarNumVacasOrdeno` desde la orquestación (esa función sigue
   * definida y testeada por separado, tomando esos cuatro argumentos
   * directamente -- ver su docstring). Si algún día se reactiva, este
   * shape es el primer lugar a extender de vuelta. */
  pesajes: PesajeMinimo[];
}

// ============================================================================
// Helpers privados
// ============================================================================

function anioMesDeFecha(fechaIso: string): { anio: number; mes: number } {
  const [anio, mes] = fechaIso.split('-').map(Number);
  return { anio, mes };
}

function claveMes(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, '0')}`;
}

function mediana(valores: number[]): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  const mitad = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0 ? (ordenados[mitad - 1] + ordenados[mitad]) / 2 : ordenados[mitad];
}

interface TotalMes {
  anio: number;
  mes: number;
  total: number;
}

/** Mediana de los totales de los meses vecinos (hasta `ventana` antes y
 * `ventana` después, en orden cronológico, EXCLUYENDO el mes en `indice`).
 * `null` si no hay ningún vecino con datos -- no hay umbral que evaluar sin
 * referencia (§5.2, punto 4: nunca se decide sin comparación). */
export function medianaLitrosVecinos(
  totalesOrdenados: TotalMes[],
  indice: number,
  ventana: number = VENTANA_VECINOS_MEDIO_MES,
): number | null {
  const valores: number[] = [];
  for (let i = Math.max(0, indice - ventana); i <= Math.min(totalesOrdenados.length - 1, indice + ventana); i++) {
    if (i === indice) continue;
    valores.push(totalesOrdenados[i].total);
  }
  return valores.length === 0 ? null : mediana(valores);
}

/**
 * Partición 15/N días de un mes de volumen completo (§5.2bis, caso 2).
 * `q2 = litrosMes - q1` a propósito -- la resta garantiza que la suma sea
 * EXACTA, sin deriva de redondeo (mismo criterio de "no fabricar" que rige
 * el módulo, ej. `dividirCaneca`/reparto de aplicaciones).
 */
export function dividirMensualEnQuincenas(input: {
  anio: number;
  mes: number;
  litrosMes: number;
}): [{ quincena: 1; litros: number }, { quincena: 2; litros: number }] {
  const diasDelMes = new Date(Date.UTC(input.anio, input.mes, 0)).getUTCDate();
  const q1 = Math.round((input.litrosMes * 15) / diasDelMes);
  const q2 = input.litrosMes - q1;
  return [
    { quincena: 1, litros: q1 },
    { quincena: 2, litros: q2 },
  ];
}

/** De un grupo de filas que cayeron en la misma quincena (caso 1, cuando
 * dos entradas mensuales de un mes multi-fila coinciden en quincena), la
 * fila REPRESENTATIVA que presta su `id` como `fin_ingreso_id` de la fila
 * derivada -- la más reciente por fecha (empate resuelto por `id` para ser
 * determinista). El resto de los ids queda documentado en `notas`: el
 * esquema solo admite UN `fin_ingreso_id` por fila derivada (migración
 * 070), así que la trazabilidad completa de un merge vive en el texto, no
 * en una FK adicional. */
function filaRepresentativa(filas: FilaIngresoMensualCruda[]): FilaIngresoMensualCruda {
  return [...filas].sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
    return a.id.localeCompare(b.id);
  }).at(-1)!;
}

export interface DerivacionNumVacas {
  numVacasOrdeno: number | null;
  origen: 'derivado_chequeos' | null;
  anclaChequeo: string | null;
  cobertura: { conFecha: number; sinFecha: number };
}

/**
 * `num_vacas_ordeno` derivado del histórico de chequeos (§4.2e). Reusa
 * EXACTAMENTE `reconstruirEstadoAFecha`/`contarVacasEnOrdenoAFecha` de
 * SOW 2 -- nunca una segunda reconstrucción.
 *
 * >>> NO LLAMADA POR `planificarBackfillProduccionQuincenal` <<< --
 * corrección del dueño 2026-07-28 (ver cabecera del archivo): contra
 * producción real esta vía dio 35 vacas en ordeño para 2026 mientras la
 * correlación pesaje/factura da 27-28. Causa raíz: `hato_eventos` no
 * registra NINGÚN evento `secado_real` (0 de 768), así que
 * `derivarEstadoReproductivo` nunca devuelve `'seca'` y todas las vacas
 * `activa` se cuentan como en ordeño -- sobreestimación sistemática de
 * ~25%. Esta función SIGUE CORRECTA para lo que hace (contar presentes
 * clasificados `hato` a una fecha, dado el estado que el motor puede
 * derivar); el problema es el insumo, no el cálculo. Se conserva definida
 * y testeada (`hatoProduccionBackfill.test.ts`, describe
 * "derivarNumVacasOrdeno (no usada por el backfill...)") para el día en
 * que exista dato real de secado -- en ese momento, esta es la función a
 * volver a invocar desde `construirFilaDerivada` para el histórico
 * anterior a `INICIO_ERA_PESAJES_MEDIDOS`.
 *
 * Regla de cobertura insuficiente (declarada, no caso por caso, mismo
 * criterio que el umbral de medio mes): `null` cuando NO hay ningún
 * chequeo antes del corte (`anclaChequeo === null`) O cuando la mayoría de
 * los animales quedaron sin fecha de entrada/salida determinable
 * (`sinFecha > conFecha`). Cualquier otro caso devuelve el conteo, con su
 * origen declarado -- nunca un número sin procedencia (CHECK
 * `hato_prod_quincenal_vacas_origen_coherente`).
 */
export function derivarNumVacasOrdeno(
  animales: AnimalHistorico[],
  eventos: EventoHistorico[],
  chequeoVacas: ChequeoVacaHistorico[],
  config: HatoConfig,
  fechaCorte: string,
): DerivacionNumVacas {
  const filas = reconstruirEstadoAFecha(animales, eventos, chequeoVacas, fechaCorte);
  const resultado = contarVacasEnOrdenoAFecha(filas, config, fechaCorte);
  const coberturaInsuficiente = resultado.anclaChequeo === null || resultado.cobertura.sinFecha > resultado.cobertura.conFecha;
  return {
    numVacasOrdeno: coberturaInsuficiente ? null : resultado.conteo,
    origen: coberturaInsuficiente ? null : 'derivado_chequeos',
    anclaChequeo: resultado.anclaChequeo,
    cobertura: resultado.cobertura,
  };
}

/** Texto de `notas` para la parte `num_vacas_ordeno` de una fila derivada
 * (decisión del dueño 2026-07-28, ver cabecera del archivo). Tres casos:
 * antes de la era medida (siempre null, nunca se deriva de chequeos),
 * dentro de la era pero sin ningún pesaje en el rango (null, "sin dato"),
 * y dentro de la era con al menos un pesaje (el conteo, origen 'medido'). */
function notaNumVacasOrdeno(
  anio: number,
  mes: number,
  fechaInicio: string,
  fechaFin: string,
  resultado: { numVacasOrdeno: number | null; origen: 'medido' | null },
): string {
  if (!estaEnEraPesajesMedidos(anio, mes)) {
    const eraLabel = `${INICIO_ERA_PESAJES_MEDIDOS.anio}-${String(INICIO_ERA_PESAJES_MEDIDOS.mes).padStart(2, '0')}`;
    return (
      `num_vacas_ordeno: sin dato -- quincena anterior a la era de pesaje medido (${eraLabel}). ` +
      `No se deriva del histórico de chequeos: hato_eventos no registra ningún secado_real, esa vía ` +
      `sobreestimaba ~25% (decisión del dueño 2026-07-28, ver docstring de derivarNumVacasOrdeno).`
    );
  }
  if (resultado.numVacasOrdeno == null) {
    return `num_vacas_ordeno: sin dato -- ningún pesaje registrado dentro de [${fechaInicio}, ${fechaFin}] (era de pesaje medido, pero sin lecturas en este rango).`;
  }
  return `num_vacas_ordeno: ${resultado.numVacasOrdeno} vacas distintas con al menos un pesaje dentro de [${fechaInicio}, ${fechaFin}] (origen 'medido', decisión del dueño 2026-07-28).`;
}

function construirFilaDerivada(
  anio: number,
  mes: number,
  quincena: 1 | 2,
  litros: number,
  finIngresoId: string,
  regla: string,
  entrada: EntradaBackfillProduccionQuincenal,
): FilaProduccionQuincenalDerivada {
  const { fechaInicio, fechaFin } = rangoQuincena(anio, mes, quincena);
  const resultadoVacas = estaEnEraPesajesMedidos(anio, mes)
    ? numVacasOrdenoMedidoQuincena(entrada.pesajes, fechaInicio, fechaFin)
    : { numVacasOrdeno: null as number | null, origen: null as 'medido' | null };
  return {
    anio,
    mes,
    quincena,
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin,
    litros_total: litros,
    num_vacas_ordeno: resultadoVacas.numVacasOrdeno,
    num_vacas_ordeno_origen: resultadoVacas.origen,
    fin_ingreso_id: finIngresoId,
    origen_dato: ORIGEN_DATO_BACKFILL,
    fuente: FUENTE_BACKFILL,
    notas: `Backfill mensual->quincenal (SOW4, docs/plan_hato_produccion_rework.md §5). ${regla} ${notaNumVacasOrdeno(anio, mes, fechaInicio, fechaFin, resultadoVacas)}`,
  };
}

// ============================================================================
// Orquestador principal
// ============================================================================

export function planificarBackfillProduccionQuincenal(
  entrada: EntradaBackfillProduccionQuincenal,
): ReporteBackfillProduccionQuincenal {
  const filasDerivadas: FilaProduccionQuincenalDerivada[] = [];
  const clasificaciones: ClasificacionMes[] = [];
  const omitidas: FilaOmitida[] = [];

  // ---- 1. Agrupar por mes calendario (desfase 0, decisión del dueño) ----
  const porMes = new Map<string, { anio: number; mes: number; filas: FilaIngresoMensualCruda[] }>();
  for (const fila of entrada.filasIngresoMensual) {
    const { anio, mes } = anioMesDeFecha(fila.fecha);
    const clave = claveMes(anio, mes);
    if (!porMes.has(clave)) porMes.set(clave, { anio, mes, filas: [] });
    porMes.get(clave)!.filas.push(fila);
  }

  // Filas sin `cantidad`: se omiten y se reportan, en CUALQUIER mes --
  // nunca se estiman a partir de `valor` (§5.2bis).
  for (const fila of entrada.filasIngresoMensual) {
    if (fila.cantidad == null) {
      const { anio, mes } = anioMesDeFecha(fila.fecha);
      omitidas.push({ id: fila.id, anio, mes, motivo: 'fin_ingresos.cantidad es NULL -- histórico sin parsear (ver migración 042), no se estima desde valor' });
    }
  }

  // ---- 2. Total de litros por mes (SOLO filas con cantidad) -- referencia ----
  // para la mediana de vecinos del umbral "medio mes" (caso 3).
  const totalesOrdenados: TotalMes[] = [...porMes.values()]
    .map(({ anio, mes, filas }) => ({
      anio,
      mes,
      total: filas.filter((f) => f.cantidad != null).reduce((acc, f) => acc + (f.cantidad as number), 0),
    }))
    .filter((t) => t.total > 0) // meses cuyas filas TODAS carecían de cantidad no aportan referencia
    .sort((a, b) => (a.anio !== b.anio ? a.anio - b.anio : a.mes - b.mes));
  const indicePorClave = new Map(totalesOrdenados.map((t, i) => [claveMes(t.anio, t.mes), i]));

  // ---- 3. Clasificar y derivar, mes por mes ----
  for (const { anio, mes, filas } of [...porMes.values()].sort((a, b) => (a.anio !== b.anio ? a.anio - b.anio : a.mes - b.mes))) {
    const filasValidas = filas.filter((f) => f.cantidad != null) as Array<FilaIngresoMensualCruda & { cantidad: number }>;
    if (filasValidas.length === 0) continue; // ya reportadas en `omitidas` arriba

    if (filasValidas.length > 1) {
      // ---- Caso 1: mes multi-fila -- ya sub-mensual, NUNCA se parte ----
      const porQuincena = new Map<1 | 2, typeof filasValidas>();
      for (const fila of filasValidas) {
        const resuelta = resolverQuincena(fila.fecha);
        if (!porQuincena.has(resuelta.quincena)) porQuincena.set(resuelta.quincena, []);
        porQuincena.get(resuelta.quincena)!.push(fila);
      }
      const litrosTotalMes = filasValidas.reduce((acc, f) => acc + f.cantidad, 0);
      for (const [quincena, filasQuincena] of [...porQuincena.entries()].sort((a, b) => a[0] - b[0])) {
        const litros = filasQuincena.reduce((acc, f) => acc + f.cantidad, 0);
        const representativa = filaRepresentativa(filasQuincena);
        const idsMerge = filasQuincena.map((f) => f.id);
        const regla =
          filasQuincena.length > 1
            ? `Caso 1 (mes multi-fila): quincena Q${quincena} suma ${idsMerge.length} filas de fin_ingresos (${idsMerge.join(', ')}) = ${litros} L; fin_ingreso_id enlaza a la más reciente (${representativa.id}). Requiere revisión humana (mes multi-fila).`
            : `Caso 1 (mes multi-fila): quincena Q${quincena} = fila fin_ingresos ${representativa.id} (${litros} L), asignada por resolverQuincena(fecha) (desfase pago->producción 0). Requiere revisión humana (mes multi-fila).`;
        filasDerivadas.push(construirFilaDerivada(anio, mes, quincena, litros, representativa.id, regla, entrada));
      }
      const clasificacion: ClasificacionMes = {
        caso: 'multi_fila',
        anio,
        mes,
        idsFilas: filasValidas.map((f) => f.id),
        litrosTotalMes,
      };
      clasificaciones.push(clasificacion);
      continue;
    }

    // ---- Mes con exactamente 1 fila válida: caso 2, 3 o ambiguo ----
    const fila = filasValidas[0];
    const indice = indicePorClave.get(claveMes(anio, mes));
    const medianaVecinos = indice != null ? medianaLitrosVecinos(totalesOrdenados, indice) : null;
    const ratioVecinos = medianaVecinos != null && medianaVecinos > 0 ? fila.cantidad / medianaVecinos : null;

    const resuelta = resolverQuincena(fila.fecha);

    if (ratioVecinos == null) {
      const clasificacion: ClasificacionMes = {
        caso: 'ambiguo',
        anio,
        mes,
        idFila: fila.id,
        litros: fila.cantidad,
        ratioVecinos: null,
        motivo: 'sin meses vecinos con datos para calcular una mediana de referencia -- no se puede evaluar el umbral de medio mes',
      };
      clasificaciones.push(clasificacion);
      continue;
    }

    const umbralInferior = FRACCION_UMBRAL_MEDIO_MES - MARGEN_REVISION_UMBRAL_MEDIO_MES;
    const umbralSuperior = FRACCION_UMBRAL_MEDIO_MES + MARGEN_REVISION_UMBRAL_MEDIO_MES;

    if (ratioVecinos < umbralInferior) {
      // ---- Caso 3: medio mes -- UNA quincena, la hermana queda sin fila ----
      const regla = `Caso 3 (medio mes): fila fin_ingresos ${fila.id} (${fila.cantidad} L) cargada COMPLETA en Q${resuelta.quincena} sin partir (razón vs. mediana de vecinos = ${ratioVecinos.toFixed(3)}, < ${umbralInferior}). La quincena hermana queda sin fila -- sin dato, nunca fabricado.`;
      filasDerivadas.push(construirFilaDerivada(anio, mes, resuelta.quincena, fila.cantidad, fila.id, regla, entrada));
      clasificaciones.push({ caso: 'medio_mes', anio, mes, idFila: fila.id, litros: fila.cantidad, ratioVecinos });
    } else if (ratioVecinos > umbralSuperior) {
      // ---- Caso 2: mes completo -- partir 15/N ----
      const [q1, q2] = dividirMensualEnQuincenas({ anio, mes, litrosMes: fila.cantidad });
      const reglaBase = `Caso 2 (mes completo): fila fin_ingresos ${fila.id} (${fila.cantidad} L, razón vs. mediana de vecinos = ${ratioVecinos.toFixed(3)}, > ${umbralSuperior}) partida 15/N días`;
      filasDerivadas.push(construirFilaDerivada(anio, mes, 1, q1.litros, fila.id, `${reglaBase} -- Q1 = ${q1.litros} L.`, entrada));
      filasDerivadas.push(construirFilaDerivada(anio, mes, 2, q2.litros, fila.id, `${reglaBase} -- Q2 = ${q2.litros} L (resta exacta, sin deriva de redondeo).`, entrada));
      clasificaciones.push({ caso: 'mes_completo', anio, mes, idFila: fila.id, litros: fila.cantidad, ratioVecinos });
    } else {
      // ---- Cerca del umbral: no se decide en automático ----
      clasificaciones.push({
        caso: 'ambiguo',
        anio,
        mes,
        idFila: fila.id,
        litros: fila.cantidad,
        ratioVecinos,
        motivo: `razón ${ratioVecinos.toFixed(3)} cae dentro del margen de revisión [${umbralInferior}, ${umbralSuperior}] alrededor del umbral -- no se decide en automático entre mes completo y medio mes`,
      });
    }
  }

  const paraRevisionHumana = clasificaciones.filter((c) => c.caso === 'multi_fila' || c.caso === 'ambiguo');

  return {
    filasDerivadas,
    clasificaciones,
    paraRevisionHumana,
    omitidas,
    resumen: {
      totalMesesConDatos: clasificaciones.length,
      totalFilasDerivadas: filasDerivadas.length,
      totalOmitidas: omitidas.length,
      totalParaRevisionHumana: paraRevisionHumana.length,
    },
  };
}

// ============================================================================
// Idempotencia -- comparación contra el estado vivo (§5.3)
// ============================================================================

/** Subconjunto de `hato_produccion_quincenal` que el runner necesita leer
 * para verificar idempotencia antes de escribir (fase `--apply`, fuera del
 * alcance de este runner en esta sesión -- ver cabecera del script). */
export interface FilaProduccionQuincenalExistente {
  id: string;
  anio: number;
  mes: number;
  quincena: 1 | 2;
  origen_dato: 'medido' | 'derivado_mensual';
  litros_total: number | null;
  fin_ingreso_id: string;
  num_vacas_ordeno: number | null;
}

export interface DiffBackfillProduccionQuincenal {
  /** Periodos que no existen todavía -- se insertarían. */
  aInsertar: FilaProduccionQuincenalDerivada[];
  /** Periodos derivados ya existentes con los MISMOS valores -- 0 escritura
   * (invariante "re-correr converge", §5.3). */
  sinCambios: Array<{ propuesta: FilaProduccionQuincenalDerivada; existenteId: string }>;
  /** Periodos que YA tienen una fila `medido` -- el dato real gana sobre el
   * derivado, siempre. Nunca se pisa. */
  respetadasPorSerMedidas: Array<{ propuesta: FilaProduccionQuincenalDerivada; existenteId: string }>;
  /** Periodos derivados existentes cuyos valores DIVERGEN de la propuesta
   * actual (ej. el histórico de `fin_ingresos` cambió entre corridas) --
   * requieren decisión humana, este motor no los sobrescribe solo. */
  divergentes: Array<{ propuesta: FilaProduccionQuincenalDerivada; existenteId: string }>;
}

/**
 * Compara el plan recién calculado contra el estado vivo de
 * `hato_produccion_quincenal` (§5.3: "re-lee el estado vivo... si algo
 * cambió, aborta listando las diferencias"). Puro -- el runner/humano con
 * acceso a Supabase decide qué hacer con cada bucket; esta función solo
 * clasifica.
 */
export function diffContraEstadoExistente(
  propuestas: FilaProduccionQuincenalDerivada[],
  existentes: FilaProduccionQuincenalExistente[],
): DiffBackfillProduccionQuincenal {
  const existentePorPeriodo = new Map(existentes.map((e) => [claveMes(e.anio, e.mes) + `-Q${e.quincena}`, e]));

  const resultado: DiffBackfillProduccionQuincenal = {
    aInsertar: [],
    sinCambios: [],
    respetadasPorSerMedidas: [],
    divergentes: [],
  };

  for (const propuesta of propuestas) {
    const clave = claveMes(propuesta.anio, propuesta.mes) + `-Q${propuesta.quincena}`;
    const existente = existentePorPeriodo.get(clave);
    if (!existente) {
      resultado.aInsertar.push(propuesta);
      continue;
    }
    if (existente.origen_dato === 'medido') {
      resultado.respetadasPorSerMedidas.push({ propuesta, existenteId: existente.id });
      continue;
    }
    const igual =
      existente.litros_total === propuesta.litros_total &&
      existente.fin_ingreso_id === propuesta.fin_ingreso_id &&
      existente.num_vacas_ordeno === propuesta.num_vacas_ordeno;
    if (igual) {
      resultado.sinCambios.push({ propuesta, existenteId: existente.id });
    } else {
      resultado.divergentes.push({ propuesta, existenteId: existente.id });
    }
  }

  return resultado;
}
