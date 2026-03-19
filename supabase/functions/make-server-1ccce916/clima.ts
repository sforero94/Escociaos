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

function parseWUObservation(obs: WUObservation, stationId: string) {
  return {
    timestamp: new Date(obs.obsTimeUtc).toISOString(),
    station_id: stationId,
    temp_c: obs.metric.temp ?? null,
    humedad_pct: obs.humidity ?? null,
    viento_kmh: obs.metric.windSpeed ?? null,
    rafaga_kmh: obs.metric.windGust ?? null,
    viento_dir: obs.winddir ?? null,
    lluvia_tasa_mm_hr: obs.metric.precipRate ?? null,
    lluvia_evento_mm: null,
    lluvia_diaria_mm: obs.metric.precipTotal ?? null,
    radiacion_wm2: obs.solarRadiation ?? null,
    uv_index: obs.uv != null ? Math.round(obs.uv) : null,
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
