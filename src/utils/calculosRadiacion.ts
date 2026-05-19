// Radiation conversion & agronomic status for Hass avocado at Aguadas, Caldas (~2200m, 5.6°N)
//
// Thresholds based on:
// - Schaffer et al. (2013) "The Avocado: Botany, Production and Uses" — Ch. 7 (Ecophysiology)
//   Hass requires 5–7 sun-hours/day for optimal flowering/fruit-set; below 4h impacts cuaje.
// - Wolstenholme & Whiley (1999) "Ecophysiology of the avocado tree as a basis for pre-harvest management"
//   Tropical highland Hass at 1800–2400m: 1500–2200 kWh/m²/year ≈ 4.1–6.0 sun-hours/day avg.
// - ICA Colombia (2012) "Manejo fitosanitario del cultivo del aguacate Hass"
//   Recommends 1500–2000 hours of sunshine/year (≈ 4.1–5.5 h/day).
//
// Combined, the optimal band for Hass at this altitude is 5.0–7.0 sun-hours/day.

export type RadiationBand = 'critico_bajo' | 'bajo' | 'optimo' | 'alto' | 'excesivo';

export interface RadiationStatus {
  band: RadiationBand;
  label: string;
  color: string;         // Tailwind-compatible color for badges
  bgColor: string;       // Tailwind bg class
  textColor: string;     // Tailwind text class
}

export interface RadiationAggregation {
  avgSunHours: number | null;
  daysTotal: number;
  daysInOptimal: number;
  daysBelowOptimal: number;
  daysAboveOptimal: number;
}

export interface RadiationPeriodContext {
  current: RadiationAggregation & { status: RadiationStatus | null };
  prior: RadiationAggregation & { status: RadiationStatus | null };
  delta: number | null;   // current.avgSunHours - prior.avgSunHours
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

/**
 * Convert average W/m² irradiance to equivalent full-sun hours per day.
 * 1 "sun" = 1000 W/m², so: sun_hours = (avg_wm2 × 24) / 1000
 */
export function wm2ToSunHours(wm2Avg: number): number {
  return (wm2Avg * 24) / 1000;
}

/**
 * Get agronomic status band for a given sun-hours/day value.
 */
export function getRadiationStatus(sunHours: number): RadiationStatus {
  let band: RadiationBand;
  if (sunHours < THRESHOLDS.critico_bajo) band = 'critico_bajo';
  else if (sunHours < THRESHOLDS.bajo) band = 'bajo';
  else if (sunHours < THRESHOLDS.optimo) band = 'optimo';
  else if (sunHours < THRESHOLDS.alto) band = 'alto';
  else band = 'excesivo';

  return { band, ...STATUS_MAP[band] };
}

/**
 * Aggregate radiation data from daily summary rows.
 * Each row should have fecha + radiacion_wm2_avg (from clima_resumen_diario).
 */
export function aggregateRadiation(
  rows: { fecha: string; radiacion_wm2_avg: number | null }[]
): RadiationAggregation {
  const valid = rows
    .map(r => r.radiacion_wm2_avg)
    .filter((v): v is number => v !== null);

  if (valid.length === 0) {
    return { avgSunHours: null, daysTotal: rows.length, daysInOptimal: 0, daysBelowOptimal: 0, daysAboveOptimal: 0 };
  }

  const sunHoursPerDay = valid.map(wm2 => wm2ToSunHours(wm2));
  const avgSunHours = Math.round((sunHoursPerDay.reduce((s, v) => s + v, 0) / sunHoursPerDay.length) * 10) / 10;

  let daysInOptimal = 0;
  let daysBelowOptimal = 0;
  let daysAboveOptimal = 0;

  for (const sh of sunHoursPerDay) {
    if (sh < THRESHOLDS.bajo) daysBelowOptimal++;
    else if (sh <= THRESHOLDS.optimo) daysInOptimal++;
    else daysAboveOptimal++;
  }

  return { avgSunHours, daysTotal: valid.length, daysInOptimal, daysBelowOptimal, daysAboveOptimal };
}

/**
 * Build period context with current vs prior comparison.
 * Splits rows at a cutoff date: rows >= cutoff are "current", rows < cutoff are "prior".
 */
export function buildRadiationPeriodContext(
  currentRows: { fecha: string; radiacion_wm2_avg: number | null }[],
  priorRows: { fecha: string; radiacion_wm2_avg: number | null }[]
): RadiationPeriodContext {
  const current = aggregateRadiation(currentRows);
  const prior = aggregateRadiation(priorRows);

  const delta = current.avgSunHours !== null && prior.avgSunHours !== null
    ? Math.round((current.avgSunHours - prior.avgSunHours) * 10) / 10
    : null;

  return {
    current: { ...current, status: current.avgSunHours !== null ? getRadiationStatus(current.avgSunHours) : null },
    prior: { ...prior, status: prior.avgSunHours !== null ? getRadiationStatus(prior.avgSunHours) : null },
    delta,
  };
}

/**
 * Convert a current instantaneous W/m² to estimated sun-hours so far today.
 * Uses the average of all 5-min readings from today, then scales by hours elapsed.
 */
export function estimateSunHoursToday(
  readings: { timestamp: string; radiacion_wm2: number | null }[],
  nowHour?: number
): { sunHoursSoFar: number; avgWm2: number } | null {
  const valid = readings
    .map(r => r.radiacion_wm2)
    .filter((v): v is number => v !== null);

  if (valid.length === 0) return null;

  const avgWm2 = valid.reduce((s, v) => s + v, 0) / valid.length;
  const hoursElapsed = nowHour ?? new Date().getHours();
  const sunHoursSoFar = Math.round(((avgWm2 * hoursElapsed) / 1000) * 10) / 10;

  return { sunHoursSoFar, avgWm2: Math.round(avgWm2 * 10) / 10 };
}
