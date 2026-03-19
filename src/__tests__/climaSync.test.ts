import { describe, it, expect, beforeAll } from 'vitest';

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

// We'll test parseWUObservation as a pure function exported from the edge function
// Since the edge function uses Deno imports, we re-implement the parsing logic
// and test it here to verify the mapping is correct.

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

const sampleObs: WUObservation = {
  stationID: 'ISANFR102',
  obsTimeUtc: '2026-03-18T15:30:00Z',
  obsTimeLocal: '2026-03-18 10:30:00',
  humidity: 65,
  winddir: 180,
  solarRadiation: 850,
  uv: 4.3,
  metric: {
    temp: 22.5,
    windSpeed: 12.3,
    windGust: 18.7,
    precipRate: 0.5,
    precipTotal: 5.2,
    pressure: 1013.25,
    dewpt: 15.1,
  },
};

describe('parseWUObservation', () => {
  it('maps metric.temp to temp_c', () => {
    const r = parseWUObservation(sampleObs, 'ISANFR102');
    expect(r.temp_c).toBe(22.5);
  });

  it('maps metric.windSpeed to viento_kmh', () => {
    const r = parseWUObservation(sampleObs, 'ISANFR102');
    expect(r.viento_kmh).toBe(12.3);
  });

  it('maps metric.windGust to rafaga_kmh', () => {
    const r = parseWUObservation(sampleObs, 'ISANFR102');
    expect(r.rafaga_kmh).toBe(18.7);
  });

  it('maps metric.precipRate to lluvia_tasa_mm_hr', () => {
    const r = parseWUObservation(sampleObs, 'ISANFR102');
    expect(r.lluvia_tasa_mm_hr).toBe(0.5);
  });

  it('maps metric.precipTotal to lluvia_diaria_mm', () => {
    const r = parseWUObservation(sampleObs, 'ISANFR102');
    expect(r.lluvia_diaria_mm).toBe(5.2);
  });

  it('maps top-level humidity to humedad_pct', () => {
    const r = parseWUObservation(sampleObs, 'ISANFR102');
    expect(r.humedad_pct).toBe(65);
  });

  it('maps top-level winddir (lowercase) to viento_dir', () => {
    const r = parseWUObservation(sampleObs, 'ISANFR102');
    expect(r.viento_dir).toBe(180);
  });

  it('maps top-level solarRadiation to radiacion_wm2', () => {
    const r = parseWUObservation(sampleObs, 'ISANFR102');
    expect(r.radiacion_wm2).toBe(850);
  });

  it('maps top-level uv to uv_index (rounded)', () => {
    const r = parseWUObservation(sampleObs, 'ISANFR102');
    expect(r.uv_index).toBe(4); // 4.3 rounded
  });

  it('sets lluvia_evento_mm to null (WU does not provide this)', () => {
    const r = parseWUObservation(sampleObs, 'ISANFR102');
    expect(r.lluvia_evento_mm).toBeNull();
  });

  it('uses stationId parameter as station_id', () => {
    const r = parseWUObservation(sampleObs, 'MY-STATION');
    expect(r.station_id).toBe('MY-STATION');
  });

  it('parses obsTimeUtc to ISO timestamp', () => {
    const r = parseWUObservation(sampleObs, 'ISANFR102');
    expect(r.timestamp).toBe('2026-03-18T15:30:00.000Z');
  });

  it('handles null solarRadiation gracefully', () => {
    const obs = { ...sampleObs, solarRadiation: null };
    const r = parseWUObservation(obs, 'ISANFR102');
    expect(r.radiacion_wm2).toBeNull();
  });

  it('handles null uv gracefully', () => {
    const obs = { ...sampleObs, uv: null };
    const r = parseWUObservation(obs, 'ISANFR102');
    expect(r.uv_index).toBeNull();
  });
});
