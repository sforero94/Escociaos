import { getSupabase } from '@/utils/supabase/client';

export interface ReemplazoChequeo {
  id: string;
  fecha: string;
  filas: number;
}

export class ErrorConfirmacionReemplazoChequeo extends Error {
  constructor(public readonly chequeo: ReemplazoChequeo) {
    super(`Ya existe un chequeo del ${chequeo.fecha} con ${chequeo.filas} filas. Confirma su reemplazo antes de aprobar.`);
    this.name = 'ErrorConfirmacionReemplazoChequeo';
  }
}

/** Se consulta en cada intento, incluso después de confirmar. Un error de
 * lectura nunca significa que la fecha está libre. No cambia la RPC 065. */
export async function verificarReemplazoChequeo(fecha: string, confirmado?: ReemplazoChequeo): Promise<void> {
  // Las tablas hato aún no están en el tipo generado de Database.
  const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase.from('hato_chequeos').select('id').eq('fecha', fecha).maybeSingle();
  if (error) throw new Error(`No se pudo verificar si ya existe el chequeo: ${error.message}`);
  if (!data) return;
  const { count, error: errorConteo } = await supabase.from('hato_chequeo_vacas')
    .select('id', { count: 'exact', head: true }).eq('chequeo_id', data.id);
  if (errorConteo || typeof count !== 'number') {
    throw new Error(`No se pudo contar el chequeo existente: ${errorConteo?.message ?? 'sin conteo'}`);
  }
  if (confirmado?.fecha !== fecha || confirmado.id !== data.id || confirmado.filas !== count) {
    throw new ErrorConfirmacionReemplazoChequeo({ id: data.id, fecha, filas: count });
  }
}
