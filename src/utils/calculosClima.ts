import type { LecturaClima, ResumenClima, ResumenDiario, LecturaClimaAgregada, DatoAnualOverlay, SerieAnual } from '@/types/clima';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function safeMax(values: number[]): number {
  return values.reduce((max, v) => (v > max ? v : max), -Infinity);
}

function safeMin(values: number[]): number {
  return values.reduce((min, v) => (v < min ? v : min), Infinity);
}

// Cardinal direction from degrees (0-360)
const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'] as const;

export function degreesToCardinal(deg: number): string {
  const normalized = ((deg % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % 8;
  return CARDINALS[index];
}

// Most recent 5-min reading (for live KPI cards)
export function lecturaActual(rows: LecturaClima[]): LecturaClima | null {
  if (rows.length === 0) return null;
  return rows.reduce((latest, row) =>
    new Date(row.timestamp) > new Date(latest.timestamp) ? row : latest
  );
}

// ============================================================================
// Period summaries from pre-aggregated daily data (clima_resumen_diario)
// ============================================================================

export function calcularResumenPeriodoDiario(rows: ResumenDiario[], dias: number): ResumenClima {
  const cutoff = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const filtered = rows.filter(r => r.fecha >= cutoffStr);
  return buildResumenFromDaily(filtered);
}

export function calcularResumenAnioALaFechaDiario(rows: ResumenDiario[]): ResumenClima {
  const jan1 = `${new Date().getFullYear()}-01-01`;
  const filtered = rows.filter(r => r.fecha >= jan1);
  return buildResumenFromDaily(filtered);
}

function buildResumenFromDaily(rows: ResumenDiario[]): ResumenClima {
  if (rows.length === 0) {
    return {
      lluvia_total_mm: null,
      temp_promedio_c: null,
      temp_max_c: null,
      temp_min_c: null,
      humedad_promedio_pct: null,
      viento_promedio_kmh: null,
      rafaga_max_kmh: null,
      radiacion_promedio_wm2: null,
    };
  }

  const temps = rows.map(r => r.temp_c_avg).filter((v): v is number => v !== null);
  const tempMaxes = rows.map(r => r.temp_c_max).filter((v): v is number => v !== null);
  const tempMins = rows.map(r => r.temp_c_min).filter((v): v is number => v !== null);
  const humedad = rows.map(r => r.humedad_pct_avg).filter((v): v is number => v !== null);
  const viento = rows.map(r => r.viento_kmh_avg).filter((v): v is number => v !== null);
  const rafaga = rows.map(r => r.rafaga_kmh_max).filter((v): v is number => v !== null);
  const radiacion = rows.map(r => r.radiacion_wm2_avg).filter((v): v is number => v !== null);
  const lluvia = rows.map(r => r.lluvia_total_mm).filter((v): v is number => v !== null);

  return {
    lluvia_total_mm: lluvia.length > 0 ? round2(lluvia.reduce((s, v) => s + v, 0)) : null,
    temp_promedio_c: temps.length > 0 ? round2(avg(temps)) : null,
    temp_max_c: tempMaxes.length > 0 ? round2(safeMax(tempMaxes)) : null,
    temp_min_c: tempMins.length > 0 ? round2(safeMin(tempMins)) : null,
    humedad_promedio_pct: humedad.length > 0 ? round2(avg(humedad)) : null,
    viento_promedio_kmh: viento.length > 0 ? round2(avg(viento)) : null,
    rafaga_max_kmh: rafaga.length > 0 ? round2(safeMax(rafaga)) : null,
    radiacion_promedio_wm2: radiacion.length > 0 ? round2(avg(radiacion)) : null,
  };
}

// ============================================================================
// 24h summary from live 5-min readings (for KPI cards secondary values)
// ============================================================================

// Bogotá timezone formatter for consistent day boundaries
const bogotaDateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function getBogotaDateKey(ts: string): string {
  return bogotaDateFmt.format(new Date(ts));
}

function nonNull(rows: LecturaClima[], field: keyof LecturaClima): number[] {
  return rows
    .map(r => r[field])
    .filter((v): v is number => v !== null && typeof v === 'number');
}

function calcularLluviaPorPeriodo(rows: LecturaClima[]): number | null {
  const lluviaRows = rows.filter(r => r.lluvia_diaria_mm !== null);
  if (lluviaRows.length === 0) return null;
  const porDia = new Map<string, number>();
  for (const row of lluviaRows) {
    const dayKey = getBogotaDateKey(row.timestamp);
    const current = porDia.get(dayKey) ?? 0;
    porDia.set(dayKey, Math.max(current, row.lluvia_diaria_mm!));
  }
  let total = 0;
  for (const maxDia of porDia.values()) total += maxDia;
  return round2(total);
}

export function calcularResumen24h(rows: LecturaClima[]): ResumenClima {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const filtered = rows.filter(r => new Date(r.timestamp) >= cutoff);
  if (filtered.length === 0) {
    return {
      lluvia_total_mm: null, temp_promedio_c: null, temp_max_c: null, temp_min_c: null,
      humedad_promedio_pct: null, viento_promedio_kmh: null, rafaga_max_kmh: null,
      radiacion_promedio_wm2: null,
    };
  }
  const temps = nonNull(filtered, 'temp_c');
  const humedad = nonNull(filtered, 'humedad_pct');
  const viento = nonNull(filtered, 'viento_kmh');
  const rafaga = nonNull(filtered, 'rafaga_kmh');
  const radiacion = nonNull(filtered, 'radiacion_wm2');
  return {
    lluvia_total_mm: calcularLluviaPorPeriodo(filtered),
    temp_promedio_c: temps.length > 0 ? round2(avg(temps)) : null,
    temp_max_c: temps.length > 0 ? round2(safeMax(temps)) : null,
    temp_min_c: temps.length > 0 ? round2(safeMin(temps)) : null,
    humedad_promedio_pct: humedad.length > 0 ? round2(avg(humedad)) : null,
    viento_promedio_kmh: viento.length > 0 ? round2(avg(viento)) : null,
    rafaga_max_kmh: rafaga.length > 0 ? round2(safeMax(rafaga)) : null,
    radiacion_promedio_wm2: radiacion.length > 0 ? round2(avg(radiacion)) : null,
  };
}

// ============================================================================
// Chart series from pre-aggregated daily data
// ============================================================================

export function resumenDiarioToAgregada(rows: ResumenDiario[], desde: string, hasta: string): LecturaClimaAgregada[] {
  return rows
    .filter(r => r.fecha >= desde && r.fecha <= hasta)
    .map(r => ({
      fecha: r.fecha,
      temp_c_promedio: r.temp_c_avg,
      temp_c_max: r.temp_c_max,
      temp_c_min: r.temp_c_min,
      humedad_pct_promedio: r.humedad_pct_avg,
      viento_kmh_promedio: r.viento_kmh_avg,
      rafaga_kmh_max: r.rafaga_kmh_max,
      lluvia_diaria_mm: r.lluvia_total_mm,
      radiacion_wm2_promedio: r.radiacion_wm2_avg,
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// Monthly aggregation of daily summaries (for ranges > 365 days)
export function resumenDiarioToMensual(rows: ResumenDiario[], desde: string, hasta: string): LecturaClimaAgregada[] {
  const filtered = rows.filter(r => r.fecha >= desde && r.fecha <= hasta);
  if (filtered.length === 0) return [];

  const buckets = new Map<string, ResumenDiario[]>();
  for (const r of filtered) {
    const monthKey = r.fecha.slice(0, 7); // YYYY-MM
    const bucket = buckets.get(monthKey) ?? [];
    bucket.push(r);
    buckets.set(monthKey, bucket);
  }

  const result: LecturaClimaAgregada[] = [];
  for (const [fecha, dias] of buckets) {
    const temps = dias.map(d => d.temp_c_avg).filter((v): v is number => v !== null);
    const tempMaxes = dias.map(d => d.temp_c_max).filter((v): v is number => v !== null);
    const tempMins = dias.map(d => d.temp_c_min).filter((v): v is number => v !== null);
    const humedad = dias.map(d => d.humedad_pct_avg).filter((v): v is number => v !== null);
    const viento = dias.map(d => d.viento_kmh_avg).filter((v): v is number => v !== null);
    const rafaga = dias.map(d => d.rafaga_kmh_max).filter((v): v is number => v !== null);
    const lluvia = dias.map(d => d.lluvia_total_mm).filter((v): v is number => v !== null);
    const radiacion = dias.map(d => d.radiacion_wm2_avg).filter((v): v is number => v !== null);

    result.push({
      fecha,
      temp_c_promedio: temps.length > 0 ? round2(avg(temps)) : null,
      temp_c_max: tempMaxes.length > 0 ? round2(safeMax(tempMaxes)) : null,
      temp_c_min: tempMins.length > 0 ? round2(safeMin(tempMins)) : null,
      humedad_pct_promedio: humedad.length > 0 ? round2(avg(humedad)) : null,
      viento_kmh_promedio: viento.length > 0 ? round2(avg(viento)) : null,
      rafaga_kmh_max: rafaga.length > 0 ? round2(safeMax(rafaga)) : null,
      lluvia_diaria_mm: lluvia.length > 0 ? round2(lluvia.reduce((s, v) => s + v, 0)) : null,
      radiacion_wm2_promedio: radiacion.length > 0 ? round2(avg(radiacion)) : null,
    });
  }

  return result.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// Hourly aggregation of live 5-min readings (for 24h chart)
export function lecturas24hToHorario(rows: LecturaClima[]): LecturaClimaAgregada[] {
  const bogotaHourFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  });

  const getBogotaHourKey = (ts: string): string => {
    const parts = bogotaHourFmt.formatToParts(new Date(ts));
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    const hour = parts.find(p => p.type === 'hour')?.value;
    return `${year}-${month}-${day} ${hour}:00`;
  };

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const filtered = rows.filter(r => new Date(r.timestamp) >= cutoff);
  if (filtered.length === 0) return [];

  const buckets = new Map<string, LecturaClima[]>();
  for (const row of filtered) {
    const key = getBogotaHourKey(row.timestamp);
    const bucket = buckets.get(key) ?? [];
    bucket.push(row);
    buckets.set(key, bucket);
  }

  const result: LecturaClimaAgregada[] = [];
  for (const [fecha, lecturas] of buckets) {
    const temps = nonNull(lecturas, 'temp_c');
    const humedad = nonNull(lecturas, 'humedad_pct');
    const viento = nonNull(lecturas, 'viento_kmh');
    const rafaga = nonNull(lecturas, 'rafaga_kmh');
    const lluvia = nonNull(lecturas, 'lluvia_diaria_mm');
    const radiacion = nonNull(lecturas, 'radiacion_wm2');

    result.push({
      fecha,
      temp_c_promedio: temps.length > 0 ? round2(avg(temps)) : null,
      temp_c_max: temps.length > 0 ? round2(safeMax(temps)) : null,
      temp_c_min: temps.length > 0 ? round2(safeMin(temps)) : null,
      humedad_pct_promedio: humedad.length > 0 ? round2(avg(humedad)) : null,
      viento_kmh_promedio: viento.length > 0 ? round2(avg(viento)) : null,
      rafaga_kmh_max: rafaga.length > 0 ? round2(safeMax(rafaga)) : null,
      lluvia_diaria_mm: lluvia.length > 0 ? round2(safeMax(lluvia)) : null,
      radiacion_wm2_promedio: radiacion.length > 0 ? round2(avg(radiacion)) : null,
    });
  }

  return result.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// ============================================================================
// Year-overlay chart from daily summaries (months on X, one series per year)
// ============================================================================

const MESES_NOMBRES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

export function resumenDiarioToAnual(rows: ResumenDiario[], desde: string, hasta: string): SerieAnual {
  const filtered = rows.filter(r => r.fecha >= desde && r.fecha <= hasta);
  if (filtered.length === 0) return { datos: [], años: [] };

  // Group by YYYY-MM
  const monthBuckets = new Map<string, ResumenDiario[]>();
  for (const row of filtered) {
    const key = row.fecha.slice(0, 7);
    const bucket = monthBuckets.get(key) ?? [];
    bucket.push(row);
    monthBuckets.set(key, bucket);
  }

  const añosSet = new Set<number>();
  const aggregated = new Map<string, { temp: number | null; lluvia: number | null; humedad: number | null; viento: number | null }>();

  for (const [yearMonth, dias] of monthBuckets) {
    const [yearStr, monthStr] = yearMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    añosSet.add(year);
    const key = `${year}-${month}`;

    const temps = dias.map(d => d.temp_c_avg).filter((v): v is number => v !== null);
    const humedad = dias.map(d => d.humedad_pct_avg).filter((v): v is number => v !== null);
    const viento = dias.map(d => d.viento_kmh_avg).filter((v): v is number => v !== null);
    const lluvia = dias.map(d => d.lluvia_total_mm).filter((v): v is number => v !== null);

    aggregated.set(key, {
      temp: temps.length > 0 ? round2(avg(temps)) : null,
      lluvia: lluvia.length > 0 ? round2(lluvia.reduce((s, v) => s + v, 0)) : null,
      humedad: humedad.length > 0 ? round2(avg(humedad)) : null,
      viento: viento.length > 0 ? round2(avg(viento)) : null,
    });
  }

  const años = [...añosSet].sort();

  const datos: DatoAnualOverlay[] = [];
  for (let m = 1; m <= 12; m++) {
    const row: DatoAnualOverlay = { mes: MESES_NOMBRES[m - 1], mesNum: m };
    for (const year of años) {
      const agg = aggregated.get(`${year}-${m}`);
      row[`temp_${year}`] = agg?.temp ?? null;
      row[`lluvia_${year}`] = agg?.lluvia ?? null;
      row[`humedad_${year}`] = agg?.humedad ?? null;
      row[`viento_${year}`] = agg?.viento ?? null;
    }
    datos.push(row);
  }

  return { datos, años };
}
