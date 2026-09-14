// Radiation conversion & agronomic status for Hass avocado at Aguadas, Caldas (~2200m, 5.6°N)
//
// Two DISTINCT solar metrics — do not mix them:
//
// 1. Daily solar ENERGY (kWh/m²/day)
//    energia = (radiacion_wm2_avg × 24) / 1000
//    Historically labelled "horas-sol equivalentes". The number is unchanged:
//    1 "sun-hour" = 1000 W/m² × 1 h = 1 kWh/m². It is NOT clock hours of sun.
//    A sunny day at this altitude often lands near ~3 kWh/m² with peaks of
//    1000–1200 W/m² — that is a real energy total, not a stuck sensor.
//
// 2. Sunshine DURATION (h)
//    Hours in which instantaneous radiation ≥ UMBRAL_TIEMPO_SOL_WM2 (WMO-style
//    120 W/m²). Count of 5-min samples above the threshold × 5/60.
//    This is what field staff mean by "mucho sol".
//
// Hass energy bands (same numeric thresholds as before, now labelled kWh/m²):
// - Schaffer et al. (2013) "The Avocado: Botany, Production and Uses" — Ch. 7
//   Hass requires 5–7 sun-hours/day for optimal flowering/fruit-set.
// - Wolstenholme & Whiley (1999): tropical highland Hass at 1800–2400m:
//   1500–2200 kWh/m²/year ≈ 4.1–6.0 kWh/m²/day avg.
// - ICA Colombia (2012): 1500–2000 hours of sunshine/year (≈ 4.1–5.5 h/day).
// Combined, the optimal ENERGY band for Hass at this altitude is 5.0–7.0 kWh/m²/day.

export type RadiationBand = 'critico_bajo' | 'bajo' | 'optimo' | 'alto' | 'excesivo';

export interface RadiationStatus {
  band: RadiationBand;
  label: string;
  color: string;         // Tailwind-compatible color for badges
  bgColor: string;       // Tailwind bg class
  textColor: string;     // Tailwind text class
}

export interface RadiationAggregation {
  avgSunHours: number | null; // daily energy kWh/m² (legacy field name)
  avgEnergiaKwhM2: number | null;
  avgTiempoSolHoras: number | null;
  daysTotal: number;
  daysInOptimal: number;
  daysBelowOptimal: number;
  daysAboveOptimal: number;
  daysCoberturaParcial: number;
}

export interface RadiationPeriodContext {
  current: RadiationAggregation & { status: RadiationStatus | null };
  prior: RadiationAggregation & { status: RadiationStatus | null };
  delta: number | null;   // current.avgEnergiaKwhM2 - prior.avgEnergiaKwhM2
}

const THRESHOLDS = {
  critico_bajo: 3.5,
  bajo: 5.0,
  optimo: 7.0,
  alto: 8.5,
} as const;

const STATUS_MAP: Record<RadiationBand, Omit<RadiationStatus, 'band'>> = {
  critico_bajo: { label: 'Crítico bajo', color: '#dc2626', bgColor: 'bg-red-100', textColor: 'text-red-700' },
  bajo:         { label: 'Bajo',         color: '#f59e0b', bgColor: 'bg-amber-100', textColor: 'text-amber-700' },
  optimo:       { label: 'Óptimo',       color: '#16a34a', bgColor: 'bg-green-100', textColor: 'text-green-700' },
  alto:         { label: 'Alto',         color: '#2563eb', bgColor: 'bg-blue-100', textColor: 'text-blue-700' },
  excesivo:     { label: 'Excesivo',     color: '#dc2626', bgColor: 'bg-red-100', textColor: 'text-red-700' },
};

/** WMO-style sunshine-duration threshold (global radiation). Easy to change. */
export const UMBRAL_TIEMPO_SOL_WM2 = 120;

/** Ecowitt ingest cadence (migration 030). Keep in sync with migration 151. */
export const INTERVALO_LECTURA_MINUTOS = 5;

export const TEXTO_ENERGIA_SOLAR =
  'Energía solar del día (kWh/m²): (radiación promedio × 24) / 1000. No son horas de reloj con sol. 1 kWh/m² = 1 “hora-sol” equivalente a 1000 W/m² durante 1 h.';

export const TEXTO_TIEMPO_SOL =
  `Tiempo de sol: horas con radiación ≥ ${UMBRAL_TIEMPO_SOL_WM2} W/m² (umbral WMO). Es lo que el campo percibe como “sol”. Un día con ~3 kWh/m² puede tener 10+ h de sol visible.`;

export const TEXTO_COBERTURA_PARCIAL =
  'Día con cobertura parcial: la estación no capturó el día completo. Energía y tiempo de sol de ese día son una cota inferior, no un día entero.';

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Convert average W/m² irradiance to daily solar energy (kWh/m²/day).
 * Same formula historically called "sun-hours": (avg_wm2 × 24) / 1000.
 */
export function wm2ToEnergiaDiaria(wm2Avg: number): number {
  return (wm2Avg * 24) / 1000;
}

/**
 * Legacy name of wm2ToEnergiaDiaria. The number is kWh/m²/day, not clock hours.
 */
export function wm2ToSunHours(wm2Avg: number): number {
  return wm2ToEnergiaDiaria(wm2Avg);
}

/**
 * Sunshine duration from 5-min (or other cadence) samples.
 * NULL when there is no radiation reading at all (sin dato, never a fabricated 0).
 * A real overcast day with readings below the threshold returns 0.
 */
export function calcularTiempoSolHoras(
  readings: { radiacion_wm2: number | null }[],
  umbralWm2: number = UMBRAL_TIEMPO_SOL_WM2,
  intervaloMinutos: number = INTERVALO_LECTURA_MINUTOS,
): number | null {
  const conDato = readings.filter((r): r is { radiacion_wm2: number } => r.radiacion_wm2 !== null);
  if (conDato.length === 0) return null;
  const nSobreUmbral = conDato.filter((r) => r.radiacion_wm2 >= umbralWm2).length;
  return round1((nSobreUmbral * intervaloMinutos) / 60);
}

/**
 * Get agronomic status band for a given daily energy (kWh/m²).
 * Numeric thresholds are unchanged (they were always energy, mislabelled as hours).
 */
export function getRadiationStatus(energiaKwhM2: number): RadiationStatus {
  let band: RadiationBand;
  if (energiaKwhM2 < THRESHOLDS.critico_bajo) band = 'critico_bajo';
  else if (energiaKwhM2 < THRESHOLDS.bajo) band = 'bajo';
  else if (energiaKwhM2 < THRESHOLDS.optimo) band = 'optimo';
  else if (energiaKwhM2 < THRESHOLDS.alto) band = 'alto';
  else band = 'excesivo';

  return { band, ...STATUS_MAP[band] };
}

export type FilaRadiacion = {
  fecha: string;
  radiacion_wm2_avg: number | null;
  horas_sol_duracion?: number | null;
  lluvia_confianza?: string | null;
};

const VACIO: RadiationAggregation = {
  avgSunHours: null,
  avgEnergiaKwhM2: null,
  avgTiempoSolHoras: null,
  daysTotal: 0,
  daysInOptimal: 0,
  daysBelowOptimal: 0,
  daysAboveOptimal: 0,
  daysCoberturaParcial: 0,
};

/**
 * Aggregate radiation data from daily summary rows.
 * Energy comes from radiacion_wm2_avg (unchanged series).
 * Duration comes from horas_sol_duracion when present (migration 151).
 */
export function aggregateRadiation(rows: FilaRadiacion[]): RadiationAggregation {
  const valid = rows
    .map(r => r.radiacion_wm2_avg)
    .filter((v): v is number => v !== null);

  const duraciones = rows
    .map(r => r.horas_sol_duracion)
    .filter((v): v is number => v !== null);

  const daysCoberturaParcial = rows.filter(r => r.lluvia_confianza === 'cobertura_parcial').length;

  if (valid.length === 0) {
    return {
      ...VACIO,
      daysTotal: rows.length,
      avgTiempoSolHoras: duraciones.length > 0
        ? round1(duraciones.reduce((s, v) => s + v, 0) / duraciones.length)
        : null,
      daysCoberturaParcial,
    };
  }

  const energiaPorDia = valid.map(wm2 => wm2ToEnergiaDiaria(wm2));
  const avgEnergiaKwhM2 = round1(energiaPorDia.reduce((s, v) => s + v, 0) / energiaPorDia.length);
  const avgTiempoSolHoras = duraciones.length > 0
    ? round1(duraciones.reduce((s, v) => s + v, 0) / duraciones.length)
    : null;

  let daysInOptimal = 0;
  let daysBelowOptimal = 0;
  let daysAboveOptimal = 0;

  for (const sh of energiaPorDia) {
    if (sh < THRESHOLDS.bajo) daysBelowOptimal++;
    else if (sh <= THRESHOLDS.optimo) daysInOptimal++;
    else daysAboveOptimal++;
  }

  return {
    avgSunHours: avgEnergiaKwhM2,
    avgEnergiaKwhM2,
    avgTiempoSolHoras,
    daysTotal: valid.length,
    daysInOptimal,
    daysBelowOptimal,
    daysAboveOptimal,
    daysCoberturaParcial,
  };
}

/**
 * Build period context with current vs prior comparison.
 * Splits rows at a cutoff date: rows >= cutoff are "current", rows < cutoff are "prior".
 */
export function buildRadiationPeriodContext(
  currentRows: FilaRadiacion[],
  priorRows: FilaRadiacion[],
): RadiationPeriodContext {
  const current = aggregateRadiation(currentRows);
  const prior = aggregateRadiation(priorRows);

  const delta = current.avgEnergiaKwhM2 !== null && prior.avgEnergiaKwhM2 !== null
    ? round1(current.avgEnergiaKwhM2 - prior.avgEnergiaKwhM2)
    : null;

  return {
    current: { ...current, status: current.avgEnergiaKwhM2 !== null ? getRadiationStatus(current.avgEnergiaKwhM2) : null },
    prior: { ...prior, status: prior.avgEnergiaKwhM2 !== null ? getRadiationStatus(prior.avgEnergiaKwhM2) : null },
    delta,
  };
}

export interface EnergiaYTiempoSolHoy {
  energiaKwhM2: number;
  tiempoSolHoras: number | null;
  avgWm2: number;
  /** @deprecated same as energiaKwhM2 */
  sunHoursSoFar: number;
}

/**
 * Energy so far today from live 5-min readings, plus sunshine duration.
 * Energy uses avg W/m² × hours elapsed / 1000 (same as the old estimate).
 */
export function estimateEnergiaYTiempoSolHoy(
  readings: { timestamp: string; radiacion_wm2: number | null }[],
  nowHour?: number,
): EnergiaYTiempoSolHoy | null {
  const valid = readings
    .map(r => r.radiacion_wm2)
    .filter((v): v is number => v !== null);

  if (valid.length === 0) return null;

  const avgWm2 = valid.reduce((s, v) => s + v, 0) / valid.length;
  const hoursElapsed = nowHour ?? new Date().getHours();
  const energiaKwhM2 = round1((avgWm2 * hoursElapsed) / 1000);
  const tiempoSolHoras = calcularTiempoSolHoras(readings);

  return {
    energiaKwhM2,
    tiempoSolHoras,
    avgWm2: round1(avgWm2),
    sunHoursSoFar: energiaKwhM2,
  };
}

/**
 * Convert a current instantaneous W/m² to estimated energy so far today.
 * Uses the average of all 5-min readings from today, then scales by hours elapsed.
 */
export function estimateSunHoursToday(
  readings: { timestamp: string; radiacion_wm2: number | null }[],
  nowHour?: number
): { sunHoursSoFar: number; avgWm2: number } | null {
  const result = estimateEnergiaYTiempoSolHoy(readings, nowHour);
  if (!result) return null;
  return { sunHoursSoFar: result.sunHoursSoFar, avgWm2: result.avgWm2 };
}
