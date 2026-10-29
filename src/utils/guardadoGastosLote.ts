import type { Json } from '@/types/database';

export interface IntentoGastosLote {
  id: string;
  datos: { [clave: string]: Json }[];
}
export interface ClienteGastosLote {
  rpc: (nombre: 'fn_fin_gastos_guardar_lote', args: {
    p_solicitud_id: string; p_usuario_id: string; p_datos: Json;
  }) => PromiseLike<{ data: Json; error: { code?: string; message: string } | null }>;
}
function clave(usuarioId: string) {
  if (!usuarioId) throw new Error('Vuelve a iniciar sesión antes de guardar.');
  return `gastos_lote_pendiente_v1_${usuarioId}`;
}
export function leerIntentoGastosLote(usuarioId: string): IntentoGastosLote | null {
  const raw = localStorage.getItem(clave(usuarioId));
  if (!raw) return null;
  const intento = JSON.parse(raw) as IntentoGastosLote;
  if (!intento.id || !Array.isArray(intento.datos) || !intento.datos.length) {
    throw new Error('No se puede leer el lote pendiente. Conserva los datos y avisa a Gerencia.');
  }
  return intento;
}
export async function guardarGastosLote(
  cliente: ClienteGastosLote, usuarioId: string, datos?: IntentoGastosLote['datos'], solicitudId?: string,
) {
  const previo = leerIntentoGastosLote(usuarioId);
  if (previo && solicitudId && previo.id !== solicitudId) throw new Error('Hay otro lote pendiente. Verifica su guardado.');
  if (previo && datos && JSON.stringify(previo.datos) !== JSON.stringify(datos)) {
    throw new Error('Verifica el lote pendiente antes de cambiar los gastos.');
  }
  if (!previo && !datos?.length) throw new Error('No hay un lote pendiente.');
  const intento = previo ?? { id: solicitudId ?? crypto.randomUUID(), datos: datos! };
  // Si falla la persistencia, no sale ninguna petición. Un reintento usa el
  // payload congelado, incluidas las rutas ya cargadas de las facturas.
  localStorage.setItem(clave(usuarioId), JSON.stringify(intento));
  const { data, error } = await cliente.rpc('fn_fin_gastos_guardar_lote', {
    p_solicitud_id: intento.id, p_usuario_id: usuarioId, p_datos: intento.datos,
  });
  if (error) {
    // SQL rollback classes permit correction with the SAME durable draft ID.
    // Transport/auth errors remain ambiguous, especially on a replay.
    if (/^(22|23|40)/.test(error.code ?? '') || error.code === 'P0001' ||
        (!previo && error.code === 'PGRST202')) finalizarGastosLote(usuarioId, intento.id);
    throw new Error(error.message);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      data.cantidad !== intento.datos.length || !Array.isArray(data.ids) ||
      data.ids.length !== intento.datos.length || data.ids.some(id => typeof id !== 'string')) {
    throw new Error('No llegó una confirmación válida. Verifica el lote pendiente.');
  }
  return intento.datos.length;
}

// Llamar solo después de retirar el borrador: una recarga entre confirmación
// y limpieza todavía debe resolver el mismo recibo, nunca recapturar el lote.
export function finalizarGastosLote(usuarioId: string, solicitudId: string) {
  if (leerIntentoGastosLote(usuarioId)?.id === solicitudId) localStorage.removeItem(clave(usuarioId));
}
