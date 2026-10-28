import type { Json } from '@/types/database';

export type OperacionInventario = 'movimiento' | 'compra' | 'eliminar_compra';
export interface IntentoInventario {
  id: string;
  operacion: OperacionInventario;
  datos: { [clave: string]: Json };
}
export interface ClienteGuardadoInventario {
  rpc: (nombre: 'fn_inventario_guardar', args: {
    p_solicitud_id: string; p_operacion: string; p_datos: Json;
  }) => PromiseLike<{ data: Json; error: { code?: string; message: string } | null }>;
}

function claveIntento(usuarioId: string, operacion: OperacionInventario) {
  if (!usuarioId) throw new Error('Vuelve a iniciar sesión antes de guardar.');
  return `inventario_pendiente_v1_${usuarioId}_${operacion}`;
}

export function leerIntentoInventario(usuarioId: string, operacion: OperacionInventario): IntentoInventario | null {
  const raw = localStorage.getItem(claveIntento(usuarioId, operacion));
  if (!raw) return null;
  const intento = JSON.parse(raw) as IntentoInventario;
  if (!intento.id || intento.operacion !== operacion || !intento.datos) {
    throw new Error('No se pudo leer el guardado pendiente. Conserva los datos y avisa a Gerencia.');
  }
  return intento;
}

function liberarIntento(usuarioId: string, intento: IntentoInventario) {
  // Una respuesta tardía de un doble clic no debe borrar un intento nuevo.
  if (leerIntentoInventario(usuarioId, intento.operacion)?.id === intento.id) {
    localStorage.removeItem(claveIntento(usuarioId, intento.operacion));
  }
}

async function enviarIntento(cliente: ClienteGuardadoInventario, usuarioId: string, intento: IntentoInventario, esReintento = false) {
  const { data, error } = await cliente.rpc('fn_inventario_guardar', {
    p_solicitud_id: intento.id, p_operacion: intento.operacion, p_datos: intento.datos,
  });
  if (error) {
    // Solo errores que confirman rechazo/rollback liberan el intento. Un
    // timeout, error HTTP o desconexión NO demuestra que no hubo COMMIT.
    if (/^(22|23|40)/.test(error.code ?? '') || error.code === 'P0001' ||
        (!esReintento && ['42501', 'PGRST202', 'PGRST301'].includes(error.code ?? ''))) {
      liberarIntento(usuarioId, intento);
    }
    if (error.code === 'PGRST202') {
      throw new Error('El guardado de inventario aún no está habilitado. Avisa a Gerencia.');
    }
    throw new Error(error.message);
  }
  if (data === null) throw new Error('No se recibió la confirmación. Verifica el guardado pendiente.');
  liberarIntento(usuarioId, intento);
  return data;
}

export async function guardarOperacionInventario(
  cliente: ClienteGuardadoInventario, usuarioId: string, operacion: OperacionInventario,
  datos: IntentoInventario['datos'],
) {
  const anterior = leerIntentoInventario(usuarioId, operacion);
  if (anterior && JSON.stringify(anterior.datos) !== JSON.stringify(datos)) {
    throw new Error('Hay un guardado sin confirmar. Pulsa «Verificar guardado pendiente» antes de guardar otros datos.');
  }
  const intento = anterior ?? { id: crypto.randomUUID(), operacion, datos };
  // Escribir ANTES de enviar: sobrevive a una recarga o al cierre del modal.
  // Si el navegador no puede conservarlo, no se hace ninguna petición.
  localStorage.setItem(claveIntento(usuarioId, operacion), JSON.stringify(intento));
  return enviarIntento(cliente, usuarioId, intento, !!anterior);
}

export async function reintentarOperacionInventario(
  cliente: ClienteGuardadoInventario, usuarioId: string, operacion: OperacionInventario,
) {
  const intento = leerIntentoInventario(usuarioId, operacion);
  if (!intento) throw new Error('No hay un guardado pendiente.');
  return enviarIntento(cliente, usuarioId, intento, true);
}
