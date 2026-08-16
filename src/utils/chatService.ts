import { getSupabase } from './supabase/client';
import { projectId, publicAnonKey } from './supabase/info.tsx';
import type { ChatConversation, ChatMessage, ChatStreamEvent } from '@/types/chat';

const EDGE_FUNCTION_BASE = `https://${projectId}.supabase.co/functions/v1`;

export async function sendChatMessage(
  conversationId: string | null,
  message: string,
  onDelta: (event: ChatStreamEvent) => void,
  /** Permite abandonar la respuesta desde el botón «Detener». */
  signal?: AbortSignal,
): Promise<void> {
  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('No hay sesion activa');
  }

  const response = await fetch(
    `${EDGE_FUNCTION_BASE}/make-server-1ccce916/chat/message`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        conversation_id: conversationId,
        message,
      }),
      signal,
    },
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Error del servidor: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No se pudo leer la respuesta');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if (!jsonStr || jsonStr === '[DONE]') continue;

      try {
        const event: ChatStreamEvent = JSON.parse(jsonStr);
        onDelta(event);
      } catch {
        // skip malformed events
      }
    }
  }
}

export async function fetchConversations(): Promise<ChatConversation[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('chat_conversations')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchMessages(conversationId: string): Promise<ChatMessage[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []) as ChatMessage[];
}

export async function deleteConversation(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('chat_conversations')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export async function renameConversation(id: string, title: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('chat_conversations')
    .update({ title })
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/**
 * Guarda una memoria de largo plazo que Esco propuso.
 *
 * El flujo estaba diseñado desde el principio — `chat.tsx` lo documenta: «el
 * cliente renderiza botones de confirmación en línea con el token» — y Telegram
 * lo implementó, pero la web nunca tuvo una sola línea. Le pedías a Esco que
 * recordara algo desde el navegador, contestaba que sí, y la fila jamás se
 * insertaba.
 *
 * La web no necesita el token ni el rol de servicio que usa Telegram: el
 * contenido propuesto ya viaja en la traza (`propose_memory_save` con sus
 * `args`), y la RLS de `esco_memorias` (migración 041) es
 * `user_id = auth.uid()` tanto en USING como en WITH CHECK, así que la sesión
 * del navegador puede insertar su propia memoria y ninguna otra.
 *
 * `esco_memorias` no está en los tipos generados (`database.ts`), de ahí el
 * escape — mismo patrón que `useClimaData` con las tablas de clima.
 */
/**
 * ¿Esta memoria ya está guardada?
 *
 * Al reabrir una conversación vieja la propuesta sigue en
 * `metadata.tool_interactions`, así que la tarjeta volvería a ofrecerla como si
 * nadie hubiera decidido nada — y aceptarla otra vez duplicaría la fila. No hay
 * en la metadata ninguna marca de "esto ya se guardó", así que la pregunta se le
 * hace a la tabla, que es quien sabe.
 */
export async function memoriaYaGuardada(content: string): Promise<boolean> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from('esco_memorias' as any)
    .select('id')
    .eq('content', content.trim().slice(0, 1000))
    .is('archived_at', null)
    .limit(1);

  if (error) return false; // ante la duda se ofrece: guardar de más es recuperable, perder la memoria no
  return (data?.length ?? 0) > 0;
}

export async function guardarMemoria(content: string): Promise<void> {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesion activa');

  const recorte = content.trim().slice(0, 1000); // CHECK char_length <= 1000
  if (!recorte) throw new Error('La memoria esta vacia');

  const { error } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from('esco_memorias' as any)
    .insert({ user_id: user.id, content: recorte, source_channel: 'web' } as never);

  if (error) throw new Error(error.message);
}
