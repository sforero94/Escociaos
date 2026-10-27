import { describe, it, expect, vi } from 'vitest';
import {
  construirMensajesJuez, criteriosDelCaso, llamarJuez, parsearRespuestaJuez, razonesDelJuez,
} from '@/utils/escoEvals/juez';
import { casoBase, corridaBase, herramienta } from './escoEvalsFixtures';

const caso = casoBase({
  must: ['Dice la fecha de la última lluvia (12 de agosto)'],
  must_not: ['Decir «47 días sin lluvia»'],
  reference: { type: 'sql', sql: 'select max(fecha) from clima_resumen_diario', frozen_result: { ultima: '2026-08-12' }, frozen_on: '2026-10-22', replayable_as_of: false, replay_note: 'El 13-ago se reparó después' },
  expected_behavior: { tools_must_include: [], tools_any_of: [], tools_forbidden: [], max_tool_calls: null, note: 'Usar clima_resumen_diario', should_clarify: true },
});

describe('criteriosDelCaso', () => {
  it('numera los «debe» y los «no debe» por separado', () => {
    expect(criteriosDelCaso(caso).map((c) => c.id)).toEqual(['debe_1', 'no_debe_1']);
  });
});

describe('construirMensajesJuez', () => {
  const mensajes = construirMensajesJuez(caso, corridaBase('Hace 4 días', [herramienta('get_climate_data', { error: true, result_summary: '{"error":"x"}' })]));

  it('lleva la referencia, los criterios, las herramientas y la respuesta', () => {
    const u = mensajes[1].content;
    expect(u).toContain('2026-08-12');
    expect(u).toContain('debe_1 (DEBE)');
    expect(u).toContain('no_debe_1 (NO DEBE)');
    expect(u).toContain('get_climate_data');
    expect(u).toContain('[ERROR]');
    expect(u).toContain('Hace 4 días');
    expect(u).toContain('select max(fecha)');
  });

  it('avisa que la base cambió y que el caso exige aclarar', () => {
    const u = mensajes[1].content;
    expect(u).toContain('El 13-ago se reparó después');
    expect(u).toContain('EXIGE que Esco aclare');
  });

  it('NO incluye el veredicto del dueño ni la respuesta original', () => {
    const u = mensajes[1].content;
    expect(u).not.toContain('incorrecto');
    expect(u).not.toContain('answer_primary');
  });

  it('el prompt de sistema fija que la verdad es la referencia', () => {
    expect(mensajes[0].content).toContain('La verdad es SOLO la referencia');
  });

  it('keeps the complete answer and SQL that starts with a comment', () => {
    const respuesta = 'a'.repeat(6500) + ' FALSE_CLAIM_AT_END';
    const c = { ...caso, reference: { ...caso.reference, sql: '-- reference query\nselect 1;' } };
    const u = construirMensajesJuez(c, corridaBase(respuesta))[1].content;
    expect(u).toContain('FALSE_CLAIM_AT_END');
    expect(u).toContain('select 1;');
  });
});

describe('parsearRespuestaJuez', () => {
  const criterios = criteriosDelCaso(caso);
  const valida = JSON.stringify({
    criterios: [
      { id: 'debe_1', veredicto: 'cumple', evidencia: '12 de agosto' },
      { id: 'no_debe_1', veredicto: 'no_viola', evidencia: '(ausente)' },
    ],
    contradice_referencia: false, oculto_fallo_herramienta: true, comentario: 'ok',
  });

  it('acepta JSON válido, incluso envuelto en ```json', () => {
    expect(parsearRespuestaJuez(valida, criterios).oculto_fallo_herramienta).toBe(true);
    expect(parsearRespuestaJuez('```json\n' + valida + '\n```', criterios).criterios).toHaveLength(2);
  });

  it('rechaza un criterio sin calificar o con veredicto del tipo equivocado', () => {
    const falta = JSON.stringify({ criterios: [{ id: 'debe_1', veredicto: 'cumple', evidencia: '(ausente)' }] });
    expect(() => parsearRespuestaJuez(falta, criterios)).toThrow(/no_debe_1/);
    const malTipo = JSON.stringify({ criterios: [
      { id: 'debe_1', veredicto: 'viola' }, { id: 'no_debe_1', veredicto: 'no_viola' },
    ] });
    expect(() => parsearRespuestaJuez(malTipo, criterios)).toThrow(/inválido/);
  });

  it('lanza si no hay JSON', () => {
    expect(() => parsearRespuestaJuez('no sé', criterios)).toThrow();
  });

  it('rejects missing or malformed flags instead of treating them as approval', () => {
    const base = JSON.parse(valida);
    for (const patch of [
      { contradice_referencia: undefined }, { contradice_referencia: 'false' },
      { oculto_fallo_herramienta: undefined }, { oculto_fallo_herramienta: 'true' },
      { comentario: null },
    ]) expect(() => parsearRespuestaJuez(JSON.stringify({ ...base, ...patch }), criterios)).toThrow();
    expect(() => parsearRespuestaJuez('null', criterios)).toThrow();
    expect(() => parsearRespuestaJuez('[]', criterios)).toThrow();
  });

  it('rejects duplicate, unknown and malformed criteria', () => {
    const base = JSON.parse(valida);
    for (const extra of [base.criterios[0], { id: 'unknown' }, null]) {
      expect(() => parsearRespuestaJuez(JSON.stringify({ ...base, criterios: [...base.criterios, extra] }), criterios)).toThrow();
    }
  });
});

describe('razonesDelJuez', () => {
  const criterios = criteriosDelCaso(caso);
  it('lista no_cumple, viola, contradicción y fallo oculto; no_aplica no cuenta', () => {
    const razones = razonesDelJuez({
      criterios: [
        { id: 'debe_1', veredicto: 'no_cumple', evidencia: '(ausente)' },
        { id: 'no_debe_1', veredicto: 'viola', evidencia: '47 días' },
      ],
      contradice_referencia: true, oculto_fallo_herramienta: true, comentario: 'cifra falsa',
    }, criterios);
    expect(razones).toHaveLength(4);
    expect(razonesDelJuez({
      criterios: [{ id: 'debe_1', veredicto: 'no_aplica', evidencia: '' }, { id: 'no_debe_1', veredicto: 'no_viola', evidencia: '' }],
      contradice_referencia: false, oculto_fallo_herramienta: null, comentario: '',
    }, criterios)).toEqual([]);
  });
});

describe('llamarJuez', () => {
  it('envía temperatura 0, modelo y clave; devuelve texto y tokens', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"criterios":[]}' } }], usage: { prompt_tokens: 100, completion_tokens: 20 },
    }), { status: 200 })) as unknown as typeof fetch;
    const r = await llamarJuez([{ role: 'user', content: 'x' }], { baseUrl: 'https://x.test/api/v1/', apiKey: 'k', modelo: 'm', fetchImpl });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x.test/api/v1/chat/completions');
    expect(JSON.parse(String(init.body))).toMatchObject({ model: 'm', temperature: 0 });
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
    expect(r.tokens).toEqual({ entrada: 100, salida: 20 });
  });

  it('lanza si el HTTP no es 2xx', async () => {
    const fetchImpl = (async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
    await expect(llamarJuez([], { baseUrl: 'https://x.test', apiKey: 'k', modelo: 'm', fetchImpl })).rejects.toThrow(/500/);
  });
});
