/**
 * Pure parsers for external API responses (Tavily, OpenWeatherMap).
 *
 * The fetch calls and Deno.env reads live in chat.tsx; this module keeps the
 * response-shaping logic in a place Vitest can import without touching Deno.
 *
 * Mirrored to supabase/functions/make-server-1ccce916/external-tools.ts.
 */

// ----------------------------------------------------------------------------
// Tavily
// ----------------------------------------------------------------------------

export interface TavilyRawResult {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
  published_date?: string;
}

export interface TavilyRawResponse {
  query?: string;
  answer?: string;
  results?: TavilyRawResult[];
  response_time?: number;
}

export interface TavilyParsedSource {
  title: string;
  url: string;
  snippet: string;
  published_date?: string;
}

export interface TavilyParsedResponse {
  answer: string;
  sources: TavilyParsedSource[];
}

export function parseTavilyResponse(raw: TavilyRawResponse): TavilyParsedResponse {
  const sources: TavilyParsedSource[] = (raw.results ?? [])
    .filter((r) => typeof r.url === 'string' && r.url.length > 0)
    .map((r) => ({
      title: r.title ?? r.url ?? '',
      url: r.url ?? '',
      snippet: (r.content ?? '').slice(0, 400),
      published_date: r.published_date,
    }));
  return {
    answer: (raw.answer ?? '').trim(),
    sources,
  };
}

// ----------------------------------------------------------------------------
// OpenWeatherMap (5-day / 3-hour forecast endpoint)
// ----------------------------------------------------------------------------

export interface OpenWeatherEntry {
  dt: number;
  dt_txt: string;
  main?: { temp_min?: number; temp_max?: number; humidity?: number };
  weather?: Array<{ main?: string; description?: string }>;
  wind?: { speed?: number; deg?: number; gust?: number };
  rain?: { '3h'?: number };
  pop?: number;
}

export interface OpenWeatherForecastResponse {
  list: OpenWeatherEntry[];
  city?: { name?: string; country?: string };
}

export interface DayForecast {
  date: string;
  temp_min: number;
  temp_max: number;
  rainfall_mm: number;
  rain_probability_pct: number;
  wind_max_kmh: number;
  wind_dominant_deg: number;
  humidity_avg: number;
  summary: string;
}

interface DayAccumulator {
  date: string;
  temps_min: number[];
  temps_max: number[];
  rainfall_mm: number;
  pops: number[];
  wind_speeds_ms: number[];
  wind_degs: number[];
  humidities: number[];
  descriptions: string[];
}

function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function parseOpenWeatherForecast(
  raw: OpenWeatherForecastResponse,
  days: number,
): DayForecast[] {
  const byDay = new Map<string, DayAccumulator>();

  for (const entry of raw.list ?? []) {
    if (!entry.dt_txt) continue;
    const date = entry.dt_txt.slice(0, 10); // YYYY-MM-DD
    let acc = byDay.get(date);
    if (!acc) {
      acc = {
        date,
        temps_min: [],
        temps_max: [],
        rainfall_mm: 0,
        pops: [],
        wind_speeds_ms: [],
        wind_degs: [],
        humidities: [],
        descriptions: [],
      };
      byDay.set(date, acc);
    }
    if (entry.main?.temp_min !== undefined) acc.temps_min.push(entry.main.temp_min);
    if (entry.main?.temp_max !== undefined) acc.temps_max.push(entry.main.temp_max);
    if (entry.main?.humidity !== undefined) acc.humidities.push(entry.main.humidity);
    acc.rainfall_mm += entry.rain?.['3h'] ?? 0;
    acc.pops.push(entry.pop ?? 0);
    if (entry.wind?.speed !== undefined) acc.wind_speeds_ms.push(entry.wind.speed);
    if (entry.wind?.deg !== undefined) acc.wind_degs.push(entry.wind.deg);
    const desc = entry.weather?.[0]?.description;
    if (desc) acc.descriptions.push(desc);
  }

  const sorted = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  const clamped = sorted.slice(0, Math.max(1, Math.min(days, 7)));

  return clamped.map((acc) => {
    const tempMin = acc.temps_min.length ? Math.min(...acc.temps_min) : 0;
    const tempMax = acc.temps_max.length ? Math.max(...acc.temps_max) : 0;
    const popMax = acc.pops.length ? Math.max(...acc.pops) : 0;
    const windMaxMs = acc.wind_speeds_ms.length ? Math.max(...acc.wind_speeds_ms) : 0;
    return {
      date: acc.date,
      temp_min: Math.round(tempMin * 10) / 10,
      temp_max: Math.round(tempMax * 10) / 10,
      rainfall_mm: Math.round(acc.rainfall_mm * 10) / 10,
      rain_probability_pct: Math.round(popMax * 100),
      wind_max_kmh: Math.round(windMaxMs * 3.6 * 10) / 10,
      wind_dominant_deg: Math.round(avg(acc.wind_degs)),
      humidity_avg: Math.round(avg(acc.humidities)),
      summary: acc.descriptions[Math.floor(acc.descriptions.length / 2)] ?? '',
    };
  });
}
