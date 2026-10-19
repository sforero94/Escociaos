// chat-propiedad.ts — puerta de propiedad de una conversación de Esco (ESCO-153).
//
// `handleChatMessage` lee y escribe `chat_conversations`/`chat_messages` con la
// service role, que se salta la RLS de esas tablas (que sí exige user_id). Sin
// esta comprobación, un `conversation_id` ajeno enviado por el cliente dejaba
// leer el historial de otra persona y escribir en su conversación.
//
// Módulo puro, sin imports de Deno, para que Vitest lo pruebe directamente.

export type ConsultarFilas = (table: string, query: string) => Promise<unknown[]>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Consulta PostgREST que devuelve la conversación solo si es del usuario. */
export function consultaPropiedadConversacion(conversationId: string, userId: string): string {
  return `select=id&id=eq.${encodeURIComponent(conversationId)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`;
}

/**
 * true solo si `conversationId` es un UUID y existe una fila de
 * `chat_conversations` con ese id y `user_id = userId`. Un id malformado se
 * rechaza sin consultar, así nunca llega a un filtro PostgREST.
 */
export async function conversacionPerteneceAUsuario(
  conversationId: unknown,
  userId: string,
  consultar: ConsultarFilas,
): Promise<boolean> {
  if (typeof conversationId !== 'string' || !UUID_RE.test(conversationId) || !userId) return false;
  const filas = await consultar('chat_conversations', consultaPropiedadConversacion(conversationId, userId));
  return Array.isArray(filas) && filas.some(
    (f) => typeof (f as { id?: unknown })?.id === 'string'
      && ((f as { id: string }).id).toLowerCase() === conversationId.toLowerCase(),
  );
}
