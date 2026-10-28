// La reversión se verifica en PostgreSQL en inventario-f1-postgres.py.
// Aquí se cubre la identidad duradera de los reintentos del navegador.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  guardarOperacionInventario, leerIntentoInventario, reintentarOperacionInventario,
  type ClienteGuardadoInventario,
} from '@/utils/guardadoInventario';

const usuario = 'usuario-local';
const datos = { compra_id: 'compra-local', fecha: '2026-10-27' };
const confirmado = { data: { compra_id: 'compra-local' }, error: null };

function cliente() {
  return { rpc: vi.fn<ClienteGuardadoInventario['rpc']>().mockResolvedValue(confirmado) };
}

beforeEach(() => {
  const valores = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => valores.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => valores.set(key, value)),
    removeItem: vi.fn((key: string) => valores.delete(key)),
  });
});

describe('guardado de inventario reintentable', () => {
  it('persiste antes de enviar; una respuesta perdida conserva el mismo id al recargar', async () => {
    const sb = cliente();
    sb.rpc.mockImplementationOnce(async () => {
      expect(leerIntentoInventario(usuario, 'eliminar_compra')).not.toBeNull();
      throw new TypeError('Failed to fetch');
    });
    await expect(guardarOperacionInventario(sb, usuario, 'eliminar_compra', datos)).rejects.toThrow();
    expect(leerIntentoInventario(usuario, 'eliminar_compra')).not.toBeNull();
    await reintentarOperacionInventario(sb, usuario, 'eliminar_compra');
    expect(sb.rpc.mock.calls[0][1]).toEqual(sb.rpc.mock.calls[1][1]);
    expect(leerIntentoInventario(usuario, 'eliminar_compra')).toBeNull();
  });

  it('no envía datos editados con una solicitud incierta; verifica la instantánea original', async () => {
    const sb = cliente();
    sb.rpc.mockResolvedValueOnce({ data: null, error: { code: '', message: 'Timeout' } });
    await expect(guardarOperacionInventario(sb, usuario, 'eliminar_compra', datos)).rejects.toThrow('Timeout');
    await expect(guardarOperacionInventario(sb, usuario, 'eliminar_compra', { ...datos, compra_id: 'otra' }))
      .rejects.toThrow('Verificar guardado pendiente');
    expect(sb.rpc).toHaveBeenCalledTimes(1);
    await reintentarOperacionInventario(sb, usuario, 'eliminar_compra');
    expect(sb.rpc.mock.lastCall?.[1].p_datos).toEqual(datos);
  });

  it('un guardado confirmado permite un nuevo hecho idéntico con otra clave', async () => {
    const sb = cliente();
    await guardarOperacionInventario(sb, usuario, 'movimiento', { cantidad: 20 });
    await guardarOperacionInventario(sb, usuario, 'movimiento', { cantidad: 20 });
    expect(sb.rpc.mock.calls[0][1].p_solicitud_id).not.toBe(sb.rpc.mock.calls[1][1].p_solicitud_id);
  });

  it('un rechazo SQL definitivo libera el formulario', async () => {
    const sb = cliente();
    sb.rpc.mockResolvedValueOnce({ data: null, error: { code: '23514', message: 'CHECK' } });
    await expect(guardarOperacionInventario(sb, usuario, 'compra', { cantidad: -1 })).rejects.toThrow('CHECK');
    expect(leerIntentoInventario(usuario, 'compra')).toBeNull();
  });

  it('una sesión expirada durante la verificación conserva el intento incierto', async () => {
    const sb = cliente();
    sb.rpc.mockRejectedValueOnce(new TypeError('desconectado'));
    await expect(guardarOperacionInventario(sb, usuario, 'eliminar_compra', datos)).rejects.toThrow();
    sb.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST301', message: 'JWT expired' } });
    await expect(reintentarOperacionInventario(sb, usuario, 'eliminar_compra')).rejects.toThrow('JWT expired');
    expect(leerIntentoInventario(usuario, 'eliminar_compra')).not.toBeNull();
  });

  it('no envía nada si el navegador no puede conservar la solicitud', async () => {
    const sb = cliente();
    vi.mocked(localStorage.setItem).mockImplementation(() => { throw new Error('QuotaExceeded'); });
    await expect(guardarOperacionInventario(sb, usuario, 'eliminar_compra', datos)).rejects.toThrow();
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it('sin la migración da un error explícito y no usa escrituras parciales', async () => {
    const sb = cliente();
    sb.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Function missing' } });
    await expect(guardarOperacionInventario(sb, usuario, 'eliminar_compra', datos)).rejects.toThrow('no está habilitado');
    expect(sb.rpc).toHaveBeenCalledTimes(1);
    expect(leerIntentoInventario(usuario, 'eliminar_compra')).toBeNull();
  });

  it('separa usuarios y conserva otros intentos al confirmar uno', async () => {
    const sb = cliente();
    sb.rpc.mockRejectedValueOnce(new TypeError('desconectado'));
    await expect(guardarOperacionInventario(sb, usuario, 'eliminar_compra', datos)).rejects.toThrow();
    await guardarOperacionInventario(sb, 'otro-usuario', 'eliminar_compra', datos);
    expect(leerIntentoInventario(usuario, 'eliminar_compra')).not.toBeNull();
  });

  it('una respuesta tardía de un doble clic no elimina un intento posterior', async () => {
    const sb = cliente();
    let resolver: ((value: typeof confirmado) => void) | undefined;
    sb.rpc.mockImplementationOnce(() => new Promise(resolve => { resolver = resolve; }));
    const tardio = guardarOperacionInventario(sb, usuario, 'movimiento', { cantidad: 20 });
    await guardarOperacionInventario(sb, usuario, 'movimiento', { cantidad: 20 });
    sb.rpc.mockRejectedValueOnce(new TypeError('desconectado'));
    await expect(guardarOperacionInventario(sb, usuario, 'movimiento', { cantidad: 30 })).rejects.toThrow();
    const siguiente = leerIntentoInventario(usuario, 'movimiento');
    resolver?.(confirmado);
    await tardio;
    expect(leerIntentoInventario(usuario, 'movimiento')).toEqual(siguiente);
  });
});
