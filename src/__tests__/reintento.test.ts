import { describe, it, expect, vi } from 'vitest';
import {
  INTENTOS_POR_DEFECTO,
  BACKOFF_MS_POR_DEFECTO,
  esStatusReintentable,
  esErrorRed,
  esErrorPostgrestReintentable,
  conReintento,
} from '../supabase/functions/server/reintento';

describe('esStatusReintentable', () => {
  it('acepta 5xx y rechaza el resto', () => {
    expect(esStatusReintentable(500)).toBe(true);
    expect(esStatusReintentable(502)).toBe(true);
    expect(esStatusReintentable(504)).toBe(true);
    expect(esStatusReintentable(599)).toBe(true);
    expect(esStatusReintentable(200)).toBe(false);
    expect(esStatusReintentable(400)).toBe(false);
    expect(esStatusReintentable(401)).toBe(false);
    expect(esStatusReintentable(404)).toBe(false);
    expect(esStatusReintentable(409)).toBe(false);
    expect(esStatusReintentable(422)).toBe(false);
    expect(esStatusReintentable(600)).toBe(false);
  });
});

describe('esErrorRed', () => {
  it('acepta TypeError y mensajes de red/timeout', () => {
    expect(esErrorRed(new TypeError('Failed to fetch'))).toBe(true);
    expect(esErrorRed(new Error('network error'))).toBe(true);
    expect(esErrorRed(new Error('Timeout of 5000 ms reached'))).toBe(true);
    expect(esErrorRed(new Error('ECONNRESET'))).toBe(true);
  });

  it('rechaza errores de negocio', () => {
    expect(esErrorRed(new Error('column does not exist'))).toBe(false);
    expect(esErrorRed(new Error('JWT expired'))).toBe(false);
    expect(esErrorRed('string suelta')).toBe(false);
    expect(esErrorRed(null)).toBe(false);
  });
});

describe('esErrorPostgrestReintentable', () => {
  it('acepta 504 por status o por el texto que PostgREST sí manda', () => {
    expect(esErrorPostgrestReintentable({ status: 504, message: 'x' })).toBe(true);
    expect(esErrorPostgrestReintentable({ message: 'Gateway Timeout' })).toBe(true);
    expect(esErrorPostgrestReintentable({ message: 'Warp server error: Thread killed by timeout manager' })).toBe(
      true,
    );
    expect(esErrorPostgrestReintentable({ code: '502' })).toBe(true);
  });

  it('rechaza 4xx y errores de esquema', () => {
    expect(esErrorPostgrestReintentable(null)).toBe(false);
    expect(esErrorPostgrestReintentable(undefined)).toBe(false);
    expect(esErrorPostgrestReintentable({ status: 400, message: 'bad request' })).toBe(false);
    expect(esErrorPostgrestReintentable({ message: 'column clima_lecturas.foo does not exist' })).toBe(false);
    expect(esErrorPostgrestReintentable({ code: 'PGRST204', message: 'Could not find the column' })).toBe(false);
  });
});

describe('conReintento', () => {
  it('devuelve el primer valor que no es reintentable', async () => {
    const accion = vi.fn().mockResolvedValue({ ok: true });
    const valor = await conReintento(accion, {
      esValorReintentable: (r: { ok: boolean }) => !r.ok,
      esperar: async () => undefined,
    });
    expect(valor).toEqual({ ok: true });
    expect(accion).toHaveBeenCalledTimes(1);
  });

  it('reintenta un 504 y se queda con el segundo 200 (2 intentos)', async () => {
    const accion = vi
      .fn()
      .mockResolvedValueOnce({ status: 504 })
      .mockResolvedValueOnce({ status: 200 });
    const esperas: number[] = [];
    const valor = await conReintento(accion, {
      esValorReintentable: (r: { status: number }) => esStatusReintentable(r.status),
      esperar: async (ms) => {
        esperas.push(ms);
      },
    });
    expect(valor).toEqual({ status: 200 });
    expect(accion).toHaveBeenCalledTimes(2);
    expect(esperas).toEqual([BACKOFF_MS_POR_DEFECTO]);
  });

  it('NO reintenta un 400 — el caller ve el 4xx del primer intento', async () => {
    const accion = vi.fn().mockResolvedValue({ status: 400 });
    const valor = await conReintento(accion, {
      esValorReintentable: (r: { status: number }) => esStatusReintentable(r.status),
      esperar: async () => {
        throw new Error('no debería esperar en un 4xx');
      },
    });
    expect(valor).toEqual({ status: 400 });
    expect(accion).toHaveBeenCalledTimes(1);
  });

  it('en el último intento devuelve el 504 — no inventa un éxito', async () => {
    const accion = vi.fn().mockResolvedValue({ status: 504 });
    const valor = await conReintento(accion, {
      esValorReintentable: (r: { status: number }) => esStatusReintentable(r.status),
      esperar: async () => undefined,
    });
    expect(valor).toEqual({ status: 504 });
    expect(accion).toHaveBeenCalledTimes(INTENTOS_POR_DEFECTO);
  });

  it('reintenta un TypeError de red y luego el valor bueno', async () => {
    const accion = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ status: 201 });
    const valor = await conReintento(accion, {
      esValorReintentable: (r: { status: number }) => esStatusReintentable(r.status),
      esperar: async () => undefined,
    });
    expect(valor).toEqual({ status: 201 });
    expect(accion).toHaveBeenCalledTimes(2);
  });

  it('NO reintenta un Error de negocio — lo lanza en el primer intento', async () => {
    const accion = vi.fn().mockRejectedValue(new Error('column does not exist'));
    await expect(
      conReintento(accion, {
        esperar: async () => {
          throw new Error('no debería esperar');
        },
      }),
    ).rejects.toThrow(/column does not exist/);
    expect(accion).toHaveBeenCalledTimes(1);
  });

  it('en el último intento relanza el TypeError de red', async () => {
    const accion = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      conReintento(accion, { esperar: async () => undefined }),
    ).rejects.toBeInstanceOf(TypeError);
    expect(accion).toHaveBeenCalledTimes(INTENTOS_POR_DEFECTO);
  });

  it('respeta intentos=3 y backoff lineal (400, 800)', async () => {
    const accion = vi
      .fn()
      .mockResolvedValueOnce({ status: 504 })
      .mockResolvedValueOnce({ status: 502 })
      .mockResolvedValueOnce({ status: 200 });
    const esperas: number[] = [];
    const valor = await conReintento(accion, {
      intentos: 3,
      esValorReintentable: (r: { status: number }) => esStatusReintentable(r.status),
      esperar: async (ms) => {
        esperas.push(ms);
      },
    });
    expect(valor).toEqual({ status: 200 });
    expect(accion).toHaveBeenCalledTimes(3);
    expect(esperas).toEqual([400, 800]);
  });
});
