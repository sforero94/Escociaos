import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { GastoOriginal } from '@/utils/gastoDraft';

export const CONFLICTO_GASTO = 'El gasto cambió o no se pudo confirmar la actualización. Conservamos tus datos. Recarga el gasto y empieza de nuevo antes de guardar.';
export const BASE_GASTO_AUSENTE = 'Este borrador no tiene la versión original del gasto. Conservamos tus datos. Recarga el gasto y empieza de nuevo antes de guardar.';
export function validarValorGasto(valor: unknown): asserts valor is number {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) throw new Error('El valor del gasto debe ser un número finito mayor a cero.');
}

// PostgreSQL may return microseconds and a different UTC offset spelling.
// Keep fractional precision when deciding whether the returned version changed.
function versionKey(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}(?::?\d{2})?)$/.exec(value);
  if (!match) return null;
  const zone = match[3].length === 3 ? `${match[3]}:00` : match[3];
  const seconds = Date.parse(`${match[1].replace(' ', 'T')}${zone}`);
  return Number.isFinite(seconds) ? `${seconds}:${(match[2] ?? '').padEnd(9, '0')}` : null;
}

/** Equality guard for this writer; updated_at is not a global monotonic revision. */
export async function actualizarGastoSeguro(
  client: SupabaseClient<Database>, id: string, original: GastoOriginal | null | undefined,
  fields: Record<string, unknown>, valor: number,
) {
  if (!original || original.id !== id || typeof original.updated_at !== 'string' ||
      !versionKey(original.updated_at)) throw new Error(BASE_GASTO_AUSENTE);
  validarValorGasto(valor);
  // Ensure a same-millisecond retry does not deliberately keep the old version.
  const updated_at = new Date(Math.max(Date.now(), Date.parse(original.updated_at) + 1)).toISOString();
  const { data, error } = await client.from('fin_gastos').update({ ...fields, updated_at })
    .eq('id', id).eq('updated_at', original.updated_at).select('id, updated_at');
  if (error) throw error;
  if (!Array.isArray(data) || data.length !== 1 || !data[0] || typeof data[0] !== 'object' || data[0].id !== id ||
      typeof data[0].updated_at !== 'string' || !versionKey(data[0].updated_at) ||
      versionKey(data[0].updated_at) === versionKey(original.updated_at)) throw new Error(CONFLICTO_GASTO);
  return data[0];
}
