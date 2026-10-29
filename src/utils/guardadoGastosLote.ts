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
export function comprobarSoporteGastosLote(): LockManager {
  if (typeof navigator === 'undefined' || !navigator.locks?.request) {
    throw new Error('Este navegador no permite guardar el lote con seguridad. Actualiza el navegador y conserva los datos pendientes.');
  }
  return navigator.locks;
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
function coincide(actual: IntentoGastosLote | null, esperado: IntentoGastosLote) {
  return actual?.id === esperado.id && JSON.stringify(actual.datos) === JSON.stringify(esperado.datos);
}
function retirarSiCoincide(usuarioId: string, intento: IntentoGastosLote) {
  // Caller owns the per-user Web Lock. UUID alone is insufficient: a changed
  // invoice path or edit under that UUID must never lose its recovery payload.
  if (coincide(leerIntentoGastosLote(usuarioId), intento)) localStorage.removeItem(clave(usuarioId));
}
export async function guardarGastosLote(
  cliente: ClienteGastosLote, usuarioId: string, datos?: IntentoGastosLote['datos'], solicitudId?: string,
  alConfirmar?: (intento: IntentoGastosLote) => boolean | void,
) {
  const gestor = comprobarSoporteGastosLote();
  const nombre = clave(usuarioId);
  // Capture the submitted input before waiting; never use later mutable form data.
  const capturados: IntentoGastosLote['datos'] | undefined = datos ? JSON.parse(JSON.stringify(datos)) : undefined;
  return gestor.request(nombre, { mode: 'exclusive' }, async () => {
    // All pending reads, writes, RPCs and cleanup run inside this origin-wide
    // per-user lock. Do not add a timeout/steal or a localStorage lock fallback.
    const previo = leerIntentoGastosLote(usuarioId);
    if (previo && solicitudId && previo.id !== solicitudId) throw new Error('Hay otro lote pendiente. Verifica su guardado.');
    if (previo && capturados && JSON.stringify(previo.datos) !== JSON.stringify(capturados)) {
      throw new Error('Verifica el lote pendiente antes de cambiar los gastos.');
    }
    if (!previo && !capturados?.length) throw new Error('No hay un lote pendiente.');
    const intento = previo ?? { id: solicitudId ?? crypto.randomUUID(), datos: capturados! };
    // Persist once before sending. A waiter must not overwrite an existing request.
    if (!previo) localStorage.setItem(nombre, JSON.stringify(intento));
    const { data, error } = await cliente.rpc('fn_fin_gastos_guardar_lote', {
      p_solicitud_id: intento.id, p_usuario_id: usuarioId, p_datos: intento.datos,
    });
    if (error) {
      // PGB01 (or legacy 22023) can describe an earlier committed payload.
      // Replays never erase recovery state, even on a later definitive rejection.
      const code = error.code ?? '';
      if (!previo && code !== 'PGB01' && code !== '22023' &&
          (/^(22|23|40)/.test(code) || code === 'P0001' || code === 'PGRST202')) {
        retirarSiCoincide(usuarioId, intento);
      }
      throw new Error(error.message);
    }
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
        data.cantidad !== intento.datos.length || !Array.isArray(data.ids) ||
        data.ids.length !== intento.datos.length || data.ids.some(id => typeof id !== 'string')) {
      throw new Error('No llegó una confirmación válida. Verifica el lote pendiente.');
    }
    if (!coincide(leerIntentoGastosLote(usuarioId), intento)) {
      throw new Error('Los datos pendientes cambiaron fuera del guardado. Consérvalos y avisa a Gerencia.');
    }
    // Synchronous form/draft cleanup occurs while still owning the lock. If the
    // account changed or cleanup throws, retain the pending payload for recovery.
    if (alConfirmar && alConfirmar(intento) !== false) retirarSiCoincide(usuarioId, intento);
    return intento.datos.length;
  });
}
