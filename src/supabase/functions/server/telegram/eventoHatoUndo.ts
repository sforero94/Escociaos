// telegram/eventoHatoUndo.ts — helpers puros del Deshacer de /evento.
//
// El 2026-09-08 Martha registró Electra+Jericó dos veces: ambas escrituras
// llegaron a `hato_eventos` + `hato_pajillas_uso`, y ella vio
// "Error registrando el evento". El botón Deshacer armaba
// `hato_ev_undo:${eventoUuid}:${usoUuid}` (~86 bytes). Telegram rechaza
// `callback_data` de más de 64 bytes; el `ctx.reply` fallaba y el catch
// de la conversación mentía. El camino sin pajilla (`…:-`, ~51 bytes)
// nunca falló.
//
// Contrato: el callback lleva SOLO el id del evento. El uso de pajilla
// se recupera del `datos.pajilla_uso_id` del evento, o —si esa anotación
// no está— del uso de la misma vaca y fecha más cercano en el tiempo.
// Sin migración: `hato_pajillas_uso` no tiene `evento_id`.
//
// Este archivo no importa Deno ni grammy a propósito: Vitest lo carga
// directo. Las dos copias del árbol de edge functions tienen que ser
// byte-idénticas.

export const PREFIJO_DESHACER_EVENTO = "hato_ev_undo:";
export const LIMITE_BYTES_CALLBACK_TELEGRAM = 64;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esUuid(valor: string): boolean {
  return UUID_RE.test(valor);
}

export function bytesCallbackData(data: string): number {
  return new TextEncoder().encode(data).length;
}

/** Formato viejo que Telegram rechazaba cuando había uso de pajilla. */
export function callbackDeshacerEventoLegacy(eventoId: string, usoId: string | null): string {
  return `${PREFIJO_DESHACER_EVENTO}${eventoId}:${usoId ?? "-"}`;
}

export function construirCallbackDeshacerEvento(eventoId: string): string {
  if (!esUuid(eventoId)) {
    throw new Error("eventoId inválido para Deshacer");
  }
  const callback = `${PREFIJO_DESHACER_EVENTO}${eventoId.toLowerCase()}`;
  if (bytesCallbackData(callback) > LIMITE_BYTES_CALLBACK_TELEGRAM) {
    throw new Error("callback_data de Deshacer excede el límite de Telegram");
  }
  return callback;
}

export function parsearCallbackDeshacerEvento(
  data: string,
): { eventoId: string; usoId: string | null } | null {
  const m = data.match(
    /^hato_ev_undo:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?::([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|-))?$/i,
  );
  if (!m) return null;
  return {
    eventoId: m[1].toLowerCase(),
    usoId: !m[2] || m[2] === "-" ? null : m[2].toLowerCase(),
  };
}

export function usoIdDesdeDatosEvento(datos: unknown): string | null {
  if (!datos || typeof datos !== "object") return null;
  const raw = (datos as Record<string, unknown>).pajilla_uso_id;
  if (typeof raw !== "string" || !esUuid(raw)) return null;
  return raw.toLowerCase();
}

export interface EventoParaDeshacerUso {
  animal_id: string;
  fecha: string;
  created_at: string;
}

export interface UsoCandidatoDeshacer {
  id: string;
  animal_id: string | null;
  fecha_uso: string;
  created_at: string;
}

/**
 * Resuelve el uso de pajilla que hay que devolver al deshacer.
 *
 * Prioridad: id del callback (botones viejos) → `datos.pajilla_uso_id` →
 * el uso de la misma vaca y fecha más cercano a `evento.created_at`.
 * El caller solo pasa candidatos cuando el evento es una inseminación;
 * si no, `usos` va vacío y no se inventa un uso de otro tipo de evento.
 */
export function elegirUsoIdParaDeshacer(args: {
  usoIdCallback: string | null;
  datosEvento: unknown;
  evento: EventoParaDeshacerUso;
  usos: UsoCandidatoDeshacer[];
}): string | null {
  if (args.usoIdCallback && esUuid(args.usoIdCallback)) {
    return args.usoIdCallback.toLowerCase();
  }
  const desdeDatos = usoIdDesdeDatosEvento(args.datosEvento);
  if (desdeDatos) return desdeDatos;

  const candidatos = args.usos.filter(
    (u) => u.animal_id === args.evento.animal_id && u.fecha_uso === args.evento.fecha,
  );
  if (candidatos.length === 0) return null;
  const tEvento = Date.parse(args.evento.created_at);
  if (Number.isNaN(tEvento)) return null;
  candidatos.sort(
    (a, b) =>
      Math.abs(Date.parse(a.created_at) - tEvento) -
      Math.abs(Date.parse(b.created_at) - tEvento),
  );
  return candidatos[0].id;
}

// ---------------------------------------------------------------------
// Deshacer de un TRATAMIENTO (2026-09-09)
// ---------------------------------------------------------------------
// Prefijo propio porque el efecto es otro: un tratamiento vive en
// `hato_tratamientos` y su paso de seguimiento cuelga con
// `ON DELETE CASCADE`, así que borrar la cabecera se lleva el paso — y con
// él la alerta que todavía no se había generado. Un `hato_ev_undo:` sobre
// este id no encontraría nada en `hato_eventos` y respondería "ya no
// existe", que es una mentira distinta del caso real.
//
// 13 + 36 = 49 bytes, holgadamente bajo el límite de 64 de Telegram; la
// guarda se conserva igual, porque el límite fue un fallo real
// (ver la cabecera de este archivo).

export const PREFIJO_DESHACER_TRATAMIENTO = "hato_tr_undo:";

export function construirCallbackDeshacerTratamiento(tratamientoId: string): string {
  if (!esUuid(tratamientoId)) {
    throw new Error("tratamientoId inválido para Deshacer");
  }
  const callback = `${PREFIJO_DESHACER_TRATAMIENTO}${tratamientoId.toLowerCase()}`;
  if (bytesCallbackData(callback) > LIMITE_BYTES_CALLBACK_TELEGRAM) {
    throw new Error("callback_data de Deshacer excede el límite de Telegram");
  }
  return callback;
}

export function parsearCallbackDeshacerTratamiento(data: string): { tratamientoId: string } | null {
  const m = data.match(
    /^hato_tr_undo:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
  );
  if (!m) return null;
  return { tratamientoId: m[1].toLowerCase() };
}

/** Atribución que el bot escribe con service_role (auth.uid() es NULL). */
export function atribucionDesdeFilaTelegram(
  fila: { usuario_id: string | null; nombre_display: string | null } | null,
): { usuarioId: string | null; nombreDisplay: string | null } {
  return {
    usuarioId: fila?.usuario_id ?? null,
    nombreDisplay: fila?.nombre_display ?? null,
  };
}
