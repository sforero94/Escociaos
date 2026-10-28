// Ejecuta un caso contra Esco: el MISMO `llmToolLoop` que usan la web y Telegram,
// importado en proceso (no por HTTP), con tres guardas:
//
//   1. Solo lectura — cualquier POST/PATCH/DELETE a Supabase se bloquea y se registra.
//      Esco usa la service role; sin esta guarda, `commit_memory_save` escribiría en producción.
//   2. Hora fijada — `Date` se congela en la hora de la pregunta original, para que
//      «últimos 15 días» o «esta semana» cubran la misma ventana que la referencia.
//   3. Consola silenciada — `llmToolLoop` registra cada ronda.

import { vi } from 'vitest';
import {
  asOfUtc,
  mensajesIniciales,
  mensajesParaSiguienteTurno,
  type MensajeLlm,
} from '../../../src/utils/escoEvals/mensajes';
import type { CasoDorado, CorridaEjecutada, HerramientaLlamada, TurnoEjecutado } from '../../../src/utils/escoEvals/tipos';

interface EventoHerramienta {
  type: string;
  tool?: string;
  index?: number;
  ms?: number;
  ok?: boolean;
}

interface ModuloEsco {
  llmToolLoop: (
    mensajes: MensajeLlm[],
    userId?: string,
    onEvent?: (e: EventoHerramienta) => void,
  ) => Promise<{ text: string; toolInteractions: { tool: string; args: Record<string, unknown>; result_summary: string }[] }>;
  getSystemPrompt: (memorias?: unknown[]) => string;
}

/** Usuario ficticio: las herramientas de memoria lo piden, pero nada se escribe. */
const USUARIO_EVAL = '00000000-0000-0000-0000-00000000e5c0';

export interface GuardasInstaladas {
  erroresReplay?: string[];
  escrituras: string[];
  tokens: { entrada: number; salida: number };
  restaurar: () => void;
}

/** Closed replay: model transport is independent; all other reads require fixtures.
 * A failed lookup is sticky because production tools can catch fetch exceptions.
 */
export interface TransporteCongelado {
  modelo: typeof fetch;
  lectura: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  errores: string[];
}

export function instalarGuardas(env: { supabaseUrl: string; verboso: boolean; replay?: TransporteCongelado }): GuardasInstaladas {
  const fetchReal = globalThis.fetch.bind(globalThis);
  const estado: GuardasInstaladas = { erroresReplay: env.replay?.errores, escrituras: [], tokens: { entrada: 0, salida: 0 }, restaurar: () => undefined };

  const guardado: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const metodo = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();

    const destino = new URL(url);
    if (destino.origin === new URL(env.supabaseUrl).origin && metodo !== 'GET' && metodo !== 'HEAD') {
      estado.escrituras.push(`${metodo} ${destino.pathname}`);
      env.replay?.errores.push('Replay blocked database write');
      return new Response(JSON.stringify({ message: 'bloqueado por el arnés de evaluación (solo lectura)' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Replay never reaches the inherited network transport, including optional tools.
    let respuesta: Response;
    if (env.replay) {
      try {
        if (destino.href === 'https://openrouter.ai/api/v1/chat/completions' && metodo === 'POST') {
          respuesta = await env.replay.modelo(input, { ...init, redirect: 'error' });
        } else {
          if (metodo !== 'GET' && metodo !== 'HEAD') throw new Error('Replay blocks side effects');
          respuesta = await env.replay.lectura(input, { ...init, redirect: 'error' });
        }
        if (respuesta.redirected || (respuesta.status >= 300 && respuesta.status < 400)) {
          throw new Error('Replay blocks redirects');
        }
      } catch {
        const error = `Frozen transport rejected ${metodo} ${destino.origin}${destino.pathname}`;
        env.replay.errores.push(error);
        throw new Error(error);
      }
    } else {
      // Do not let an automatic redirect bypass the origin/method check.
      respuesta = await fetchReal(input, { ...init, redirect: 'error' });
    }
    if (destino.origin === 'https://openrouter.ai' && respuesta.ok) {
      try {
        const cuerpo = await respuesta.clone().json() as { usage?: { prompt_tokens?: number; completion_tokens?: number } };
        estado.tokens.entrada += cuerpo.usage?.prompt_tokens ?? 0;
        estado.tokens.salida += cuerpo.usage?.completion_tokens ?? 0;
      } catch {
        // El conteo de tokens es informativo; nunca debe romper una corrida.
      }
    }
    return respuesta;
  };

  vi.stubGlobal('fetch', guardado);
  vi.stubGlobal('Deno', { env: { get: (clave: string) => process.env[clave] } });
  const espias = env.verboso
    ? []
    : [vi.spyOn(console, 'log').mockImplementation(() => undefined), vi.spyOn(console, 'error').mockImplementation(() => undefined)];

  estado.restaurar = () => {
    vi.unstubAllGlobals();
    for (const e of espias) e.mockRestore();
  };
  return estado;
}

let moduloEsco: ModuloEsco | null = null;

/** Carga chat.tsx (Deno) bajo Vitest. Hay que instalar las guardas antes: el módulo lee `Deno` al ejecutarse. */
export async function cargarEsco(): Promise<ModuloEsco> {
  if (!moduloEsco) {
    const ruta = '../../../src/supabase/functions/server/chat.tsx';
    moduloEsco = await import(/* @vite-ignore */ ruta) as unknown as ModuloEsco;
  }
  return moduloEsco;
}

function aHerramientas(
  interacciones: { tool: string; args: Record<string, unknown>; result_summary: string }[],
  eventos: EventoHerramienta[],
): HerramientaLlamada[] {
  return interacciones.map((x, i) => {
    const fin = eventos.find((e) => e.type === 'tool_done' && e.index === i);
    return { tool: x.tool, args: x.args, result_summary: x.result_summary, error: fin ? fin.ok === false : /^\s*\{\s*"error"/.test(x.result_summary), ms: fin?.ms };
  });
}

export async function correrCaso(
  caso: CasoDorado,
  pregunta: string,
  conSeguimientos: boolean,
  opciones: { fijarHora: boolean; guardas: GuardasInstaladas },
): Promise<CorridaEjecutada> {
  const { guardas } = opciones;
  const asOf = opciones.fijarHora ? asOfUtc(caso.as_of_bogota) : null;
  const turnos: TurnoEjecutado[] = [];
  const escriturasAntes = guardas.escrituras.length;
  const erroresReplayAntes = guardas.erroresReplay?.length ?? 0;
  const tokensAntes = { ...guardas.tokens };

  if (asOf) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(asOf));
  }
  try {
    const esco = await cargarEsco();
    const preguntas = [pregunta, ...(conSeguimientos ? caso.followup_turns.map((f) => f.user) : [])];
    let mensajes: MensajeLlm[] = [];
    let anterior: { respuesta: string; herramientas: HerramientaLlamada[] } | null = null;

    for (const [i, p] of preguntas.entries()) {
      // Sin memorias: la corrida debe ser reproducible, no depender de lo que el usuario guardó.
      const base = esco.getSystemPrompt([]);
      mensajes = i === 0
        ? mensajesIniciales(caso, base, p)
        : mensajesParaSiguienteTurno(mensajes, anterior!.respuesta, anterior!.herramientas, p, caso.channel);

      const eventos: EventoHerramienta[] = [];
      const inicios = new Map<number, number>();
      const t0 = performance.now();
      const { text, toolInteractions } = await esco.llmToolLoop(mensajes, USUARIO_EVAL, (e) => {
        if (e.type === 'tool_start' && e.index !== undefined) inicios.set(e.index, performance.now());
        const inicio = e.index === undefined ? undefined : inicios.get(e.index);
        eventos.push(e.type === 'tool_done' && inicio !== undefined ? { ...e, ms: performance.now() - inicio } : e);
      });
      if ((guardas.erroresReplay?.length ?? 0) > erroresReplayAntes) {
        throw new Error('Frozen replay invalid: blocked or unmatched transport request');
      }
      const herramientas = aHerramientas(toolInteractions, eventos);
      turnos.push({ pregunta: p, respuesta: text, herramientas, ms: performance.now() - t0 });
      anterior = { respuesta: text, herramientas };
    }
    return {
      modo: 'live', asOf, turnos,
      tokens: { entrada: guardas.tokens.entrada - tokensAntes.entrada, salida: guardas.tokens.salida - tokensAntes.salida },
      escriturasBloqueadas: guardas.escrituras.slice(escriturasAntes),
    };
  } catch (err) {
    return {
      modo: 'live', asOf, turnos,
      escriturasBloqueadas: guardas.escrituras.slice(escriturasAntes),
      tokens: { entrada: guardas.tokens.entrada - tokensAntes.entrada, salida: guardas.tokens.salida - tokensAntes.salida },
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (asOf) vi.useRealTimers();
  }
}

/** Modo «originales»: arma la corrida con lo que Esco respondió en producción (sin llamar a nada). */
export function corridaDesdeOriginal(caso: CasoDorado): CorridaEjecutada {
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
