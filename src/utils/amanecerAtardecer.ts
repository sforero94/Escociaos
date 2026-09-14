// Civil sunrise / sunset at the farm (Aguadas, Caldas).
// Algorithm: SunCalc / NOAA solar-position formulas (Agafonkin), civil
// elevation -0.833°. Times are returned in America/Bogota wall-clock hours.
// Coordinates match FARM_LAT / FARM_LON defaults in the edge functions.

export const FINCA_LAT = 5.6094;
export const FINCA_LON = -75.4582;
export const ZONA_FINCA = 'America/Bogota';

export interface AmanecerAtardecer {
  fecha: string;
  /** Fractional Bogotá hour of civil sunrise (e.g. 5.87 = 05:52). */
  amanecerHora: number;
  /** Fractional Bogotá hour of civil sunset. */
  atardecerHora: number;
  amanecerLabel: string;
  atardecerLabel: string;
}

const DAY_MS = 1000 * 60 * 60 * 24;
const J1970 = 2440588;
const J2000 = 2451545;
const RAD = Math.PI / 180;
const E = RAD * 23.4397; // obliquity
const J0 = 0.0009;
const CIVIL = -0.833 * RAD;

function toJulian(date: Date): number {
  return date.valueOf() / DAY_MS - 0.5 + J1970;
}

function fromJulian(j: number): Date {
  return new Date((j + 0.5 - J1970) * DAY_MS);
}

function toDays(date: Date): number {
  return toJulian(date) - J2000;
}

function solarMeanAnomaly(d: number): number {
  return RAD * (357.5291 + 0.98560028 * d);
}

function eclipticLongitude(M: number): number {
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = RAD * 102.9372;
  return M + C + P + Math.PI;
}

function declination(l: number): number {
  return Math.asin(Math.sin(l) * Math.sin(E));
}

function julianCycle(d: number, lw: number): number {
  return Math.round(d - J0 - lw / (2 * Math.PI));
}

function approxTransit(Ht: number, lw: number, n: number): number {
  return J0 + (Ht + lw) / (2 * Math.PI) + n;
}

function solarTransitJ(ds: number, M: number, L: number): number {
  return J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
}

function hourAngle(h: number, phi: number, d: number): number {
  const cos = (Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d));
  return Math.acos(Math.min(1, Math.max(-1, cos)));
}

function getSetJ(
  h: number,
  lw: number,
  phi: number,
  dec: number,
  n: number,
  M: number,
  L: number,
): number {
  const w = hourAngle(h, phi, dec);
  const a = approxTransit(w, lw, n);
  return solarTransitJ(a, M, L);
}

function sunTimesUtc(date: Date, lat: number, lon: number): { sunrise: Date; sunset: Date } {
  const lw = RAD * -lon;
  const phi = RAD * lat;
  const d = toDays(date);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L);
  const Jnoon = solarTransitJ(ds, M, L);
  const Jset = getSetJ(CIVIL, lw, phi, dec, n, M, L);
  const Jrise = Jnoon - (Jset - Jnoon);
  return { sunrise: fromJulian(Jrise), sunset: fromJulian(Jset) };
}

function horaFraccionEnZona(date: Date, timeZone: string = ZONA_FINCA): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour + minute / 60;
}

export function formatearHoraFraccion(hora: number): string {
  let h = Math.floor(hora);
  let m = Math.round((hora - h) * 60);
  if (m === 60) {
    h += 1;
    m = 0;
  }
  h = ((h % 24) + 24) % 24;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Civil sunrise and sunset for a Bogotá calendar day at the farm.
 * `fecha` is YYYY-MM-DD in America/Bogota.
 */
export function calcularAmanecerAtardecer(
  fecha: string,
  lat: number = FINCA_LAT,
  lon: number = FINCA_LON,
): AmanecerAtardecer {
  // Noon Bogotá (UTC−5, no DST) so the Julian day is that local date.
  const mediodia = new Date(`${fecha}T12:00:00-05:00`);
  const { sunrise, sunset } = sunTimesUtc(mediodia, lat, lon);
  const amanecerHora = horaFraccionEnZona(sunrise);
  const atardecerHora = horaFraccionEnZona(sunset);
  return {
    fecha,
    amanecerHora,
    atardecerHora,
    amanecerLabel: formatearHoraFraccion(amanecerHora),
    atardecerLabel: formatearHoraFraccion(atardecerHora),
  };
}
