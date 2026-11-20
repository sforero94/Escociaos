import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  procesarUpdateTelegram,
  describirErrorWebhook,
} from '../supabase/functions/server/telegram/webhookRespuesta';

/**
 * ESCO-182 — un update que falla no puede bloquear la cola del webhook.
 *
 * 2026-11-17 22:14Z → 11-18 22:13Z: un chat sin fila en `telegram_usuarios`
 * mandó un update que no era /start. El middleware de auth hizo
 * `await ctx.reply(...)` sin try/catch, la llamada falló, `handleWebhook`
 * devolvió 500 y Telegram reenvió el MISMO update durante ~24 h (~943 × 500,
 * 0 × 200): mientras un update no recibe 2xx, Telegram no entrega los
 * siguientes. El bot quedó mudo para todos.
 *
 * Contrato: un fallo AL PROCESAR un update responde 200 (el update se da por
 * entregado) y queda en el log con clase y mensaje. El 401/503 del secreto
 * compartido NO cambia: eso es autenticación, no procesamiento.
 *
 * `telegram/bot.ts` importa `npm:grammy` y sólo resuelve bajo Deno, así que
 * la decisión vive en un helper puro y el cableado se vigila estáticamente.
 */

const RAIZ = join(__dirname, '..', '..');
const COPIAS_BOT = [
  'supabase/functions/make-server-1ccce916/telegram/bot.ts',
  'src/supabase/functions/server/telegram/bot.ts',
];
const COPIAS_HELPER = [
  'supabase/functions/make-server-1ccce916/telegram/webhookRespuesta.ts',
  'src/supabase/functions/server/telegram/webhookRespuesta.ts',
];

function leer(ruta: string): string {
  return readFileSync(join(RAIZ, ruta), 'utf8');
}

function extraerHandleWebhook(fuente: string): string {
  const inicio = fuente.indexOf('export async function handleWebhook');
  expect(inicio).toBeGreaterThan(-1);
  const fin = fuente.indexOf('\n}', inicio);
  return fuente.slice(inicio, fin + 2);
}

describe('procesarUpdateTelegram', () => {
  it('responde 200 cuando el handler lanza (el reply falló)', async () => {
    const log = vi.fn();
    const r = await procesarUpdateTelegram(async () => {
      throw new Error("Call to 'sendMessage' failed! (403: Forbidden: bot was blocked by the user)");
    }, log);
    expect(r).toEqual({ estado: 200, cuerpo: { ok: true } });
    expect(log).toHaveBeenCalledTimes(1);
    const linea = String(log.mock.calls[0][0]);
    expect(linea).toContain('clase=Error');
    // El mensaje nunca va al log: puede traer datos del chat.
    expect(linea).not.toContain('blocked by the user');
  });

  it('responde 200 sin log cuando el handler termina bien', async () => {
    const log = vi.fn();
    const r = await procesarUpdateTelegram(async () => {}, log);
    expect(r).toEqual({ estado: 200, cuerpo: { ok: true } });
    expect(log).not.toHaveBeenCalled();
  });

  it('también responde 200 si lo que se lanza no es un Error', async () => {
    const log = vi.fn();
    const r = await procesarUpdateTelegram(async () => {
      throw 'texto suelto';
    }, log);
    expect(r.estado).toBe(200);
    expect(log).toHaveBeenCalledTimes(1);
  });
});

describe('describirErrorWebhook', () => {
  it('da clase, causa envuelta y código, sin el mensaje', () => {
    class GrammyError extends Error {
      error_code = 403;
      constructor(m: string) {
        super(m);
        this.name = 'GrammyError';
      }
    }
    class BotError extends Error {
      constructor(public error: unknown) {
        super('wrapped');
        this.name = 'BotError';
      }
    }
    const d = describirErrorWebhook(new BotError(new GrammyError('Forbidden: SECRETO_DEL_CHAT')));
    expect(d).toEqual({ clase: 'BotError', causa: 'GrammyError', codigo: 403 });
    expect(JSON.stringify(d)).not.toContain('SECRETO_DEL_CHAT');
  });

  it('un error sin causa ni código', () => {
    expect(describirErrorWebhook(new TypeError('x'))).toEqual({ clase: 'TypeError', causa: null, codigo: null });
    expect(describirErrorWebhook('texto')).toEqual({ clase: 'string', causa: null, codigo: null });
  });
});

describe('cableado en bot.ts (las dos copias)', () => {
  for (const copia of COPIAS_BOT) {
    it(`${copia}: un fallo al procesar nunca devuelve 500`, () => {
      const cuerpo = extraerHandleWebhook(leer(copia));
      expect(cuerpo).toContain('procesarUpdateTelegram(');
      expect(cuerpo).not.toMatch(/,\s*500\s*\)/);
      expect(cuerpo).not.toContain('WEBHOOK_PROCESSING_FAILED');
      // El gate del secreto sigue antes del procesamiento.
      expect(cuerpo.indexOf('401')).toBeLessThan(cuerpo.indexOf('procesarUpdateTelegram('));
    });

    it(`${copia}: el aviso a un chat no registrado no puede lanzar`, () => {
      const fuente = leer(copia);
      const pos = fuente.indexOf('No estás registrado. Pide un código');
      expect(pos).toBeGreaterThan(-1);
      const antes = fuente.slice(Math.max(0, pos - 600), pos);
      // Sin mensaje (my_chat_member, callback, etc.) no se contesta.
      expect(antes).toMatch(/if \(!ctx\.message\) return;/);
      // El reply va dentro de un try.
      expect(antes.lastIndexOf('try {')).toBeGreaterThan(antes.lastIndexOf('if (!user && !isStart)'));
    });
  }

  it('las dos copias del helper y del bot son byte-idénticas', () => {
    expect(leer(COPIAS_HELPER[0])).toBe(leer(COPIAS_HELPER[1]));
    expect(leer(COPIAS_BOT[0])).toBe(leer(COPIAS_BOT[1]));
  });
});
