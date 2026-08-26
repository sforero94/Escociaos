import { Context } from 'https://deno.land/x/hono@v4.0.0/mod.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { parseOpenWeatherForecast } from './external-tools.ts';

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

// Ecowitt reports a per-field "last updated" epoch alongside every value
// (EcowittValueUnit.time). For the daily rain accumulator this is the only
// signal that tells us whether the counter actually reset at midnight or is
// serving a stale/cached total — see migration 068.
function epochSecondsToIso(s: string | undefined): string | null {
  if (!s) return null;
  const n = parseInt(s, 10);
  return isNaN(n) ? null : new Date(n * 1000).toISOString();
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
    lluvia_diaria_actualizada_en: epochSecondsToIso(rain?.daily?.time),
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
// Auth de los dos endpoints de ESCRITURA de clima (`/clima/sync` y
// `/clima/backfill`) -- DOBLE PUERTA, calcada de `acciones-tick.ts`:
//
//   (a) secreto compartido `x-clima-sync-secret` -- el llamador normal de
//       `/clima/sync` es el pg_cron `clima-sync-wu` (migración 030, cada 5
//       minutos), no una sesión humana. El secreto se resuelve en tiempo de
//       disparo desde Supabase Vault (migración 105) y se compara contra
//       `Deno.env.get('CLIMA_SYNC_SECRET')`. Si el secreto NO está
//       configurado en este entorno y tampoco llega un JWT, el endpoint
//       responde 503 y NO HACE NADA -- nunca corre "abierto", mismo criterio
//       que `HATO_ALERTAS_TICK_SECRET` y `ACCIONES_TICK_SECRET`.
//
//   (b) JWT + rol Gerencia -- disparo manual (sobre todo `/clima/backfill`,
//       que no tiene cron y se corre a mano cuando hay que rellenar
//       historia). Gerencia y no {Administrador, Gerencia} a propósito:
//       `clima_lecturas`/`clima_resumen_diario` NO tienen ninguna política
//       RLS de escritura -- sólo el service role las escribe -- así que no
//       hay un rol de navegador que "ya podía" escribirlas; es una acción de
//       mantenimiento. Mismo criterio que el disparo manual de
//       `acciones-tick.ts`.
//
// Antes de esta puerta ambas rutas corrían con el service role y sin leer
// ningún encabezado: cualquiera en internet que supiera la URL podía agotar
// la cuota de Ecowitt con `/clima/backfill` (y con eso tumbar el cron de 5
// minutos). La edge function corre con verify_jwt=false y no se puede
// activar, porque el webhook de Telegram y los pg_cron dependen de que siga
// en false.
// ============================================================================

const ROLES_DISPARO_MANUAL = new Set(['Gerencia']);

async function verificarAccesoClima(c: Context): Promise<{ disparo: 'cron' | 'manual' } | Response> {
  const secretoConfigurado = Deno.env.get('CLIMA_SYNC_SECRET');
  const secretoRecibido = c.req.header('x-clima-sync-secret');
  if (secretoConfigurado && secretoRecibido && secretoRecibido === secretoConfigurado) {
    return { disparo: 'cron' };
  }

  // No coincidió el secreto (o no vino) -- se intenta la segunda puerta,
  // JWT + Gerencia, antes de rechazar.
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const sb = getSupabaseConfig();
    if (!sb) {
      return c.json({ error: 'Missing Supabase config' }, 500);
    }
    const supabase = createClient(sb.supabaseUrl, sb.serviceKey);
    const token = authHeader.slice(7);

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return c.json({ error: 'Token inválido o expirado.' }, 401);
    }

    const { data: usuario, error: usuarioError } = await supabase
      .from('usuarios')
      .select('rol')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (usuarioError) {
      return c.json({ error: `No se pudo verificar el rol del usuario: ${usuarioError.message}` }, 500);
    }
    if (!usuario || !ROLES_DISPARO_MANUAL.has(usuario.rol as string)) {
      return c.json({ error: 'El disparo manual de clima está restringido a Gerencia.' }, 403);
    }
    return { disparo: 'manual' };
  }

  if (!secretoConfigurado) {
    return c.json({
      error: 'CLIMA_SYNC_SECRET no está configurado en este entorno -- los endpoints de escritura de clima quedan deshabilitados hasta que se configure el secreto (ver migración 105), y no llegó ningún JWT de Gerencia como alternativa.',
    }, 503);
  }

  return c.json({ error: 'No autorizado -- falta el encabezado x-clima-sync-secret o un JWT de Gerencia.' }, 401);
}

// ============================================================================
// Handler: Ecowitt real-time sync (called by pg_cron every 5 min)
// ============================================================================

export async function handleClimaSync(c: Context): Promise<Response> {
  const log = '[clima-sync]';

  const acceso = await verificarAccesoClima(c);
  if (acceso instanceof Response) return acceso;

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

/** Tope de días por llamada a `/clima/backfill` -- ver el comentario en el
 *  handler. Constante nombrada, no un número mágico en la validación. */
const MAX_DIAS_BACKFILL = 90;

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

// ============================================================================
// Backfill de UN día: pide la History API de Ecowitt para ese día, inserta
// las lecturas crudas en clima_lecturas (mismo camino que el sync de 5 min,
// `handleClimaSync`) y deja que `fn_clima_rollup_diario` (068/103/115) sea
// la ÚNICA lógica que decide `lluvia_confianza` -- nunca se reimplementa esa
// clasificación acá.
//
// Antes esta función agregaba en TypeScript (`aggregateReadingsToDaily`,
// eliminada) y escribía `clima_resumen_diario` directo con un simple
// `max(lluvia_diaria_mm)`, sin aplicar ninguno de los tres chequeos de
// confianza -- un backfill podía escribir 'ok' sobre un día con el contador
// de lluvia congelado o capturado a medias, exactamente lo que esas
// migraciones existen para impedir. Insertar en `clima_lecturas` y llamar
// al mismo RPC que corre el cron nocturno hace que backfill manual,
// reintento automático (migración 121) y rollup nocturno concuerden
// siempre, por construcción -- no por disciplina de mantener dos copias de
// la lógica sincronizadas.
//
// Usado por `handleClimaBackfill` (disparo manual) y
// `handleClimaReintentoSinDato` (cron diario, migración 121).
// ============================================================================

interface ResultadoBackfillDia {
  ok: boolean;
  lecturas: number;
  error?: string;
}

async function backfillUnDia(
  fecha: Date,
  creds: { appKey: string; apiKey: string; mac: string },
  sb: { supabaseUrl: string; serviceKey: string },
  log: string,
): Promise<ResultadoBackfillDia> {
  const ecowittDateStr = formatEcowittDate(fecha);

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
    return { ok: false, lecturas: 0, error: `Ecowitt API HTTP ${apiRes.status} — ${body}` };
  }

  const response: EcowittHistoryResponse = await apiRes.json();
  if (response.code !== 0) {
    return { ok: false, lecturas: 0, error: `Ecowitt: ${response.msg}` };
  }
  if (!response.data || Object.keys(response.data).length === 0) {
    return { ok: false, lecturas: 0, error: 'sin datos de Ecowitt para ese día' };
  }

  const readings = parseEcowittHistory(response.data as EcowittHistoryData, creds.mac);
  if (readings.length === 0) {
    return { ok: false, lecturas: 0, error: '0 lecturas parseadas' };
  }

  // Lecturas crudas -> clima_lecturas. `ignore-duplicates` sobre el
  // UNIQUE(station_id, timestamp) de la migración 029 hace que reintentar
  // un día ya cargado sea idempotente en vez de fallar.
  const insertRes = await fetch(`${sb.supabaseUrl}/rest/v1/clima_lecturas`, {
    method: 'POST',
    headers: {
      apikey: sb.serviceKey,
      Authorization: `Bearer ${sb.serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal,resolution=ignore-duplicates',
    },
    body: JSON.stringify(readings),
  });
  if (!insertRes.ok) {
    const errorText = await insertRes.text();
    return { ok: false, lecturas: 0, error: `insert clima_lecturas falló — ${errorText}` };
  }

  // fn_clima_rollup_diario agrega, clasifica lluvia_confianza y escribe
  // clima_resumen_diario -- y al final poda clima_lecturas > 24h, así que
  // las lecturas históricas recién insertadas no se quedan pisando la
  // ventana rodante del sync en vivo.
  const rpcRes = await fetch(`${sb.supabaseUrl}/rest/v1/rpc/fn_clima_rollup_diario`, {
    method: 'POST',
    headers: {
      apikey: sb.serviceKey,
      Authorization: `Bearer ${sb.serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_fecha: ecowittDateStr }),
  });
  if (!rpcRes.ok) {
    const errorText = await rpcRes.text();
    return { ok: false, lecturas: readings.length, error: `fn_clima_rollup_diario falló — ${errorText}` };
  }

  console.info(`${log} ${ecowittDateStr}: ${readings.length} lecturas reagregadas`);
  return { ok: true, lecturas: readings.length };
}

export async function handleClimaBackfill(c: Context): Promise<Response> {
  const log = '[clima-backfill]';

  const acceso = await verificarAccesoClima(c);
  if (acceso instanceof Response) return acceso;

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

    // Tope de rango: `parseDateParam` sólo valida el FORMATO, así que un
    // `from=19700101` pedía ~20.000 días a Ecowitt (una llamada HTTP por
    // día) y agotaba la cuota de la estación, con lo que el cron de 5
    // minutos se queda sin datos. El tope es una cota de daño, no una regla
    // de negocio: 90 días cubre de sobra el uso real (el default son 30).
    const diasSolicitados = Math.floor((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (diasSolicitados > MAX_DIAS_BACKFILL) {
      return c.json({
        error: `Rango demasiado amplio: ${diasSolicitados} días. El máximo por llamada es ${MAX_DIAS_BACKFILL} (una llamada a Ecowitt por día). Corre el backfill por tramos.`,
      }, 400);
    }

    console.info(`${log} Backfilling ${formatDateParam(fromDate)} → ${formatDateParam(toDate)} for station ${creds.mac}`);

    let totalSynced = 0;
    let totalDays = 0;
    const errors: string[] = [];

    // Iterate day by day -- backfillUnDia hace la pregunta a Ecowitt y deja
    // que fn_clima_rollup_diario clasifique lluvia_confianza (ver el
    // comentario de esa función).
    const current = new Date(fromDate);
    while (current <= toDate) {
      const dateStr = formatDateParam(current);

      try {
        const resultado = await backfillUnDia(current, creds, sb, log);
        totalDays++;
        if (resultado.ok) {
          totalSynced += 1;
        } else {
          errors.push(`${dateStr}: ${resultado.error}`);
          console.warn(`${log} ${dateStr}: ${resultado.error}`);
        }
      } catch (err) {
        totalDays++;
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

// ============================================================================
// Handler: reintento diario de días sin dato confiable (migración 121)
// POST /clima/reintentar-sin-dato -- disparado por el pg_cron
// 'clima-reintento-sin-dato' a las 06:00 Bogotá.
//
// Pedido del dueño: "no quiero que registre null ni invente el 0. Quiero
// que haga backfill del día una vez la estación recupere conexión y se
// pueda consultar el dato real que sí existe en Ecowitt." El rollup
// nocturno ya hace la mitad correcta -- nunca fabrica un cero -- pero nada
// volvía a mirar un día ya sellado `sin_dato`. Esto es esa segunda mitad:
// revisa los últimos DIAS_REINTENTO_SIN_DATO días y le vuelve a preguntar a
// Ecowitt sólo por los que todavía no tienen un dato confiable. Si la
// estación ya se reconectó y Ecowitt tiene el día completo en su nube
// (buffer local que sube al volver la luz/el internet), el día pasa a
// 'ok' con el número real. Si Ecowitt TODAVÍA no lo tiene, el día queda
// exactamente como estaba -- nunca se inventa un valor para forzar que
// "avance".
//
// Importante sobre `contador_congelado`: a diferencia de `cobertura_parcial`
// (un hueco de captura, justo lo que este reintento puede recuperar),
// `contador_congelado` es un bug del firmware del sensor -- el contador
// acumulado de Ecowitt no se reinició, y eso ya quedó grabado así del lado
// de Ecowitt, con estación conectada y las 288 lecturas del día presentes.
// Reintentarlo es inofensivo (misma pregunta, misma respuesta previsible) y
// se incluye por si el sensor se corrige o el valor cambia, pero no hay
// garantía de que se resuelva -- es un problema de HARDWARE, no de
// conexión.
// ============================================================================

/** Ventana hacia atrás que cada corrida revisa. 21 días cubre de sobra
 *  cualquier corte de luz/internet razonable sin recorrer toda la historia
 *  en cada disparo diario. */
const DIAS_REINTENTO_SIN_DATO = 21;

/** `lluvia_confianza` que vale la pena reintentar -- las dos que guardan
 *  NULL por falta de dato (068/103). `sin_time_piezo` se deja afuera a
 *  propósito: ese día ya tiene un número en el que se confía, no está en
 *  NULL, reintentarlo no lo mejora. */
const CONFIANZAS_A_REINTENTAR = new Set(['contador_congelado', 'cobertura_parcial']);

export async function handleClimaReintentoSinDato(c: Context): Promise<Response> {
  const log = '[clima-reintento-sin-dato]';

  const acceso = await verificarAccesoClima(c);
  if (acceso instanceof Response) return acceso;

  try {
    const creds = getEcowittCredentials();
    if (!creds) return c.json({ error: 'Missing Ecowitt credentials' }, 500);
    const sb = getSupabaseConfig();
    if (!sb) return c.json({ error: 'Missing Supabase config' }, 500);

    const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const desde = new Date(ayer.getTime() - (DIAS_REINTENTO_SIN_DATO - 1) * 24 * 60 * 60 * 1000);
    const desdeStr = formatEcowittDate(desde);
    const ayerStr = formatEcowittDate(ayer);

    // Se pregunta a la base qué días están sin dato en vez de reintentar la
    // ventana completa a ciegas -- un día ya 'ok' no necesita otra llamada
    // a Ecowitt.
    const queryUrl = `${sb.supabaseUrl}/rest/v1/clima_resumen_diario`
      + `?station_id=eq.${encodeURIComponent(creds.mac)}`
      + `&fecha=gte.${desdeStr}&fecha=lte.${ayerStr}`
      + `&select=fecha,lluvia_confianza`;
    const queryRes = await fetch(queryUrl, {
      headers: { apikey: sb.serviceKey, Authorization: `Bearer ${sb.serviceKey}` },
    });
    if (!queryRes.ok) {
      const body = await queryRes.text().catch(() => '');
      console.error(`${log} No se pudo leer clima_resumen_diario (${queryRes.status}): ${body}`);
      return c.json({ error: 'No se pudo leer clima_resumen_diario', details: body }, 502);
    }
    const filas: { fecha: string; lluvia_confianza: string }[] = await queryRes.json();
    const confianzaPorFecha = new Map(filas.map((f) => [f.fecha, f.lluvia_confianza]));

    const candidatos: Date[] = [];
    for (let i = 0; i < DIAS_REINTENTO_SIN_DATO; i++) {
      const d = new Date(ayer.getTime() - i * 24 * 60 * 60 * 1000);
      const fechaStr = formatEcowittDate(d);
      const confianza = confianzaPorFecha.get(fechaStr);
      // Sin fila en absoluto ("sin_registro" del lado del frontend) o con
      // una confianza que hoy vale NULL -- las dos son candidatas.
      if (confianza === undefined || CONFIANZAS_A_REINTENTAR.has(confianza)) {
        candidatos.push(d);
      }
    }

    if (candidatos.length === 0) {
      console.info(`${log} nada que reintentar en los últimos ${DIAS_REINTENTO_SIN_DATO} días`);
      return c.json({ message: 'Nada que reintentar', candidatos: 0 }, 200);
    }

    console.info(`${log} ${candidatos.length} día(s) candidato(s): ${candidatos.map(formatEcowittDate).join(', ')}`);

    const resultados: { fecha: string; consultaOk: boolean; error?: string }[] = [];
    for (const dia of candidatos) {
      const r = await backfillUnDia(dia, creds, sb, log);
      resultados.push({ fecha: formatEcowittDate(dia), consultaOk: r.ok, error: r.ok ? undefined : r.error });
      await sleep(150);
    }

    // Se vuelve a preguntar a la base cuántos candidatos quedaron 'ok'
    // DESPUÉS del reintento -- "la consulta a Ecowitt no dio error" no es
    // lo mismo que "el día se resolvió"; puede seguir incompleto del lado
    // de Ecowitt. Si esta verificación en sí falla, se dice explícitamente
    // (`resueltos: null`) en vez de reportar 0 como si nada se hubiera
    // arreglado.
    let resueltos: number | null = null;
    const verifQueryUrl = `${sb.supabaseUrl}/rest/v1/clima_resumen_diario`
      + `?station_id=eq.${encodeURIComponent(creds.mac)}`
      + `&fecha=gte.${desdeStr}&fecha=lte.${ayerStr}`
      + `&lluvia_confianza=eq.ok`
      + `&select=fecha`;
    const verifRes = await fetch(verifQueryUrl, {
      headers: { apikey: sb.serviceKey, Authorization: `Bearer ${sb.serviceKey}` },
    });
    if (verifRes.ok) {
      const fechasOk = new Set(((await verifRes.json()) as { fecha: string }[]).map((f) => f.fecha));
      resueltos = candidatos.filter((d) => fechasOk.has(formatEcowittDate(d))).length;
    } else {
      console.warn(`${log} no se pudo verificar cuántos candidatos quedaron 'ok' tras el reintento`);
    }

    console.info(`${log} ${resueltos ?? '?'}/${candidatos.length} día(s) resuelto(s) a 'ok' en esta corrida`);

    return c.json({
      message: 'Reintento completo',
      candidatos: candidatos.length,
      resueltos,
      resultados,
    }, 200);
  } catch (error) {
    console.error(`${log} Unhandled error:`, error);
    return c.json({ error: String(error) }, 500);
  }
}

// ============================================================================
// Forecast — thin proxy over OpenWeatherMap, reusing the same parser the
// Esco chat agent uses (external-tools.ts). Exposed as its own GET endpoint
// so the main dashboard's weather card doesn't need the chat tool-loop.
// ============================================================================

export async function handleClimaForecast(c: Context): Promise<Response> {
  const daysParam = c.req.query('days');
  const requestedDays = Math.max(1, Math.min(Number(daysParam) || 3, 7));

  const apiKey = Deno.env.get('OPENWEATHER_API_KEY');
  if (!apiKey) {
    return c.json({ error: 'OPENWEATHER_API_KEY no configurada' }, 500);
  }

  const lat = Number(Deno.env.get('FARM_LAT')) || 5.6094;
  const lon = Number(Deno.env.get('FARM_LON')) || -75.4582;

  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&lang=es&appid=${apiKey}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return c.json({ error: `OpenWeather error ${res.status}`, detail: errText.slice(0, 200) }, 502);
    }
    const raw = await res.json();
    const dias = parseOpenWeatherForecast(raw, requestedDays);
    return c.json({ ubicacion: { lat, lon, ciudad: raw?.city?.name ?? 'Finca' }, dias }, 200);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  } finally {
    clearTimeout(timeoutId);
  }
}
