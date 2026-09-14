// Pure radiation context logic for Esco chat agent.
// Mirrors src/utils/calculosRadiacion.ts but runs in Deno edge function context.
//
// ENERGY (kWh/m²/day) = (avg W/m² × 24) / 1000 — historically labelled "horas-sol".
// DURATION (h) = hours with radiation ≥ 120 W/m² (WMO). Not the same metric.

export type RadiationBand = 'critico_bajo' | 'bajo' | 'optimo' | 'alto' | 'excesivo';

interface RadiationStatus {
  band: RadiationBand;
  label: string;
}

interface RadiationAgg {
  avgSunHours: number | null;
  avgEnergiaKwhM2: number | null;
  avgTiempoSolHoras: number | null;
  daysTotal: number;
  daysInOptimal: number;
  daysBelowOptimal: number;
  daysAboveOptimal: number;
  daysCoberturaParcial: number;
}

const THRESHOLDS = { critico_bajo: 3.5, bajo: 5.0, optimo: 7.0, alto: 8.5 } as const;

const LABELS: Record<RadiationBand, string> = {
  critico_bajo: 'Crítico bajo', bajo: 'Bajo', optimo: 'Óptimo', alto: 'Alto', excesivo: 'Excesivo',
};

export const UMBRAL_TIEMPO_SOL_WM2 = 120;

export function wm2ToEnergiaDiaria(wm2Avg: number): number {
  return (wm2Avg * 24) / 1000;
}

export function wm2ToSunHours(wm2Avg: number): number {
  return wm2ToEnergiaDiaria(wm2Avg);
}

export function getRadiationStatus(energiaKwhM2: number): RadiationStatus {
  let band: RadiationBand;
  if (energiaKwhM2 < THRESHOLDS.critico_bajo) band = 'critico_bajo';
  else if (energiaKwhM2 < THRESHOLDS.bajo) band = 'bajo';
  else if (energiaKwhM2 < THRESHOLDS.optimo) band = 'optimo';
  else if (energiaKwhM2 < THRESHOLDS.alto) band = 'alto';
  else band = 'excesivo';
  return { band, label: LABELS[band] };
}

export type FilaRadiacion = {
  radiacion_wm2_avg: number | null;
  horas_sol_duracion?: number | null;
  lluvia_confianza?: string | null;
};

export function aggregateRadiation(rows: FilaRadiacion[]): RadiationAgg {
  const valid = rows.map(r => r.radiacion_wm2_avg).filter((v): v is number => v !== null);
  const duraciones = rows.map(r => r.horas_sol_duracion).filter((v): v is number => v !== null);
  const daysCoberturaParcial = rows.filter(r => r.lluvia_confianza === 'cobertura_parcial').length;

  if (valid.length === 0) {
    return {
      avgSunHours: null,
      avgEnergiaKwhM2: null,
      avgTiempoSolHoras: duraciones.length
        ? Math.round((duraciones.reduce((s, v) => s + v, 0) / duraciones.length) * 10) / 10
        : null,
      daysTotal: rows.length,
      daysInOptimal: 0,
      daysBelowOptimal: 0,
      daysAboveOptimal: 0,
      daysCoberturaParcial,
    };
  }

  const sunHours = valid.map(wm2ToSunHours);
  const avg = Math.round((sunHours.reduce((s, v) => s + v, 0) / sunHours.length) * 10) / 10;
  const avgTiempoSolHoras = duraciones.length
    ? Math.round((duraciones.reduce((s, v) => s + v, 0) / duraciones.length) * 10) / 10
    : null;

  let inOpt = 0, below = 0, above = 0;
  for (const sh of sunHours) {
    if (sh < THRESHOLDS.bajo) below++;
    else if (sh <= THRESHOLDS.optimo) inOpt++;
    else above++;
  }

  return {
    avgSunHours: avg,
    avgEnergiaKwhM2: avg,
    avgTiempoSolHoras,
    daysTotal: valid.length,
    daysInOptimal: inOpt,
    daysBelowOptimal: below,
    daysAboveOptimal: above,
    daysCoberturaParcial,
  };
}

export interface RadiationContextResult {
  period: string;
  energia_kwh_m2_dia: number | null;
  tiempo_sol_horas_dia: number | null;
  /** @deprecated alias of energia_kwh_m2_dia */
  sun_hours_per_day: number | null;
  status: string | null;
  status_label: string | null;
  delta_vs_prior: number | null;
  days_in_optimal: number;
  days_below_optimal: number;
  days_above_optimal: number;
  days_total: number;
  days_cobertura_parcial: number;
  note: string;
}

export function buildRadiationContext(
  currentRows: FilaRadiacion[],
  priorRows: FilaRadiacion[],
  periodLabel: string,
): RadiationContextResult {
  const current = aggregateRadiation(currentRows);
  const prior = aggregateRadiation(priorRows);

  const status = current.avgEnergiaKwhM2 !== null ? getRadiationStatus(current.avgEnergiaKwhM2) : null;
  const delta = current.avgEnergiaKwhM2 !== null && prior.avgEnergiaKwhM2 !== null
    ? Math.round((current.avgEnergiaKwhM2 - prior.avgEnergiaKwhM2) * 10) / 10
    : null;

  return {
    period: periodLabel,
    energia_kwh_m2_dia: current.avgEnergiaKwhM2,
    tiempo_sol_horas_dia: current.avgTiempoSolHoras,
    sun_hours_per_day: current.avgSunHours,
    status: status?.band ?? null,
    status_label: status?.label ?? null,
    delta_vs_prior: delta,
    days_in_optimal: current.daysInOptimal,
    days_below_optimal: current.daysBelowOptimal,
    days_above_optimal: current.daysAboveOptimal,
    days_total: current.daysTotal,
    days_cobertura_parcial: current.daysCoberturaParcial,
    note: 'ENERGIA (kWh/m²/día) = (radiación promedio × 24) / 1000. No son horas de reloj con sol. Rango óptimo Hass (2200m): 5.0–7.0 kWh/m²/día. <3.5 afecta floración/cuaje. >8.5 riesgo quemado. TIEMPO DE SOL = horas con radiación ≥ 120 W/m² (WMO). Un día con ~3 kWh/m² puede tener 10+ h de sol visible. Días cobertura_parcial son cota inferior, no un día completo.',
  };
}
