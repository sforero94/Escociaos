import { Context } from 'https://deno.land/x/hono@v4.0.0/mod.ts';

// ============================================================================
// Weather Underground PWS API Types
// ============================================================================

interface WUMetric {
  temp: number;
  windSpeed: number;
  windGust: number;
  precipRate: number;
  precipTotal: number;
  pressure: number;
  dewpt: number;
}

interface WUObservation {
  stationID: string;
  obsTimeUtc: string;
  obsTimeLocal: string;
  humidity: number;
  winddir: number;
  solarRadiation: number | null;
  uv: number | null;
  metric: WUMetric;
}

interface WUResponse {
  observations?: WUObservation[];
}

// ============================================================================
// Pure parsing function (mirrors logic tested in climaSync.test.ts)
// ============================================================================

// Handles both current observations AND historical hourly responses:
// Current: metric.temp, humidity, windSpeed, winddir, solarRadiation, uv
// History: metric.tempAvg, humidityAvg, windspeedAvg, winddirAvg, solarRadiationHigh, uvHigh
function parseWUObservation(obs: any, stationId: string) {
  const m = obs.metric ?? {};
  return {
    timestamp: new Date(obs.obsTimeUtc).toISOString(),
    station_id: stationId,
    temp_c: m.temp ?? m.tempAvg ?? null,
    humedad_pct: obs.humidity ?? obs.humidityAvg ?? null,
    viento_kmh: m.windSpeed ?? m.windspeedAvg ?? null,
    rafaga_kmh: m.windGust ?? m.windgustHigh ?? null,
    viento_dir: obs.winddir ?? obs.winddirAvg ?? null,
    lluvia_tasa_mm_hr: m.precipRate ?? null,
    lluvia_evento_mm: null,
    lluvia_diaria_mm: m.precipTotal ?? null,
    radiacion_wm2: obs.solarRadiation ?? obs.solarRadiationHigh ?? null,
    uv_index: (() => {
      const v = obs.uv ?? obs.uvHigh ?? null;
      return v != null ? Math.round(v) : null;
    })(),
  };
}

// ============================================================================
// Handler: Weather Underground API Pull (called by pg_cron every 5 min)
// ============================================================================

export async function handleClimaSync(c: Context): Promise<Response> {
  const log = '[clima-sync]';

  try {
    const WU_API_KEY = Deno.env.get('WU_API_KEY');
    if (!WU_API_KEY) {
      console.error(`${log} WU_API_KEY not configured`);
      return c.json({ error: 'Missing WU_API_KEY secret' }, 500);
    }

    const stationId = Deno.env.get('WU_STATION_ID') || 'ISANFR102';

    // 1. Fetch current observations (metric units)
    const wuUrl = new URL('https://api.weather.com/v2/pws/observations/current');
    wuUrl.searchParams.set('stationId', stationId);
    wuUrl.searchParams.set('format', 'json');
    wuUrl.searchParams.set('units', 'm');
    wuUrl.searchParams.set('apiKey', WU_API_KEY);

    console.info(`${log} Fetching station ${stationId}`);
    const wuRes = await fetch(wuUrl.toString());

    if (!wuRes.ok) {
      const body = await wuRes.text().catch(() => '');
      console.error(`${log} WU API ${wuRes.status}: ${body}`);
      return c.json({ error: `WU API returned ${wuRes.status}`, details: body }, 502);
    }

    const wuData: WUResponse = await wuRes.json();
    const obs = wuData.observations?.[0];

    if (!obs) {
      console.warn(`${log} Empty observations from WU`);
      return c.json({ message: 'No observations available', synced: 0 }, 200);
    }

    // 2. Parse observation
    const reading = parseWUObservation(obs, stationId);

    // 3. Insert via PostgREST with deduplication
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceKey) {
      console.error(`${log} Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`);
      return c.json({ error: 'Missing Supabase config' }, 500);
    }

    const insertRes = await fetch(`${supabaseUrl}/rest/v1/clima_lecturas`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
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

    return c.json({ message: 'Synced from Weather Underground', synced: 1, reading }, 200);
  } catch (error) {
    console.error(`${log} Unhandled error:`, error);
    return c.json({ error: String(error) }, 500);
  }
}

// ============================================================================
// Handler: Backfill historical data from WU (admin-triggered)
// POST /clima/backfill?from=YYYYMMDD&to=YYYYMMDD
// ============================================================================

function formatDateParam(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
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

export async function handleClimaBackfill(c: Context): Promise<Response> {
  const log = '[clima-backfill]';

  try {
    const WU_API_KEY = Deno.env.get('WU_API_KEY');
    if (!WU_API_KEY) {
      return c.json({ error: 'Missing WU_API_KEY secret' }, 500);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      return c.json({ error: 'Missing Supabase config' }, 500);
    }

    const stationId = Deno.env.get('WU_STATION_ID') || 'ISANFR102';

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

    console.info(`${log} Backfilling ${formatDateParam(fromDate)} → ${formatDateParam(toDate)} for station ${stationId}`);

    let totalSynced = 0;
    let totalDays = 0;
    const errors: string[] = [];

    // Iterate day by day
    const current = new Date(fromDate);
    while (current <= toDate) {
      const dateStr = formatDateParam(current);
      totalDays++;

      try {
        // Fetch hourly history for this day
        const wuUrl = new URL('https://api.weather.com/v2/pws/history/hourly');
        wuUrl.searchParams.set('stationId', stationId);
        wuUrl.searchParams.set('format', 'json');
        wuUrl.searchParams.set('units', 'm');
        wuUrl.searchParams.set('date', dateStr);
        wuUrl.searchParams.set('apiKey', WU_API_KEY);

        const wuRes = await fetch(wuUrl.toString());

        if (!wuRes.ok) {
          const body = await wuRes.text().catch(() => '');
          errors.push(`${dateStr}: WU API ${wuRes.status}`);
          console.warn(`${log} ${dateStr}: WU API ${wuRes.status} — ${body}`);
          current.setDate(current.getDate() + 1);
          await sleep(100);
          continue;
        }

        const responseText = await wuRes.text();
        let wuData: WUResponse;
        try {
          wuData = JSON.parse(responseText);
        } catch {
          console.warn(`${log} ${dateStr}: empty or invalid JSON response`);
          current.setDate(current.getDate() + 1);
          await sleep(100);
          continue;
        }

        const observations = wuData.observations ?? [];

        if (observations.length === 0) {
          console.info(`${log} ${dateStr}: no observations`);
          current.setDate(current.getDate() + 1);
          await sleep(100);
          continue;
        }

        // Parse all observations
        const readings = observations.map(obs => parseWUObservation(obs, stationId));

        // Batch upsert: update existing rows with corrected data
        const insertRes = await fetch(`${supabaseUrl}/rest/v1/clima_lecturas?on_conflict=station_id,timestamp`, {
          method: 'POST',
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal,resolution=merge-duplicates',
          },
          body: JSON.stringify(readings),
        });

        if (!insertRes.ok) {
          const errorText = await insertRes.text();
          errors.push(`${dateStr}: insert failed — ${errorText}`);
          console.error(`${log} ${dateStr}: insert failed — ${errorText}`);
        } else {
          totalSynced += readings.length;
          console.info(`${log} ${dateStr}: ${readings.length} readings inserted`);
        }
      } catch (err) {
        errors.push(`${dateStr}: ${String(err)}`);
        console.error(`${log} ${dateStr}: ${err}`);
      }

      current.setDate(current.getDate() + 1);
      await sleep(100); // Rate limit protection
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
