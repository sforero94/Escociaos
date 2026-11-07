// One contract for HTTP transport and the development client. No app/session imports.
import type { MensajeHistorial } from './esco2/tipos.ts';

export const MAX_MENSAJES_HISTORIAL = 12;
export const MAX_CONTEXTO_MENSAJE = 4000;
export const MAX_RESPUESTA_TRANSPORTE = 256 * 1024;
export const AVISO_EXTRACTO_HISTORIAL = '\n[EXTRACTO DE RESPUESTA ANTERIOR: detalle intermedio omitido por tamaño. No es una lista exhaustiva. Conserva el alcance de los mensajes del usuario y del estado válido; relee la fuente para calcular, no infieras datos omitidos.]\n';

/** Bound model context without presenting a silent prefix as a complete prior answer. */
export function compactarRespuestaHistorial(texto: string): string {
  if (texto.length <= MAX_CONTEXTO_MENSAJE) return texto;
  const disponible = MAX_CONTEXTO_MENSAJE - AVISO_EXTRACTO_HISTORIAL.length;
  const inicio = Math.floor(disponible * 0.7);
  const final = disponible - inicio;
  // Cut only at whitespace, never inside a token (including a UTF-16 pair).
  // A space between digits can itself be part of a formatted number.
  let corteCabeza = 0;
  let corteCola = texto.length;
  const inicioCola = texto.length - final;
  for (const espacio of texto.matchAll(/\s+/gu)) {
    const desde = espacio.index;
    const hasta = desde + espacio[0].length;
    if (/\p{Decimal_Number}$/u.test(texto.slice(Math.max(0, desde - 2), desde)) && /^\p{Decimal_Number}/u.test(texto.slice(hasta, hasta + 2))) continue;
    if (desde < inicio) corteCabeza = Math.min(hasta, inicio);
    if (hasta > inicioCola && corteCola === texto.length) corteCola = Math.max(desde, inicioCola);
  }
  const cabeza = texto.slice(0, corteCabeza);
  const cola = texto.slice(corteCola);
  return cabeza + AVISO_EXTRACTO_HISTORIAL + cola;
}

export function prepararHistorial(historial: readonly MensajeHistorial[]): MensajeHistorial[] {
  return historial.slice(-MAX_MENSAJES_HISTORIAL).map(m => ({
    rol: m.rol,
    texto: m.rol === 'assistant' ? compactarRespuestaHistorial(m.texto) : m.texto,
  }));
}
