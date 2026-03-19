import { describe, it, expect } from 'vitest';

// ============================================================================
// Ecowitt types (mirrors edge function)
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
}

interface EcowittData {
  outdoor?: { temperature?: EcowittValueUnit; humidity?: EcowittValueUnit };
  wind?: { wind_speed?: EcowittValueUnit; wind_gust?: EcowittValueUnit; wind_direction?: EcowittValueUnit };
  rainfall?: EcowittRainfall;
  rainfall_piezo?: EcowittRainfall;
  solar_and_uvi?: { solar?: EcowittValueUnit; uvi?: EcowittValueUnit };
}

// ============================================================================
// Pure functions (copied from edge function for testing)
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

// ============================================================================
// Test data (based on real API response from station 84:1F:E8:35:D8:73)
// ============================================================================

const v = (value: string, unit: string): EcowittValueUnit => ({
  time: '1773961642',
  value,
  unit,
});

const sampleData: EcowittData = {
  outdoor: {
    temperature: v('72.5', '°F'),
    humidity: v('65', '%'),
  },
  wind: {
    wind_speed: v('5.2', 'mph'),
    wind_gust: v('8.1', 'mph'),
    wind_direction: v('258', '°'),
  },
  rainfall_piezo: {
    rain_rate: v('0.50', 'in/hr'),
    daily: v('0.20', 'in'),
    event: v('0.10', 'in'),
  },
  solar_and_uvi: {
    solar: v('450.0', 'W/m²'),
    uvi: v('5.3', ''),
  },
};

const sampleTime = '1773961642';
const sampleMac = '84:1F:E8:35:D8:73';

// ============================================================================
// Tests
// ============================================================================

describe('parseEcowittObservation', () => {
  it('converts temperature from °F to °C', () => {
    const r = parseEcowittObservation(sampleData, sampleTime, sampleMac);
    expect(r.temp_c).toBeCloseTo(22.5, 1); // (72.5 - 32) * 5/9 = 22.5
  });

  it('converts wind speed from mph to km/h', () => {
    const r = parseEcowittObservation(sampleData, sampleTime, sampleMac);
    expect(r.viento_kmh).toBeCloseTo(8.37, 1); // 5.2 * 1.60934
  });

  it('converts wind gust from mph to km/h', () => {
    const r = parseEcowittObservation(sampleData, sampleTime, sampleMac);
    expect(r.rafaga_kmh).toBeCloseTo(13.04, 1); // 8.1 * 1.60934
  });

  it('converts rain rate from in/hr to mm/hr', () => {
    const r = parseEcowittObservation(sampleData, sampleTime, sampleMac);
    expect(r.lluvia_tasa_mm_hr).toBeCloseTo(12.7, 1); // 0.50 * 25.4
  });

  it('converts daily rain from inches to mm', () => {
    const r = parseEcowittObservation(sampleData, sampleTime, sampleMac);
    expect(r.lluvia_diaria_mm).toBeCloseTo(5.08, 1); // 0.20 * 25.4
  });

  it('converts event rain from inches to mm (not null)', () => {
    const r = parseEcowittObservation(sampleData, sampleTime, sampleMac);
    expect(r.lluvia_evento_mm).toBeCloseTo(2.54, 1); // 0.10 * 25.4
    expect(r.lluvia_evento_mm).not.toBeNull();
  });

  it('passes humidity through without conversion', () => {
    const r = parseEcowittObservation(sampleData, sampleTime, sampleMac);
    expect(r.humedad_pct).toBe(65);
  });

  it('passes wind direction through without conversion', () => {
    const r = parseEcowittObservation(sampleData, sampleTime, sampleMac);
    expect(r.viento_dir).toBe(258);
  });

  it('passes solar radiation through without conversion (already W/m²)', () => {
    const r = parseEcowittObservation(sampleData, sampleTime, sampleMac);
    expect(r.radiacion_wm2).toBe(450);
  });

  it('rounds UV index to integer', () => {
    const r = parseEcowittObservation(sampleData, sampleTime, sampleMac);
    expect(r.uv_index).toBe(5); // 5.3 rounded
  });

  it('uses MAC address as station_id', () => {
    const r = parseEcowittObservation(sampleData, sampleTime, 'AA:BB:CC:DD:EE:FF');
    expect(r.station_id).toBe('AA:BB:CC:DD:EE:FF');
  });

  it('derives timestamp from unix epoch string', () => {
    const r = parseEcowittObservation(sampleData, '1773961642', sampleMac);
    const ts = new Date(1773961642 * 1000).toISOString();
    expect(r.timestamp).toBe(ts);
  });

  it('handles missing outdoor data gracefully', () => {
    const data: EcowittData = { wind: sampleData.wind };
    const r = parseEcowittObservation(data, sampleTime, sampleMac);
    expect(r.temp_c).toBeNull();
    expect(r.humedad_pct).toBeNull();
  });

  it('handles missing wind data gracefully', () => {
    const data: EcowittData = { outdoor: sampleData.outdoor };
    const r = parseEcowittObservation(data, sampleTime, sampleMac);
    expect(r.viento_kmh).toBeNull();
    expect(r.rafaga_kmh).toBeNull();
    expect(r.viento_dir).toBeNull();
  });

  it('handles missing rain data gracefully', () => {
    const data: EcowittData = { outdoor: sampleData.outdoor };
    const r = parseEcowittObservation(data, sampleTime, sampleMac);
    expect(r.lluvia_tasa_mm_hr).toBeNull();
    expect(r.lluvia_diaria_mm).toBeNull();
    expect(r.lluvia_evento_mm).toBeNull();
  });

  it('handles missing solar/uvi data gracefully', () => {
    const data: EcowittData = { outdoor: sampleData.outdoor };
    const r = parseEcowittObservation(data, sampleTime, sampleMac);
    expect(r.radiacion_wm2).toBeNull();
    expect(r.uv_index).toBeNull();
  });

  it('prefers rainfall_piezo over rainfall', () => {
    const data: EcowittData = {
      rainfall: { daily: v('0.50', 'in') },
      rainfall_piezo: { daily: v('0.20', 'in') },
    };
    const r = parseEcowittObservation(data, sampleTime, sampleMac);
    expect(r.lluvia_diaria_mm).toBeCloseTo(5.08, 1); // piezo value: 0.20 * 25.4
  });

  it('falls back to rainfall when rainfall_piezo is absent', () => {
    const data: EcowittData = {
      rainfall: { daily: v('0.50', 'in') },
    };
    const r = parseEcowittObservation(data, sampleTime, sampleMac);
    expect(r.lluvia_diaria_mm).toBeCloseTo(12.7, 1); // 0.50 * 25.4
  });
});

describe('unit conversion helpers', () => {
  it('fToC: 32°F = 0°C', () => expect(fToC(32)).toBe(0));
  it('fToC: 212°F = 100°C', () => expect(fToC(212)).toBe(100));
  it('mphToKmh: 1 mph ≈ 1.61 km/h', () => expect(mphToKmh(1)).toBeCloseTo(1.61, 1));
  it('inToMm: 1 inch = 25.4 mm', () => expect(inToMm(1)).toBe(25.4));

  it('safeFloat: valid string', () => expect(safeFloat('3.14')).toBe(3.14));
  it('safeFloat: undefined', () => expect(safeFloat(undefined)).toBeNull());
  it('safeFloat: invalid string', () => expect(safeFloat('abc')).toBeNull());
  it('safeFloat: zero', () => expect(safeFloat('0')).toBe(0));
  it('safeFloat: negative', () => expect(safeFloat('-5.2')).toBe(-5.2));
});
