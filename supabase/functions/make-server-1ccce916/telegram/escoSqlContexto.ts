import { esObjetoSql } from "./escoSqlContrato.ts";
export interface IdentidadContextoSql {
  usuarioId: string;
  telegramId: number;
  chatId: number;
}
interface ResultadoContexto {
  data: Record<string, unknown> | null;
  error: unknown;
}
interface TerminalContexto {
  maybeSingle: () => PromiseLike<ResultadoContexto>;
}
interface IgualdadContexto extends TerminalContexto {
  eq: (columna: string, valor: string) => TerminalContexto;
}
interface FiltroContexto extends TerminalContexto {
  eq: (columna: string, valor: string) => IgualdadContexto;
}
export interface ClienteContextoSql {
  from: (tabla: string) => {
    select: (columnas: "session" | "id") => FiltroContexto;
    insert: (fila: Record<string, unknown>) => PromiseLike<{ error: unknown }>;
    upsert: (
      fila: Record<string, unknown>,
      opciones: { onConflict: string },
    ) => PromiseLike<{ error: unknown }>;
  };
}
/** La fila no comparte key con el writeback de sesión de grammY. */
export async function resolverContextoTelegramSql(
  cliente: ClienteContextoSql,
  identidad: IdentidadContextoSql,
  crearConversacion: () => Promise<string>,
  nueva = false,
  soloLectura = false,
): Promise<string> {
  const key =
    `esco-sql-context:v1:${identidad.usuarioId}:${identidad.telegramId}:${identidad.chatId}`;
  async function leer(): Promise<string | null> {
    const { data, error } = await cliente.from("telegram_sessions").select(
      "session",
    ).eq("key", key).maybeSingle();
    if (error) throw new Error("ESCO_SQL_CONTEXT_UNAVAILABLE");
    if (!data) return null;
    const s = data.session;
    if (
      !esObjetoSql(s) || s.version !== 1 ||
      s.usuarioId !== identidad.usuarioId ||
      s.telegramId !== identidad.telegramId || s.chatId !== identidad.chatId ||
      typeof s.conversationId !== "string" || !s.conversationId
    ) throw new Error("ESCO_SQL_CONTEXT_INVALID");
    return s.conversationId;
  }
  async function exigirDueno(id: string): Promise<string> {
    const { data, error } = await cliente.from("chat_conversations").select(
      "id",
    ).eq("id", id).eq("user_id", identidad.usuarioId).maybeSingle();
    if (error || data?.id !== id) {
      throw new Error("ESCO_SQL_CONVERSATION_UNAVAILABLE");
    }
    return id;
  }
  if (!nueva) {
    const previo = await leer();
    if (previo) return exigirDueno(previo);
  }
  if (soloLectura) throw new Error("ESCO_SQL_CONTEXT_UNAVAILABLE");
  const conversationId = await crearConversacion();
  const fila = { key, session: { version: 1, ...identidad, conversationId } };
  const { error } = nueva
    ? await cliente.from("telegram_sessions").upsert(fila, {
      onConflict: "key",
    })
    : await cliente.from("telegram_sessions").insert(fila);
  if (error) {
    if (!nueva && esObjetoSql(error) && error.code === "23505") {
      const ganador = await leer();
      if (ganador) return exigirDueno(ganador);
    }
    throw new Error("ESCO_SQL_CONTEXT_WRITE_UNCERTAIN");
  }
  return conversationId;
}
