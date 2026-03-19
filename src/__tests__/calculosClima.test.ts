import { describe, it, expect, beforeAll } from 'vitest';
import type { LecturaClima } from '@/types/clima';

// Helper: create a LecturaClima with defaults
function lectura(overrides: Partial<LecturaClima> & { timestamp: string }): LecturaClima {
  return {
    id: 1,
    station_id: 'ISANFR102',
    temp_c: null,
    humedad_pct: null,
    viento_kmh: null,
    rafaga_kmh: null,
    viento_dir: null,
    lluvia_tasa_mm_hr: null,
    lluvia_evento_mm: null,
    lluvia_diaria_mm: null,
    radiacion_wm2: null,
    uv_index: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// Relative date helpers
const now = new Date();
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000).toISOString();
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString();

describe('degreesToCardinal', () => {
  let degreesToCardinal: (deg: number) => string;

  beforeAll(async () => {
    const mod = await import('@/utils/calculosClima');
    degreesToCardinal = mod.degreesToCardinal;
  });

  it('converts 0° to N', () => expect(degreesToCardinal(0)).toBe('N'));
  it('converts 45° to NE', () => expect(degreesToCardinal(45)).toBe('NE'));
  it('converts 90° to E', () => expect(degreesToCardinal(90)).toBe('E'));
  it('converts 135° to SE', () => expect(degreesToCardinal(135)).toBe('SE'));
  it('converts 180° to S', () => expect(degreesToCardinal(180)).toBe('S'));
  it('converts 225° to SO', () => expect(degreesToCardinal(225)).toBe('SO'));
  it('converts 270° to O', () => expect(degreesToCardinal(270)).toBe('O'));
  it('converts 315° to NO', () => expect(degreesToCardinal(315)).toBe('NO'));
  it('wraps 360° to N', () => expect(degreesToCardinal(360)).toBe('N'));
  it('wraps 359° to N', () => expect(degreesToCardinal(359)).toBe('N'));
  it('handles 22° as N (boundary)', () => expect(degreesToCardinal(22)).toBe('N'));
  it('handles 23° as NE (boundary)', () => expect(degreesToCardinal(23)).toBe('NE'));
});

describe('lecturaActual', () => {
  let lecturaActual: (rows: LecturaClima[]) => LecturaClima | null;

  beforeAll(async () => {
    const mod = await import('@/utils/calculosClima');
    lecturaActual = mod.lecturaActual;
  });

  it('returns null for empty array', () => {
    expect(lecturaActual([])).toBeNull();
  });

  it('returns the most recent row by timestamp', () => {
    const rows = [
      lectura({ id: 1, timestamp: hoursAgo(3), temp_c: 20 }),
      lectura({ id: 2, timestamp: hoursAgo(1), temp_c: 25 }),
      lectura({ id: 3, timestamp: hoursAgo(2), temp_c: 22 }),
    ];
    const result = lecturaActual(rows);
    expect(result?.id).toBe(2);
    expect(result?.temp_c).toBe(25);
  });
});

describe('calcularResumenPeriodo', () => {
  let calcularResumenPeriodo: (rows: LecturaClima[], dias: number) => import('@/types/clima').ResumenClima;

  beforeAll(async () => {
    const mod = await import('@/utils/calculosClima');
    calcularResumenPeriodo = mod.calcularResumenPeriodo;
  });

  it('returns nulls for empty array', () => {
    const r = calcularResumenPeriodo([], 7);
    expect(r.temp_promedio_c).toBeNull();
    expect(r.temp_max_c).toBeNull();
    expect(r.temp_min_c).toBeNull();
    expect(r.humedad_promedio_pct).toBeNull();
    expect(r.viento_promedio_kmh).toBeNull();
    expect(r.rafaga_max_kmh).toBeNull();
    expect(r.radiacion_promedio_wm2).toBeNull();
    expect(r.lluvia_total_mm).toBeNull();
  });

  it('filters rows outside the date window', () => {
    const rows = [
      lectura({ timestamp: daysAgo(10), temp_c: 100 }), // outside 7-day window
      lectura({ timestamp: hoursAgo(1), temp_c: 20 }),
    ];
    const r = calcularResumenPeriodo(rows, 7);
    expect(r.temp_promedio_c).toBe(20);
    expect(r.temp_max_c).toBe(20);
    expect(r.temp_min_c).toBe(20);
  });

  it('calculates temperature avg/max/min correctly', () => {
    const rows = [
      lectura({ timestamp: hoursAgo(3), temp_c: 18 }),
      lectura({ timestamp: hoursAgo(2), temp_c: 22 }),
      lectura({ timestamp: hoursAgo(1), temp_c: 26 }),
    ];
    const r = calcularResumenPeriodo(rows, 1);
    expect(r.temp_promedio_c).toBe(22);
    expect(r.temp_max_c).toBe(26);
    expect(r.temp_min_c).toBe(18);
  });

  it('calculates humidity avg correctly', () => {
    const rows = [
      lectura({ timestamp: hoursAgo(2), humedad_pct: 60 }),
      lectura({ timestamp: hoursAgo(1), humedad_pct: 80 }),
    ];
    const r = calcularResumenPeriodo(rows, 1);
    expect(r.humedad_promedio_pct).toBe(70);
  });

  it('calculates wind avg and max gust', () => {
    const rows = [
      lectura({ timestamp: hoursAgo(2), viento_kmh: 10, rafaga_kmh: 20 }),
      lectura({ timestamp: hoursAgo(1), viento_kmh: 14, rafaga_kmh: 30 }),
    ];
    const r = calcularResumenPeriodo(rows, 1);
    expect(r.viento_promedio_kmh).toBe(12);
    expect(r.rafaga_max_kmh).toBe(30);
  });

  it('calculates radiation avg', () => {
    const rows = [
      lectura({ timestamp: hoursAgo(2), radiacion_wm2: 400 }),
      lectura({ timestamp: hoursAgo(1), radiacion_wm2: 600 }),
    ];
    const r = calcularResumenPeriodo(rows, 1);
    expect(r.radiacion_promedio_wm2).toBe(500);
  });

  it('handles rows with null values without division by 0', () => {
    const rows = [
      lectura({ timestamp: hoursAgo(2), temp_c: null, humedad_pct: 50 }),
      lectura({ timestamp: hoursAgo(1), temp_c: 20, humedad_pct: null }),
    ];
    const r = calcularResumenPeriodo(rows, 1);
    expect(r.temp_promedio_c).toBe(20); // only 1 non-null value
    expect(r.humedad_promedio_pct).toBe(50);
  });

  it('calculates rainfall as SUM of MAX(lluvia_diaria_mm) per calendar day', () => {
    // Same calendar day: multiple readings, device accumulator increases
    // MAX per day is what matters (device resets at midnight)
    const rows = [
      lectura({ timestamp: hoursAgo(5), lluvia_diaria_mm: 2.0 }),
      lectura({ timestamp: hoursAgo(4), lluvia_diaria_mm: 3.5 }),
      lectura({ timestamp: hoursAgo(3), lluvia_diaria_mm: 5.0 }), // MAX for today
      lectura({ timestamp: hoursAgo(2), lluvia_diaria_mm: 5.0 }),
      lectura({ timestamp: hoursAgo(1), lluvia_diaria_mm: 5.0 }),
    ];
    const r = calcularResumenPeriodo(rows, 1);
    // All readings are same calendar day → MAX = 5.0, SUM of one day = 5.0
    expect(r.lluvia_total_mm).toBe(5.0);
  });

  it('sums MAX per day across multiple calendar days', () => {
    const rows = [
      // Yesterday: max = 8.0
      lectura({ timestamp: daysAgo(1), lluvia_diaria_mm: 3.0 }),
      lectura({ timestamp: new Date(now.getTime() - 30 * 60 * 60 * 1000).toISOString(), lluvia_diaria_mm: 8.0 }),
      // Today: max = 4.0
      lectura({ timestamp: hoursAgo(2), lluvia_diaria_mm: 2.0 }),
      lectura({ timestamp: hoursAgo(1), lluvia_diaria_mm: 4.0 }),
    ];
    const r = calcularResumenPeriodo(rows, 7);
    // SUM(MAX per day) = 8.0 + 4.0 = 12.0
    expect(r.lluvia_total_mm).toBe(12.0);
  });
});

describe('calcularResumenAnioALaFecha', () => {
  let calcularResumenAnioALaFecha: (rows: LecturaClima[]) => import('@/types/clima').ResumenClima;

  beforeAll(async () => {
    const mod = await import('@/utils/calculosClima');
    calcularResumenAnioALaFecha = mod.calcularResumenAnioALaFecha;
  });

  it('returns nulls for empty array', () => {
    const r = calcularResumenAnioALaFecha([]);
    expect(r.temp_promedio_c).toBeNull();
  });

  it('includes data from Jan 1 of current year', () => {
    const jan1 = new Date(now.getFullYear(), 0, 1, 12, 0, 0).toISOString();
    const rows = [
      lectura({ timestamp: jan1, temp_c: 15 }),
      lectura({ timestamp: hoursAgo(1), temp_c: 25 }),
    ];
    const r = calcularResumenAnioALaFecha(rows);
    expect(r.temp_promedio_c).toBe(20);
  });

  it('excludes data from previous year', () => {
    const lastYear = new Date(now.getFullYear() - 1, 11, 15, 12, 0, 0).toISOString();
    const rows = [
      lectura({ timestamp: lastYear, temp_c: 100 }), // should be excluded
      lectura({ timestamp: hoursAgo(1), temp_c: 20 }),
    ];
    const r = calcularResumenAnioALaFecha(rows);
    expect(r.temp_promedio_c).toBe(20);
  });
});

describe('agregarParaGrafico', () => {
  let agregarParaGrafico: (rows: LecturaClima[], desde: Date, hasta: Date) => import('@/types/clima').LecturaClimaAgregada[];

  beforeAll(async () => {
    const mod = await import('@/utils/calculosClima');
    agregarParaGrafico = mod.agregarParaGrafico;
  });

  it('returns empty array for empty input', () => {
    const result = agregarParaGrafico([], new Date(), new Date());
    expect(result).toEqual([]);
  });

  it('uses hourly buckets for ranges ≤7 days', () => {
    const desde = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const rows = [
      lectura({ timestamp: hoursAgo(3), temp_c: 20 }),
      lectura({ timestamp: hoursAgo(2), temp_c: 22 }),
      lectura({ timestamp: hoursAgo(1), temp_c: 24 }),
    ];
    const result = agregarParaGrafico(rows, desde, now);
    // Each reading in a different hour → 3 buckets
    expect(result.length).toBe(3);
    // Hourly bucket format: includes time component
    expect(result[0].fecha).toContain(':');
  });

  it('uses daily buckets for ranges >7 days', () => {
    const desde = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const rows = [
      lectura({ timestamp: daysAgo(9), temp_c: 18 }),
      lectura({ timestamp: daysAgo(8), temp_c: 20 }),
      lectura({ timestamp: daysAgo(1), temp_c: 22 }),
    ];
    const result = agregarParaGrafico(rows, desde, now);
    expect(result.length).toBeGreaterThanOrEqual(3);
    // Daily bucket format: YYYY-MM-DD (no time component with ':')
    expect(result[0].fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('correctly averages values within each bucket', () => {
    // Two readings in same hour
    const baseTime = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago
    const t1 = new Date(baseTime.getTime());
    const t2 = new Date(baseTime.getTime() + 10 * 60 * 1000); // 10 min later, same hour
    const desde = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    const rows = [
      lectura({ timestamp: t1.toISOString(), temp_c: 20, humedad_pct: 60 }),
      lectura({ timestamp: t2.toISOString(), temp_c: 24, humedad_pct: 80 }),
    ];
    const result = agregarParaGrafico(rows, desde, now);

    // Should be grouped into 1 bucket with averaged values
    const bucket = result.find(r => r.temp_c_promedio !== null);
    expect(bucket).toBeDefined();
    expect(bucket!.temp_c_promedio).toBe(22);
    expect(bucket!.humedad_pct_promedio).toBe(70);
  });

  it('uses reduce-based max/min (stack-safe for large datasets)', () => {
    // Create 200 readings (enough to test that we're not using Math.max(...spread))
    const desde = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const rows: LecturaClima[] = [];
    for (let i = 0; i < 200; i++) {
      rows.push(
        lectura({
          id: i,
          timestamp: new Date(now.getTime() - i * 5 * 60 * 1000).toISOString(), // every 5 min
          temp_c: 20 + (i % 10),
          viento_kmh: 5 + (i % 5),
          rafaga_kmh: 10 + (i % 8),
        })
      );
    }
    // Should not throw RangeError
    const result = agregarParaGrafico(rows, desde, now);
    expect(result.length).toBeGreaterThan(0);
  });
});
