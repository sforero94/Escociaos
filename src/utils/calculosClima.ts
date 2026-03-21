import type { LecturaClima, ResumenClima, LecturaClimaAgregada, DatoAnualOverlay, SerieAnual } from '@/types/clima';

// Bogotá timezone formatter for consistent day boundaries
const bogotaDateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const bogotaHourFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hour12: false,
});

// Stack-safe reduce-based min/max
function safeMax(values: number[]): number {
  return values.reduce((max, v) => (v > max ? v : max), -Infinity);
}

function safeMin(values: number[]): number {
  return values.reduce((min, v) => (v < min ? v : min), Infinity);
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Get calendar date key in Bogotá timezone (YYYY-MM-DD)
function getBogotaDateKey(ts: string): string {
  return bogotaDateFmt.format(new Date(ts));
}

// Get month bucket key in Bogotá timezone (YYYY-MM)
function getBogotaMonthKey(ts: string): string {
  const d = new Date(ts);
  const parts = bogotaDateFmt.formatToParts(d);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  return `${year}-${month}`;
}

// Get hour bucket key in Bogotá timezone (YYYY-MM-DD HH:00)
function getBogotaHourKey(ts: string): string {
  const parts = bogotaHourFmt.formatToParts(new Date(ts));
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  const hour = parts.find(p => p.type === 'hour')?.value;
  return `${year}-${month}-${day} ${hour}:00`;
}

// Cardinal direction from degrees (0-360)
const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'] as const;

export function degreesToCardinal(deg: number): string {
  const normalized = ((deg % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % 8;
  return CARDINALS[index];
}

// Most recent reading
export function lecturaActual(rows: LecturaClima[]): LecturaClima | null {
  if (rows.length === 0) return null;
  return rows.reduce((latest, row) =>
    new Date(row.timestamp) > new Date(latest.timestamp) ? row : latest
  );
}

// Extract non-null values from a specific field
function nonNull(rows: LecturaClima[], field: keyof LecturaClima): number[] {
  return rows
    .map(r => r[field])
    .filter((v): v is number => v !== null && typeof v === 'number');
}

// Calculate rainfall: SUM of MAX(lluvia_diaria_mm) per calendar day (Bogotá TZ)
function calcularLluviaPorPeriodo(rows: LecturaClima[]): number | null {
  const lluviaRows = rows.filter(r => r.lluvia_diaria_mm !== null);
  if (lluviaRows.length === 0) return null;

  // Group by calendar day in Bogotá timezone
  const porDia = new Map<string, number>();
  for (const row of lluviaRows) {
    const dayKey = getBogotaDateKey(row.timestamp);
    const current = porDia.get(dayKey) ?? 0;
    porDia.set(dayKey, Math.max(current, row.lluvia_diaria_mm!));
  }

  // SUM of MAX per day
  let total = 0;
  for (const maxDia of porDia.values()) {
    total += maxDia;
  }
  return round2(total);
}

// Rolling period summary (last N days from now)
export function calcularResumenPeriodo(rows: LecturaClima[], dias: number): ResumenClima {
  const cutoff = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const filtered = rows.filter(r => new Date(r.timestamp) >= cutoff);
  return buildResumen(filtered);
}

// Year-to-date summary (Jan 1 of current year to now)
export function calcularResumenAnioALaFecha(rows: LecturaClima[]): ResumenClima {
  const jan1 = new Date(new Date().getFullYear(), 0, 1);
  const filtered = rows.filter(r => new Date(r.timestamp) >= jan1);
  return buildResumen(filtered);
}

function buildResumen(filtered: LecturaClima[]): ResumenClima {
  if (filtered.length === 0) {
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

// Aggregate readings for charts — auto-selects hourly (≤7d), daily (7d–365d), or monthly (>365d)
export function agregarParaGrafico(
  rows: LecturaClima[],
  desde: Date,
  hasta: Date
): LecturaClimaAgregada[] {
  const filtered = rows.filter(r => {
    const t = new Date(r.timestamp);
    return t >= desde && t <= hasta;
  });

  if (filtered.length === 0) return [];

  const rangoMs = hasta.getTime() - desde.getTime();
  const rangoDias = rangoMs / (24 * 60 * 60 * 1000);
  const granularity: 'hourly' | 'daily' | 'monthly' =
    rangoDias <= 7 ? 'hourly' : rangoDias < 365 ? 'daily' : 'monthly';

  const getBucketKey = (ts: string) => {
    switch (granularity) {
      case 'hourly': return getBogotaHourKey(ts);
      case 'daily': return getBogotaDateKey(ts);
      case 'monthly': return getBogotaMonthKey(ts);
    }
  };

  // Group by bucket key
  const buckets = new Map<string, LecturaClima[]>();
  for (const row of filtered) {
    const key = getBucketKey(row.timestamp);
    const bucket = buckets.get(key) ?? [];
    bucket.push(row);
    buckets.set(key, bucket);
  }

  // Aggregate each bucket
  const result: LecturaClimaAgregada[] = [];
  for (const [fecha, lecturas] of buckets) {
    const temps = nonNull(lecturas, 'temp_c');
    const humedad = nonNull(lecturas, 'humedad_pct');
    const viento = nonNull(lecturas, 'viento_kmh');
    const rafaga = nonNull(lecturas, 'rafaga_kmh');
    const radiacion = nonNull(lecturas, 'radiacion_wm2');
    const lluvia = nonNull(lecturas, 'lluvia_diaria_mm');

    // For monthly buckets, sum daily max rainfall instead of taking overall max
    let lluviaAgregada: number | null = null;
    if (lluvia.length > 0) {
      if (granularity === 'monthly') {
        // Group by day first, get max per day, then sum
        const dailyMax = new Map<string, number>();
        for (const lectura of lecturas) {
          if (lectura.lluvia_diaria_mm == null) continue;
          const dayKey = getBogotaDateKey(lectura.timestamp);
          const current = dailyMax.get(dayKey) ?? 0;
          dailyMax.set(dayKey, Math.max(current, lectura.lluvia_diaria_mm));
        }
        lluviaAgregada = round2([...dailyMax.values()].reduce((sum, v) => sum + v, 0));
      } else {
        lluviaAgregada = round2(safeMax(lluvia));
      }
    }

    // Max/min only meaningful when bucket has Ecowitt data (multiple readings/day)
    const tieneEcowitt = lecturas.some(l => l.station_id !== 'wunderground-historico');

    result.push({
      fecha,
      temp_c_promedio: temps.length > 0 ? round2(avg(temps)) : null,
      temp_c_max: tieneEcowitt && temps.length > 0 ? round2(safeMax(temps)) : null,
      temp_c_min: tieneEcowitt && temps.length > 0 ? round2(safeMin(temps)) : null,
      humedad_pct_promedio: humedad.length > 0 ? round2(avg(humedad)) : null,
      viento_kmh_promedio: viento.length > 0 ? round2(avg(viento)) : null,
      rafaga_kmh_max: rafaga.length > 0 ? round2(safeMax(rafaga)) : null,
      lluvia_diaria_mm: lluviaAgregada,
      radiacion_wm2_promedio: radiacion.length > 0 ? round2(avg(radiacion)) : null,
    });
  }

  // Sort by fecha
  result.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return result;
}

const MESES_NOMBRES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// Aggregate readings for year-overlay charts (>365d): months on X, one series per year
export function agregarParaGraficoAnual(
  rows: LecturaClima[],
  desde: Date,
  hasta: Date
): SerieAnual {
  const filtered = rows.filter(r => {
    const t = new Date(r.timestamp);
    return t >= desde && t <= hasta;
  });

  if (filtered.length === 0) return { datos: [], años: [] };

  // Group by YYYY-MM
  const monthBuckets = new Map<string, LecturaClima[]>();
  for (const row of filtered) {
    const key = getBogotaMonthKey(row.timestamp);
    const bucket = monthBuckets.get(key) ?? [];
    bucket.push(row);
    monthBuckets.set(key, bucket);
  }

  // Compute monthly aggregates per (year, month)
  const añosSet = new Set<number>();
  const aggregated = new Map<string, { temp: number | null; lluvia: number | null; humedad: number | null; viento: number | null }>();

  for (const [yearMonth, lecturas] of monthBuckets) {
    const [yearStr, monthStr] = yearMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    añosSet.add(year);
    const key = `${year}-${month}`;

    const temps = nonNull(lecturas, 'temp_c');
    const humedad = nonNull(lecturas, 'humedad_pct');
    const viento = nonNull(lecturas, 'viento_kmh');

    // Rainfall: max per day, then sum
    const dailyMax = new Map<string, number>();
    for (const l of lecturas) {
      if (l.lluvia_diaria_mm == null) continue;
      const dayKey = getBogotaDateKey(l.timestamp);
      const cur = dailyMax.get(dayKey) ?? 0;
      dailyMax.set(dayKey, Math.max(cur, l.lluvia_diaria_mm));
    }
    const lluviaTotal = dailyMax.size > 0 ? round2([...dailyMax.values()].reduce((s, v) => s + v, 0)) : null;

    aggregated.set(key, {
      temp: temps.length > 0 ? round2(avg(temps)) : null,
      lluvia: lluviaTotal,
      humedad: humedad.length > 0 ? round2(avg(humedad)) : null,
      viento: viento.length > 0 ? round2(avg(viento)) : null,
    });
  }

  const años = [...añosSet].sort();

  // Build 12 rows (one per month), with dynamic columns per year
  const datos: DatoAnualOverlay[] = [];
  for (let m = 1; m <= 12; m++) {
    const row: DatoAnualOverlay = {
      mes: MESES_NOMBRES[m - 1],
      mesNum: m,
    };

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
