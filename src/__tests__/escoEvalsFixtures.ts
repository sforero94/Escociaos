// Fábricas de casos y corridas para las pruebas del arnés de evaluación de Esco.
import type { CasoDorado, CorridaEjecutada, HerramientaLlamada } from '@/utils/escoEvals/tipos';

export function casoBase(parcial: Partial<CasoDorado> = {}): CasoDorado {
  return {
    id: 'ESCO-GS-900', key: 'T01', title: 'Caso de prueba', domain: 'clima', kind: 'factual_sql',
    channel: 'Web', channels_observed: ['Web'], as_of_bogota: '2026-08-16 17:01',
    question: '¿Hace cuánto no llueve?', paraphrases: [], followup_turns: [], prior_context: [],
    expected_behavior: { tools_must_include: [], tools_any_of: [], tools_forbidden: [], max_tool_calls: null },
    reference: { type: 'sql', sql: 'select 1', frozen_result: { ultima: '2026-08-12' }, frozen_on: '2026-10-22', replayable_as_of: true },
    numeric_anchors: [], must: [], must_not: [],
    original: { verdict: 'wrong', issues: [], runs: [], answer_primary: '' },
    tags: [], human_review: { verdict: 'incorrecta', verdict_raw: 'incorrecto' },
    include_in_golden: true, golden_status: 'aprobado',
    ...parcial,
  };
}

export function herramienta(tool: string, extra: Partial<HerramientaLlamada> = {}): HerramientaLlamada {
  return { tool, args: {}, result_summary: '{}', error: false, ...extra };
}

export function corridaBase(respuesta: string, herramientas: HerramientaLlamada[] = [], parcial: Partial<CorridaEjecutada> = {}): CorridaEjecutada {
  return {
    modo: 'live', asOf: null, escriturasBloqueadas: [],
    turnos: [{ pregunta: '¿?', respuesta, herramientas }],
    ...parcial,
  };
}

/** Misma conversión que evals/esco/lib/ejecutor.ts → corridaDesdeOriginal, para probar el puntaje sin Vitest-Deno. */
export function corridaDesdeOriginalPura(caso: CasoDorado): CorridaEjecutada {
  const origen = caso.original.runs[0];
  return {
    modo: 'originales', asOf: null, escriturasBloqueadas: [],
    turnos: [{
      pregunta: origen?.question ?? caso.question,
      respuesta: caso.original.answer_primary,
      herramientas: (origen?.tools ?? []).map((t) => ({ tool: t.tool, args: t.args, error: t.error })),
    }],
  };
}
