import { getSupabase } from './supabase/client';
import { projectId, publicAnonKey } from './supabase/info.tsx';
import type { ChatConversation, ChatMessage, ChatStreamEvent } from '@/types/chat';

const EDGE_FUNCTION_BASE = `https://${projectId}.supabase.co/functions/v1`;

export async function sendChatMessage(
  conversationId: string | null,
  message: string,
  onDelta: (event: ChatStreamEvent) => void,
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
  return data || [];
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
