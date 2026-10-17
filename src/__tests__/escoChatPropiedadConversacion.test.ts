import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  consultaPropiedadConversacion,
  conversacionPerteneceAUsuario,
} from '../supabase/functions/server/chat-propiedad';

/**
 * ESCO-153: el endpoint web de Esco (`handleChatMessage`) recibía
 * `conversation_id` del cliente y lo usaba con la service role, que se salta
 * la RLS de `chat_conversations`/`chat_messages`. Cualquier Gerencia podía
 * leer el historial de otra conversación y escribir en ella. La puerta ahora
 * vive dentro del handler: la conversación tiene que ser del llamante.
 */

const DUENO = '11111111-1111-4111-8111-111111111111';
const OTRO = '22222222-2222-4222-8222-222222222222';
const CONV = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

/** Simula PostgREST sobre `chat_conversations` aplicando los filtros id/user_id. */
function consultorFalso(filas: Array<{ id: string; user_id: string }>) {
  const llamadas: Array<{ table: string; query: string }> = [];
  const consultar = async (table: string, query: string) => {
    llamadas.push({ table, query });
    const p = new URLSearchParams(query);
    const id = p.get('id')?.replace(/^eq\./, '');
    const user = p.get('user_id')?.replace(/^eq\./, '');
    return filas.filter((f) => f.id === id && f.user_id === user).map((f) => ({ id: f.id }));
  };
  return { consultar, llamadas };
}

describe('conversacionPerteneceAUsuario', () => {
  it('acepta la conversación del propio usuario', async () => {
    const { consultar } = consultorFalso([{ id: CONV, user_id: DUENO }]);
    expect(await conversacionPerteneceAUsuario(CONV, DUENO, consultar)).toBe(true);
  });

  it('rechaza la conversación de otro usuario', async () => {
    const { consultar } = consultorFalso([{ id: CONV, user_id: DUENO }]);
    expect(await conversacionPerteneceAUsuario(CONV, OTRO, consultar)).toBe(false);
  });

  it('rechaza una conversación que no existe', async () => {
    const { consultar } = consultorFalso([]);
    expect(await conversacionPerteneceAUsuario(CONV, DUENO, consultar)).toBe(false);
  });

  it('rechaza un id que no es UUID sin consultar la base (no inyecta filtros PostgREST)', async () => {
    const { consultar, llamadas } = consultorFalso([{ id: CONV, user_id: DUENO }]);
    for (const malo of [`${CONV}&user_id=eq.${OTRO}`, 'or=(id.not.is.null)', 42, null, {}]) {
      expect(await conversacionPerteneceAUsuario(malo, OTRO, consultar)).toBe(false);
    }
    expect(llamadas).toHaveLength(0);
  });

  it('la consulta filtra por id Y por user_id, codificados', () => {
    const q = consultaPropiedadConversacion(CONV, DUENO);
    const p = new URLSearchParams(q);
    expect(p.get('id')).toBe(`eq.${CONV}`);
    expect(p.get('user_id')).toBe(`eq.${DUENO}`);
    expect(p.get('select')).toBe('id');
  });
});

describe('handleChatMessage verifica la propiedad antes de leer o escribir', () => {
  for (const arbol of ['src/supabase/functions/server', 'supabase/functions/make-server-1ccce916']) {
    it(arbol, () => {
      const fuente = readFileSync(resolve(__dirname, '../..', arbol, 'chat.tsx'), 'utf8');
      const inicio = fuente.indexOf('export async function handleChatMessage');
      expect(inicio).toBeGreaterThan(-1);
      const cuerpo = fuente.slice(inicio);
      const chequeo = cuerpo.indexOf('conversacionPerteneceAUsuario(');
      const primerInsertMensaje = cuerpo.indexOf("supabaseInsert('chat_messages'");
      const lecturaHistorial = cuerpo.indexOf("supabaseQuery('chat_messages'");
      // toContain antes del orden: indexOf -1 < n pasaría en vacío.
      expect(cuerpo).toContain('conversacionPerteneceAUsuario(');
      expect(primerInsertMensaje).toBeGreaterThan(-1);
      expect(lecturaHistorial).toBeGreaterThan(-1);
      expect(chequeo).toBeLessThan(primerInsertMensaje);
      expect(chequeo).toBeLessThan(lecturaHistorial);
      expect(cuerpo.slice(chequeo, primerInsertMensaje)).toMatch(/404/);
    });
  }
});
