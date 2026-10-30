// Committed synthetic controls are independent of private golden cases.
import { createHash } from 'node:crypto';

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

/** Strict JSON canonicalization: unsupported values must not collide with valid keys. */
export function canonico(value: unknown): string {
  const ancestors = new Set<object>();
  function encode(v: unknown, depth: number): string {
    if (depth > 100) throw new Error('Fixture JSON nesting exceeds 100');
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v);
    if (typeof v === 'number' && Number.isFinite(v)) return JSON.stringify(v);
    if (typeof v !== 'object' || v === null) throw new Error('Fixture requires finite JSON values');
    if (ancestors.has(v)) throw new Error('Cyclic fixture JSON');
    const array = Array.isArray(v);
    if (array && Object.getPrototypeOf(v) !== Array.prototype) throw new Error('Fixture requires plain JSON arrays');
    if (!array && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) {
      throw new Error('Fixture requires plain JSON objects');
    }
    const keys = Reflect.ownKeys(v);
    if (keys.some(k => typeof k !== 'string')) throw new Error('Symbol fixture key');
    const fields = keys.filter(k => !(array && k === 'length')) as string[];
    if (fields.some(k => {
      const d = Object.getOwnPropertyDescriptor(v, k)!;
      return !d.enumerable || !('value' in d);
    })) throw new Error('Fixture requires enumerable data properties');
    if (array && (fields.length !== v.length || fields.some((k, i) => k !== String(i)))) {
      throw new Error('Fixture requires dense JSON arrays');
    }
    ancestors.add(v);
    const result = array
      ? `[${v.map(x => encode(x, depth + 1)).join(',')}]`
      : `{${fields.sort().map(k => `${JSON.stringify(k)}:${encode((v as Record<string, unknown>)[k], depth + 1)}`).join(',')}}`;
    ancestors.delete(v);
    return result;
  }
  return encode(value, 0);
}
export const hashFixture = (value: unknown): string => createHash('sha256').update(canonico(value)).digest('hex');
const objeto = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const texto = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const textos = (v: unknown): v is string[] => Array.isArray(v) && v.every(texto);
const clave = (tool: string, args: Record<string, unknown>): string => {
  if (!texto(tool) || !objeto(args)) throw new Error('Invalid fixture tool/arguments');
  return canonico([tool, args]);
};
function fecha(v: unknown): boolean {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(v)) return false;
  const [y, m, d, h, min, sec] = v.split(/[- T:]/).map(Number);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return y > 0 && m >= 1 && m <= 12 && d >= 1 && d <= days[m - 1] && h < 24 && min < 60 && sec < 60;
}

/** Declared synthetic provenance and integrity only; hashes are not truth/adjudication. */
export function validarPaquete(pack: unknown): asserts pack is PaqueteFixtures {
  canonico(pack); // reject lossy/non-JSON values before hashing or cloning
  if (!objeto(pack) || pack.schema !== 'esco-tool-fixtures/v1' || pack.source !== 'explicitly-synthetic'
    || pack.review_status !== 'synthetic-control-unadjudicated' || !texto(pack.reference_version)
    || !texto(pack.rubric_version) || !Array.isArray(pack.scenarios) || !pack.scenarios.length || !objeto(pack.hashes)) {
    throw new Error('Unsupported fixture manifest');
  }
  const ids = new Set<string>();
  for (const s of pack.scenarios) {
    if (!objeto(s) || !texto(s.id) || !/^SYN-[A-Za-z0-9_-]+$/.test(s.id) || ids.has(s.id)
      || !texto(s.title) || !textos(s.seeds) || (s.channel !== 'Web' && s.channel !== 'Telegram')
      || !fecha(s.as_of_bogota) || !textos(s.criteria) || !s.criteria.length
      || !Array.isArray(s.turns) || !s.turns.length
      || !Object.prototype.hasOwnProperty.call(pack.hashes, s.id) || pack.hashes[s.id] !== hashFixture(s)) {
      throw new Error('Invalid scenario/hash');
    }
    ids.add(s.id);
    for (const t of s.turns) {
      if (!objeto(t) || !texto(t.question) || typeof t.control_answer !== 'string'
        || (t.duplicate !== undefined && typeof t.duplicate !== 'boolean') || !Array.isArray(t.fixtures)) {
        throw new Error('Invalid fixture turn');
      }
      const keys = t.fixtures.map(f => {
        if (!objeto(f) || !texto(f.tool) || !objeto(f.args) || !Object.prototype.hasOwnProperty.call(f, 'result')) {
          throw new Error('Invalid fixture');
        }
        return clave(f.tool, f.args);
      });
      if (new Set(keys).size !== keys.length) throw new Error('Duplicate fixture key');
    }
  }
  if (Object.keys(pack.hashes).length !== ids.size) throw new Error('Invalid fixture index');
}

export interface AdaptadorFixtures {
  iniciarCaso: (id: string) => void;
  iniciarTurno: (turno: number) => void;
  verificarFin: () => void;
  verificarCasoFin: () => void;
  ejecutar: (tool: string, args: Record<string, unknown>) => Promise<string>;
}

/** Closed tool-boundary adapter. No network/runtime fallback, even after a caught error. */
export function crearAdaptadorFixtures(pack: unknown, errores: string[]): AdaptadorFixtures {
  validarPaquete(pack);
  const escenarios = structuredClone(pack.scenarios);
  let escenario: EscenarioFixture | undefined;
  let turno = -1;
  let cerrado = false;
  let casoCerrado = false;
  let fallo: string | undefined;
  let pendientes = new Map<string, FixtureHerramienta>();
  const fallar = (reason: string): never => {
    fallo ??= `Frozen fixture rejected: ${escenario?.id ?? 'unset'} turn ${turno}: ${reason}`;
    errores.push(fallo);
    throw new Error(fallo);
  };
  const comprobar = () => { if (fallo) throw new Error(fallo); };
  return {
    iniciarCaso(id) {
      comprobar();
      if (escenario && !casoCerrado) fallar('previous scenario not completed');
      escenario = escenarios.find(s => s.id === id);
      if (!escenario) fallar('unknown scenario');
      turno = -1; cerrado = false; casoCerrado = false; pendientes.clear();
    },
    iniciarTurno(index) {
      comprobar();
      if (casoCerrado || (turno >= 0 && !cerrado) || !Number.isInteger(index)
        || index !== turno + 1 || !escenario?.turns[index]) fallar('unexpected or unclosed turn');
      turno = index; cerrado = false;
      pendientes = new Map(escenario!.turns[index].fixtures.map(f => [clave(f.tool, f.args), f]));
    },
    verificarFin() {
      comprobar();
      if (turno < 0 || casoCerrado || pendientes.size) fallar('turn unset or required fixtures not consumed');
      cerrado = true;
    },
    verificarCasoFin() {
      comprobar();
      if (!escenario || !cerrado || turno !== escenario.turns.length - 1) fallar('scenario incomplete');
      casoCerrado = true;
    },
    async ejecutar(tool, args) {
      comprobar();
      if (turno < 0 || cerrado || casoCerrado) return fallar('tool outside active turn');
      let key: string;
      try { key = clave(tool, args); } catch { return fallar('invalid tool/arguments'); }
      const fixture = pendientes.get(key);
      if (!fixture) return fallar('unmatched or repeated tool/arguments');
      pendientes.delete(key);
      return JSON.stringify(fixture.result);
    },
  };
}
