import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  AJUSTES_TELEGRAM, ENCABEZADO_CONTEXTO_TELEGRAM, ENCABEZADO_CONTEXTO_WEB, asOfUtc,
  mensajesIniciales, mensajesParaSiguienteTurno,
} from '@/utils/escoEvals/mensajes';
import { ejecutarConsultaEsco, resumirContexto } from '@/utils/escoConsultas';
import { leerEvidencia } from '@/utils/escoEvidencia';
import { casoBase, herramienta } from './escoEvalsFixtures';

const fuente = (ruta: string) => readFileSync(resolve(__dirname, ruta), 'utf8');

describe('el arnés replica lo que arman los canales de producción', () => {
  it('los ajustes de Telegram son los de telegram/bot.ts (ambos árboles)', () => {
    const lineas = AJUSTES_TELEGRAM.trim().split('. ').map((s) => s.replace(/\.$/, ''));
    for (const arbol of ['../supabase/functions/server/telegram/bot.ts', '../../supabase/functions/make-server-1ccce916/telegram/bot.ts']) {
      const bot = fuente(arbol);
      for (const frase of lineas) expect(bot, `${arbol}: «${frase}»`).toContain(frase);
    }
  });

  it('los encabezados del contexto de herramientas existen en chat.tsx y bot.ts', () => {
    expect(fuente('../supabase/functions/server/chat.tsx')).toContain(ENCABEZADO_CONTEXTO_WEB);
    expect(fuente('../supabase/functions/server/telegram/bot.ts')).toContain(ENCABEZADO_CONTEXTO_TELEGRAM);
  });

  it('la ronda 0 de llmToolLoop sigue forzando tool_choice «required» (supuesto del caso de saludos)', () => {
    expect(fuente('../supabase/functions/server/chat.tsx')).toContain("round === 0 ? (consultaPartosObligatoria ? { type: 'function', function: { name: 'get_hato_partos' } } : 'required') : 'auto'");
  });
});

describe('mensajesIniciales', () => {
  const caso = casoBase({ channel: 'Telegram', prior_context: [{ rn: 1, user: 'hola', assistant_original: 'buenas' }] });

  it('agrega los ajustes de Telegram solo en ese canal', () => {
    expect(mensajesIniciales(caso, 'BASE', 'p')[0].content).toBe('BASE' + AJUSTES_TELEGRAM);
    expect(mensajesIniciales({ ...caso, channel: 'Web' }, 'BASE', 'p')[0].content).toBe('BASE');
  });

  it('pone el contexto previo (con la respuesta original) antes de la pregunta', () => {
    const m = mensajesIniciales(caso, 'BASE', 'p');
    expect(m.map((x) => x.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(m[2].content).toBe('buenas');
    expect(m[3].content).toBe('p');
  });
});

describe('mensajesParaSiguienteTurno', () => {
  const previos = [
    { role: 'system', content: 'S' }, { role: 'user', content: 'q1' },
    { role: 'assistant', content: null, tool_calls: [{ id: '1' }] },
    { role: 'tool', content: '{"x":1}', tool_call_id: '1' },
  ];

  it('descarta tool_calls y mensajes tool; agrega el contexto de datos, la respuesta y la nueva pregunta', () => {
    const m = mensajesParaSiguienteTurno(previos, 'r1', [herramienta('get_climate_data', { args: { a: 1 }, result_summary: 'RES' })], 'q2', 'Web');
    expect(m.map((x) => x.role)).toEqual(['system', 'user', 'system', 'assistant', 'user']);
    expect(m[2].content).toContain(ENCABEZADO_CONTEXTO_WEB);
    expect(m[2].content).toContain('[get_climate_data({"a":1}): RES]');
    expect(m[3].content).toBe('r1');
    expect(m[4].content).toBe('q2');
  });

  it('en Telegram usa el encabezado corto; sin herramientas no agrega contexto', () => {
    expect(mensajesParaSiguienteTurno(previos, 'r', [herramienta('x')], 'q', 'Telegram')[2].content).toContain(ENCABEZADO_CONTEXTO_TELEGRAM);
    expect(mensajesParaSiguienteTurno(previos, 'r', [], 'q', 'Web').map((x) => x.role)).toEqual(['system', 'user', 'assistant', 'user']);
  });
});

describe('asOfUtc', () => {
  it('convierte hora de Bogotá (UTC-5) a UTC, cruzando el día', () => {
    expect(asOfUtc('2026-08-16 17:01')).toBe('2026-08-16T22:01:00.000Z');
    expect(asOfUtc('2026-08-28 21:25')).toBe('2026-08-29T02:25:00.000Z');
  });
  it('rechaza un formato inválido', () => {
    expect(() => asOfUtc('ayer')).toThrow();
  });
});


describe('typed persisted context compatibility (synthetic)', () => {
  it.each(['Web', 'Telegram'] as const)('preserves scoped producer metadata for %s follow-ups', async channel => {
    const result = await ejecutarConsultaEsco('get_hato_animales', {}, async table =>
      table === 'hato_animales' ? [{ id: 'synthetic-animal', nombre: 'SYNTHETIC', numero: 1 }] : []);
    const summary = resumirContexto(JSON.stringify(result));
    const messages = mensajesParaSiguienteTurno([{ role: 'system', content: 'S' }], 'r1',
      [herramienta('get_hato_animales', { result_summary: summary })], 'q2', channel);
    expect(messages[1].content).toContain(summary);
    const metadata = leerEvidencia(JSON.parse(summary));
    expect(metadata).toMatchObject({ complete: true, source_refs: [{ table: 'hato_animales', id: 'synthetic-animal' }] });
    const truncated = resumirContexto(JSON.stringify(result), 1);
    const followup = mensajesParaSiguienteTurno([{ role: 'system', content: 'S' }], 'r1',
      [herramienta('get_hato_animales', { result_summary: truncated })], 'q2', channel);
    expect(followup[1].content).toContain(truncated);
    expect(leerEvidencia(JSON.parse(truncated))).toMatchObject({ complete: false, outcome: 'partial',
      source_refs: metadata.source_refs, scope: metadata.scope });
  });
});
