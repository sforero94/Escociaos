import { describe, it, expect } from 'vitest';
import {
  wm2ToSunHours,
  getRadiationStatus,
  aggregateRadiation,
  buildRadiationPeriodContext,
  estimateSunHoursToday,
} from '@/utils/calculosRadiacion';

describe('wm2ToSunHours', () => {
  it('converts 250 W/m² avg to 6.0 sun-hours/day', () => {
    expect(wm2ToSunHours(250)).toBe(6.0);
  });

  it('converts 0 to 0', () => {
    expect(wm2ToSunHours(0)).toBe(0);
  });

  it('converts 1000 W/m² to 24 sun-hours (theoretical max)', () => {
    expect(wm2ToSunHours(1000)).toBe(24);
  });

  it('converts 145.83 W/m² to ~3.5', () => {
    expect(wm2ToSunHours(145.83)).toBeCloseTo(3.5, 1);
  });
});

describe('getRadiationStatus', () => {
  it('returns critico_bajo for < 3.5', () => {
    expect(getRadiationStatus(2.0).band).toBe('critico_bajo');
    expect(getRadiationStatus(3.4).band).toBe('critico_bajo');
  });

  it('returns bajo for 3.5 – 4.99', () => {
    expect(getRadiationStatus(3.5).band).toBe('bajo');
    expect(getRadiationStatus(4.9).band).toBe('bajo');
  });

  it('returns optimo for 5.0 – 6.99', () => {
    expect(getRadiationStatus(5.0).band).toBe('optimo');
    expect(getRadiationStatus(6.9).band).toBe('optimo');
  });

  it('returns alto for 7.0 – 8.49', () => {
    expect(getRadiationStatus(7.0).band).toBe('alto');
    expect(getRadiationStatus(8.4).band).toBe('alto');
  });

  it('returns excesivo for >= 8.5', () => {
    expect(getRadiationStatus(8.5).band).toBe('excesivo');
    expect(getRadiationStatus(12.0).band).toBe('excesivo');
  });

  it('includes label and color properties', () => {
    const status = getRadiationStatus(6.0);
    expect(status.label).toBe('Óptimo');
    expect(status.color).toBe('#16a34a');
    expect(status.bgColor).toBe('bg-green-100');
    expect(status.textColor).toBe('text-green-700');
  });
});

describe('aggregateRadiation', () => {
  it('returns null avgSunHours for empty rows', () => {
    const result = aggregateRadiation([]);
    expect(result.avgSunHours).toBeNull();
    expect(result.daysTotal).toBe(0);
  });

  it('returns null avgSunHours when all values are null', () => {
    const rows = [
      { fecha: '2026-05-01', radiacion_wm2_avg: null },
      { fecha: '2026-05-02', radiacion_wm2_avg: null },
    ];
    const result = aggregateRadiation(rows);
    expect(result.avgSunHours).toBeNull();
    expect(result.daysTotal).toBe(2);
  });

  it('computes correct averages and day counts', () => {
    const rows = [
      { fecha: '2026-05-01', radiacion_wm2_avg: 250 }, // 6.0 h → optimal
      { fecha: '2026-05-02', radiacion_wm2_avg: 100 }, // 2.4 h → critico_bajo (below)
      { fecha: '2026-05-03', radiacion_wm2_avg: 200 }, // 4.8 h → bajo (below)
      { fecha: '2026-05-04', radiacion_wm2_avg: 350 }, // 8.4 h → alto (above)
      { fecha: '2026-05-05', radiacion_wm2_avg: 230 }, // 5.52 h → optimal
    ];
    const result = aggregateRadiation(rows);
    // avg = (6.0 + 2.4 + 4.8 + 8.4 + 5.52) / 5 = 27.12 / 5 = 5.424 → 5.4
    expect(result.avgSunHours).toBe(5.4);
    expect(result.daysTotal).toBe(5);
    expect(result.daysInOptimal).toBe(2);
    expect(result.daysBelowOptimal).toBe(2);
    expect(result.daysAboveOptimal).toBe(1);
  });

  it('skips null values but counts valid days', () => {
    const rows = [
      { fecha: '2026-05-01', radiacion_wm2_avg: 250 },
      { fecha: '2026-05-02', radiacion_wm2_avg: null },
      { fecha: '2026-05-03', radiacion_wm2_avg: 250 },
    ];
    const result = aggregateRadiation(rows);
    expect(result.avgSunHours).toBe(6.0);
    expect(result.daysTotal).toBe(2);
  });
});

describe('buildRadiationPeriodContext', () => {
  it('computes delta between current and prior periods', () => {
    const current = [
      { fecha: '2026-05-08', radiacion_wm2_avg: 250 }, // 6.0
      { fecha: '2026-05-09', radiacion_wm2_avg: 260 }, // 6.24
    ];
    const prior = [
      { fecha: '2026-05-01', radiacion_wm2_avg: 200 }, // 4.8
      { fecha: '2026-05-02', radiacion_wm2_avg: 210 }, // 5.04
    ];
    const ctx = buildRadiationPeriodContext(current, prior);
    expect(ctx.current.avgSunHours).toBe(6.1);
    expect(ctx.prior.avgSunHours).toBe(4.9);
    expect(ctx.delta).toBe(1.2);
    expect(ctx.current.status?.band).toBe('optimo');
    expect(ctx.prior.status?.band).toBe('bajo');
  });

  it('returns null delta when prior has no data', () => {
    const current = [{ fecha: '2026-05-08', radiacion_wm2_avg: 250 }];
    const ctx = buildRadiationPeriodContext(current, []);
    expect(ctx.delta).toBeNull();
    expect(ctx.prior.status).toBeNull();
  });
});

describe('estimateSunHoursToday', () => {
  it('estimates sun-hours based on avg readings and hours elapsed', () => {
    const readings = [
      { timestamp: '2026-05-19T06:00:00', radiacion_wm2: 100 },
      { timestamp: '2026-05-19T09:00:00', radiacion_wm2: 400 },
      { timestamp: '2026-05-19T12:00:00', radiacion_wm2: 600 },
    ];
    // avg = 366.67 W/m², hours = 14 → (366.67 * 14) / 1000 = 5.133 → 5.1
    const result = estimateSunHoursToday(readings, 14);
    expect(result).not.toBeNull();
    expect(result!.sunHoursSoFar).toBe(5.1);
    expect(result!.avgWm2).toBeCloseTo(366.7, 0);
  });

  it('returns null for no valid readings', () => {
    const result = estimateSunHoursToday([
      { timestamp: '2026-05-19T06:00:00', radiacion_wm2: null },
    ]);
    expect(result).toBeNull();
  });

  it('returns null for empty readings', () => {
    expect(estimateSunHoursToday([])).toBeNull();
  });
});
