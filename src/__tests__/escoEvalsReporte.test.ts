import { describe, it, expect } from 'vitest';
import { aMarkdown, calibrar, compararConBase, resumir } from '@/utils/escoEvals/reporte';
import { combinarVeredicto } from '@/utils/escoEvals/veredicto';
import { evaluarDeterminista } from '@/utils/escoEvals/deterministico';
import type { ResultadoJuez, VeredictoHumano } from '@/utils/escoEvals/tipos';
import { casoBase, corridaBase } from './escoEvalsFixtures';

const juezOk: ResultadoJuez = {
  criterios: [{ id: 'debe_1', veredicto: 'cumple', evidencia: '' }],
  contradice_referencia: false, oculto_fallo_herramienta: null, comentario: '',
};

function resultado(id: string, humano: VeredictoHumano, respuesta: string, juez: ResultadoJuez | null = juezOk, extra: { rep?: number; variante?: string; error?: string } = {}) {
  const caso = casoBase({ id, key: id.slice(-3), must: ['algo'], human_review: { verdict: humano, verdict_raw: humano } });
  const corrida = corridaBase(respuesta, [], extra.error ? { error: extra.error } : {});
  return combinarVeredicto({
    caso, corrida, repeticion: extra.rep ?? 1, variante: extra.variante ?? 'principal',
    determinista: evaluarDeterminista(caso, corrida), juez, juezEstado: juez ? 'ok' : 'omitido',
  });
}

describe('combinarVeredicto', () => {
  it('pasa cuando la capa 1 y el juez aprueban', () => {
    expect(resultado('ESCO-GS-001', 'correcta', 'Hace 4 días').estado).toBe('pasa');
  });

  it('una falla determinista es concluyente aunque el juez apruebe', () => {
    const r = resultado('ESCO-GS-002', 'incorrecta', 'No pude generar una respuesta.');
    expect(r.estado).toBe('falla');
    expect(r.razones.join(' ')).toContain('respondio');
  });

  it('el juez puede reprobar una respuesta que pasó la capa 1', () => {
    const juez: ResultadoJuez = { ...juezOk, contradice_referencia: true, comentario: 'cifra falsa' };
    const r = resultado('ESCO-GS-003', 'incorrecta', 'Hace 47 días', juez);
    expect(r.estado).toBe('falla');
    expect(r.razones.join(' ')).toContain('contradice la referencia');
  });

  it('un error de infraestructura es inconcluso, no falla', () => {
    expect(resultado('ESCO-GS-004', 'correcta', '', null, { error: 'Timeout en la llamada al LLM' }).estado).toBe('inconcluso');
  });

  it('sin juez configurado, la capa 1 decide', () => {
    expect(resultado('ESCO-GS-005', 'correcta', 'ok', null).estado).toBe('pasa');
  });

  it('juez roto con capa 1 aprobada → inconcluso', () => {
    const caso = casoBase();
    const corrida = corridaBase('ok');
    const r = combinarVeredicto({ caso, corrida, repeticion: 1, variante: 'principal', determinista: evaluarDeterminista(caso, corrida), juez: null, juezEstado: 'error' });
    expect(r.estado).toBe('inconcluso');
  });
});

describe('resumir', () => {
  const rs = [
    resultado('ESCO-GS-010', 'correcta', 'ok'),
    resultado('ESCO-GS-011', 'incorrecta', 'No pude generar una respuesta.'),
    resultado('ESCO-GS-012', 'incorrecta', 'ok', null, { error: 'red' }),
    resultado('ESCO-GS-013', 'correcta', 'ok', juezOk, { rep: 1 }),
    resultado('ESCO-GS-013', 'correcta', 'No pude generar una respuesta.', juezOk, { rep: 2 }),
  ];
  const s = resumir(rs);

  it('cuenta estados y calcula la tasa solo sobre las concluyentes', () => {
    expect([s.pasa, s.falla, s.inconcluso]).toEqual([2, 2, 1]);
    expect(s.tasa_pasa).toBeCloseTo(0.5);
  });

  it('marca como inestable el caso que pasa y falla con la misma entrada', () => {
    expect(s.casos.find((c) => c.caso_id === 'ESCO-GS-013')?.estado).toBe('inestable');
    expect(s.casos.find((c) => c.caso_id === 'ESCO-GS-011')?.estado).toBe('estable_falla');
    expect(s.casos.find((c) => c.caso_id === 'ESCO-GS-012')?.estado).toBe('inconcluso');
  });

  it('agrupa los motivos de falla', () => {
    expect(s.motivos[0]).toEqual({ motivo: 'respondio', n: 2 });
  });

  it('avisa cuando no hubo juez', () => {
    const solo = resumir([resultado('ESCO-GS-020', 'correcta', 'ok', null)]);
    expect(solo.solo_determinista).toBe(true);
    expect(aMarkdown(solo, { fecha: 'x', modo: 'live', conjunto: 'g', modelo_juez: null, modo_fecha: 'caso', repeticiones: 1 })).toContain('solo capa determinista');
  });

  it('does not call a case stable when a repetition has an infrastructure error', () => {
    const s = resumir([
      resultado('ESCO-GS-020', 'correcta', 'ok'),
      resultado('ESCO-GS-020', 'correcta', '', null, { rep: 2, error: 'network unavailable' }),
    ]);
    expect(s.casos[0].estado).toBe('inconcluso');
    expect(aMarkdown(s, { fecha: 'x', modo: 'live', conjunto: 'g', modelo_juez: null, modo_fecha: 'caso', repeticiones: 2 })).toContain('1/2 inconclusas');
  });
});

describe('compararConBase', () => {
  it('detecta regresiones, mejoras, casos nuevos y faltantes', () => {
    const base = resumir([resultado('ESCO-GS-030', 'correcta', 'ok'), resultado('ESCO-GS-031', 'incorrecta', 'No pude generar una respuesta.'), resultado('ESCO-GS-032', 'correcta', 'ok')]);
    const actual = resumir([resultado('ESCO-GS-030', 'correcta', 'No pude generar una respuesta.'), resultado('ESCO-GS-031', 'incorrecta', 'ok'), resultado('ESCO-GS-033', 'correcta', 'ok')]);
    expect(compararConBase(base, actual)).toEqual({
      regresiones: ['ESCO-GS-030'], mejoras: ['ESCO-GS-031'], nuevos: ['ESCO-GS-033'], faltantes: ['ESCO-GS-032'],
    });
  });
});

describe('calibrar', () => {
  it('compara contra el veredicto del dueño y reporta falsos negativos', () => {
    const rs = [
      resultado('ESCO-GS-040', 'incorrecta', 'No pude generar una respuesta.'), // VP
      resultado('ESCO-GS-041', 'incorrecta', 'ok'), // FN: el arnés lo deja pasar
      resultado('ESCO-GS-042', 'correcta', 'ok'), // VN
      resultado('ESCO-GS-043', 'correcta', 'No pude generar una respuesta.'), // FP
      resultado('ESCO-GS-044', 'mixta', 'ok'), // omitido
      resultado('ESCO-GS-045', 'incorrecta', 'ok', juezOk, { variante: 'origen_multiple' }), // omitido
    ];
    const c = calibrar(rs);
    expect(c).toMatchObject({ n: 4, verdaderos_positivos: 1, falsos_negativos: 1, verdaderos_negativos: 1, falsos_positivos: 1, omitidos: 2 });
    expect(c.acuerdo).toBeCloseTo(0.5);
    expect(c.recall_fallas).toBeCloseTo(0.5);
    expect(c.discrepancias.map((d) => d.caso_id).sort()).toEqual(['ESCO-GS-041', 'ESCO-GS-043']);
  });
});
