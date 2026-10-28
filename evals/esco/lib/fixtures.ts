// Committed synthetic controls are independent of private golden cases.
import { createHash } from 'node:crypto';
import type { CasoDorado } from '../../../src/utils/escoEvals/tipos';

export interface FixtureHerramienta {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
}
export interface EscenarioFixture {
  id: string;
  title: string;
  seeds: string[];
  channel: 'Web' | 'Telegram';
  as_of_bogota: string;
  turns: { question: string; fixtures: FixtureHerramienta[]; duplicate?: boolean; control_answer: string }[];
  criteria: string[];
}
export interface PaqueteFixtures {
  schema: 'esco-tool-fixtures/v1';
  source: 'explicitly-synthetic';
  reference_version: string;
  rubric_version: string;
  review_status: 'synthetic-control-unadjudicated';
  scenarios: EscenarioFixture[];
  hashes: Record<string, string>;
}

/** Sort object keys recursively; preserve arrays, values and absent-vs-null. */
export function canonico(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonico).join(',')}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([k, v]) => `${JSON.stringify(k)}:${canonico(v)}`).join(',')}}`;
}
export const hashFixture = (value: unknown): string => createHash('sha256').update(canonico(value)).digest('hex');
const clave = (tool: string, args: Record<string, unknown>): string => canonico([tool, args]);

export function validarPaquete(pack: PaqueteFixtures): void {
  if (pack.schema !== 'esco-tool-fixtures/v1' || pack.source !== 'explicitly-synthetic'
    || pack.review_status !== 'synthetic-control-unadjudicated' || !pack.reference_version || !pack.rubric_version) {
    throw new Error('Unsupported fixture manifest');
  }
  const ids = new Set<string>();
  for (const s of pack.scenarios) {
    if (ids.has(s.id) || !s.id.startsWith('SYN-') || !s.turns.length || pack.hashes[s.id] !== hashFixture(s)) {
      throw new Error(`Invalid scenario/hash: ${s.id}`);
    }
    ids.add(s.id);
    for (const t of s.turns) {
      const keys = t.fixtures.map(f => clave(f.tool, f.args));
      if (new Set(keys).size !== keys.length) throw new Error(`Duplicate fixture key: ${s.id}`);
    }
  }
  if (!ids.size || Object.keys(pack.hashes).length !== ids.size) throw new Error('Invalid fixture index');
}

export interface AdaptadorFixtures {
  iniciarCaso: (id: string) => void;
  iniciarTurno: (turno: number) => void;
  verificarFin: () => void;
  ejecutar: (tool: string, args: Record<string, unknown>) => Promise<string>;
}

/** New state per installation, reset per scenario and turn. No fallback path. */
export function crearAdaptadorFixtures(pack: PaqueteFixtures, errores: string[]): AdaptadorFixtures {
  validarPaquete(pack);
  // Isolate the snapshot from caller mutation after validation.
  const escenarios = structuredClone(pack.scenarios);
  let escenario: EscenarioFixture | undefined;
  let turno = -1;
  let pendientes = new Map<string, FixtureHerramienta>();
  const fallar = (reason: string): never => {
    const message = `Frozen fixture rejected: ${escenario?.id ?? 'unset'} turn ${turno}: ${reason}`;
    errores.push(message);
    throw new Error(message);
  };
  return {
    iniciarCaso(id) {
      escenario = escenarios.find(s => s.id === id);
      turno = -1;
      pendientes.clear();
      if (!escenario) fallar('unknown scenario');
    },
    iniciarTurno(index) {
      if (index !== turno + 1 || !escenario?.turns[index]) fallar('unexpected turn');
      turno = index;
      pendientes = new Map(escenario!.turns[index].fixtures.map(f => [clave(f.tool, f.args), f]));
    },
    verificarFin() {
      if (pendientes.size) fallar('required fixtures not consumed');
    },
    async ejecutar(tool, args) {
      const key = clave(tool, args);
      const fixture = pendientes.get(key);
      if (!fixture) return fallar(`unmatched tool/arguments: ${key}`);
      pendientes.delete(key);
      return JSON.stringify(fixture.result);
    },
  };
}

/** Synthetic cases have no human truth label; do not merge with calibration. */
export function casoDeEscenario(s: EscenarioFixture): CasoDorado {
  return {
    id: s.id, key: s.id, title: s.title, domain: 'synthetic', kind: 'behavior',
    channel: s.channel, channels_observed: [s.channel], as_of_bogota: s.as_of_bogota,
    question: s.turns[0].question, paraphrases: [], prior_context: [],
    followup_turns: s.turns.slice(1).map((t, i) => ({ rn: i + 2, user: t.question })),
    expected_behavior: { tools_must_include: [], tools_any_of: [], tools_forbidden: [], max_tool_calls: null },
    reference: { type: 'rubric', sql: '', frozen_result: s.turns.map(t => t.fixtures),
      frozen_on: '2026-10-28', replayable_as_of: true, replay_note: 'Explicitly synthetic; no historical claims.' },
    numeric_anchors: [], must: s.criteria, must_not: [],
    original: { verdict: 'synthetic', issues: [], runs: [], answer_primary: '' },
    tags: ['synthetic', ...s.seeds], human_review: { verdict: 'no_verificable', verdict_raw: 'unadjudicated' },
    include_in_golden: false, golden_status: 'synthetic-control-unadjudicated',
  };
}

/** Scripted model verifies plumbing only; its answers cannot measure quality. */
export function modeloControl(s: EscenarioFixture, observar?: (messages: unknown[]) => void): typeof fetch {
  let turno = 0;
  let consulta = true;
  return async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { messages: unknown[] };
    observar?.(body.messages);
    const t = s.turns[turno];
    if (!t) throw new Error('Unexpected mock model round');
    const calls = t.fixtures.map((f, i) => ({ id: `syn-${turno}-${i}`, type: 'function',
      function: { name: f.tool, arguments: JSON.stringify(f.args) } }));
    if (t.duplicate && calls[0]) calls.push({ ...calls[0], id: `duplicate-${turno}` });
    const message = consulta && calls.length
      ? { role: 'assistant', content: null, tool_calls: calls }
      : { role: 'assistant', content: t.control_answer };
    if (consulta && calls.length) consulta = false;
    else { consulta = true; turno++; }
    return new Response(JSON.stringify({ choices: [{ message }] }), { headers: { 'content-type': 'application/json' } });
  };
}
