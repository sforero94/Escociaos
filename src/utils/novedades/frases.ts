/**
 * Plantillas de frases de "Novedades" (issue #266) -- PURO: sin red, sin
 * Supabase, sin React, **cero LLM** (§6 punto 6 / §12.9 del brief y del
 * plan técnico). Cada plantilla es una función con parámetros TIPADOS
 * (`Novedad`, ya agrupada por `agrupar.ts`) que devuelve una estructura de
 * dos partes -- nunca concatena texto libre del usuario fuera de una
 * ranura ya tipada (§4.1 del plan técnico: "el mecanismo de ranuras
 * tipadas del motor que se retira; acá no hay modelo, así que la ranura
 * sólo protege contra un error de programación").
 *
 * Dos partes, igual que §4.1 del brief:
 *   - `texto`   -- el hecho, en pasado, sujeto = autor, objeto nombrado.
 *   - `detalle` -- fecha/rango del hecho · tamaño · canal · "con fecha
 *                  futura" si aplica.
 *
 * `frasearNovedad(n)` despacha por `n.fuente` -- si algún día el catálogo
 * gana una fuente sin plantilla, lanza un error explícito en vez de
 * imprimir un texto genérico que nadie pidió (§12.7: "el autor nunca se
 * inventa" se extiende acá a "la frase nunca se inventa").
 */

import type { CanalNovedad, Novedad } from './tipos';
import { formatCurrency, formatNumber } from '@/utils/format';

export interface FraseNovedad {
  /** El autor tal cual lo devuelve `sujetoAutor(n)` -- SIEMPRE el prefijo
   *  literal de `texto` (cada plantilla empieza con `${sujetoAutor(n)} ...`).
   *  Expuesto aparte para que `NovedadLinea.tsx` lo pinte en negrita sin que
   *  `frases.ts` importe React ni conozca JSX (guardrail 2026-09-17:
   *  "bold the user names"). */
  autor: string;
  /** Línea 1: el hecho, en pasado, listo para pintar. */
  texto: string;
  /** Línea 2: fecha/rango del hecho, tamaño, canal, "con fecha futura". */
  detalle: string;
}

// ============================================================================
// Autor -- §4.3 del brief, "nunca se inventa, nunca 'Sistema' donde falta".
// ============================================================================

function sujetoAutor(n: Novedad): string {
  return n.autorNombre ?? n.autorTextoLibre ?? 'sin autor registrado';
}

// ============================================================================
// Listas de nombres propios -- §2.4 del brief: "hasta 3; más allá, 'y N
// más'". `n.objetosNombre` ya llega en el orden en que `agrupar.ts` los
// preservó (más reciente primero) -- esta función SÓLO decide el corte.
// ============================================================================

const CUPO_NOMBRES = 3;

export function formatearListaNombres(nombres: readonly string[]): string {
  if (nombres.length === 0) return '';
  if (nombres.length === 1) return nombres[0];
  if (nombres.length <= CUPO_NOMBRES) {
    return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
  }
  const resto = nombres.length - CUPO_NOMBRES;
  return `${nombres.slice(0, CUPO_NOMBRES).join(', ')} y ${resto} más`;
}

// ============================================================================
// Fechas -- §4.2 del brief: rango completo siempre que haya más de una
// fecha, año sólo cuando la RANGO lo necesita (alguna punta difiere del año
// de captura, o las dos puntas caen en años distintos entre sí). Duplicado
// deliberado de un formateador de fecha local en vez de reusar
// `formatearFechaLarga` de `@/utils/fechas` (que SIEMPRE imprime el año) --
// mismo patrón de "cada consumidor puro repite la fórmula" que
// `calculosRequiereDecision.ts` ya documenta para este módulo.
// ============================================================================

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function partesFecha(fechaISO: string): { dia: number; mes: number; anio: number } {
  const [anio, mes, dia] = fechaISO.slice(0, 10).split('-').map(Number);
  return { dia, mes, anio };
}

function diaYMes(fechaISO: string): string {
  const { dia, mes } = partesFecha(fechaISO);
  return `${dia} de ${MESES[mes - 1]}`;
}

function diaMesAnio(fechaISO: string): string {
  const { dia, mes, anio } = partesFecha(fechaISO);
  return `${dia} de ${MESES[mes - 1]} de ${anio}`;
}

/**
 * `fechasHecho` YA viene ordenada ascendente y sin duplicados (contrato de
 * `agrupar.ts`). `capturadoEn` es el ISO completo (con huso) de la
 * `Novedad` -- su año en Bogotá es lo que decide "el año de la captura"
 * (§4.2 del brief), por eso pasa por `diaBogota()` y no por un `slice`
 * crudo del string UTC.
 */
export function formatearRangoHecho(fechasHecho: readonly string[], capturadoEnBogota: string): string {
  if (fechasHecho.length === 0) return '';

  const anioCaptura = Number(capturadoEnBogota.slice(0, 4));
  const min = fechasHecho[0];
  const max = fechasHecho[fechasHecho.length - 1];
  const { anio: anioMin } = partesFecha(min);
  const { anio: anioMax } = partesFecha(max);
  const necesitaAnio = anioMin !== anioCaptura || anioMax !== anioCaptura || anioMin !== anioMax;

  const formatear = necesitaAnio ? diaMesAnio : diaYMes;
  return min === max ? formatear(min) : `${formatear(min)} al ${formatear(max)}`;
}

// ============================================================================
// Canal -- §4.3/§5 del plan técnico: sólo 4 fuentes del hato lo tienen;
// las demás llegan con `canal: null` y este helper simplemente lo omite
// (nunca "por la web" inferido de la ausencia de dato).
// ============================================================================

const CANAL_ETIQUETA: Record<CanalNovedad, string> = {
  web: 'la web',
  telegram: 'Telegram',
  importacion: 'una importación',
  alerta: 'una alerta',
  chequeo: 'un chequeo',
};

function detalleCanal(canal: CanalNovedad | null): string | null {
  return canal ? `por ${CANAL_ETIQUETA[canal]}` : null;
}

/** Arma la línea de detalle con sus partes presentes, unidas por " · ",
 *  y agrega "con fecha futura" al final si corresponde (§4.2 del brief:
 *  marca binaria, nunca un umbral). */
function armarDetalle(partes: (string | null)[], conFechaFutura: boolean): string {
  const presentes = partes.filter((p): p is string => !!p);
  if (conFechaFutura) presentes.push('con fecha futura');
  return presentes.join(' · ');
}

// ============================================================================
// Plantillas por fuente
// ============================================================================

// -- hato_eventos --------------------------------------------------------
// CHECK de la 053 (11 valores) -- etiqueta singular/plural para cada uno.
// Un `tipoHecho` fuera de esta lista (no debería ocurrir: el cargador nunca
// filtra) cae en un respaldo que NUNCA inventa una palabra: usa el valor
// crudo, nunca "evento" genérico.
const ETIQUETA_TIPO_EVENTO_HATO: Record<string, { singular: string; plural: string }> = {
  servicio: { singular: 'un servicio', plural: 'servicios' },
  celo: { singular: 'un celo', plural: 'celos' },
  confirmacion_prenez: { singular: 'una confirmación de preñez', plural: 'confirmaciones de preñez' },
  parto: { singular: 'un parto', plural: 'partos' },
  aborto: { singular: 'un aborto', plural: 'abortos' },
  secado_real: { singular: 'un secado', plural: 'secados' },
  venta: { singular: 'una venta', plural: 'ventas' },
  muerte: { singular: 'una muerte', plural: 'muertes' },
  compra: { singular: 'una compra', plural: 'compras' },
  cambio_etapa: { singular: 'un cambio de etapa', plural: 'cambios de etapa' },
  rechequeo: { singular: 'un rechequeo', plural: 'rechequeos' },
};

function etiquetaEventoHato(tipoHecho: string, n: number): string {
  const etiqueta = ETIQUETA_TIPO_EVENTO_HATO[tipoHecho];
  if (!etiqueta) return n === 1 ? `un registro de ${tipoHecho}` : `${n} registros de ${tipoHecho}`;
  return n === 1 ? etiqueta.singular : `${n} ${etiqueta.plural}`;
}

// Verbo del detalle -- brief §4.1: "inseminación del 11 de agosto", nunca
// una fecha pelada. El pipeline no distingue monta/inseminación dentro de
// `tipo='servicio'` (esa sub-distinción vive en `tipo_servicio` y no viaja
// por `NovedadCruda`/`Novedad`) -- se documenta como simplificación
// deliberada: el sustantivo del verbo coincide con el que ya usa el texto
// (línea 1), nunca uno inventado. Mismo patrón "<verbo> del <fecha>" que
// ya usan `frasearHatoTratamientos` ("inicio") y `frasearRegistrosTrabajo`
// ("trabajo") más abajo.
const VERBO_DETALLE_EVENTO_HATO: Record<string, string> = {
  servicio: 'servicio del',
  celo: 'celo del',
  confirmacion_prenez: 'confirmación del',
  parto: 'parto del',
  aborto: 'aborto del',
  secado_real: 'secado del',
  venta: 'venta del',
  muerte: 'muerte del',
  compra: 'compra del',
  cambio_etapa: 'cambio de etapa del',
  rechequeo: 'rechequeo del',
};

export function frasearHatoEventos(n: Novedad): FraseNovedad {
  const cantidad = n.tamano.filas;
  const objeto = n.objetosNombre.length > 0 ? ` de ${formatearListaNombres(n.objetosNombre)}` : '';
  const texto = `${sujetoAutor(n)} registró ${etiquetaEventoHato(n.tipoHecho, cantidad)}${objeto}`;
  const verbo = VERBO_DETALLE_EVENTO_HATO[n.tipoHecho];
  const fecha = formatearRangoHecho(n.fechasHecho, n.capturadoEn);
  const detalle = armarDetalle(
    [verbo ? `${verbo} ${fecha}` : fecha, detalleCanal(n.canal)],
    n.conFechaFutura,
  );
  return { autor: sujetoAutor(n), texto, detalle };
}

// -- hato_pesajes_leche ---------------------------------------------------
// "Martha registró el pesaje del 27 de agosto · 52 de 65 vacas" -- el
// denominador NUNCA desaparece (§2.3 del brief), aunque valga 0 (finca sin
// vacas activas es un hecho real, no "sin dato").
export function frasearHatoPesajesLeche(n: Novedad): FraseNovedad {
  const fecha = formatearRangoHecho(n.fechasHecho, n.capturadoEn);
  const texto = `${sujetoAutor(n)} registró el pesaje del ${fecha}`;
  const denominador = n.tamano.denominador ?? 0;
  const detalle = armarDetalle(
    [`${formatNumber(n.tamano.filas)} de ${formatNumber(denominador)} vacas`, detalleCanal(n.canal)],
    n.conFechaFutura,
  );
  return { autor: sujetoAutor(n), texto, detalle };
}

// -- hato_tratamientos ------------------------------------------------------
// Guardrail 2026-09-17 (Santiago): "martha vega registro un tratamiento" no
// dice qué vaca -- nombra el animal en el texto, mismo mecanismo que
// `hato_eventos` (hasta 3 + "y N más", `formatearListaNombres`).
export function frasearHatoTratamientos(n: Novedad): FraseNovedad {
  const cantidad = n.tamano.filas;
  const etiqueta = cantidad === 1 ? 'un tratamiento' : `${formatNumber(cantidad)} tratamientos`;
  const objeto = n.objetosNombre.length > 0 ? ` de ${formatearListaNombres(n.objetosNombre)}` : '';
  const texto = `${sujetoAutor(n)} registró ${etiqueta}${objeto}`;
  const detalle = armarDetalle(
    [`inicio ${formatearRangoHecho(n.fechasHecho, n.capturadoEn)}`, detalleCanal(n.canal)],
    n.conFechaFutura,
  );
  return { autor: sujetoAutor(n), texto, detalle };
}

// -- hato_chequeos ----------------------------------------------------------
export function frasearHatoChequeos(n: Novedad): FraseNovedad {
  const fecha = formatearRangoHecho(n.fechasHecho, n.capturadoEn);
  const texto = `${sujetoAutor(n)} subió el chequeo del ${fecha}`;
  const detalle = armarDetalle([`${formatNumber(n.tamano.filas)} vacas`, detalleCanal(n.canal)], n.conFechaFutura);
  return { autor: sujetoAutor(n), texto, detalle };
}

// -- registros_trabajo --------------------------------------------------
// "David García registró 12 jornales en Recolección cosecha, Drench
// Septiembre y 1 más para 7 personas" -- `tamano.filas` acá YA es la suma de
// fraccion_jornal (no un conteo de filas, ver `registrosTrabajo.ts`), y
// `tamano.personas` YA es el conteo de personas distintas -- este archivo
// sólo formatea, nunca recalcula (§12.12 del brief).
//
// Guardrail 2026-09-17 (Santiago): "X jornales Y personas" no dice EN QUÉ
// labor -- sin eso la línea no se lee sola. `objetoNombre` ahora trae el
// nombre de la tarea (`registrosTrabajo.ts`); si por lo que sea llega vacío
// (tarea borrada, fila huérfana), la cláusula "en ..." se omite entera en
// vez de imprimir "en undefined".
export function frasearRegistrosTrabajo(n: Novedad): FraseNovedad {
  const jornales = formatNumber(n.tamano.filas, Number.isInteger(n.tamano.filas) ? 0 : 1);
  const personas = n.tamano.personas ?? 0;
  const etiquetaPersonas = personas === 1 ? '1 persona' : `${formatNumber(personas)} personas`;
  const labor = n.objetosNombre.length > 0 ? ` en ${formatearListaNombres(n.objetosNombre)}` : '';
  const texto = `${sujetoAutor(n)} registró ${jornales} jornal${n.tamano.filas === 1 ? '' : 'es'}${labor} para ${etiquetaPersonas}`;
  const detalle = armarDetalle([`trabajo del ${formatearRangoHecho(n.fechasHecho, n.capturadoEn)}`], n.conFechaFutura);
  return { autor: sujetoAutor(n), texto, detalle };
}

// -- monitoreos -----------------------------------------------------------
// "David registró la ronda del 29 de agosto · 44 lecturas · monitor:
// Efrain" -- `monitor` (quién caminó la ronda) viaja en `objetosNombre`
// (ver `monitoreos.ts`), NUNCA se confunde con el autor (quién la
// capturó).
export function frasearMonitoreos(n: Novedad): FraseNovedad {
  const fecha = formatearRangoHecho(n.fechasHecho, n.capturadoEn);
  const texto = `${sujetoAutor(n)} registró la ronda del ${fecha}`;
  const lecturas = `${formatNumber(n.tamano.filas)} lectura${n.tamano.filas === 1 ? '' : 's'}`;
  const monitor = n.objetosNombre.length > 0 ? `monitor: ${formatearListaNombres(n.objetosNombre)}` : null;
  const detalle = armarDetalle([lecturas, monitor], n.conFechaFutura);
  return { autor: sujetoAutor(n), texto, detalle };
}

// -- movimientos_diarios --------------------------------------------------
// "David registró la ejecución del 15 de septiembre en Lote 5 y Lote 8" --
// guardrail 2026-09-17: "2 lotes" no dice CUÁLES; `objetoNombre` ya trae
// `lote_nombre` (`movimientosDiarios.ts`) y sólo faltaba usarlo en vez de
// contarlo.
export function frasearMovimientosDiarios(n: Novedad): FraseNovedad {
  const fecha = formatearRangoHecho(n.fechasHecho, n.capturadoEn);
  const lotes = n.objetosNombre.length > 0 ? ` en ${formatearListaNombres(n.objetosNombre)}` : '';
  const texto = `${sujetoAutor(n)} registró la ejecución del ${fecha}${lotes}`;
  return { autor: sujetoAutor(n), texto, detalle: '' };
}

// -- fin_gastos -------------------------------------------------------------
// "Consuelito registró 15 gastos por $4.250.000" -- guardrail 2026-09-17
// (Santiago): "15 gastos" sin su total no se lee sola. `formatCurrency`
// (no `formatMillonesCOP`): una sesión de captura es un monto de línea, no
// un KPI agregado -- la abreviación a millones es para el segundo, no el
// primero (`Dinero.tsx`).
export function frasearFinGastos(n: Novedad): FraseNovedad {
  const cantidad = n.tamano.filas;
  const etiqueta = cantidad === 1 ? '1 gasto' : `${formatNumber(cantidad)} gastos`;
  const total = n.tamano.montoTotal != null ? ` por ${formatCurrency(n.tamano.montoTotal)}` : '';
  const texto = `${sujetoAutor(n)} registró ${etiqueta}${total}`;
  const detalle = armarDetalle([formatearRangoHecho(n.fechasHecho, n.capturadoEn)], n.conFechaFutura);
  return { autor: sujetoAutor(n), texto, detalle };
}

// ============================================================================
// Despacho
// ============================================================================

const PLANTILLAS: Record<Novedad['fuente'], (n: Novedad) => FraseNovedad> = {
  hato_eventos: frasearHatoEventos,
  hato_pesajes_leche: frasearHatoPesajesLeche,
  hato_tratamientos: frasearHatoTratamientos,
  hato_chequeos: frasearHatoChequeos,
  registros_trabajo: frasearRegistrosTrabajo,
  monitoreos: frasearMonitoreos,
  movimientos_diarios: frasearMovimientosDiarios,
  fin_gastos: frasearFinGastos,
};

/** Punto de entrada único -- despacha por `n.fuente`. Lanza si la fuente no
 *  tiene plantilla en vez de imprimir un texto genérico inventado. */
export function frasearNovedad(n: Novedad): FraseNovedad {
  const plantilla = PLANTILLAS[n.fuente];
  if (!plantilla) throw new Error(`frasearNovedad: sin plantilla para la fuente "${n.fuente}".`);
  return plantilla(n);
}
