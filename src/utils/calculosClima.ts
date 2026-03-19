import type { LecturaClima, ResumenClima, LecturaClimaAgregada } from '@/types/clima';

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

// Aggregate readings for charts — auto-selects hourly (≤7d) or daily (>7d) granularity
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
  const useHourly = rangoDias <= 7;

  // Group by bucket key
  const buckets = new Map<string, LecturaClima[]>();
  for (const row of filtered) {
    const key = useHourly
      ? getBogotaHourKey(row.timestamp)
      : getBogotaDateKey(row.timestamp);
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

  // Sort by fecha
  result.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return result;
}
