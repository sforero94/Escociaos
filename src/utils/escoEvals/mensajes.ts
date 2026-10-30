// Armado de los mensajes que se le dan a Esco en una corrida de evaluación.
// Replica lo que hacen los dos canales de producción:
//   Web      — chat.tsx / handleChatMessage
//   Telegram — telegram/bot.ts / buildTelegramLlmMessages
// Tests estáticos detectan deriva del formato; no ejecutan los handlers.

import type { CasoDorado, HerramientaLlamada } from './tipos';

export interface MensajeLlm {
  role: string;
  content: string | null;
  tool_calls?: unknown[];
  tool_call_id?: string;
  name?: string;
}

/** Texto que telegram/bot.ts agrega al prompt de sistema. */
export const AJUSTES_TELEGRAM =
  '\n\nEstás respondiendo por Telegram. Sé conciso. ' +
  'No uses tablas markdown (no se renderizan en Telegram). ' +
  'Usa listas con viñetas en su lugar. ' +
  'Limita la respuesta a lo esencial.';

export const ENCABEZADO_CONTEXTO_WEB =
  'Datos consultados en la respuesta anterior (pueden estar recortados o desactualizados; vuelve a consultar para afirmar ausencia o cambiar de período):';
export const ENCABEZADO_CONTEXTO_TELEGRAM = 'Datos consultados en la respuesta anterior:';

function validarCanal(canal: string): void {
  if (canal !== 'Web' && canal !== 'Telegram') throw new Error('Canal de evaluación inválido');
}

export function promptDeSistema(base: string, canal: 'Web' | 'Telegram'): string {
  validarCanal(canal);
  return canal === 'Telegram' ? base + AJUSTES_TELEGRAM : base;
}

/** Filas persistidas en orden cronológico, antes de expandir metadata. */
export interface MensajeHistorial {
  role: 'user' | 'assistant';
  content: string;
  herramientas?: HerramientaLlamada[];
}

function resumenDeHerramientas(herramientas: HerramientaLlamada[]): string {
  return herramientas
    .map((h) => `[${h.tool}(${JSON.stringify(h.args)}): ${h.result_summary}]`)
    .join('\n');
}

/** Reproduce la ventana actual: Web últimos 20; Telegram primeros 20.
 * La ventana cuenta filas persistidas, no mensajes de contexto ya expandidos.
 * No carga memorias ni historial: promptBase e historial pertenecen al llamador.
 */
export function mensajesDesdeHistorial(
  historial: readonly MensajeHistorial[], promptBase: string, canal: 'Web' | 'Telegram',
): MensajeLlm[] {
  validarCanal(canal);
  for (const fila of historial) {
    if ((fila.role !== 'user' && fila.role !== 'assistant') || typeof fila.content !== 'string') {
      throw new Error('Historial de evaluación inválido: se esperan filas persistidas');
    }
    if ('tool_calls' in fila || 'tool_call_id' in fila) throw new Error('No se acepta protocolo LLM como historial persistido');
  }
  const filas = canal === 'Web' ? historial.slice(-20) : historial.slice(0, 20);
  const mensajes: MensajeLlm[] = [{ role: 'system', content: promptDeSistema(promptBase, canal) }];
  for (const fila of filas) {
    if (fila.role === 'assistant' && fila.herramientas?.length) {
      const encabezado = canal === 'Web' ? ENCABEZADO_CONTEXTO_WEB : ENCABEZADO_CONTEXTO_TELEGRAM;
      mensajes.push({ role: 'system', content: `${encabezado}\n${resumenDeHerramientas(fila.herramientas)}` });
    }
    mensajes.push({ role: fila.role, content: fila.content });
  }
  return mensajes;
}

export function historialInicial(caso: CasoDorado, pregunta: string, conContexto = true): MensajeHistorial[] {
  const historial: MensajeHistorial[] = [];
  if (conContexto) {
    for (const previo of caso.prior_context) {
      historial.push({ role: 'user', content: previo.user }, { role: 'assistant', content: previo.assistant_original });
    }
  }
  historial.push({ role: 'user', content: pregunta });
  return historial;
}

/** Conserva historia cruda completa; cada canal selecciona su ventana al construir. */
export function historialParaSiguienteTurno(
  anteriores: readonly MensajeHistorial[], respuesta: string, herramientas: HerramientaLlamada[], pregunta: string,
): MensajeHistorial[] {
  return structuredClone([...anteriores,
    { role: 'assistant' as const, content: respuesta, herramientas },
    { role: 'user' as const, content: pregunta },
  ]);
}

export function mensajesIniciales(caso: CasoDorado, promptBase: string, pregunta: string, conContexto = true): MensajeLlm[] {
  return mensajesDesdeHistorial(historialInicial(caso, pregunta, conContexto), promptBase, caso.channel);
}

/** API cruda explícita: nunca reconstruye filas desde mensajes LLM expandidos. */
export function mensajesParaSiguienteTurno(
  anteriores: readonly MensajeHistorial[], promptBase: string, respuesta: string,
  herramientas: HerramientaLlamada[], pregunta: string, canal: 'Web' | 'Telegram',
): MensajeLlm[] {
  return mensajesDesdeHistorial(historialParaSiguienteTurno(anteriores, respuesta, herramientas, pregunta), promptBase, canal);
}
