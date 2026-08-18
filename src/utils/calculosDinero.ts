// ARCHIVO: utils/calculosDinero.ts
// DESCRIPCIÓN: Lógica PURA del bloque "Dinero" del Tablero General
// (`docs/plan_dashboard_centro_control.md` §4 Bloque 5 / §9.2). Sólo aritmética
// y clasificación -- cero Supabase, cero `Date` "de hoy" (todas las fechas de
// referencia llegan como parámetro, nunca se leen del reloj aquí). El I/O
// vive en `src/components/dashboard/hooks/useDinero.ts`, que sólo llama a
// estas funciones sobre lo que ya trajo.
//
// Reglas de producto que este archivo encierra (no reabrir sin releer el
// plan): "Sólo cuenta estado='Confirmado'" y "sin presupuesto cargado, nunca
// una barra al 0%" (§5.1); "agosto sin ingresos es un guion, jamás $0" (§5.2,
// pero esa parte vive en el componente -- este archivo no decide render); la
// semántica de color del gasto es la OPUESTA a un KPI normal: gastar MENOS
// que el mes anterior es favorable (verde), gastar MÁS es desfavorable
// (rojo) -- mismo patrón invertido que `PlagasKPICard`, documentado ahí para
// plagas y aquí para dinero.

import { resolverQuincena, quincenaAnterior, type QuincenaResuelta } from '@/utils/calculosHato';

export type { QuincenaResuelta };

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const;

/** Nombre del mes en español, minúscula ("agosto"). El llamador decide si lo
 *  necesita en mayúscula (la etiqueta "GASTO DE AGOSTO" del diseño). */
export function nombreMes(mes1a12: number): string {
  return MESES[mes1a12 - 1] ?? '';
}

// ---------------------------------------------------------------------------
// Gasto del mes / del año, agrupado por negocio
// ---------------------------------------------------------------------------

export interface FilaGastoDinero {
  valor: number;
  /** `YYYY-MM-DD` */
  fecha: string;
  /** `null` cuando el embed/join de negocio no resolvió (nunca se descarta
   *  la fila por eso -- cae en "Sin negocio"). */
  negocioNombre: string | null;
}

export interface AgregadoGastoDinero {
  gastoMesActual: number;
  gastoMesAnterior: number;
  /** Todo lo `Confirmado` cuya fecha cae en el AÑO CALENDARIO de `hoy`,
   *  desde el 1 de enero hasta `hoy` inclusive -- es el numerador de la
   *  barra de presupuesto acumulado al trimestre (misma regla que ya usaba
   *  `loadPresupuestoAlertas` del tablero anterior) y la base del ranking
   *  de negocios. */
  gastoAcumuladoAnio: number;
  /** Sin ordenar -- usa `topNegocios()` para el top-N. */
  porNegocioAnio: Array<{ nombre: string; total: number }>;
}

function ultimoDiaMes(anio: number, mes1a12: number): number {
  // Mismo truco que `rangoQuincena` (calculosHato.ts): día 0 del mes
  // SIGUIENTE es el último día del mes pedido.
  return new Date(Date.UTC(anio, mes1a12, 0)).getUTCDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Separa un conjunto de filas de `fin_gastos` (ya filtradas por
 * `estado='Confirmado'` por el llamador, y ya trayendo al menos desde el 1
 * de enero del año de `hoy` hasta `hoy`) en gasto del mes actual, del mes
 * anterior, y el acumulado del año agrupado por negocio.
 *
 * `hoy` es `YYYY-MM-DD` (de `obtenerFechaHoy()`, nunca de
 * `toISOString().slice(0,10)`) -- esta función no toca `Date` "de reloj" en
 * absoluto, sólo aritmética de calendario sobre los componentes de `hoy`.
 */
export function agregarGastoDinero(filas: FilaGastoDinero[], hoy: string): AgregadoGastoDinero {
  const [anio, mes] = hoy.split('-').map(Number);
  const inicioMesActual = `${anio}-${pad2(mes)}-01`;

  const anioMesAnt = mes === 1 ? anio - 1 : anio;
  const mesAnt = mes === 1 ? 12 : mes - 1;
  const inicioMesAnterior = `${anioMesAnt}-${pad2(mesAnt)}-01`;
  const finMesAnterior = `${anioMesAnt}-${pad2(mesAnt)}-${pad2(ultimoDiaMes(anioMesAnt, mesAnt))}`;

  let gastoMesActual = 0;
  let gastoMesAnterior = 0;
  let gastoAcumuladoAnio = 0;
  const porNegocio = new Map<string, number>();

  for (const f of filas) {
    if (f.fecha.slice(0, 4) === String(anio)) {
      gastoAcumuladoAnio += f.valor;
      const nombre = f.negocioNombre ?? 'Sin negocio';
      porNegocio.set(nombre, (porNegocio.get(nombre) ?? 0) + f.valor);
    }

    if (f.fecha >= inicioMesActual && f.fecha <= hoy) {
      gastoMesActual += f.valor;
    } else if (f.fecha >= inicioMesAnterior && f.fecha <= finMesAnterior) {
      gastoMesAnterior += f.valor;
    }
  }

  return {
    gastoMesActual,
    gastoMesAnterior,
    gastoAcumuladoAnio,
    porNegocioAnio: Array.from(porNegocio.entries()).map(([nombre, total]) => ({ nombre, total })),
  };
}

// ---------------------------------------------------------------------------
// Variación de gasto (semántica invertida: bajar es bueno)
// ---------------------------------------------------------------------------

export interface VariacionGasto {
  /** Redondeado al entero, con signo (-54 = bajó 54%). */
  pct: number;
  /** `true` = gastó menos que el mes anterior (verde); `false` = gastó más
   *  (rojo). Semántica OPUESTA a un KPI normal -- ver cabecera del archivo. */
  favorable: boolean;
}

/** `null` cuando el mes anterior no tiene gasto contra qué comparar (nunca
 *  0% ni `Infinity`). */
export function calcularVariacionGasto(actual: number, anterior: number): VariacionGasto | null {
  if (anterior <= 0) return null;
  const pct = ((actual - anterior) / anterior) * 100;
  return { pct: Math.round(pct), favorable: pct <= 0 };
}

// ---------------------------------------------------------------------------
// Ejecución de presupuesto acumulado al trimestre
// ---------------------------------------------------------------------------

export interface EjecucionPresupuesto {
  /** % del presupuesto acumulado al trimestre ya ejecutado, redondeado. */
  pct: number;
  sobrePresupuesto: boolean;
  presupuestoAcumuladoQ: number;
}

/**
 * `presupuestoTotalAnual` es la SUMA de `fin_presupuestos.monto_anual` del
 * año -- 0 (o sin filas) significa "sin presupuesto cargado" y esta función
 * devuelve `null`: la regla dura del plan es que eso renderiza una nota, NUNCA
 * una barra al 0% (§5.1, "Sin dato").
 */
export function calcularEjecucionPresupuesto(
  gastoAcumuladoAnio: number,
  presupuestoTotalAnual: number,
  trimestreActual: number,
): EjecucionPresupuesto | null {
  if (presupuestoTotalAnual <= 0) return null;
  const presupuestoAcumuladoQ = (presupuestoTotalAnual * trimestreActual) / 4;
  if (presupuestoAcumuladoQ <= 0) return null;
  const pct = (gastoAcumuladoAnio / presupuestoAcumuladoQ) * 100;
  return { pct: Math.round(pct), sobrePresupuesto: pct > 100, presupuestoAcumuladoQ };
}

/** Top-N negocios por gasto del año, descendente. No muta el arreglo de entrada. */
export function topNegocios(
  porNegocio: Array<{ nombre: string; total: number }>,
  n = 2,
): Array<{ nombre: string; total: number }> {
  return [...porNegocio].sort((a, b) => b.total - a.total).slice(0, n);
}

// ---------------------------------------------------------------------------
// Quincenas de leche sin registrar (evidencia del caso "sin ingresos", §5.2)
// ---------------------------------------------------------------------------

export function etiquetaQuincena(q: QuincenaResuelta): string {
  return `${nombreMes(q.mes)} Q${q.quincena}`;
}

function claveQuincena(q: QuincenaResuelta): string {
  return `${q.anio}-${q.mes}-${q.quincena}`;
}

/**
 * Quincenas YA CERRADAS entre la última registrada (`ultimaRegistrada`,
 * la más reciente fila de `hato_produccion_quincenal`) y "hoy", en orden
 * cronológico -- lo que falta por capturar.
 *
 * `ultimaRegistrada === null` (nunca se registró ninguna quincena) devuelve
 * `[]` a propósito: es un estado DISTINTO de "al día" ("0 faltantes"
 * calculado) y el llamador lo distingue comprobando `ultimaRegistrada`, no
 * inspeccionando el arreglo -- confundirlos mostraría "0 quincenas
 * pendientes" para un módulo que jamás se ha usado, que es peor mentira que
 * no decir nada.
 *
 * No es un simple "hoy - última / 15": camina quincena por quincena hacia
 * atrás desde la más reciente ya cerrada, así que un backlog de VARIAS
 * quincenas seguidas se cuenta completo, no sólo la inmediata siguiente.
 * `ventanaMax` es un techo de seguridad (nunca un límite esperado): si el
 * dato lleva años sin capturarse, esta función no crece sin límite.
 */
export function quincenasFaltantes(
  ultimaRegistrada: QuincenaResuelta | null,
  hoy: string,
  ventanaMax = 8,
): QuincenaResuelta[] {
  if (!ultimaRegistrada) return [];

  const objetivo = claveQuincena(ultimaRegistrada);
  const faltantes: QuincenaResuelta[] = [];
  let cursor = quincenaAnterior(resolverQuincena(hoy)); // la quincena CERRADA más reciente

  for (let i = 0; i < ventanaMax; i++) {
    if (claveQuincena(cursor) === objetivo) break;
    faltantes.push(cursor);
    cursor = quincenaAnterior(cursor);
  }

  return faltantes.reverse();
}

/** Rango (min/max) de una serie de valores de venta de quincenas pasadas --
 *  el "de ~$11M a $27M cada una" del diseño. `null` sin valores (nunca se
 *  inventa un rango). */
export function rangoValorQuincenas(valores: number[]): { min: number; max: number } | null {
  if (valores.length === 0) return null;
  return { min: Math.min(...valores), max: Math.max(...valores) };
}
