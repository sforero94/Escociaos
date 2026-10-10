// Bound the stream before parsing: Content-Length is optional and untrusted.
export const MAX_CHAT_BODY_BYTES = 32 * 1024;
export const MAX_CHAT_MESSAGE_BYTES = 16 * 1024;
export class ChatRequestError extends Error {
  constructor(message: string, readonly status: 400 | 413) { super(message); }
}
export async function readChatRequest(request: Request): Promise<{ message: string; conversation_id?: string | null }> {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_CHAT_BODY_BYTES)) {
    throw new ChatRequestError('Solicitud demasiado grande o inválida', 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ChatRequestError('Body inválido', 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_CHAT_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        throw new ChatRequestError('Solicitud demasiado grande', 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let body: unknown;
  try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new ChatRequestError('Body inválido', 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(key => key !== 'message' && key !== 'conversation_id')) {
    throw new ChatRequestError('Campos de solicitud inválidos', 400);
  }
  const input = body as { message?: unknown; conversation_id?: unknown };
  if (typeof input.message !== 'string' || !input.message.trim()) {
    throw new ChatRequestError('Mensaje vacío', 400);
  }
  if (new TextEncoder().encode(input.message).byteLength > MAX_CHAT_MESSAGE_BYTES) {
    throw new ChatRequestError('Mensaje demasiado grande', 413);
  }
  if (input.conversation_id !== undefined && input.conversation_id !== null
    && (typeof input.conversation_id !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.conversation_id))) {
    throw new ChatRequestError('Conversación inválida', 400);
  }
  return input as { message: string; conversation_id?: string | null };
}
