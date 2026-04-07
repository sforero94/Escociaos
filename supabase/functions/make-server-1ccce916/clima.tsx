import { Context } from 'https://deno.land/x/hono@v4.0.0/mod.ts';

// ============================================================================
// Ecowitt Cloud API Types
// ============================================================================

interface EcowittValueUnit {
  time: string;
  value: string;
  unit: string;
}

interface EcowittRainfall {
  rain_rate?: EcowittValueUnit;
  daily?: EcowittValueUnit;
  event?: EcowittValueUnit;
  '1_hour'?: EcowittValueUnit;
  '24_hours'?: EcowittValueUnit;
  weekly?: EcowittValueUnit;
  monthly?: EcowittValueUnit;
  yearly?: EcowittValueUnit;
  state?: EcowittValueUnit;
}

interface EcowittData {
  outdoor?: { temperature?: EcowittValueUnit; humidity?: EcowittValueUnit };
  wind?: { wind_speed?: EcowittValueUnit; wind_gust?: EcowittValueUnit; wind_direction?: EcowittValueUnit };
  rainfall?: EcowittRainfall;
  rainfall_piezo?: EcowittRainfall;
  solar_and_uvi?: { solar?: EcowittValueUnit; uvi?: EcowittValueUnit };
  pressure?: { absolute?: EcowittValueUnit; relative?: EcowittValueUnit };
}

interface EcowittResponse {
  code: number;
  msg: string;
  time: string;
  data: EcowittData;
}

// ============================================================================
// Ecowitt History API types (different structure from real-time)
// ============================================================================

interface EcowittHistoryField {
  unit: string;
  list: Record<string, string>;
}

interface EcowittHistoryData {
  outdoor?: { temperature?: EcowittHistoryField; humidity?: EcowittHistoryField };
  wind?: { wind_speed?: EcowittHistoryField; wind_gust?: EcowittHistoryField; wind_direction?: EcowittHistoryField };
  rainfall?: {
    rain_rate?: EcowittHistoryField;
    daily?: EcowittHistoryField;
    event?: EcowittHistoryField;
    yearly?: EcowittHistoryField;
  };
  rainfall_piezo?: {
    rain_rate?: EcowittHistoryField;
    daily?: EcowittHistoryField;
    event?: EcowittHistoryField;
    yearly?: EcowittHistoryField;
  };
  solar_and_uvi?: { solar?: EcowittHistoryField; uvi?: EcowittHistoryField };
  pressure?: { absolute?: EcowittHistoryField; relative?: EcowittHistoryField };
}

interface EcowittHistoryResponse {
  code: number;
  msg: string;
  time: string;
  data: EcowittHistoryData;
}

// ============================================================================
// Pure parsing functions (mirrors logic tested in climaSync.test.ts)
// ============================================================================

function safeFloat(v: string | undefined): number | null {
  if (v === undefined) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fToC(f: number): number {
  return round2((f - 32) * 5 / 9);
}

function mphToKmh(mph: number): number {
  return round2(mph * 1.60934);
}

function inToMm(inches: number): number {
  return round2(inches * 25.4);
}

// WS90 uses piezo rain gauge; fallback to traditional if piezo not present
function parseEcowittObservation(data: EcowittData, time: string, stationId: string) {
  const tempF = safeFloat(data.outdoor?.temperature?.value);
  const windMph = safeFloat(data.wind?.wind_speed?.value);
  const gustMph = safeFloat(data.wind?.wind_gust?.value);

  const rain = data.rainfall_piezo ?? data.rainfall;
  const rainRateIn = safeFloat(rain?.rain_rate?.value);
  const rainDailyIn = safeFloat(rain?.daily?.value);
  const rainEventIn = safeFloat(rain?.event?.value);

  return {
    timestamp: new Date(parseInt(time) * 1000).toISOString(),
    station_id: stationId,
    temp_c: tempF != null ? fToC(tempF) : null,
    humedad_pct: safeFloat(data.outdoor?.humidity?.value),
    viento_kmh: windMph != null ? mphToKmh(windMph) : null,
    rafaga_kmh: gustMph != null ? mphToKmh(gustMph) : null,
    viento_dir: safeFloat(data.wind?.wind_direction?.value),
    lluvia_tasa_mm_hr: rainRateIn != null ? inToMm(rainRateIn) : null,
    lluvia_evento_mm: rainEventIn != null ? inToMm(rainEventIn) : null,
    lluvia_diaria_mm: rainDailyIn != null ? inToMm(rainDailyIn) : null,
    radiacion_wm2: safeFloat(data.solar_and_uvi?.solar?.value),
    uv_index: (() => {
      const v = safeFloat(data.solar_and_uvi?.uvi?.value);
      return v != null ? Math.round(v) : null;
    })(),
  };
}

function getEcowittCredentials() {
  const appKey = Deno.env.get('ECOWITT_APP_KEY');
  const apiKey = Deno.env.get('ECOWITT_API_KEY');
  const mac = Deno.env.get('ECOWITT_MAC');
  if (!appKey || !apiKey || !mac) return null;
  return { appKey, apiKey, mac };
}

function getSupabaseConfig() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return null;
  return { supabaseUrl, serviceKey };
}

// ============================================================================
// Handler: Ecowitt real-time sync (called by pg_cron every 5 min)
// ============================================================================

export async function handleClimaSync(c: Context): Promise<Response> {
  const log = '[clima-sync]';

  try {
    const creds = getEcowittCredentials();
    if (!creds) {
      console.error(`${log} Missing ECOWITT_APP_KEY, ECOWITT_API_KEY, or ECOWITT_MAC`);
      return c.json({ error: 'Missing Ecowitt credentials' }, 500);
    }

    const sb = getSupabaseConfig();
    if (!sb) {
      console.error(`${log} Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`);
      return c.json({ error: 'Missing Supabase config' }, 500);
    }

    // 1. Fetch current observations from Ecowitt
    const url = new URL('https://api.ecowitt.net/api/v3/device/real_time');
    url.searchParams.set('application_key', creds.appKey);
    url.searchParams.set('api_key', creds.apiKey);
    url.searchParams.set('mac', creds.mac);
    url.searchParams.set('call_back', 'all');

    console.info(`${log} Fetching station ${creds.mac}`);
    const apiRes = await fetch(url.toString());

    if (!apiRes.ok) {
      const body = await apiRes.text().catch(() => '');
      console.error(`${log} Ecowitt API HTTP ${apiRes.status}: ${body}`);
      return c.json({ error: `Ecowitt API returned ${apiRes.status}`, details: body }, 502);
    }

    const ecowitt: EcowittResponse = await apiRes.json();

    if (ecowitt.code !== 0) {
      console.error(`${log} Ecowitt API error: ${ecowitt.msg} (code ${ecowitt.code})`);
      return c.json({ error: `Ecowitt API: ${ecowitt.msg}`, code: ecowitt.code }, 502);
    }

    if (!ecowitt.data || Object.keys(ecowitt.data).length === 0) {
      console.warn(`${log} Empty data from Ecowitt`);
      return c.json({ message: 'No data available', synced: 0 }, 200);
    }

    // 2. Parse observation
    const reading = parseEcowittObservation(ecowitt.data, ecowitt.time, creds.mac);

    // 3. Insert via PostgREST with deduplication
    const insertRes = await fetch(`${sb.supabaseUrl}/rest/v1/clima_lecturas`, {
      method: 'POST',
      headers: {
        apikey: sb.serviceKey,
        Authorization: `Bearer ${sb.serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal,resolution=ignore-duplicates',
      },
      body: JSON.stringify(reading),
    });

    if (!insertRes.ok) {
      const errorText = await insertRes.text();
      console.error(`${log} Supabase insert failed (${insertRes.status}): ${errorText}`);
      return c.json({ error: 'Insert failed', details: errorText }, 500);
    }

    console.info(`${log} Synced: station=${reading.station_id} ts=${reading.timestamp} temp=${reading.temp_c}C hum=${reading.humedad_pct}%`);

    return c.json({ message: 'Synced from Ecowitt', synced: 1, reading }, 200);
  } catch (error) {
    console.error(`${log} Unhandled error:`, error);
    return c.json({ error: String(error) }, 500);
  }
}

// ============================================================================
// Handler: Backfill historical data from Ecowitt (admin-triggered)
// POST /clima/backfill?from=YYYYMMDD&to=YYYYMMDD
// ============================================================================

function formatDateParam(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function formatEcowittDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateParam(s: string): Date | null {
  if (!/^\d{8}$/.test(s)) return null;
  const y = parseInt(s.slice(0, 4));
  const m = parseInt(s.slice(4, 6)) - 1;
  const d = parseInt(s.slice(6, 8));
  const date = new Date(y, m, d);
  if (isNaN(date.getTime())) return null;
  return date;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Parse Ecowitt history response into individual readings.
// History returns {field: {unit, list: {timestamp: value}}} — need to pivot
// timestamps across all fields into per-timestamp readings.
function parseEcowittHistory(histData: EcowittHistoryData, stationId: string) {
  const rain = histData.rainfall_piezo ?? histData.rainfall;

  // Collect all unique timestamps across all fields
  const allTimestamps = new Set<string>();
  const fields = [
    histData.outdoor?.temperature?.list,
    histData.outdoor?.humidity?.list,
    histData.wind?.wind_speed?.list,
    histData.wind?.wind_gust?.list,
    histData.wind?.wind_direction?.list,
    rain?.rain_rate?.list,
    rain?.daily?.list,
    rain?.event?.list,
    histData.solar_and_uvi?.solar?.list,
    histData.solar_and_uvi?.uvi?.list,
  ];
  for (const list of fields) {
    if (list) Object.keys(list).forEach(ts => allTimestamps.add(ts));
  }

  const tempList = histData.outdoor?.temperature?.list ?? {};
  const humList = histData.outdoor?.humidity?.list ?? {};
  const windList = histData.wind?.wind_speed?.list ?? {};
  const gustList = histData.wind?.wind_gust?.list ?? {};
  const dirList = histData.wind?.wind_direction?.list ?? {};
  const rainRateList = rain?.rain_rate?.list ?? {};
  const rainDailyList = rain?.daily?.list ?? {};
  const rainEventList = rain?.event?.list ?? {};
  const solarList = histData.solar_and_uvi?.solar?.list ?? {};
  const uviList = histData.solar_and_uvi?.uvi?.list ?? {};

  const readings = Array.from(allTimestamps)
    .sort()
    .map(ts => {
      const tempF = safeFloat(tempList[ts]);
      const windMph = safeFloat(windList[ts]);
      const gustMph = safeFloat(gustList[ts]);
      const rainRateIn = safeFloat(rainRateList[ts]);
      const rainDailyIn = safeFloat(rainDailyList[ts]);
      const rainEventIn = safeFloat(rainEventList[ts]);
      const uvVal = safeFloat(uviList[ts]);

      return {
        timestamp: new Date(parseInt(ts) * 1000).toISOString(),
        station_id: stationId,
        temp_c: tempF != null ? fToC(tempF) : null,
        humedad_pct: safeFloat(humList[ts]),
        viento_kmh: windMph != null ? mphToKmh(windMph) : null,
        rafaga_kmh: gustMph != null ? mphToKmh(gustMph) : null,
        viento_dir: safeFloat(dirList[ts]),
        lluvia_tasa_mm_hr: rainRateIn != null ? inToMm(rainRateIn) : null,
        lluvia_evento_mm: rainEventIn != null ? inToMm(rainEventIn) : null,
        lluvia_diaria_mm: rainDailyIn != null ? inToMm(rainDailyIn) : null,
        radiacion_wm2: safeFloat(solarList[ts]),
        uv_index: uvVal != null ? Math.round(uvVal) : null,
      };
    });

  return readings;
}

// Aggregate an array of parsed 5-min readings into a single daily summary row
// for clima_resumen_diario. Readings must already be unit-converted (°C, km/h, mm).
function aggregateReadingsToDaily(
  readings: ReturnType<typeof parseEcowittHistory>,
  fecha: string,
  stationId: string
) {
  const nonNull = (vals: (number | null)[]): number[] =>
    vals.filter((v): v is number => v !== null);

  const temps = nonNull(readings.map(r => r.temp_c));
  const humidity = nonNull(readings.map(r => r.humedad_pct));
  const wind = nonNull(readings.map(r => r.viento_kmh));
  const gust = nonNull(readings.map(r => r.rafaga_kmh));
  const windDir = nonNull(readings.map(r => r.viento_dir));
  const rain = nonNull(readings.map(r => r.lluvia_diaria_mm));
  const solar = nonNull(readings.map(r => r.radiacion_wm2));
  const uv = nonNull(readings.map(r => r.uv_index));

  const avg = (arr: number[]) => arr.length > 0 ? round2(arr.reduce((s, v) => s + v, 0) / arr.length) : null;
  const min = (arr: number[]) => arr.length > 0 ? round2(Math.min(...arr)) : null;
  const max = (arr: number[]) => arr.length > 0 ? round2(Math.max(...arr)) : null;

  // Circular mean for wind direction
  let windDirMean: number | null = null;
  if (windDir.length > 0) {
    const sinSum = windDir.reduce((s, d) => s + Math.sin(d * Math.PI / 180), 0);
    const cosSum = windDir.reduce((s, d) => s + Math.cos(d * Math.PI / 180), 0);
    windDirMean = round2(((Math.atan2(sinSum / windDir.length, cosSum / windDir.length) * 180 / Math.PI) % 360 + 360) % 360);
  }

  return {
    fecha,
    station_id: stationId,
    temp_c_min: min(temps),
    temp_c_max: max(temps),
    temp_c_avg: avg(temps),
    humedad_pct_min: min(humidity),
    humedad_pct_max: max(humidity),
    humedad_pct_avg: avg(humidity),
    lluvia_total_mm: max(rain), // Ecowitt daily accumulator — max = day total
    viento_kmh_avg: avg(wind),
    rafaga_kmh_max: max(gust),
    viento_dir_predominante: windDirMean,
    radiacion_wm2_avg: avg(solar),
    radiacion_wm2_max: max(solar),
    uv_index_max: uv.length > 0 ? Math.max(...uv) : null,
    lecturas_count: readings.length,
  };
}

export async function handleClimaBackfill(c: Context): Promise<Response> {
  const log = '[clima-backfill]';

  try {
    const creds = getEcowittCredentials();
    if (!creds) {
      return c.json({ error: 'Missing Ecowitt credentials' }, 500);
    }

    const sb = getSupabaseConfig();
    if (!sb) {
      return c.json({ error: 'Missing Supabase config' }, 500);
    }

    // Parse date range from query params
    const fromParam = c.req.query('from');
    const toParam = c.req.query('to');

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const fromDate = fromParam ? parseDateParam(fromParam) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const toDate = toParam ? parseDateParam(toParam) : yesterday;

    if (!fromDate || !toDate) {
      return c.json({ error: 'Invalid date format. Use YYYYMMDD.' }, 400);
    }

    if (fromDate > toDate) {
      return c.json({ error: 'from date must be before to date' }, 400);
    }

    console.info(`${log} Backfilling ${formatDateParam(fromDate)} → ${formatDateParam(toDate)} for station ${creds.mac}`);

    let totalSynced = 0;
    let totalDays = 0;
    const errors: string[] = [];

    // Iterate day by day
    const current = new Date(fromDate);
    while (current <= toDate) {
      const dateStr = formatDateParam(current);
      const ecowittDateStr = formatEcowittDate(current);
      totalDays++;

      try {
        // Fetch history for this day from Ecowitt
        const url = new URL('https://api.ecowitt.net/api/v3/device/history');
        url.searchParams.set('application_key', creds.appKey);
        url.searchParams.set('api_key', creds.apiKey);
        url.searchParams.set('mac', creds.mac);
        url.searchParams.set('start_date', `${ecowittDateStr} 00:00:00`);
        url.searchParams.set('end_date', `${ecowittDateStr} 23:59:59`);
        url.searchParams.set('call_back', 'outdoor.temperature,outdoor.humidity,wind,rainfall_piezo,solar_and_uvi');
        url.searchParams.set('cycle_type', 'auto');

        const apiRes = await fetch(url.toString());

        if (!apiRes.ok) {
          const body = await apiRes.text().catch(() => '');
          errors.push(`${dateStr}: Ecowitt API HTTP ${apiRes.status}`);
          console.warn(`${log} ${dateStr}: Ecowitt API ${apiRes.status} — ${body}`);
          current.setDate(current.getDate() + 1);
          await sleep(100);
          continue;
        }

        const response: EcowittHistoryResponse = await apiRes.json();

        if (response.code !== 0) {
          errors.push(`${dateStr}: ${response.msg}`);
          console.warn(`${log} ${dateStr}: Ecowitt error — ${response.msg}`);
          current.setDate(current.getDate() + 1);
          await sleep(100);
          continue;
        }

        if (!response.data || Object.keys(response.data).length === 0) {
          console.info(`${log} ${dateStr}: no data`);
          current.setDate(current.getDate() + 1);
          await sleep(100);
          continue;
        }

        // Parse historical data into readings
        const readings = parseEcowittHistory(response.data as EcowittHistoryData, creds.mac);

        if (readings.length === 0) {
          console.info(`${log} ${dateStr}: no readings`);
          current.setDate(current.getDate() + 1);
          await sleep(100);
          continue;
        }

        // Aggregate into daily summary and upsert into clima_resumen_diario
        const dailySummary = aggregateReadingsToDaily(readings, ecowittDateStr, creds.mac);

        const insertRes = await fetch(`${sb.supabaseUrl}/rest/v1/clima_resumen_diario?on_conflict=fecha,station_id`, {
          method: 'POST',
          headers: {
            apikey: sb.serviceKey,
            Authorization: `Bearer ${sb.serviceKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal,resolution=merge-duplicates',
          },
          body: JSON.stringify(dailySummary),
        });

        if (!insertRes.ok) {
          const errorText = await insertRes.text();
          errors.push(`${dateStr}: insert failed — ${errorText}`);
          console.error(`${log} ${dateStr}: insert failed — ${errorText}`);
        } else {
          totalSynced += 1;
          console.info(`${log} ${dateStr}: daily summary inserted (${readings.length} readings aggregated)`);
        }
      } catch (err) {
        errors.push(`${dateStr}: ${String(err)}`);
        console.error(`${log} ${dateStr}: ${err}`);
      }

      current.setDate(current.getDate() + 1);
      await sleep(100);
    }

    console.info(`${log} Done: ${totalSynced} readings across ${totalDays} days, ${errors.length} errors`);

    return c.json({
      message: 'Backfill complete',
      synced: totalSynced,
      days: totalDays,
      errors: errors.length > 0 ? errors : undefined,
    }, 200);
  } catch (error) {
    console.error(`${log} Unhandled error:`, error);
    return c.json({ error: String(error) }, 500);
  }
}
