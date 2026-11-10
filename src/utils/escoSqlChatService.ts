import { getSupabase } from './supabase/client';
import { projectId } from './supabase/info.tsx';
import type { ChatMessage } from '@/types/chat';
import type { Json } from '@/types/database';
import { construirHistorialSql } from './escoSql/historial';
import { hashHistorialSql, leerReciboTurnoSql, leerUsoTurnoSql, type CanalTurnoSql, type ContextoTurnoSql, type ReciboTurnoSql, type UsoTurnoSql } from './escoSql/turno';
import { leerRespuestaSqlWeb, metadataRespuestaSql, type RespuestaSqlWeb } from './escoSqlChat';

export interface EventoSqlWeb { type: string; consulta?: number; proposito?: string; ms?: number; ok?: boolean; n_filas?: number | null; texto?: string; bloques?: unknown[]; sugerencias?: string[]; aclaracion?: unknown; resultado?: unknown; message?: string; turno_id?: string; canal?: CanalTurnoSql; historial_sha256?: string; recibo?: unknown; uso?: unknown }
const objeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const abortar = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException('Solicitud detenida', 'AbortError'); };
const esAbort = (error: unknown) => (error instanceof Error || error instanceof DOMException) && error.name === 'AbortError';
export class ErrorTurnoSqlWeb extends Error {
  readonly uso: UsoTurnoSql | null;
  conversationId?: string;
  constructor(message: string, readonly recibo: ReciboTurnoSql | null = null, readonly fase: 'motor' | 'transporte' | 'persistencia' | 'cancelacion' = 'motor', readonly contexto: ContextoTurnoSql | null = recibo, readonly mensajeIds?: readonly string[]) {
    super(message);
    this.name = fase === 'cancelacion' ? 'AbortError' : 'ErrorTurnoSqlWeb';
    this.uso = recibo?.uso ?? null;
  }
}
function contextoEvento(valor: unknown): ContextoTurnoSql | null {
  if (!objeto(valor) || valor.canal !== 'web' || typeof valor.turno_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor.turno_id) || typeof valor.historial_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(valor.historial_sha256)) return null;
  return { turno_id: valor.turno_id, canal: 'web', historial_sha256: valor.historial_sha256 };
}
function reciboError(valor: unknown): ReciboTurnoSql | null {
  if (!objeto(valor)) return null;
  const r = leerReciboTurnoSql(valor.recibo);
  if (!r || r.canal !== 'web' || (r.uso === null ? valor.uso !== null : JSON.stringify(leerUsoTurnoSql(valor.uso)) !== JSON.stringify(r.uso))) return null;
  return r;
}
const mismoContexto = (a: ContextoTurnoSql, b: ContextoTurnoSql) => a.turno_id === b.turno_id && a.canal === b.canal && a.historial_sha256 === b.historial_sha256;

export async function leerStreamSql(response: Response, onEvento: (evento: EventoSqlWeb) => void, signal?: AbortSignal): Promise<RespuestaSqlWeb> {
  if (!response.ok) {
    const error: unknown = await response.json().catch(() => ({}));
    const r = reciboError(error);
    throw new ErrorTurnoSqlWeb(objeto(error) && typeof error.error === 'string' ? error.error : `Error del servidor: ${response.status}`, r);
  }
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    const resultado = leerRespuestaSqlWeb(await response.json());
    if (!resultado || (resultado.recibo && resultado.recibo.canal !== 'web')) throw new ErrorTurnoSqlWeb('Respuesta SQL inválida');
    try {
      if (resultado.recibo) onEvento({ type: 'turno', turno_id: resultado.recibo.turno_id, canal: resultado.recibo.canal, historial_sha256: resultado.recibo.historial_sha256 });
      onEvento({ type: 'texto', texto: resultado.texto, ...(resultado.recibo ? { turno_id: resultado.recibo.turno_id, canal: resultado.recibo.canal } : {}) });
      onEvento({ type: 'done', resultado, ...(resultado.recibo ? { turno_id: resultado.recibo.turno_id, canal: resultado.recibo.canal } : {}) });
    } catch {
      throw new ErrorTurnoSqlWeb('No se pudo entregar la respuesta SQL', resultado.recibo ?? null, 'transporte');
    }
    return resultado;
  }
  const reader = response.body?.getReader();
  if (!reader) throw new ErrorTurnoSqlWeb('No se pudo leer la respuesta SQL', null, 'transporte');
  const cancelar = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancelar, { once: true });
  const decoder = new TextDecoder();
  let buffer = '';
  let resultado: RespuestaSqlWeb | null = null;
  let contexto: ContextoTurnoSql | null = null;
  const procesar = (frame: string) => {
    const datos = frame.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
    if (!datos || datos === '[DONE]') return;
    let raw: unknown;
    try { raw = JSON.parse(datos); } catch { throw new ErrorTurnoSqlWeb('Evento SQL inválido', null, 'transporte', contexto); }
    if (!objeto(raw) || typeof raw.type !== 'string') throw new ErrorTurnoSqlWeb('Evento SQL inválido', null, 'transporte', contexto);
    const evento = raw as unknown as EventoSqlWeb;
    if (evento.type === 'turno') {
      const recibido = contextoEvento(raw);
      if (!recibido || (contexto && !mismoContexto(contexto, recibido))) throw new ErrorTurnoSqlWeb('Identidad del turno SQL inválida', null, 'transporte', contexto);
      contexto = recibido;
    } else if (contexto && (raw.turno_id !== contexto.turno_id || raw.canal !== contexto.canal)) throw new ErrorTurnoSqlWeb('Identidad del turno SQL inválida', null, 'transporte', contexto);
    if (evento.type === 'error') {
      const r = reciboError(raw);
      if (r && contexto && !mismoContexto(contexto, r)) throw new ErrorTurnoSqlWeb('Identidad del turno SQL inválida', null, 'transporte', contexto);
      onEvento(evento);
      throw new ErrorTurnoSqlWeb(typeof evento.message === 'string' ? evento.message : 'Error del asistente', r, 'motor', contexto);
    }
    if (evento.type === 'done') {
      resultado = leerRespuestaSqlWeb(evento.resultado);
      if (!resultado || (contexto && !resultado.recibo) || (resultado.recibo && (!contexto || !mismoContexto(contexto, resultado.recibo)))) throw new ErrorTurnoSqlWeb('Respuesta SQL final inválida', null, 'transporte', contexto);
    }
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
    if (!resultado) throw new ErrorTurnoSqlWeb('Respuesta SQL incompleta. Intenta de nuevo.', null, 'transporte', contexto);
    return resultado;
  } catch (error) {
    if (error instanceof ErrorTurnoSqlWeb) throw error;
    if (esAbort(error)) throw new ErrorTurnoSqlWeb('Solicitud detenida', (resultado as RespuestaSqlWeb | null)?.recibo ?? null, 'cancelacion', contexto);
    throw new ErrorTurnoSqlWeb('No se pudo completar la respuesta SQL', (resultado as RespuestaSqlWeb | null)?.recibo ?? null, 'transporte', contexto);
  } finally { signal?.removeEventListener('abort', cancelar); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function enviarMensajeSql(conversationId: string | null, pregunta: string, _mensajes: ChatMessage[], onEvento: (evento: EventoSqlWeb) => void, signal?: AbortSignal): Promise<{ conversationId: string; asistente: ChatMessage }> {
  abortar(signal);
  const cliente = getSupabase();
  const { data: { session } } = await cliente.auth.getSession();
  if (!session?.access_token || !session.user?.id) throw new Error('No hay sesión activa');
  let historial: ReturnType<typeof construirHistorialSql> = [];
  if (conversationId) {
    const { data, error } = await cliente.from('chat_conversations').select('id').eq('id', conversationId).eq('user_id', session.user.id).maybeSingle();
    if (error || !data) throw new Error('La conversación no está disponible');
    const filas = await cliente.from('chat_messages').select('id,role,content,metadata,created_at').eq('conversation_id', conversationId).eq('metadata->>motor', 'sql').in('role', ['user', 'assistant']).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(10);
    if (filas.error) throw new Error('No se pudo cargar el historial SQL');
    historial = construirHistorialSql(filas.data ?? []);
  }
  const historialHash = await hashHistorialSql(historial);
  const nuevaConversacion = async (): Promise<string> => {
    const { data, error } = await cliente.from('chat_conversations').insert({ user_id: session.user.id, title: pregunta.slice(0, 80) }).select('id').single();
    if (error || !data) throw new Error('La respuesta llegó, pero no se pudo guardar la conversación');
    return data.id;
  };
  let resultado: RespuestaSqlWeb;
  try {
    const response = await fetch(`https://${projectId}.supabase.co/functions/v1/esco-consultas`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ motor: 'sql', pregunta, historial }), signal });
    resultado = await leerStreamSql(response, onEvento, signal);
    if (resultado.recibo && (resultado.recibo.canal !== 'web' || resultado.recibo.historial_sha256 !== historialHash)) throw new ErrorTurnoSqlWeb('El contexto del turno SQL no coincide', null, 'transporte');
    if (signal?.aborted) throw new ErrorTurnoSqlWeb('Solicitud detenida', resultado.recibo ?? null, 'cancelacion');
  } catch (error) {
    const fallo = error instanceof ErrorTurnoSqlWeb ? error : esAbort(error) ? new ErrorTurnoSqlWeb('Solicitud detenida', null, 'cancelacion') : error;
    if (fallo instanceof ErrorTurnoSqlWeb && fallo.recibo && fallo.recibo.historial_sha256 === historialHash) {
      try {
        const id = conversationId ?? await nuevaConversacion();
        const ahora = new Date().toISOString();
        const metadata = { motor: 'sql_error', recibo: fallo.recibo, uso: fallo.recibo.uso, entrega: { estado: 'error', fase: fallo.fase } };
        const { error: guardarError } = await cliente.from('chat_messages').insert([
          { id: crypto.randomUUID(), conversation_id: id, role: 'user', content: pregunta, metadata: { motor: 'sql_error' }, created_at: ahora },
          { id: crypto.randomUUID(), conversation_id: id, role: 'assistant', content: 'La consulta SQL no se completó o no se pudo entregar.', metadata: JSON.parse(JSON.stringify(metadata)) as Json, created_at: new Date(Date.parse(ahora) + 1).toISOString() },
        ]);
        if (!guardarError) fallo.conversationId = id;
      } catch { /* El recibo recibido sigue disponible en el error; no se reintenta la escritura. */ }
    }
    throw fallo;
  }
  let id = conversationId;
  let mensajeIds: string[] | undefined;
  try {
    if (!id) id = await nuevaConversacion();
    const ahora = new Date().toISOString();
    const metadata = metadataRespuestaSql(resultado, ahora);
    const userId = crypto.randomUUID();
    const asistente: ChatMessage = { id: crypto.randomUUID(), conversation_id: id, role: 'assistant', content: resultado.texto, metadata: { ...metadata }, created_at: new Date(Date.parse(ahora) + 1).toISOString() };
    mensajeIds = [userId, asistente.id];
    const { error } = await cliente.from('chat_messages').insert([
      { id: userId, conversation_id: id, role: 'user', content: pregunta, metadata: { motor: 'sql' }, created_at: ahora },
      { ...asistente, metadata: JSON.parse(JSON.stringify(metadata)) as Json },
    ]);
    if (error) throw new Error('La respuesta llegó, pero no se pudo guardar el turno. Vuelve a abrir el historial para comprobarlo antes de reenviar.');
    return { conversationId: id, asistente };
  } catch (error) {
    const fallo = new ErrorTurnoSqlWeb(error instanceof Error ? error.message : 'No se pudo conservar el turno SQL. Reabre el historial antes de reenviar.', resultado.recibo ?? null, 'persistencia', resultado.recibo ?? null, mensajeIds);
    if (id) fallo.conversationId = id;
    throw fallo;
  }
}
