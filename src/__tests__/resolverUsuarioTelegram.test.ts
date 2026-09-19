/**
 * Lookup de `telegram_usuarios` para atribución Telegram (issue #273).
 *
 * `/pesaje` leía `ctx.telegramUser?.usuario_id`. conversations@2 no lleva
 * ese flavor al replay: Fernando, vinculado, veía "no vinculada".
 * La regla: escrituras y write-gates van por `resolverUsuarioTelegram`.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  atribucionDesdeFilaTelegram,
  exigirUsuarioIdVinculado,
  mensajeResolverUsuarioTelegram,
  resolverUsuarioTelegram,
  type ClienteConsultaTelegram,
  type FilaTelegramAtribucion,
} from '../supabase/functions/server/telegram/resolverUsuarioTelegram';

const RAIZ = resolve(__dirname, '../..');

const COPIAS_HELPER = [
  'src/supabase/functions/server/telegram/resolverUsuarioTelegram.ts',
  'supabase/functions/make-server-1ccce916/telegram/resolverUsuarioTelegram.ts',
];

const ARBOLES_TELEGRAM = [
  'src/supabase/functions/server/telegram',
  'supabase/functions/make-server-1ccce916/telegram',
] as const;

const CONVERSACIONES = [
  'conversations/pesajeLeche.ts',
  'conversations/eventoHato.ts',
  'conversations/jornal.ts',
  'conversations/gasto.ts',
  'conversations/ingreso.ts',
  'conversations/monitoreo.ts',
  'conversations/cierreRonda.ts',
  'conversations/excepcionDavid.ts',
] as const;

const FERNANDO: FilaTelegramAtribucion = {
  id: '0beaa50d-4811-4377-af34-dfc30934eb22',
  usuario_id: '091fde35-0cc3-47b8-9fb8-04337a58e830',
  nombre_display: 'Fernando Jimenez',
};

function leer(ruta: string): string {
  return readFileSync(resolve(RAIZ, ruta), 'utf8');
}

function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

function clienteMock(opts: {
  fila?: FilaTelegramAtribucion | null;
  error?: { message: string } | null;
  visto?: { tabla?: string; columnas?: string; eqs: Array<[string, string | number | boolean]> };
}): ClienteConsultaTelegram {
  const eqs: Array<[string, string | number | boolean]> = [];
  const chain = {
    eq(columna: string, valor: string | number | boolean) {
      eqs.push([columna, valor]);
      return chain;
    },
    async maybeSingle() {
      return { data: opts.fila ?? null, error: opts.error ?? null };
    },
  };
  return {
    from(tabla: string) {
      if (opts.visto) opts.visto.tabla = tabla;
      return {
        select(columnas: string) {
          if (opts.visto) {
            opts.visto.columnas = columnas;
            opts.visto.eqs = eqs;
          }
          return chain;
        },
      };
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('atribucionDesdeFilaTelegram', () => {
  it('copia usuario_id y nombre_display cuando la fila está vinculada', () => {
    expect(atribucionDesdeFilaTelegram(FERNANDO)).toEqual({
      usuarioId: FERNANDO.usuario_id,
      nombreDisplay: FERNANDO.nombre_display,
    });
  });

  it('queda null si no hay fila (cuenta sin vincular)', () => {
    expect(atribucionDesdeFilaTelegram(null)).toEqual({
      usuarioId: null,
      nombreDisplay: null,
    });
  });
});

describe('mensajeResolverUsuarioTelegram', () => {
  it('distingue no registrado, sin usuario_id y fallo de base', () => {
    expect(mensajeResolverUsuarioTelegram('no_registrado')).toContain('No estás registrado');
    expect(mensajeResolverUsuarioTelegram('sin_usuario_id', 'registrar un pesaje')).toContain(
      'no está vinculada a un usuario del sistema',
    );
    expect(mensajeResolverUsuarioTelegram('sin_usuario_id', 'registrar un pesaje')).toContain(
      'antes de registrar un pesaje',
    );
    expect(mensajeResolverUsuarioTelegram('error_db')).toContain('No pude consultar tu cuenta');
    expect(mensajeResolverUsuarioTelegram('sin_telegram_id')).toContain('/start');
  });
});

describe('resolverUsuarioTelegram', () => {
  it('resuelve a Fernando por telegram_id activo', async () => {
    const visto = { eqs: [] as Array<[string, string | number | boolean]> };
    const r = await resolverUsuarioTelegram(
      clienteMock({ fila: FERNANDO, visto }),
      4242,
    );
    expect(r).toEqual({
      ok: true,
      fila: FERNANDO,
      usuarioId: FERNANDO.usuario_id,
      nombreDisplay: FERNANDO.nombre_display,
    });
    expect(visto.tabla).toBe('telegram_usuarios');
    expect(visto.columnas).toContain('usuario_id');
    expect(visto.eqs).toEqual([
      ['telegram_id', 4242],
      ['activo', true],
    ]);
  });

  it('acepta telegram_id como string (JSON del storage de conversaciones)', async () => {
    const r = await resolverUsuarioTelegram(clienteMock({ fila: FERNANDO }), '4242');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.usuarioId).toBe(FERNANDO.usuario_id);
  });

  it('sin telegram_id no toca la base', async () => {
    const from = vi.fn();
    const r = await resolverUsuarioTelegram({ from } as unknown as ClienteConsultaTelegram, null);
    expect(r).toEqual({ ok: false, motivo: 'sin_telegram_id' });
    expect(from).not.toHaveBeenCalled();
  });

  it('fila ausente o inactiva es no_registrado', async () => {
    const r = await resolverUsuarioTelegram(clienteMock({ fila: null }), 1);
    expect(r).toEqual({ ok: false, motivo: 'no_registrado' });
  });

  it('error de PostgREST es error_db', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await resolverUsuarioTelegram(
      clienteMock({ error: { message: 'JWT expired' } }),
      1,
    );
    expect(r).toEqual({ ok: false, motivo: 'error_db' });
  });

  it('fila activa con usuario_id NULL sigue ok -- el desvínculo lo decide exigirUsuarioIdVinculado', async () => {
    const fila = { ...FERNANDO, usuario_id: null };
    const r = await resolverUsuarioTelegram(clienteMock({ fila }), 4242);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.usuarioId).toBeNull();
    expect(exigirUsuarioIdVinculado(r)).toEqual({ ok: false, motivo: 'sin_usuario_id' });
  });
});

describe('exigirUsuarioIdVinculado', () => {
  it('deja pasar a Fernando', () => {
    const r = exigirUsuarioIdVinculado({
      ok: true,
      fila: FERNANDO,
      usuarioId: FERNANDO.usuario_id,
      nombreDisplay: FERNANDO.nombre_display,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.usuarioId).toBe(FERNANDO.usuario_id);
  });

  it('propaga no_registrado y error_db', () => {
    expect(exigirUsuarioIdVinculado({ ok: false, motivo: 'no_registrado' })).toEqual({
      ok: false,
      motivo: 'no_registrado',
    });
    expect(exigirUsuarioIdVinculado({ ok: false, motivo: 'error_db' })).toEqual({
      ok: false,
      motivo: 'error_db',
    });
  });
});

describe('las dos copias del árbol de edge functions están en sync', () => {
  it('resolverUsuarioTelegram.ts es byte-idéntico', () => {
    expect(leer(COPIAS_HELPER[0])).toBe(leer(COPIAS_HELPER[1]));
  });

  for (const rel of [...CONVERSACIONES, 'bot.ts'] as const) {
    it(`${rel} es byte-idéntico`, () => {
      expect(leer(`${ARBOLES_TELEGRAM[0]}/${rel}`)).toBe(leer(`${ARBOLES_TELEGRAM[1]}/${rel}`));
    });
  }
});

describe('regla: nunca ctx.telegramUser.usuario_id en escrituras ni write-gates', () => {
  const USUARIO_ID_DEL_FLAVOR =
    /ctx\.telegramUser\?\.usuario_id|ctx\.telegramUser\.usuario_id/;

  for (const arbol of ARBOLES_TELEGRAM) {
    it(`${arbol}/conversations/pesajeLeche.ts no gatea con ctx.telegramUser.usuario_id`, () => {
      const fuente = sinComentarios(leer(`${arbol}/conversations/pesajeLeche.ts`));
      expect(fuente).toContain('resolverUsuarioTelegram');
      expect(fuente).toContain('conversation.external');
      expect(fuente).toContain('exigirUsuarioIdVinculado');
      expect(fuente).not.toMatch(USUARIO_ID_DEL_FLAVOR);
    });

    for (const rel of CONVERSACIONES) {
      it(`${arbol}/${rel} atribuye vía resolverUsuarioTelegram`, () => {
        const fuente = sinComentarios(leer(`${arbol}/${rel}`));
        expect(fuente).toContain('resolverUsuarioTelegram');
        expect(fuente).not.toMatch(USUARIO_ID_DEL_FLAVOR);
      });
    }

    it(`${arbol}/bot.ts escribe Esco y mem_save vía el helper`, () => {
      const fuente = sinComentarios(leer(`${arbol}/bot.ts`));
      expect(fuente).not.toMatch(USUARIO_ID_DEL_FLAVOR);
      expect(fuente).toContain('resolverUsuarioTelegram');
      expect(fuente).toContain('exigirUsuarioIdVinculado');
      const idxMem = fuente.indexOf('mem_save:');
      expect(idxMem).toBeGreaterThan(-1);
      expect(fuente.slice(idxMem, idxMem + 2500)).toContain('resolverUsuarioTelegram');
      const idxEsco = fuente.lastIndexOf('bot.on("message:text"');
      expect(idxEsco).toBeGreaterThan(-1);
      expect(fuente.slice(idxEsco)).toContain('resolverUsuarioTelegram');
    });
  }
});
