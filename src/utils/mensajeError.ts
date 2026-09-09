/**
 * Texto de un fallo para el usuario. PostgREST (supabase-js) no lanza
 * `Error`: `.from().update()` resuelve `{ error: { message, code, details } }`.
 * Un `catch` que solo mira `instanceof Error` traga ese objeto y muestra
 * "Error desconocido" aunque el mensaje exista — eso es lo que vio quien
 * editó una venta en el preview de #216 con la 141 sin aplicar.
 */

export function mensajeDeError(error: unknown, fallback = 'Error desconocido'): string {
  if (typeof error === 'string' && error.trim() !== '') return error;
  if (error instanceof Error && error.message.trim() !== '') return error.message;
  if (error !== null && typeof error === 'object' && 'message' in error) {
    const raw = (error as { message: unknown }).message;
    if (typeof raw === 'string' && raw.trim() !== '') return raw;
  }
  return fallback;
}

export const PISTA_MIGRACION_141 =
  'Aplica la migración 141 (columnas peso_total_kg y destare_kg_cabeza) antes de guardar.';

/** PGRST204 / schema cache cuando peso_total_kg o destare_kg_cabeza aún no existen. */
export function esColumnaPesoDestareAusente(mensaje: string): boolean {
  const mencionaColumna = /peso_total_kg|destare_kg_cabeza/i.test(mensaje);
  const desconocida = /PGRST204|Could not find the|schema cache/i.test(mensaje);
  return mencionaColumna && desconocida;
}

export function mensajeErrorTransaccionGanado(error: unknown): string {
  const base = mensajeDeError(error);
  if (esColumnaPesoDestareAusente(base)) {
    return `${base} ${PISTA_MIGRACION_141}`;
  }
  return base;
}
