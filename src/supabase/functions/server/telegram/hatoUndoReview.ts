import { validateHatoUndoAttempt, validateHatoUndoReceipt, type HatoUndoAttempt, type HatoUndoClient, type HatoUndoReceipt } from '../hato-undo-protocol.ts';

type Operation = 'event' | 'treatment';
type Action = 'c' | 'x' | 's' | 'n';
export interface HatoReview extends HatoUndoAttempt {
  state: 'pending' | 'cancelled' | 'committed'; receipt: HatoUndoReceipt | null;
  animal: { numero: number | null; nombre: string | null };
}
interface Buttons { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> }
export interface UndoReviewContext {
  from?: { id: number }; chat?: { id: number; type: string };
  callbackQuery: { data?: string; message?: { message_id: number } };
  api: { sendMessage(chat: number, text: string, options?: { reply_markup: Buttons }): Promise<{ message_id: number; chat: { id: number } }> };
  answerCallbackQuery(options: { text: string }): Promise<unknown>;
  editMessageText(text: string, options?: { reply_markup: Buttons }): Promise<unknown>;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const MAX_REVIEW_BYTES = 12 * 1024;
const prefix = (operation: Operation) => operation === 'event' ? 'hato_ev_undo:' : 'hato_tr_undo:';
export function parseHatoReviewCallback(data: string, operation: Operation): { id: string; action: Action | null } | null {
  if (new TextEncoder().encode(data).length > 64 || !data.startsWith(prefix(operation))) return null;
  const parts = data.slice(prefix(operation).length).toLowerCase().split(':');
  if (!UUID.test(parts[0])) return null;
  if (parts.length === 1 || (operation === 'event' && parts.length === 2 && parts[1] === '-')) return { id: parts[0], action: null };
  if (parts.length === 2 && ['c','x','s','n'].includes(parts[1])) return { id: parts[0], action: parts[1] as Action };
  return null; // Legacy usage UUIDs exceed the cap and never prove an association.
}
function callback(operation: Operation, key: string, action: Action) { return `${prefix(operation)}${key}:${action}`; }
function buttons(review: HatoReview, completeReview = true): Buttons {
  const op = review.payload.operation;
  return { inline_keyboard: review.state === 'cancelled'
    ? [[{ text: 'Solicitar nueva revisión', callback_data: callback(op, review.key, 'n') }]]
    : completeReview ? [[{ text: 'Confirmar deshacer', callback_data: callback(op, review.key, 'c') }, { text: 'Cancelar', callback_data: callback(op, review.key, 'x') }],
      [{ text: 'Verificar estado', callback_data: callback(op, review.key, 's') }]] : [[{text:'Cancelar revisión',callback_data:callback(op,review.key,'x')},{text:'Verificar estado',callback_data:callback(op,review.key,'s')}]] };
}
function canonical(value: unknown) {
  return JSON.stringify(value, (_key, item: unknown) => object(item) ? Object.fromEntries(Object.entries(item).sort(([a],[b]) => a.localeCompare(b))) : item);
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function validateHatoReview(value: unknown, sender: number): asserts value is HatoReview {
  if (!object(value) || Object.keys(value).sort().join('|') !== 'animal|key|payload|receipt|state|version'
    || !['pending','committed','cancelled'].includes(String(value.state)) || !object(value.animal)
    || Object.keys(value.animal).sort().join('|') !== 'nombre|numero'
    || (value.animal.numero !== null && (typeof value.animal.numero !== 'number' || !Number.isSafeInteger(value.animal.numero)))
    || (value.animal.nombre !== null && typeof value.animal.nombre !== 'string')) throw new Error('Revisión desconocida. Conserva el intento.');
  const attempt = { version: value.version, key: value.key, payload: value.payload };
  validateHatoUndoAttempt(attempt, sender);
  if (value.state === 'committed') validateHatoUndoReceipt(value.receipt, attempt);
  else if (value.receipt !== null) throw new Error('Estado de revisión inconsistente.');
}
class ReviewRefusal extends Error {}
const internal = new Set(['id','animal_id','tratamiento_id','created_at','updated_at','created_by','updated_by','fuente']);
const labels: Record<string, string> = { tipo: 'Evento', fecha: 'Fecha', tipo_servicio: 'Tipo de servicio', cria_destino: 'Destino de cría',
  datos: 'Detalles', notas: 'Notas', nota: 'Nota', observaciones: 'Observaciones', nombre: 'Tratamiento', estado: 'Estado',
  fecha_inicio: 'Fecha de inicio', fecha_confianza:'Confianza de la fecha', sx_raw:'Resultado original', offset_dias:'Días desde el inicio', requiere_confirmacion:'Requiere confirmación', chequeo_vaca_id:'Chequeo asociado', chequeo_id:'Chequeo asociado', cria_id:'Cría asociada', alerta_id:'Alerta asociada', transaccion_ganado_id:'Transacción asociada', paso_num: 'Paso', fecha_programada: 'Fecha programada', fecha_ejecutada: 'Fecha realizada', descripcion: 'Descripción' };
const types: Record<string,string> = { celo: 'Celo', confirmacion_prenez: 'Confirmación de preñez', parto: 'Parto', aborto: 'Aborto',
  secado_real: 'Secado', cambio_etapa: 'Cambio de etapa', rechequeo: 'Rechequeo', servicio: 'Servicio', monta: 'Monta', activo: 'Activo' };
function clinical(value: unknown, field: string, depth = 0): string {
  if (depth > 12) throw new ReviewRefusal('La revisión contiene detalles demasiado extensos. Corrige desde la app.');
  if (value === null) return 'Sin dato';
  if (typeof value === 'string') {
    if (UUID.test(value.toLowerCase())) throw new ReviewRefusal('No pude identificar una referencia clínica para revisarla. Corrige desde la app.');
    return types[value] ?? value;
  }
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (Array.isArray(value)) return value.length ? value.map((v, i) => `${i + 1}. ${clinical(v, field, depth + 1)}`).join('\n') : 'Sin detalles';
  if (object(value)) return Object.entries(value).filter(([k]) => depth > 0 || !internal.has(k))
    .map(([k,v]) => `${labels[k] ?? `Campo ${k.replace(/_/g,' ')}`}: ${clinical(v,k,depth + 1)}`).join('\n') || 'Sin detalles';
  throw new ReviewRefusal('Detalle clínico inválido. Conserva el intento.');
}
export function renderHatoReview(review: HatoReview): string[] {
  const animal = [review.animal.numero === null ? 'Sin número' : `#${review.animal.numero}`, review.animal.nombre].filter(Boolean).join(' · ');
  const parts = [`Revisar deshacer ${review.payload.operation === 'event' ? 'evento' : 'tratamiento'}\nAnimal: ${animal}\nOrigen: Telegram\n\n${clinical(review.payload.snapshot.target,'target')}`,
    ...review.payload.snapshot.steps.map((step, i) => `Paso ${i + 1}\n${clinical(step,'step')}`)];
  const text = parts.join('\n\n');
  if (new TextEncoder().encode(text).length > MAX_REVIEW_BYTES) throw new ReviewRefusal('La revisión supera 12 KiB. Corrige desde la app; no deshice nada.');
  // Telegram counts UTF-16 units. Split without separating surrogate pairs.
  const chunks: string[] = []; let chunk = '';
  for (const character of text) { if (chunk.length + character.length > 3500) { chunks.push(chunk); chunk = ''; } chunk += character; }
  if (chunk) chunks.push(chunk);
  return chunks;
}
async function rpc(client: HatoUndoClient, name: string, args: Record<string, unknown>, sender: number): Promise<HatoReview> {
  const response = await client.rpc(name, args);
  if (response.error) throw new Error('No se confirmó el intento. Verifica su estado; no prepares otro.');
  validateHatoReview(response.data, sender); return response.data;
}
async function deliver(ctx: UndoReviewContext, client: HatoUndoClient, review: HatoReview, sender: number) {
  if (review.state === 'committed') { await ctx.api.sendMessage(sender, '↩️ Deshacer confirmado. No se repetirá la operación.'); return; }
  let completeReview = false;
  if (review.state === 'pending') {
    let chunks: string[];
    try { chunks = renderHatoReview(review); completeReview = true; }
    catch (error) {
      if (!(error instanceof ReviewRefusal)) throw error;
      // Complete this safe explanation before registering cancellation-only
      // controls. The database independently refuses confirmation from them.
      chunks = [error.message + '\nEsta revisión no permite confirmar deshacer. Puedes cancelarla o verificar su estado.'];
    }
    for (const text of chunks) {
      const sent = await ctx.api.sendMessage(sender, text);
      if (sent.chat.id !== sender || !Number.isSafeInteger(sent.message_id) || sent.message_id <= 0) throw new Error('No se confirmó la entrega privada.');
    }
  }
  const sent = await ctx.api.sendMessage(sender, review.state === 'cancelled' ? 'Revisión cancelada. No se deshizo el registro. Una nueva revisión necesita otra confirmación.'
    : completeReview ? 'Revisa los datos de esta revisión. ¿Deshacer exactamente este registro? Si cambió después de esta revisión, la operación se rechazará.' : 'No se puede confirmar deshacer con esta revisión. Puedes cancelarla.', { reply_markup: buttons(review,completeReview) });
  if (sent.chat.id !== sender || !Number.isSafeInteger(sent.message_id) || sent.message_id <= 0) throw new Error('No se confirmó la entrega privada.');
  const confirmed = await rpc(client,'fn_hato_undo_review_deliver',{ p_sender:sender,p_operation:review.payload.operation,p_request_key:review.key,p_chat_id:sent.chat.id,p_message_id:sent.message_id,p_complete_review:completeReview },sender);
  if (confirmed.key !== review.key || canonical(confirmed.payload) !== canonical(review.payload)) throw new Error('La entrega cambió de intento.');
}
export async function handleHatoUndoReview(ctx: UndoReviewContext, client: HatoUndoClient, operation: Operation): Promise<void> {
  const sender = ctx.from?.id, parsed = parseHatoReviewCallback(ctx.callbackQuery.data ?? '',operation);
  if (!sender || !Number.isSafeInteger(sender) || sender <= 0 || !parsed) { await ctx.answerCallbackQuery({ text:'No se pudo procesar.' }); return; }
  if (ctx.chat?.type !== 'private' || ctx.chat.id !== sender) { await ctx.answerCallbackQuery({ text:'Abre el chat privado con Esco para revisar esta operación.' }); return; }
  try {
    let review: HatoReview;
    if (parsed.action === null) {
      review = await rpc(client,'fn_hato_undo_review_begin',{p_sender:sender,p_operation:operation,p_target_id:parsed.id},sender);
      if (review.payload.operation !== operation || review.payload.target_id !== parsed.id) throw new Error('Revisión de otro registro.');
      await deliver(ctx,client,review,sender);
      await ctx.answerCallbackQuery({text:review.state === 'committed' ? 'Deshacer ya confirmado.' : 'Revisa el mensaje privado.'}); return;
    }
    const message = ctx.callbackQuery.message?.message_id;
    if (!Number.isSafeInteger(message) || !message || message <= 0) throw new Error('Falta la revisión privada original.');
    const args = {p_sender:sender,p_operation:operation,p_request_key:parsed.id,p_chat_id:ctx.chat.id,p_message_id:message};
    if (parsed.action === 'n') {
      review = await rpc(client,'fn_hato_undo_review_new',args,sender);
      if (review.key === parsed.id || review.payload.operation !== operation) throw new Error('Nueva revisión no confirmada.');
      await deliver(ctx,client,review,sender); await ctx.answerCallbackQuery({text:'Revisa los datos actuales en privado.'}); return;
    }
    review = await rpc(client, parsed.action === 's' ? 'fn_hato_undo_review_status' : 'fn_hato_undo_review_action',
      parsed.action === 's' ? args : {...args,p_action:parsed.action === 'c' ? 'confirm' : 'cancel'},sender);
    if (review.key !== parsed.id || review.payload.operation !== operation) throw new Error('Estado de otro intento.');
    await ctx.answerCallbackQuery({text:review.state === 'committed' ? 'Deshacer confirmado.' : review.state === 'cancelled' ? 'Cancelado.' : 'El intento sigue pendiente.'});
    if (review.state !== 'pending') await ctx.editMessageText(review.state === 'committed' ? '↩️ Deshacer confirmado. No se repetirá la operación.' : 'Revisión cancelada. No se deshizo el registro.',
      review.state === 'cancelled' ? {reply_markup:buttons(review)} : undefined);
  } catch {
    // No clinical details or SQL error are exposed; original attempt stays durable.
    await ctx.answerCallbackQuery({text:'No se confirmó. Abre la revisión privada para verificar el estado.'}).catch(() => {});
    await ctx.api.sendMessage(sender,'No pude verificar el resultado. Si ya tienes una revisión, usa Verificar estado o reintenta el mismo botón; conserva el intento original. Eventos asociados a pajillas, crías, chequeos o alertas necesitan corrección desde la app.').catch(() => {});
  }
}
