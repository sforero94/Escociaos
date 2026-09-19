// telegram/resolverUsuarioTelegram.ts — lookup de `telegram_usuarios` para
// atribución de escrituras y para write-gates.
//
// NUNCA usar `ctx.telegramUser?.usuario_id` para eso: grammy
// conversations@2 no lleva el flavor de middleware propio al replay del
// handler (hallazgo 2026-08-28 en excepcionDavid; falso "no vinculada" de
// /pesaje el 2026-09-19, issue #273). `ctx.from.id` sí es nativo de grammY
// y sobrevive; este helper relee `telegram_usuarios` por ese id. En una
// conversación, el llamante envuelve la llamada en `conversation.external()`
// (el resultado es JSON-serializable a propósito).
//
// `ctx.telegramUser` sigue sirviendo para "¿estás registrado?" y para los
// menús de módulos — no para escribir.
//
// Este archivo no importa Deno ni grammy a propósito: Vitest lo carga
// directo. Las dos copias del árbol de edge functions tienen que ser
// byte-idénticas.

export type FilaTelegramAtribucion = {
  id: string;
  usuario_id: string | null;
  nombre_display: string | null;
};

export type MotivoResolverUsuarioTelegram =
  | "sin_telegram_id"
  | "no_registrado"
  | "sin_usuario_id"
  | "error_db";

export type ResultadoResolverUsuarioTelegram =
  | {
      ok: true;
      fila: FilaTelegramAtribucion;
      usuarioId: string | null;
      nombreDisplay: string | null;
    }
  | {
      ok: false;
      motivo: Exclude<MotivoResolverUsuarioTelegram, "sin_usuario_id">;
    };

/** Cadena PostgREST mínima. Vitest mockea esto sin el cliente Deno. */
export interface ClienteConsultaTelegram {
  from: (tabla: string) => {
    select: (columnas: string) => {
      eq: (
        columna: string,
        valor: string | number | boolean,
      ) => {
        eq: (
          columna: string,
          valor: string | number | boolean,
        ) => {
          maybeSingle: () => Promise<{
            data: FilaTelegramAtribucion | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
}

/** Atribución que el bot escribe con service_role (`auth.uid()` es NULL). */
export function atribucionDesdeFilaTelegram(
  fila: { usuario_id: string | null; nombre_display: string | null } | null,
): { usuarioId: string | null; nombreDisplay: string | null } {
  return {
    usuarioId: fila?.usuario_id ?? null,
    nombreDisplay: fila?.nombre_display ?? null,
  };
}

export function mensajeResolverUsuarioTelegram(
  motivo: MotivoResolverUsuarioTelegram,
  accion?: string,
): string {
  switch (motivo) {
    case "sin_telegram_id":
      return "No pude identificar tu cuenta de Telegram. Escribe /start e inténtalo de nuevo.";
    case "no_registrado":
      return "No estás registrado. Pide un código de acceso a tu administrador.";
    case "sin_usuario_id": {
      const cola = accion ? ` antes de ${accion}` : "";
      return `Tu cuenta de Telegram no está vinculada a un usuario del sistema -- avisa a un administrador${cola}.`;
    }
    case "error_db":
      return "No pude consultar tu cuenta ahora mismo. Inténtalo de nuevo en un momento.";
  }
}

export async function resolverUsuarioTelegram(
  cliente: ClienteConsultaTelegram,
  telegramId: number | string | null | undefined,
): Promise<ResultadoResolverUsuarioTelegram> {
  if (telegramId == null || telegramId === "") {
    return { ok: false, motivo: "sin_telegram_id" };
  }
  const idNumerico = typeof telegramId === "number" ? telegramId : Number(telegramId);
  if (!Number.isFinite(idNumerico)) {
    return { ok: false, motivo: "sin_telegram_id" };
  }

  const { data, error } = await cliente
    .from("telegram_usuarios")
    .select("id, usuario_id, nombre_display")
    .eq("telegram_id", idNumerico)
    .eq("activo", true)
    .maybeSingle();

  if (error) {
    console.error("[telegram] resolverUsuarioTelegram:", error.message);
    return { ok: false, motivo: "error_db" };
  }
  if (!data) {
    return { ok: false, motivo: "no_registrado" };
  }

  const fila: FilaTelegramAtribucion = {
    id: data.id,
    usuario_id: data.usuario_id ?? null,
    nombre_display: data.nombre_display ?? null,
  };
  const atribucion = atribucionDesdeFilaTelegram(fila);
  return {
    ok: true,
    fila,
    usuarioId: atribucion.usuarioId,
    nombreDisplay: atribucion.nombreDisplay,
  };
}

/** Write-gate para flujos que SÍ exigen `usuarios.id` (pesaje, Esco, mem_save).
 * `usuario_id` NULL en la fila es un desvínculo real, no un fallo del lookup. */
export function exigirUsuarioIdVinculado(
  resultado: ResultadoResolverUsuarioTelegram,
):
  | {
      ok: true;
      usuarioId: string;
      fila: FilaTelegramAtribucion;
      nombreDisplay: string | null;
    }
  | { ok: false; motivo: MotivoResolverUsuarioTelegram } {
  if (!resultado.ok) return resultado;
  if (!resultado.usuarioId) {
    return { ok: false, motivo: "sin_usuario_id" };
  }
  return {
    ok: true,
    usuarioId: resultado.usuarioId,
    fila: resultado.fila,
    nombreDisplay: resultado.nombreDisplay,
  };
}
