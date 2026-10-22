// Armado de los mensajes que se le dan a Esco en una corrida de evaluación.
// Replica lo que hacen los dos canales de producción:
//   Web      — chat.tsx / handleChatMessage
//   Telegram — telegram/bot.ts / buildTelegramLlmMessages
// Si cambian allá, src/__tests__/escoEvalsMensajes.test.ts lo detecta.

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

export function promptDeSistema(base: string, canal: 'Web' | 'Telegram'): string {
  return canal === 'Telegram' ? base + AJUSTES_TELEGRAM : base;
}

function resumenDeHerramientas(herramientas: HerramientaLlamada[]): string {
  return herramientas
    .map((h) => `[${h.tool}(${JSON.stringify(h.args ?? {})}): ${h.result_summary ?? ''}]`)
    .join('\n');
}

/**
 * Mensajes iniciales: sistema + contexto previo de la conversación (con las
 * respuestas ORIGINALES de Esco, que son parte del historial que el caso fija)
 * + la pregunta.
 */
export function mensajesIniciales(caso: CasoDorado, promptBase: string, pregunta: string, conContexto = true): MensajeLlm[] {
  const mensajes: MensajeLlm[] = [{ role: 'system', content: promptDeSistema(promptBase, caso.channel) }];
  if (conContexto) {
    for (const previo of caso.prior_context) {
      mensajes.push({ role: 'user', content: previo.user });
      mensajes.push({ role: 'assistant', content: previo.assistant_original });
    }
  }
  mensajes.push({ role: 'user', content: pregunta });
  return mensajes;
}

/**
 * Mensajes para el turno siguiente: parte del historial en texto (como lo
 * recarga producción desde la base: solo texto, más un mensaje de sistema con
 * los datos consultados) y agrega la nueva pregunta. No reutiliza los mensajes
 * `tool_calls`/`tool` del turno anterior.
 */
export function mensajesParaSiguienteTurno(
  anteriores: MensajeLlm[],
  respuesta: string,
  herramientas: HerramientaLlamada[],
  pregunta: string,
  canal: 'Web' | 'Telegram',
): MensajeLlm[] {
  const texto = anteriores.filter((m) => (m.role === 'system' || m.role === 'user' || m.role === 'assistant') && !m.tool_calls);
  const salida: MensajeLlm[] = texto.map((m) => ({ role: m.role, content: m.content }));
  if (herramientas.length > 0) {
    const encabezado = canal === 'Telegram' ? ENCABEZADO_CONTEXTO_TELEGRAM : ENCABEZADO_CONTEXTO_WEB;
    salida.push({ role: 'system', content: `${encabezado}\n${resumenDeHerramientas(herramientas)}` });
  }
  salida.push({ role: 'assistant', content: respuesta });
  salida.push({ role: 'user', content: pregunta });
  return salida;
}

/** La hora a fijar para la corrida (UTC ISO) a partir de «AAAA-MM-DD HH:MM» en Bogotá (UTC-5, sin horario de verano). */
export function asOfUtc(asOfBogota: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(asOfBogota);
  if (!m) throw new Error(`as_of inválido: ${asOfBogota}`);
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]) + 5, Number(m[5]));
  return new Date(utc).toISOString();
}
