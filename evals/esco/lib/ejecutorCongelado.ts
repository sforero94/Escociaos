// Test-only actual-loop runner. No live branch or inherited network transport.
import { vi } from 'vitest';
import { validarCaso } from '../../../src/utils/escoEvals/golden';
import { asOfUtc } from '../../../src/utils/escoEvals/fechas';
import { crearAdaptadorFixtures, hashFixture, validarPaquete } from '../../../src/utils/escoEvals/fixtures';
import { historialInicial, historialParaSiguienteTurno, mensajesDesdeHistorial, type MensajeLlm } from '../../../src/utils/escoEvals/mensajes';
import { evaluarDeterminista } from '../../../src/utils/escoEvals/deterministico';
import { combinarVeredicto } from '../../../src/utils/escoEvals/veredicto';
import { medir } from '../../../src/utils/escoEvals/medicion';
import type { CorridaEjecutada, HerramientaLlamada } from '../../../src/utils/escoEvals/tipos';

export const MODELO_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const BASE_SINTETICA = 'https://esco-fixture.invalid';
const VALORES_SINTETICOS: Record<string, string> = {
  SUPABASE_URL: BASE_SINTETICA, SUPABASE_SERVICE_ROLE_KEY: 'synthetic-placeholder',
  OPENROUTER_API_KEY: 'synthetic-placeholder',
};
interface Evento { type: string; tool?: string; index?: number; args?: Record<string, unknown>; ok?: boolean }
interface ModuloLoop {
  llmToolLoop: (messages: MensajeLlm[], userId?: string, onEvent?: (event: Evento) => void)
    => Promise<{ text: string; toolInteractions: { tool: string; args: Record<string, unknown>; result_summary: string }[] }>;
}
export interface IntentoHttp {
  method: string; url: string; body_sha256?: string; headers_sha256?: string;
  estado: 'intentado' | 'respondido' | 'rechazado'; status?: number;
}
let instalado = false; // Global mutation cannot overlap in the same worker.

/** Exact URL/query, method, header and raw-body signatures; no values are logged. */
export async function firmaHttp(input: RequestInfo | URL, init?: RequestInit) {
  const request = new Request(input, init);
  return { method: request.method, url: request.url,
    body_sha256: hashFixture(await request.text()),
    headers_sha256: hashFixture([...request.headers.entries()]) };
}

/** A single caller-supplied synthetic HTTP scenario. Both finalizers are required. */
export function instalarHttpCongelado(pack: unknown, id: string) {
  validarPaquete(pack);
  if (instalado) throw new Error('Closed HTTP installation already active');
  const escenario = pack.scenarios.find(s => s.id === id);
  if (!escenario) throw new Error('Unknown HTTP scenario');
  const errores: string[] = [];
  const intentos: IntentoHttp[] = [];
  const adapter = crearAdaptadorFixtures(pack, errores);
  adapter.iniciarCaso(id);
  let fallo: string | undefined;
  let cerrado = false;
  const rechazar = (reason: string): never => {
    fallo ??= `Closed HTTP invalid: ${reason}`;
    errores.push(fallo); throw new Error(fallo);
  };
  const comprobar = () => { if (cerrado || fallo) throw new Error(fallo ?? 'Closed HTTP installation restored'); };
  const denoAnterior = Object.getOwnPropertyDescriptor(globalThis, 'Deno');
  const fetchAnterior = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  if (!fetchAnterior || !('value' in fetchAnterior) || !fetchAnterior.configurable) {
    throw new Error('Closed HTTP requires an owned configurable fetch binding');
  }
  // Never delegate to process.env or an existing Deno binding.
  Object.defineProperty(globalThis, 'Deno', { configurable: true, value: { env: { get(key: string) {
    comprobar();
    if (!Object.prototype.hasOwnProperty.call(VALORES_SINTETICOS, key)) return rechazar('unlisted synthetic environment key');
    return VALORES_SINTETICOS[key];
  } } } });
  try {
    const fetchCerrado: typeof fetch = async (input, init) => {
      const intento: IntentoHttp = { method: init?.method ?? (input instanceof Request ? input.method : 'GET'),
        url: input instanceof Request ? input.url : String(input), estado: 'intentado' };
      intentos.push(intento);
      try {
        comprobar();
        const firma = await firmaHttp(input, init);
        comprobar();
        Object.assign(intento, firma);
        const url = new URL(firma.url);
        const modelo = firma.url === MODELO_URL && firma.method === 'POST';
        const lectura = url.origin === BASE_SINTETICA && url.pathname.startsWith('/rest/v1/')
          && (firma.method === 'GET' || firma.method === 'HEAD');
        if (url.username || url.password || url.hash || (!modelo && !lectura)) rechazar('unlisted destination/method');
        const response: unknown = JSON.parse(await adapter.ejecutar('http', firma));
        comprobar();
        if (!response || typeof response !== 'object' || Array.isArray(response)) rechazar('malformed HTTP fixture');
        const r = response as { status?: unknown; body?: unknown; headers?: unknown };
        if (!Number.isInteger(r.status) || Number(r.status) < 200 || Number(r.status) > 599
          || (Number(r.status) >= 300 && Number(r.status) < 400)
          || !(typeof r.body === 'string' || r.body === null) || !r.headers || typeof r.headers !== 'object'
          || Array.isArray(r.headers) || Object.values(r.headers).some(v => typeof v !== 'string')) {
          rechazar('invalid HTTP status/body/headers or redirect');
        }
        const result = new Response(r.body as string | null, { status: r.status as number, headers: r.headers as Record<string, string> });
        intento.estado = 'respondido'; intento.status = result.status;
        return result;
      } catch {
        intento.estado = 'rechazado';
        return rechazar('blocked or unmatched request');
      }
    };
    // Fresh function: do not mutate/reuse an inherited mock's implementation or ledger.
    Object.defineProperty(globalThis, 'fetch', { ...fetchAnterior, value: fetchCerrado });
  } catch (error) {
    if (denoAnterior) Object.defineProperty(globalThis, 'Deno', denoAnterior); else Reflect.deleteProperty(globalThis, 'Deno');
    throw error;
  }
  instalado = true;
  const ciclo = (operation: () => void) => {
    comprobar();
    try { operation(); } catch { rechazar('fixture lifecycle failure'); }
  };
  return {
    errores, intentos,
    iniciarTurno(i: number) { ciclo(() => adapter.iniciarTurno(i)); },
    verificarFin() { ciclo(() => adapter.verificarFin()); },
    verificarCasoFin() { ciclo(() => adapter.verificarCasoFin()); },
    comprobar,
    restaurar() {
      if (cerrado) return;
      cerrado = true; Object.defineProperty(globalThis, 'fetch', fetchAnterior);
      if (denoAnterior) Object.defineProperty(globalThis, 'Deno', denoAnterior); else Reflect.deleteProperty(globalThis, 'Deno');
      instalado = false;
    },
  };
}

/** Runs unchanged llmToolLoop and real query code against closed synthetic HTTP. */
export async function correrCasoCongelado(casoEntrada: unknown, paquete: unknown, id: string, promptBase: string) {
  validarPaquete(paquete);
  const caso = structuredClone(validarCaso(casoEntrada, 1));
  const pack = structuredClone(paquete);
  const escenario = pack.scenarios.find(s => s.id === id);
  if (!escenario || pack.scenarios.length !== 1 || caso.domain !== 'synthetic' || caso.include_in_golden
    || caso.human_review.verdict !== 'no_verificable' || caso.golden_status !== 'synthetic-control-unadjudicated'
    || !caso.tags.includes('synthetic') || caso.original.verdict !== 'synthetic' || caso.original.runs.length
    || caso.original.answer_primary !== '' || caso.reference.type !== 'rubric' || caso.reference.replayable_as_of !== true
    || typeof promptBase !== 'string' || !promptBase.trim()) throw new Error('Explicit single synthetic control required');
  const preguntas = [caso.question, ...caso.followup_turns.map(t => t.user)];
  if (caso.key !== id || caso.channel !== escenario.channel || preguntas.length !== escenario.turns.length
    || preguntas.some((q, i) => q !== escenario.turns[i].question)
    || escenario.as_of_bogota.replace('T', ' ') !== `${caso.as_of_bogota}:00`) throw new Error('Scenario/case scope or clock mismatch');
  if (vi.isFakeTimers()) throw new Error('Runner requires ownership of the test clock');
  const asOf = asOfUtc(caso.as_of_bogota);
  const g = instalarHttpCongelado(pack, id);
  const corrida: CorridaEjecutada = { modo: 'frozen', asOf, turnos: [], escriturasBloqueadas: [] };
  const eventos: (Evento & { turno: number })[] = [];
  const mensajes: MensajeLlm[][] = [];
  let historial = historialInicial(caso, caso.question);
  try {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(asOf));
    const ruta = '../../../src/supabase/functions/server/chat.tsx';
    const runtime = await import(/* @vite-ignore */ ruta) as ModuloLoop;
    for (const [i, pregunta] of preguntas.entries()) {
      g.iniciarTurno(i);
      const entrada = mensajesDesdeHistorial(historial, promptBase, caso.channel);
      mensajes.push(structuredClone(entrada));
      const r = await runtime.llmToolLoop(entrada, '00000000-0000-0000-0000-00000000e5c0', e => eventos.push({ ...e, turno: i }));
      g.comprobar(); g.verificarFin();
      const herramientas: HerramientaLlamada[] = r.toolInteractions.map((h, index) => {
        const done = eventos.find(e => e.turno === i && e.index === index && e.type === 'tool_done');
        return { ...h, ...(typeof done?.ok === 'boolean' ? { error: !done.ok } : {}) };
      });
      corrida.turnos.push({ pregunta, respuesta: r.text, herramientas });
      if (preguntas[i + 1]) historial = historialParaSiguienteTurno(historial, r.text, herramientas, preguntas[i + 1]);
    }
    g.verificarCasoFin();
  } catch (e) {
    corrida.error = e instanceof Error ? e.message : 'Closed loop failed';
  } finally {
    corrida.escriturasBloqueadas = g.intentos.filter(r => r.estado === 'rechazado' && !['GET', 'HEAD'].includes(r.method.toUpperCase())
      && r.url !== MODELO_URL).map(r => `${r.method} ${r.url}`);
    try { g.restaurar(); } finally { vi.useRealTimers(); }
  }
  const resultado = combinarVeredicto({ caso, corrida, repeticion: 1, variante: 'synthetic-actual-loop',
    determinista: evaluarDeterminista(caso, corrida), juez: null, juezEstado: 'omitido' });
  return { resultado, medicion: medir([resultado], [caso.id]), mensajes, eventos, intentos: g.intentos, errores: g.errores,
    meta: { mode: 'synthetic-actual-loop', quality_measured: false, production_loop_exercised: true,
      usage: null, measurement_version: '1.1', pack_sha256: hashFixture(pack), scenario_sha256: pack.hashes[id],
      case_sha256: hashFixture(caso), prompt_sha256: hashFixture(promptBase),
      reference_version: pack.reference_version, rubric_version: pack.rubric_version,
      expected_turns: preguntas.length, completed_turns: corrida.turnos.length } };
}
