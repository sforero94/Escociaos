/**
 * PostgREST + RLS: un `.delete()` sin `.select()` reporta éxito cuando la
 * política filtra la fila — `{ error: null, data: null }`. Con `.select()`
 * (Prefer: return=representation) vuelve `{ error: null, data: [] }` si no
 * se borró nada. El cliente JS no lanza en ninguno de los dos casos, así
 * que "no hay error" no significa "se eliminó".
 *
 * Llamar después de `.delete().eq(...).select()`. ESCO-46.
 */
export function deleteDevolvioFilas(data: unknown[] | null | undefined): boolean {
  return Array.isArray(data) && data.length > 0;
}
