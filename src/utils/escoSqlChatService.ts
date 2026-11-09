import { getSupabase } from './supabase/client';
import { projectId } from './supabase/info.tsx';
import type { ChatMessage } from '@/types/chat';
import type { Json } from '@/types/database';
import { textoHistorialSql } from './escoSql/loop';
import { leerMetadataSql, leerRespuestaSqlWeb, metadataRespuestaSql, type RespuestaSqlWeb } from './escoSqlChat';

export interface EventoSqlWeb { type: string; consulta?: number; proposito?: string; ms?: number; ok?: boolean; n_filas?: number | null; texto?: string; bloques?: unknown[]; sugerencias?: string[]; aclaracion?: unknown; resultado?: unknown; message?: string }
const abortar = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException('Solicitud detenida', 'AbortError'); };

export async function leerStreamSql(response: Response, onEvento: (evento: EventoSqlWeb) => void, signal?: AbortSignal): Promise<RespuestaSqlWeb> {
  if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || `Error del servidor: ${response.status}`); }
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    const resultado = leerRespuestaSqlWeb(await response.json());
    if (!resultado) throw new Error('Respuesta SQL inválida');
    onEvento({ type: 'texto', texto: resultado.texto });
    onEvento({ type: 'done', resultado });
    return resultado;
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No se pudo leer la respuesta SQL');
  const cancelar = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancelar, { once: true });
  const decoder = new TextDecoder();
  let buffer = '';
  let resultado: RespuestaSqlWeb | null = null;
  const procesar = (frame: string) => {
    const datos = frame.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
    if (!datos || datos === '[DONE]') return;
    let evento: EventoSqlWeb;
    try { evento = JSON.parse(datos) as EventoSqlWeb; } catch { throw new Error('Evento SQL inválido'); }
    if (!evento || typeof evento !== 'object' || typeof evento.type !== 'string') throw new Error('Evento SQL inválido');
    if (evento.type === 'error') throw new Error(evento.message || 'Error del asistente');
    if (evento.type === 'done') { resultado = leerRespuestaSqlWeb(evento.resultado); if (!resultado) throw new Error('Respuesta SQL final inválida'); }
    onEvento(evento);
  };
  try {
    while (!resultado) {
      abortar(signal);
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');
      let limite: number;
      while ((limite = buffer.indexOf('\n\n')) >= 0 && !resultado) { procesar(buffer.slice(0, limite)); buffer = buffer.slice(limite + 2); }
      if (done) { if (buffer.trim() && !resultado) procesar(buffer); break; }
    }
    abortar(signal);
    if (!resultado) throw new Error('Respuesta SQL incompleta. Intenta de nuevo.');
    return resultado;
  } finally { signal?.removeEventListener('abort', cancelar); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function enviarMensajeSql(conversationId: string | null, pregunta: string, mensajes: ChatMessage[], onEvento: (evento: EventoSqlWeb) => void, signal?: AbortSignal): Promise<{ conversationId: string; asistente: ChatMessage }> {
  abortar(signal);
  const cliente = getSupabase();
  const { data: { session } } = await cliente.auth.getSession();
  if (!session?.access_token || !session.user?.id) throw new Error('No hay sesión activa');
  if (conversationId) {
    const { data, error } = await cliente.from('chat_conversations').select('id').eq('id', conversationId).eq('user_id', session.user.id).maybeSingle();
    if (error || !data) throw new Error('La conversación no está disponible');
  }
  const historial = mensajes.slice(-10).map((m) => {
    const meta = leerMetadataSql(m.metadata);
    return { rol: m.role, texto: (m.role === 'assistant' && meta ? textoHistorialSql(m.content, meta.consultas) : m.content).slice(0, 4000) };
  });
  const response = await fetch(`https://${projectId}.supabase.co/functions/v1/esco-consultas`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ motor: 'sql', pregunta, historial }), signal });
  const resultado = await leerStreamSql(response, onEvento, signal);
  abortar(signal);
  let id = conversationId;
  if (!id) {
    const { data, error } = await cliente.from('chat_conversations').insert({ user_id: session.user.id, title: pregunta.slice(0, 80) }).select('id').single();
    if (error || !data) throw new Error('La respuesta llegó, pero no se pudo guardar la conversación');
    id = data.id;
  }
  const ahora = new Date().toISOString();
  const metadata = metadataRespuestaSql(resultado, ahora);
  const asistente: ChatMessage = { id: crypto.randomUUID(), conversation_id: id, role: 'assistant', content: resultado.texto, metadata: { ...metadata }, created_at: new Date(Date.parse(ahora) + 1).toISOString() };
  const { error } = await cliente.from('chat_messages').insert([
    { id: crypto.randomUUID(), conversation_id: id, role: 'user', content: pregunta, metadata: { motor: 'sql' }, created_at: ahora },
    { ...asistente, metadata: JSON.parse(JSON.stringify(metadata)) as Json },
  ]);
  if (error) throw new Error('La respuesta llegó, pero no se pudo guardar el turno. Vuelve a abrir el historial para comprobarlo.');
  return { conversationId: id, asistente };
}
