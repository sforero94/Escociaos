// Offline composition only. Scripted responses are data, never executable transports.
import { asOfUtc } from './fechas';
import { canonico, crearAdaptadorFixtures, hashFixture, validarPaquete, type EscenarioFixture } from './fixtures';
import { historialInicial, historialParaSiguienteTurno, mensajesDesdeHistorial, type MensajeLlm } from './mensajes';
import { evaluarDeterminista } from './deterministico';
import { combinarVeredicto } from './veredicto';
import { medir } from './medicion';
import type { AnclaNumerica, CasoDorado, CorridaEjecutada, HerramientaLlamada, ResultadoCaso } from './tipos';

export interface GuionReplay {
  id: string;
  turns: { calls: { tool: string; args: Record<string, unknown> }[]; answer: string }[];
  anchors: AnclaNumerica[];
}
const objeto = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const texto = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
function claves(v: Record<string, unknown>, permitidas: string[]): boolean {
  return Object.keys(v).every(k => permitidas.includes(k));
}
function validarGuiones(value: unknown): asserts value is GuionReplay[] {
  canonico(value); // rejects functions/accessors/exotic objects before reading data
  if (!Array.isArray(value)) throw new Error('Replay requires an explicit script array');
  const ids = new Set<string>();
  for (const s of value) {
    if (!objeto(s) || !claves(s, ['id', 'turns', 'anchors']) || !texto(s.id) || ids.has(s.id)
      || !Array.isArray(s.turns) || !Array.isArray(s.anchors)) throw new Error('Invalid replay script');
    ids.add(s.id);
    for (const t of s.turns) {
      if (!objeto(t) || !claves(t, ['calls', 'answer']) || typeof t.answer !== 'string' || !Array.isArray(t.calls)
        || t.calls.some(c => !objeto(c) || !claves(c, ['tool', 'args']) || !texto(c.tool) || !objeto(c.args))) {
        throw new Error('Invalid scripted turn/call');
      }
    }
    for (const a of s.anchors) {
      if (!objeto(a) || !claves(a, ['claim', 'value', 'tol']) || !texto(a.claim)
        || !(texto(a.value) || (typeof a.value === 'number' && Number.isFinite(a.value)))
        || !(a.tol === undefined || a.tol === null || (typeof a.tol === 'number' && Number.isFinite(a.tol) && a.tol >= 0))) {
        throw new Error('Invalid scripted anchor');
      }
    }
  }
}

/** Synthetic cases retain an unadjudicated label; no historical/private-case decoder. */
function casoSintetico(s: EscenarioFixture, anchors: AnclaNumerica[]): CasoDorado {
  return {
    id: s.id, key: s.id, title: s.title, domain: 'synthetic', kind: 'behavior',
    channel: s.channel, channels_observed: [s.channel], as_of_bogota: s.as_of_bogota,
    question: s.turns[0].question, paraphrases: [], prior_context: [],
    followup_turns: s.turns.slice(1).map((t, i) => ({ rn: i + 2, user: t.question })),
    expected_behavior: { tools_must_include: [...new Set(s.turns.flatMap(t => t.fixtures.map(f => f.tool)))],
      tools_any_of: [], tools_forbidden: [], max_tool_calls: s.turns.reduce((n, t) => n + t.fixtures.length, 0) },
    reference: { type: 'rubric', sql: '', frozen_result: s.turns.map(t => t.fixtures),
      frozen_on: s.as_of_bogota.substring(0, 10), replayable_as_of: true,
      replay_note: 'Explicit synthetic control, not historical evidence or calibration.' },
    numeric_anchors: anchors, must: s.criteria, must_not: [],
    original: { verdict: 'synthetic', issues: [], runs: [], answer_primary: '' },
    tags: ['synthetic', ...s.seeds], human_review: { verdict: 'no_verificable', verdict_raw: 'unadjudicated' },
    include_in_golden: false, golden_status: 'synthetic-control-unadjudicated',
  };
}

/** No fetch/runtime/credentials/clock mutation. All transport input is strict JSON data.
 * Not a sandbox for arbitrary JS, and does not execute the production tool loop.
 */
export async function ejecutarReplaySintetico(paquete: unknown, guiones: unknown, promptBase: string) {
  validarPaquete(paquete); validarGuiones(guiones);
  if (!texto(promptBase)) throw new Error('Replay requires an explicit base prompt');
  const pack = structuredClone(paquete);
  const scripts = structuredClone(guiones);
  if (scripts.some(s => !pack.scenarios.some(c => c.id === s.id))) throw new Error('Unknown scripted scenario');
  const resultados: ResultadoCaso[] = [];
  const registros: { id: string; scenario_sha256: string; script_sha256: string;
    mensajes: MensajeLlm[][]; errores: string[] }[] = [];
  for (const script of scripts) {
    const s = pack.scenarios.find(c => c.id === script.id)!;
    const caso = casoSintetico(s, script.anchors);
    // Fixture manifest uses seconds; the reviewed date helper uses minutes.
    // Preserve the validated seconds explicitly rather than silently truncating.
    const asOf = new Date(new Date(asOfUtc(s.as_of_bogota.substring(0, 16))).getTime()
      + Number(s.as_of_bogota.substring(17, 19)) * 1000).toISOString();
    const corrida: CorridaEjecutada = { modo: 'frozen', asOf, turnos: [], escriturasBloqueadas: [] };
    const errores: string[] = [];
    const adapter = crearAdaptadorFixtures(pack, errores);
    const mensajes: MensajeLlm[][] = [];
    let historial = historialInicial(caso, s.turns[0].question);
    try {
      adapter.iniciarCaso(s.id);
      if (script.turns.length !== s.turns.length) throw new Error('Scripted turn coverage mismatch');
      for (const [i, t] of script.turns.entries()) {
        mensajes.push(mensajesDesdeHistorial(historial, promptBase, s.channel));
        adapter.iniciarTurno(i);
        const herramientas: HerramientaLlamada[] = [];
        for (const call of t.calls) {
          const result_summary = await adapter.ejecutar(call.tool, call.args);
          // No production events exist here: absence of error/usage/timing is unknown.
          herramientas.push({ tool: call.tool, args: call.args, result_summary });
        }
        adapter.verificarFin();
        corrida.turnos.push({ pregunta: s.turns[i].question, respuesta: t.answer, herramientas });
        if (s.turns[i + 1]) historial = historialParaSiguienteTurno(historial, t.answer, herramientas, s.turns[i + 1].question);
      }
      adapter.verificarCasoFin();
    } catch (e) {
      corrida.error = e instanceof Error ? e.message : 'Synthetic replay failed';
    }
    resultados.push(combinarVeredicto({ caso, corrida, repeticion: 1, variante: 'synthetic-script',
      determinista: evaluarDeterminista(caso, corrida), juez: null, juezEstado: 'omitido' }));
    registros.push({ id: s.id, scenario_sha256: pack.hashes[s.id], script_sha256: hashFixture(script), mensajes, errores });
  }
  return {
    meta: { mode: 'synthetic-script' as const, model: 'scripted-control/v1', quality_measured: false as const,
      measurement_version: '1.1' as const, reference_version: pack.reference_version, rubric_version: pack.rubric_version,
      review_status: pack.review_status, pack_sha256: hashFixture(pack), scripts_sha256: hashFixture(scripts),
      prompt_sha256: hashFixture(promptBase), usage: null, production_loop_exercised: false as const },
    resultados, registros, medicion: medir(resultados, pack.scenarios.map(s => s.id)),
  };
}
