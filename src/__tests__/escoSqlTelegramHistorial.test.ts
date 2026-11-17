import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_HISTORIAL_SQL } from '@/utils/escoSql/loop';
import { construirHistorialSql } from '@/utils/escoSql/historial';
import { historialEscoSql } from '../supabase/functions/server/telegram/escoSqlCliente.ts';

// Historial de Telegram para el motor SQL: mismo contexto que la web en un seguimiento.
// Desde P6 Telegram y web usan el MISMO helper (src/utils/escoSql/historial.ts).

let n = 0;
const fila = (f: Record<string, unknown>) => {
  n += 1;
  return { id: `m${String(n).padStart(4, '0')}`, created_at: new Date(Date.UTC(2026, 10, 1, 0, 0, n)).toISOString(), ...f };
};
const sqlUser = (content: string) => fila({ role: 'user', content, metadata: { motor: 'sql' } });
const sqlAsistente = (content: string, sqls: string[] = []) => fila({
  role: 'assistant',
  content,
  metadata: { motor: 'sql', consultas: sqls.map((sql) => ({ sql, proposito: 'p', filas_muestra: [] })) },
});

describe('historialEscoSql de Telegram', () => {
  it('es el mismo helper que usa la web', () => {
    expect(historialEscoSql).toBe(construirHistorialSql);
  });
});

describe('historialEscoSql', () => {
  it('deja fuera los mensajes de Esco 1.0 aunque sean del usuario', () => {
    const h = historialEscoSql([
      fila({ role: 'user', content: 'Pregunta vieja', metadata: {} }),
      fila({ role: 'assistant', content: 'Respuesta vieja', metadata: { tool_interactions: [] } }),
      fila({ role: 'user', content: 'Pregunta legacy sin metadata' }),
      sqlUser('¿Cuánto gastamos en octubre?'),
      sqlAsistente('Gastaron $95M', ['SELECT sum(valor) FROM v_esco_gastos']),
    ]);
    expect(h.map((m) => m.rol)).toEqual(['user', 'assistant']);
    expect(h[0].texto).toBe('¿Cuánto gastamos en octubre?');
    expect(h[1].texto).toContain('SELECT sum(valor) FROM v_esco_gastos');
  });

  // La pregunta de un turno fallido ya no se filtra aquí: desde P6 el bot guarda el par
  // (pregunta + respuesta) junto, y un turno fallido queda con motor 'sql_error'.
  it('deja fuera un turno marcado sql_error', () => {
    const h = historialEscoSql([
      fila({ role: 'user', content: 'Pregunta que falló', metadata: { motor: 'sql_error' } }),
      fila({ role: 'assistant', content: 'Error', metadata: { motor: 'sql_error' } }),
      sqlUser('Pregunta buena'),
      sqlAsistente('Respuesta buena'),
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
      fila({ role: 'assistant', content: 'R', metadata: { motor: 'sql', consultas: [{ sql: 3 }, null, 'x'] } }),
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
    expect(bot).toContain('.eq("metadata->>motor", "sql")');
    const comando = bot.indexOf('bot.command("esco_nueva"');
    // El fallback de Esco es el ÚLTIMO bot.on("message:text"); los anteriores son de la ronda.
    const fallback = bot.lastIndexOf('bot.on("message:text"');
    expect(comando).toBeGreaterThan(-1);
    expect(comando).toBeLessThan(fallback);
    expect(bot).toContain('{ command: "esco_nueva"');
  });
});
