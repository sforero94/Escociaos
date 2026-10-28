// Hora de evidencia explícita en Bogotá (UTC-5), nunca el reloj de «hoy».
export function asOfUtc(asOfBogota: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(asOfBogota);
  if (!m) throw new Error('as_of inválido: usa AAAA-MM-DD HH:MM');
  const [anio, mes, dia, hora, minuto] = m.slice(1).map(Number);
  const local = new Date(0);
  // setUTCFullYear evita el ajuste de Date.UTC para los años 00–99.
  local.setUTCFullYear(anio, mes - 1, dia);
  local.setUTCHours(hora, minuto, 0, 0);
  if (local.getUTCFullYear() !== anio || local.getUTCMonth() !== mes - 1 ||
    local.getUTCDate() !== dia || local.getUTCHours() !== hora || local.getUTCMinutes() !== minuto) {
    throw new Error('as_of inválido: fecha u hora imposible');
  }
  return new Date(local.getTime() + 5 * 60 * 60 * 1000).toISOString();
}
