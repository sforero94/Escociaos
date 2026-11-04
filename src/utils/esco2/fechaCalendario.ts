// Aritmética de días calendario sin huso horario. Las fechas del núcleo son strings
// AAAA-MM-DD; se convierten a Date en medianoche UTC solo para sumar o restar días y
// se vuelven a string con los componentes UTC. Nunca toman "hoy" del reloj: "hoy"
// llega siempre como parámetro.

export function aFechaUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function deFechaUTC(d: Date): string {
  const a = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(d.getUTCDate()).padStart(2, '0');
  return `${a}-${m}-${dia}`;
}

/** ¿Es una fecha calendario real? ("2026-02-30" no lo es.) */
export function esFechaCalendario(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = aFechaUTC(s);
  return !Number.isNaN(d.getTime()) && deFechaUTC(d) === s;
}

/** Lunes de la semana (lunes a domingo) que contiene la fecha. */
export function lunesDe(iso: string): string {
  const d = aFechaUTC(iso);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return deFechaUTC(d);
}
