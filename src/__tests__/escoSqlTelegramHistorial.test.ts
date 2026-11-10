import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_HISTORIAL_SQL, textoHistorialSql } from '@/utils/escoSql/loop';
import {
  historialEscoSql,
  textoHistorialTelegramSql,
} from '../supabase/functions/server/telegram/escoSqlCliente.ts';

// Historial de Telegram para el motor SQL: mismo contexto que la web en un seguimiento.

const sqlUser = (content: string) => ({ role: 'user', content, metadata: { motor: 'sql' } });
const sqlAsistente = (content: string, sqls: string[] = []) => ({
  role: 'assistant',
  content,
  metadata: { motor: 'sql', consultas: sqls.map((sql) => ({ sql, proposito: 'p', filas_muestra: [] })) },
});

describe('textoHistorialTelegramSql', () => {
  it('es idéntico a textoHistorialSql del motor web', () => {
    const largo = 'x'.repeat(3990);
    const casos: [string, { sql: string }[]][] = [
      ['Sin consultas', []],
      ['Una consulta', [{ sql: 'SELECT 1' }]],
      ['Dos consultas', [{ sql: 'SELECT 1' }, { sql: 'SELECT 2' }]],
      [largo, [{ sql: 'SELECT * FROM v_esco_gastos' }]],
      ['Bloque enorme', [{ sql: 'SELECT '.padEnd(3950, 'y') }]],
      [largo, []],
    ];
    for (const [respuesta, consultas] of casos) {
      expect(textoHistorialTelegramSql(respuesta, consultas)).toBe(textoHistorialSql(respuesta, consultas));
    }
  });
});

describe('historialEscoSql', () => {
  it('deja fuera los mensajes de Esco 1.0 aunque sean del usuario', () => {
    const h = historialEscoSql([
      { role: 'user', content: 'Pregunta vieja', metadata: {} },
      { role: 'assistant', content: 'Respuesta vieja', metadata: { tool_interactions: [] } },
      { role: 'user', content: 'Pregunta legacy sin metadata' },
      sqlUser('¿Cuánto gastamos en octubre?'),
      sqlAsistente('Gastaron $95M', ['SELECT sum(valor) FROM v_esco_gastos']),
    ]);
    expect(h.map((m) => m.rol)).toEqual(['user', 'assistant']);
    expect(h[0].texto).toBe('¿Cuánto gastamos en octubre?');
    expect(h[1].texto).toContain('SELECT sum(valor) FROM v_esco_gastos');
  });

  it('descarta la pregunta de un turno que falló y no guardó respuesta', () => {
    const h = historialEscoSql([
      sqlUser('Pregunta que falló'),
      sqlUser('Pregunta buena'),
      sqlAsistente('Respuesta buena'),
      sqlUser('Pregunta en vuelo'),
    ]);
    expect(h).toEqual([
      { rol: 'user', texto: 'Pregunta buena' },
      { rol: 'assistant', texto: 'Respuesta buena' },
    ]);
  });

  it('guarda como máximo los últimos pares que el motor acepta, siempre completos', () => {
    const filas = Array.from({ length: 8 }, (_, i) => [sqlUser(`P${i}`), sqlAsistente(`R${i}`)]).flat();
    const h = historialEscoSql(filas);
    expect(h).toHaveLength(MAX_HISTORIAL_SQL);
    expect(h[0]).toEqual({ rol: 'user', texto: 'P3' });
    expect(h.at(-1)).toEqual({ rol: 'assistant', texto: 'R7' });
  });

  it('ignora consultas malformadas en la metadata en vez de inventar SQL', () => {
    const h = historialEscoSql([
      sqlUser('P'),
      { role: 'assistant', content: 'R', metadata: { motor: 'sql', consultas: [{ sql: 3 }, null, 'x'] } },
    ]);
    expect(h[1].texto).toBe('R');
  });
});

describe('bot de Telegram (los dos árboles)', () => {
  const arboles = [
    'supabase/functions/make-server-1ccce916/telegram',
    'src/supabase/functions/server/telegram',
  ];
  const leer = (arbol: string, archivo: string) => readFileSync(resolve(process.cwd(), arbol, archivo), 'utf8');

  it('los dos árboles quedan idénticos en los archivos tocados', () => {
    for (const archivo of ['bot.ts', 'escoSqlCliente.ts']) {
      expect(leer(arboles[0], archivo)).toBe(leer(arboles[1], archivo));
    }
  });

  it('lee de la base solo filas SQL y registra /esco_nueva antes del fallback de texto', () => {
    const bot = leer(arboles[0], 'bot.ts');
    expect(bot).toContain('.contains("metadata", { motor: "sql" })');
    const comando = bot.indexOf('bot.command("esco_nueva"');
    const fallback = bot.indexOf('bot.on("message:text"');
    expect(comando).toBeGreaterThan(-1);
    expect(comando).toBeLessThan(fallback);
    expect(bot).toContain('{ command: "esco_nueva"');
  });
});
