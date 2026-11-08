// Cliente mínimo de OpenRouter (API compatible con OpenAI). Inyectable para pruebas.

import type { LlamadaHerramienta } from './registro.ts';

export type Esfuerzo = 'none' | 'low' | 'medium';

export interface MensajeLLM {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Solo role 'assistant': llamadas a herramientas que pidió el modelo (formato OpenAI). */
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  /** Solo role 'tool': a qué llamada responde. */
  tool_call_id?: string;
}

export interface SolicitudLLM {
  modelo: string;
  esfuerzo: Esfuerzo;
  mensajes: MensajeLLM[];
  herramientas?: unknown[];
  /** 'required' obliga a llamar una herramienta. */
  toolChoice?: 'required' | 'auto';
  maxTokens: number;
}

export interface UsoLLM {
  entrada: number;
  salida: number;
  razonamiento: number;
  costoUsd: number | null;
}

export interface RespuestaLLM {
  texto: string;
  llamadas: LlamadaHerramienta[];
  uso: UsoLLM;
  ms: number;
  modelo: string;
  finishReason: string | null;
}

export interface ClienteLLM {
  completar(s: SolicitudLLM): Promise<RespuestaLLM>;
}

export class ErrorLLM extends Error {}

interface RespuestaOpenRouter {
  model?: string;
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | null;
      tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    cost?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
  error?: { message?: string };
}

export function crearClienteOpenRouter(apiKey: string, fetchImpl: typeof fetch = fetch, titulo = 'Esco 2.0 M2.5'): ClienteLLM {
  return {
    async completar(s: SolicitudLLM): Promise<RespuestaLLM> {
      const cuerpo: Record<string, unknown> = {
        model: s.modelo,
        messages: s.mensajes,
        max_tokens: s.maxTokens,
        temperature: 0,
        reasoning: { effort: s.esfuerzo },
        usage: { include: true },
      };
      if (s.herramientas) {
        cuerpo.tools = s.herramientas;
        cuerpo.tool_choice = s.toolChoice ?? 'auto';
        cuerpo.parallel_tool_calls = true;
      }
      const inicio = Date.now();
      const res = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': titulo },
        body: JSON.stringify(cuerpo),
      });
      const datos = (await res.json()) as RespuestaOpenRouter;
      const ms = Date.now() - inicio;
      if (!res.ok || datos.error) throw new ErrorLLM(`OpenRouter ${res.status}: ${datos.error?.message ?? 'sin detalle'}`);
      const eleccion = datos.choices?.[0];
      return {
        texto: eleccion?.message?.content ?? '',
        llamadas: (eleccion?.message?.tool_calls ?? []).map((t) => ({ nombre: t.function?.name ?? '', argumentos: t.function?.arguments ?? '' })),
        uso: {
          entrada: datos.usage?.prompt_tokens ?? 0,
          salida: datos.usage?.completion_tokens ?? 0,
          razonamiento: datos.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
          costoUsd: typeof datos.usage?.cost === 'number' ? datos.usage.cost : null,
        },
        ms,
        modelo: datos.model ?? s.modelo,
        finishReason: eleccion?.finish_reason ?? null,
      };
    },
  };
}
