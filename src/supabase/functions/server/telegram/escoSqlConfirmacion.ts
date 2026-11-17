import { esObjetoSql } from "./escoSqlContrato.ts";
interface Resultado {
  data: Record<string, unknown> | null;
  error: unknown;
}
interface Terminal {
  maybeSingle: () => PromiseLike<Resultado>;
}
interface Igualdad extends Terminal {
  eq: (columna: string, valor: string) => Terminal;
}
interface Filtro extends Terminal {
  eq: (columna: string, valor: string) => Igualdad;
}
export interface ClienteConfirmacionSql {
  from: (tabla: string) => {
    select: (
      columnas: "id" | "id,conversation_id,role,content,metadata,created_at",
    ) => Filtro;
    upsert: (
      filas: Record<string, unknown>[],
      opciones: { onConflict: string },
    ) => PromiseLike<{ error: unknown }>;
  };
}
export interface MensajeConfirmacionSql {
  id: string;
  content: string;
  created_at: string;
  metadata: Record<string, unknown>;
}
export interface ParConfirmacionSql {
  usuarioId: string;
  conversationId: string;
  usuario: MensajeConfirmacionSql;
  asistente: MensajeConfirmacionSql;
}
/** Una sola sentencia confirma el par. Un resultado incierto nunca admite reintento automático. */
export async function confirmarParTelegramSql(
  cliente: ClienteConfirmacionSql,
  entrada: ParConfirmacionSql,
): Promise<void> {
  const { data: owner, error: ownerError } = await cliente.from(
    "chat_conversations",
  ).select("id").eq("id", entrada.conversationId).eq(
    "user_id",
    entrada.usuarioId,
  ).maybeSingle();
  if (ownerError || owner?.id !== entrada.conversationId) {
    throw new Error("ESCO_SQL_CONVERSATION_UNAVAILABLE");
  }
  const { data: claim, error: claimError } = await cliente.from("chat_messages")
    .select("id,conversation_id,role,content,metadata,created_at").eq(
      "id",
      entrada.usuario.id,
    ).eq("conversation_id", entrada.conversationId).maybeSingle();
  if (
    claimError || !claim || claim.role !== "user" ||
    claim.content !== entrada.usuario.content ||
    (typeof claim.created_at !== "string" ||
      Date.parse(claim.created_at) !==
        Date.parse(entrada.usuario.created_at)) ||
    !esObjetoSql(claim.metadata) || claim.metadata.motor !== "sql_pending"
  ) throw new Error("ESCO_SQL_CLAIM_UNCONFIRMED");
  const { data: assistant, error: assistantError } = await cliente.from(
    "chat_messages",
  ).select("id").eq("id", entrada.asistente.id).maybeSingle();
  if (assistantError || assistant) throw new Error("ESCO_SQL_ASSISTANT_EXISTS");
  const filas = [
    {
      ...entrada.usuario,
      conversation_id: entrada.conversationId,
      role: "user",
    },
    {
      ...entrada.asistente,
      conversation_id: entrada.conversationId,
      role: "assistant",
    },
  ];
  try {
    const { error } = await cliente.from("chat_messages").upsert(filas, {
      onConflict: "id",
    });
    if (error) throw new Error("ESCO_SQL_CONFIRMATION_UNCERTAIN");
  } catch {
    throw new Error("ESCO_SQL_CONFIRMATION_UNCERTAIN");
  }
}
