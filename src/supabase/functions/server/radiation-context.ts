// Pure radiation context logic for Esco chat agent.
// Mirrors src/utils/calculosRadiacion.ts but runs in Deno edge function context.

export type RadiationBand = 'critico_bajo' | 'bajo' | 'optimo' | 'alto' | 'excesivo';

interface RadiationStatus {
  band: RadiationBand;
  label: string;
}

interface RadiationAgg {
  avgSunHours: number | null;
  daysTotal: number;
  daysInOptimal: number;
  daysBelowOptimal: number;
  daysAboveOptimal: number;
}

const THRESHOLDS = { critico_bajo: 3.5, bajo: 5.0, optimo: 7.0, alto: 8.5 } as const;

const LABELS: Record<RadiationBand, string> = {
  critico_bajo: 'Crítico bajo', bajo: 'Bajo', optimo: 'Óptimo', alto: 'Alto', excesivo: 'Excesivo',
};

export function wm2ToSunHours(wm2Avg: number): number {
  return (wm2Avg * 24) / 1000;
}

export function getRadiationStatus(sunHours: number): RadiationStatus {
  let band: RadiationBand;
  if (sunHours < THRESHOLDS.critico_bajo) band = 'critico_bajo';
  else if (sunHours < THRESHOLDS.bajo) band = 'bajo';
  else if (sunHours < THRESHOLDS.optimo) band = 'optimo';
  else if (sunHours < THRESHOLDS.alto) band = 'alto';
  else band = 'excesivo';
  return { band, label: LABELS[band] };
}

export function aggregateRadiation(rows: { radiacion_wm2_avg: number | null }[]): RadiationAgg {
  const valid = rows.map(r => r.radiacion_wm2_avg).filter((v): v is number => v !== null);
  if (valid.length === 0) return { avgSunHours: null, daysTotal: rows.length, daysInOptimal: 0, daysBelowOptimal: 0, daysAboveOptimal: 0 };

  const sunHours = valid.map(wm2ToSunHours);
  const avg = Math.round((sunHours.reduce((s, v) => s + v, 0) / sunHours.length) * 10) / 10;

  let inOpt = 0, below = 0, above = 0;
  for (const sh of sunHours) {
    if (sh < THRESHOLDS.bajo) below++;
    else if (sh <= THRESHOLDS.optimo) inOpt++;
    else above++;
  }

  return { avgSunHours: avg, daysTotal: valid.length, daysInOptimal: inOpt, daysBelowOptimal: below, daysAboveOptimal: above };
}

export interface RadiationContextResult {
  period: string;
  sun_hours_per_day: number | null;
  status: string | null;
  status_label: string | null;
  delta_vs_prior: number | null;
  days_in_optimal: number;
  days_below_optimal: number;
  days_above_optimal: number;
  days_total: number;
  note: string;
}

export function buildRadiationContext(
  currentRows: { radiacion_wm2_avg: number | null }[],
  priorRows: { radiacion_wm2_avg: number | null }[],
  periodLabel: string,
): RadiationContextResult {
  const current = aggregateRadiation(currentRows);
  const prior = aggregateRadiation(priorRows);

  const status = current.avgSunHours !== null ? getRadiationStatus(current.avgSunHours) : null;
  const delta = current.avgSunHours !== null && prior.avgSunHours !== null
    ? Math.round((current.avgSunHours - prior.avgSunHours) * 10) / 10
    : null;

  return {
    period: periodLabel,
    sun_hours_per_day: current.avgSunHours,
    status: status?.band ?? null,
    status_label: status?.label ?? null,
    delta_vs_prior: delta,
    days_in_optimal: current.daysInOptimal,
    days_below_optimal: current.daysBelowOptimal,
    days_above_optimal: current.daysAboveOptimal,
    days_total: current.daysTotal,
    note: 'Rango óptimo Hass (2200m): 5.0–7.0 h/día. <3.5 afecta floración/cuaje. >8.5 riesgo quemado.',
  };
}
