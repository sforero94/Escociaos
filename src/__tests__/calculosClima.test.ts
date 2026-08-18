import { describe, it, expect, beforeAll } from 'vitest';
import type { LecturaClima, ResumenDiario } from '@/types/clima';

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
    // null = sin señal de frescura de Ecowitt (comportamiento previo a la
    // migración 068: se confía en el valor crudo). Tests que simulan el
    // bug del contador congelado deben fijar este campo explícitamente.
    lluvia_diaria_actualizada_en: null,
    radiacion_wm2: null,
    uv_index: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// Helper: create a ResumenDiario with defaults
function resumenDia(overrides: Partial<ResumenDiario> & { fecha: string }): ResumenDiario {
  return {
    station_id: 'ECOWITT-MAC',
    temp_c_min: null,
    temp_c_max: null,
    temp_c_avg: null,
    humedad_pct_min: null,
    humedad_pct_max: null,
    humedad_pct_avg: null,
    lluvia_total_mm: null,
    lluvia_confianza: 'ok',
    viento_kmh_avg: null,
    rafaga_kmh_max: null,
    viento_dir_predominante: null,
    radiacion_wm2_avg: null,
    radiacion_wm2_max: null,
    uv_index_max: null,
    lecturas_count: 288,
    ...overrides,
  };
}

// Relative date helpers
const now = new Date();
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000).toISOString();
const daysAgoStr = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

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

describe('calcularResumen24h', () => {
  let calcularResumen24h: (rows: LecturaClima[]) => import('@/types/clima').ResumenClima;

  beforeAll(async () => {
    const mod = await import('@/utils/calculosClima');
    calcularResumen24h = mod.calcularResumen24h;
  });

  it('returns nulls for empty array', () => {
    const r = calcularResumen24h([]);
    expect(r.temp_promedio_c).toBeNull();
    expect(r.lluvia_total_mm).toBeNull();
  });

  it('calculates temperature avg/max/min from live readings', () => {
    const rows = [
      lectura({ timestamp: hoursAgo(3), temp_c: 18 }),
      lectura({ timestamp: hoursAgo(2), temp_c: 22 }),
      lectura({ timestamp: hoursAgo(1), temp_c: 26 }),
    ];
    const r = calcularResumen24h(rows);
    expect(r.temp_promedio_c).toBe(22);
    expect(r.temp_max_c).toBe(26);
    expect(r.temp_min_c).toBe(18);
  });

  it('handles null values without division by 0', () => {
    const rows = [
      lectura({ timestamp: hoursAgo(2), temp_c: null, humedad_pct: 50 }),
      lectura({ timestamp: hoursAgo(1), temp_c: 20, humedad_pct: null }),
    ];
    const r = calcularResumen24h(rows);
    expect(r.temp_promedio_c).toBe(20);
    expect(r.humedad_promedio_pct).toBe(50);
  });

  // Regression coverage for the frozen Ecowitt rain-counter bug (migración 068):
  // 2026-07-20/21 both showed 15.75mm because the daily accumulator never reset.
  it('ignores rain value when the daily counter never updated today (frozen)', () => {
    const now = new Date();
    const staleUpdate = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString(); // >24h back — guaranteed prior Bogotá day
    const rows = [
      lectura({ timestamp: now.toISOString(), lluvia_diaria_mm: 15.75, lluvia_diaria_actualizada_en: staleUpdate }),
    ];
    const r = calcularResumen24h(rows);
    expect(r.lluvia_total_mm).toBeNull();
  });

  it('trusts rain value when the daily counter updated within today', () => {
    const now = new Date();
    const rows = [
      lectura({ timestamp: now.toISOString(), lluvia_diaria_mm: 4.2, lluvia_diaria_actualizada_en: now.toISOString() }),
    ];
    const r = calcularResumen24h(rows);
    expect(r.lluvia_total_mm).toBe(4.2);
  });

  it('trusts rain value when Ecowitt sends no freshness signal (legacy behavior)', () => {
    const now = new Date();
    const rows = [
      lectura({ timestamp: now.toISOString(), lluvia_diaria_mm: 3, lluvia_diaria_actualizada_en: null }),
    ];
    const r = calcularResumen24h(rows);
    expect(r.lluvia_total_mm).toBe(3);
  });
});

describe('calcularResumenPeriodoDiario', () => {
  let calcularResumenPeriodoDiario: (rows: ResumenDiario[], dias: number) => import('@/types/clima').ResumenClima;

  beforeAll(async () => {
    const mod = await import('@/utils/calculosClima');
    calcularResumenPeriodoDiario = mod.calcularResumenPeriodoDiario;
  });

  it('returns nulls for empty array', () => {
    const r = calcularResumenPeriodoDiario([], 7);
    expect(r.temp_promedio_c).toBeNull();
    expect(r.lluvia_total_mm).toBeNull();
  });

  it('filters rows outside the date window', () => {
    const rows = [
      resumenDia({ fecha: daysAgoStr(10), temp_c_avg: 100 }), // outside 7-day window
      resumenDia({ fecha: daysAgoStr(1), temp_c_avg: 20, temp_c_max: 25, temp_c_min: 15 }),
    ];
    const r = calcularResumenPeriodoDiario(rows, 7);
    expect(r.temp_promedio_c).toBe(20);
    expect(r.temp_max_c).toBe(25);
  });

  it('sums rainfall across days', () => {
    const rows = [
      resumenDia({ fecha: daysAgoStr(2), lluvia_total_mm: 8 }),
      resumenDia({ fecha: daysAgoStr(1), lluvia_total_mm: 4 }),
    ];
    const r = calcularResumenPeriodoDiario(rows, 7);
    expect(r.lluvia_total_mm).toBe(12);
  });

  it('takes max of daily maxes for temp/gust', () => {
    const rows = [
      resumenDia({ fecha: daysAgoStr(2), temp_c_max: 28, rafaga_kmh_max: 30 }),
      resumenDia({ fecha: daysAgoStr(1), temp_c_max: 32, rafaga_kmh_max: 25 }),
    ];
    const r = calcularResumenPeriodoDiario(rows, 7);
    expect(r.temp_max_c).toBe(32);
    expect(r.rafaga_max_kmh).toBe(30);
  });
});

describe('calcularResumenAnioALaFechaDiario', () => {
  let calcularResumenAnioALaFechaDiario: (rows: ResumenDiario[]) => import('@/types/clima').ResumenClima;

  beforeAll(async () => {
    const mod = await import('@/utils/calculosClima');
    calcularResumenAnioALaFechaDiario = mod.calcularResumenAnioALaFechaDiario;
  });

  it('returns nulls for empty array', () => {
    const r = calcularResumenAnioALaFechaDiario([]);
    expect(r.temp_promedio_c).toBeNull();
  });

  it('includes data from Jan 1 of current year', () => {
    const jan1 = `${now.getFullYear()}-01-01`;
    const rows = [
      resumenDia({ fecha: jan1, temp_c_avg: 15 }),
      resumenDia({ fecha: daysAgoStr(1), temp_c_avg: 25 }),
    ];
    const r = calcularResumenAnioALaFechaDiario(rows);
    expect(r.temp_promedio_c).toBe(20);
  });

  it('excludes data from previous year', () => {
    const lastYear = `${now.getFullYear() - 1}-12-15`;
    const rows = [
      resumenDia({ fecha: lastYear, temp_c_avg: 100 }), // should be excluded
      resumenDia({ fecha: daysAgoStr(1), temp_c_avg: 20 }),
    ];
    const r = calcularResumenAnioALaFechaDiario(rows);
    expect(r.temp_promedio_c).toBe(20);
  });
});

describe('resumenDiarioToAgregada', () => {
  let resumenDiarioToAgregada: (rows: ResumenDiario[], desde: string, hasta: string) => import('@/types/clima').LecturaClimaAgregada[];

  beforeAll(async () => {
    const mod = await import('@/utils/calculosClima');
    resumenDiarioToAgregada = mod.resumenDiarioToAgregada;
  });

  it('returns empty array for empty input', () => {
    expect(resumenDiarioToAgregada([], '2026-01-01', '2026-12-31')).toEqual([]);
  });

  it('maps daily summaries to chart format', () => {
    const rows = [
      resumenDia({ fecha: '2026-04-01', temp_c_avg: 20, temp_c_max: 25, temp_c_min: 15, lluvia_total_mm: 5 }),
      resumenDia({ fecha: '2026-04-02', temp_c_avg: 22, temp_c_max: 27, temp_c_min: 17, lluvia_total_mm: 0 }),
    ];
    const result = resumenDiarioToAgregada(rows, '2026-04-01', '2026-04-02');
    expect(result).toHaveLength(2);
    expect(result[0].fecha).toBe('2026-04-01');
    expect(result[0].temp_c_promedio).toBe(20);
    expect(result[0].lluvia_diaria_mm).toBe(5);
    expect(result[1].fecha).toBe('2026-04-02');
  });

  it('filters by date range', () => {
    const rows = [
      resumenDia({ fecha: '2026-03-30', temp_c_avg: 18 }),
      resumenDia({ fecha: '2026-04-01', temp_c_avg: 20 }),
      resumenDia({ fecha: '2026-04-05', temp_c_avg: 22 }),
    ];
    const result = resumenDiarioToAgregada(rows, '2026-04-01', '2026-04-03');
    expect(result).toHaveLength(1);
    expect(result[0].fecha).toBe('2026-04-01');
  });

  // Regression coverage for the frozen Ecowitt rain-counter bug (migración 068).
  it('renders lluvia_diaria_mm as null when the day is flagged contador_congelado', () => {
    const rows = [
      resumenDia({ fecha: '2026-07-21', lluvia_total_mm: 15.75, lluvia_confianza: 'contador_congelado' }),
    ];
    const result = resumenDiarioToAgregada(rows, '2026-07-01', '2026-07-31');
    expect(result[0].lluvia_diaria_mm).toBeNull();
    expect(result[0].lluvia_confianza).toBe('contador_congelado');
  });

  it('passes through lluvia_diaria_mm when confianza is ok', () => {
    const rows = [
      resumenDia({ fecha: '2026-07-20', lluvia_total_mm: 15.75, lluvia_confianza: 'ok' }),
    ];
    const result = resumenDiarioToAgregada(rows, '2026-07-01', '2026-07-31');
    expect(result[0].lluvia_diaria_mm).toBe(15.75);
  });
});

describe('lecturas24hToHorario', () => {
  let lecturas24hToHorario: (rows: LecturaClima[]) => import('@/types/clima').LecturaClimaAgregada[];

  beforeAll(async () => {
    const mod = await import('@/utils/calculosClima');
    lecturas24hToHorario = mod.lecturas24hToHorario;
  });

  it('returns empty array for empty input', () => {
    expect(lecturas24hToHorario([])).toEqual([]);
  });

  it('groups readings into hourly buckets', () => {
    const rows = [
      lectura({ timestamp: hoursAgo(3), temp_c: 20 }),
      lectura({ timestamp: hoursAgo(2), temp_c: 22 }),
      lectura({ timestamp: hoursAgo(1), temp_c: 24 }),
    ];
    const result = lecturas24hToHorario(rows);
    expect(result.length).toBe(3);
    // Hourly format includes time component
    expect(result[0].fecha).toContain(':');
  });

  it('averages values within same hour', () => {
    const baseTime = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago
    baseTime.setMinutes(0, 0, 0); // anchor to the top of the hour so t1/t2 share the bucket
    const t1 = new Date(baseTime.getTime());
    const t2 = new Date(baseTime.getTime() + 10 * 60 * 1000); // 10 min later, same hour
    const rows = [
      lectura({ timestamp: t1.toISOString(), temp_c: 20, humedad_pct: 60 }),
      lectura({ timestamp: t2.toISOString(), temp_c: 24, humedad_pct: 80 }),
    ];
    const result = lecturas24hToHorario(rows);
    const bucket = result.find(r => r.temp_c_promedio !== null);
    expect(bucket).toBeDefined();
    expect(bucket!.temp_c_promedio).toBe(22);
    expect(bucket!.humedad_pct_promedio).toBe(70);
  });

  // Regression coverage for the frozen Ecowitt rain-counter bug (migración 068).
  it('nulls hourly rain when the counter is frozen from a prior day', () => {
    const now = new Date();
    const staleUpdate = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
    const rows = [
      lectura({ timestamp: now.toISOString(), lluvia_diaria_mm: 15.75, lluvia_diaria_actualizada_en: staleUpdate }),
    ];
    const result = lecturas24hToHorario(rows);
    expect(result[0].lluvia_diaria_mm).toBeNull();
  });

  it('keeps hourly rain when the counter updated within the same day', () => {
    const now = new Date();
    const rows = [
      lectura({ timestamp: now.toISOString(), lluvia_diaria_mm: 4.2, lluvia_diaria_actualizada_en: now.toISOString() }),
    ];
    const result = lecturas24hToHorario(rows);
    expect(result[0].lluvia_diaria_mm).toBe(4.2);
  });
});

// Bloque "Hoy en la finca" del tablero (docs/plan_dashboard_centro_control.md
// §4 Bloque 2.1 / §9.2): la franja de los últimos N días de lluvia. El caso
// real que sostiene este bloque (06-ago → 15-ago 2026, verificado en
// producción): 0,25 · 0,51 · s/d · 0,25 · s/d · 0,00 · 0,25 · s/d · 0,00 ·
// 0,00 mm -- tres días con el contador congelado y dos ceros reales, y la
// franja tiene que distinguirlos.
describe('construirFranjaLluvia', () => {
  let construirFranjaLluvia: (
    resumenes: ResumenDiario[],
    dias: number,
    hastaISO: string,
  ) => import('@/utils/calculosClima').DiaFranjaLluvia[];

  beforeAll(async () => {
    const mod = await import('@/utils/calculosClima');
    construirFranjaLluvia = mod.construirFranjaLluvia;
  });

  it('clasifica el caso real de producción (06-ago → 15-ago 2026)', () => {
    const mmPorDia: Record<string, number> = {
      '2026-08-06': 0.25,
      '2026-08-07': 0.51,
      '2026-08-09': 0.25,
      '2026-08-12': 0.25,
    };
    const congelados = new Set(['2026-08-08', '2026-08-10', '2026-08-13']);
    const ceros = new Set(['2026-08-11', '2026-08-14', '2026-08-15']);

    const rows: ResumenDiario[] = [];
    for (const fecha of [
      '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09', '2026-08-10',
      '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15',
    ]) {
      if (congelados.has(fecha)) {
        rows.push(resumenDia({ fecha, lluvia_total_mm: null, lluvia_confianza: 'contador_congelado' }));
      } else if (ceros.has(fecha)) {
        rows.push(resumenDia({ fecha, lluvia_total_mm: 0, lluvia_confianza: 'ok' }));
      } else {
        rows.push(resumenDia({ fecha, lluvia_total_mm: mmPorDia[fecha], lluvia_confianza: 'ok' }));
      }
    }

    const franja = construirFranjaLluvia(rows, 10, '2026-08-15');

    expect(franja).toHaveLength(10);
    expect(franja[0].fecha).toBe('2026-08-06');
    expect(franja[9].fecha).toBe('2026-08-15');

    const porFecha = Object.fromEntries(franja.map((d) => [d.fecha, d]));

    // Días con lluvia real
    expect(porFecha['2026-08-06']).toMatchObject({ estado: 'lluvia', mm: 0.25 });
    expect(porFecha['2026-08-07']).toMatchObject({ estado: 'lluvia', mm: 0.51 });
    expect(porFecha['2026-08-09']).toMatchObject({ estado: 'lluvia', mm: 0.25 });
    expect(porFecha['2026-08-12']).toMatchObject({ estado: 'lluvia', mm: 0.25 });

    // Ceros reales -- nunca "sin dato"
    expect(porFecha['2026-08-11']).toMatchObject({ estado: 'seco', mm: 0 });
    expect(porFecha['2026-08-14']).toMatchObject({ estado: 'seco', mm: 0 });
    expect(porFecha['2026-08-15']).toMatchObject({ estado: 'seco', mm: 0 });

    // Contador congelado -- sin dato, NUNCA 0mm, y con su causa
    for (const fecha of ['2026-08-08', '2026-08-10', '2026-08-13']) {
      expect(porFecha[fecha].estado).toBe('sin_dato');
      expect(porFecha[fecha].mm).toBeNull();
      expect(porFecha[fecha].causa).toBe('contador_congelado');
    }

    const sinDato = franja.filter((d) => d.estado === 'sin_dato');
    expect(sinDato).toHaveLength(3);
  });

  it('un día sin ninguna fila en clima_resumen_diario es "sin_dato", nunca 0mm', () => {
    const franja = construirFranjaLluvia([], 3, '2026-08-15');
    expect(franja.every((d) => d.estado === 'sin_dato' && d.mm === null)).toBe(true);
    expect(franja.map((d) => d.causa)).toEqual(['sin_registro', 'sin_registro', 'sin_registro']);
  });

  it('nunca lee lluvia_total_mm directo -- pasa por lluviaConfiableDeResumen incluso si confianza no está seteada como congelada pero el total es null', () => {
    const rows = [resumenDia({ fecha: '2026-08-15', lluvia_total_mm: null, lluvia_confianza: 'ok' })];
    const franja = construirFranjaLluvia(rows, 1, '2026-08-15');
    expect(franja[0].estado).toBe('sin_dato');
    expect(franja[0].mm).toBeNull();
  });

  it('respeta el rango exacto de `dias` terminando en `hastaISO`, ordenado ascendente', () => {
    const rows = [
      resumenDia({ fecha: '2026-08-13', lluvia_total_mm: 1, lluvia_confianza: 'ok' }),
      resumenDia({ fecha: '2026-08-14', lluvia_total_mm: 2, lluvia_confianza: 'ok' }),
      resumenDia({ fecha: '2026-08-15', lluvia_total_mm: 3, lluvia_confianza: 'ok' }),
    ];
    const franja = construirFranjaLluvia(rows, 3, '2026-08-15');
    expect(franja.map((d) => d.fecha)).toEqual(['2026-08-13', '2026-08-14', '2026-08-15']);
  });
});
