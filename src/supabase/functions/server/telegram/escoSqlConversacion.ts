// El contexto SQL nunca reutiliza la conversación legacy reciente por tiempo.
interface ResultadoConversacion {
  data: Record<string, unknown> | null;
  error: unknown;
}
interface TerminalConversacion {
  maybeSingle: () => PromiseLike<ResultadoConversacion>;
}
interface IgualdadConversacion extends TerminalConversacion {
  eq: (columna: string, valor: string) => TerminalConversacion;
}
interface FiltroConversacion extends TerminalConversacion {
  eq: (columna: string, valor: string) => IgualdadConversacion;
}
export interface ClienteConversacionSql {
  from: (
    tabla: string,
  ) => {
    select: (columnas: "id") => FiltroConversacion;
    insert: (
      fila: Record<string, unknown>,
    ) => {
      select: (
        columnas: "id",
      ) => { single: () => PromiseLike<ResultadoConversacion> };
    };
  };
}
export async function obtenerConversacionTelegramSql(
  cliente: ClienteConversacionSql,
  usuarioId: string,
  seleccionId?: string,
): Promise<string> {
  if (seleccionId) {
    const { data, error } = await cliente.from("chat_conversations").select(
      "id",
    ).eq("id", seleccionId).eq("user_id", usuarioId).maybeSingle();
    if (error || !data || data.id !== seleccionId) {
      throw new Error("ESCO_SQL_CONVERSATION_UNAVAILABLE");
    }
    return seleccionId;
  }
  const { data, error } = await cliente.from("chat_conversations").insert({
    user_id: usuarioId,
    title: "Telegram SQL",
  }).select("id").single();
  if (error || !data || typeof data.id !== "string" || !data.id) {
    throw new Error("ESCO_SQL_CONVERSATION_UNAVAILABLE");
  }
  return data.id;
}
