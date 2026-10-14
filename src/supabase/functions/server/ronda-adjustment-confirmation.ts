/** Telegram human transport boundary. Proposal/source authority remains in PostgreSQL. */
export const RONDA_FORCE = /^rda_force:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
export const RONDA_REVIEW = /^rda_review:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
export class PendingRondaReview extends Error { constructor(public proposal: string, message: string) { super(message); } }
interface Client { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> }
interface Transport { sender?: number; chat?: { id: number; type: string }; message?: number }
export interface AdjustmentResult { excepcion_id?: string; movimiento_id?: string; saldo_anterior?: number; saldo_nuevo?: number; aplicado: boolean; motivo?: string; propuesta_id?: string; teorico_al_conteo?: number; teorico_hoy?: number; delta?: number; producto_nombre?: string; unidad?: string; fecha_movimiento?: string; cantidad_fisica?: number }
function identity(t: Transport) {
  if (!Number.isSafeInteger(t.sender) || (t.sender ?? 0) <= 0 || t.chat?.type !== 'private' || t.chat.id !== t.sender) throw new Error('La confirmación requiere tu chat privado actual.');
  return { p_sender: t.sender, p_chat: t.chat.id };
}
async function rpc(client: Client, name: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, args);
  if (error || !data || typeof data !== 'object') throw new Error('No se pudo verificar el resultado. Conserva el botón original para reintentar.');
  return data as Record<string, unknown>;
}
function reviewText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value);
}
function reviewDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
/** Explicit HTML escaping for the saved review identity; never interpret product text as markup. */
export function escapeRondaReviewText(value: string | undefined): string {
  return (value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}
function result(data: Record<string, unknown>): AdjustmentResult {
  if (data.aplicado === true) {
    if (typeof data.excepcion_id !== 'string' || typeof data.movimiento_id !== 'string' || !RONDA_FORCE.test(`rda_force:${data.excepcion_id}`) || !RONDA_FORCE.test(`rda_force:${data.movimiento_id}`)
      || ![data.saldo_anterior, data.saldo_nuevo, data.delta].every(x => typeof x === 'number' && Number.isFinite(x)) || (data.saldo_anterior as number) < 0 || (data.saldo_nuevo as number) < 0) throw new Error('No se verificó el recibo del ajuste. Conserva el botón original para reintentar.');
    return data as unknown as AdjustmentResult;
  }
  if (data.aplicado !== false || data.motivo !== 'teorico_cambio' || typeof data.propuesta_id !== 'string' || !RONDA_FORCE.test(`rda_force:${data.propuesta_id}`)
    || !reviewText(data.producto_nombre) || !reviewText(data.unidad) || !reviewDate(data.fecha_movimiento)
    || typeof data.cantidad_fisica !== 'number' || !Number.isFinite(data.cantidad_fisica) || data.cantidad_fisica < 0 || data.cantidad_fisica > 9999999999.99
    || ![data.teorico_al_conteo, data.teorico_hoy, data.delta].every(x => typeof x === 'number' && Number.isFinite(x))) throw new Error('No se pudo verificar la revisión original del ajuste.');
  return data as unknown as AdjustmentResult;
}
export async function beginTelegramAdjustment(client: Client, t: Transport, exception: string, date: string,
  deliver: (review: AdjustmentResult, callback: string) => Promise<{ message_id: number; chat: { id: number; type: string } }>): Promise<AdjustmentResult> {
  const actor = identity(t);
  const review = result(await rpc(client, 'fn_ronda_telegram_ajuste', { ...actor, p_excepcion: exception, p_fecha: date }));
  if (review.excepcion_id !== exception) throw new Error('No se verificó la excepción original del ajuste.');
  if (review.aplicado) return review;
  if (review.fecha_movimiento !== date) throw new Error('No se verificó la fecha original del ajuste.');
  return deliverOriginalReview(client, t, review, deliver);
}
type Delivery = (review: AdjustmentResult, callback: string) => Promise<{ message_id: number; chat: { id: number; type: string } }>;
async function deliverOriginalReview(client: Client, t: Transport, review: AdjustmentResult, deliver: Delivery): Promise<AdjustmentResult> {
 const actor = identity(t);
 try {
  const delivered = await deliver(review, `rda_force:${review.propuesta_id}`);
  if (!Number.isSafeInteger(delivered.message_id) || delivered.message_id <= 0 || delivered.chat.type !== 'private' || delivered.chat.id !== actor.p_chat) throw new Error('No se verificó la entrega de la revisión privada.');
  const receipt = await rpc(client, 'fn_ronda_telegram_registrar_revision', { ...actor, p_message: delivered.message_id, p_propuesta: review.propuesta_id });
  if (receipt.proposal_id !== review.propuesta_id || receipt.sender !== actor.p_sender || receipt.chat !== actor.p_chat || receipt.message !== delivered.message_id) throw new Error('No se verificó el registro de la revisión privada.');
  return review;
 } catch (error) {
   throw new PendingRondaReview(review.propuesta_id!, error instanceof Error ? error.message : 'No se pudo verificar la entrega original.');
 }
}
export async function recoverTelegramAdjustment(client: Client, t: Transport, callback: string, deliver: Delivery): Promise<AdjustmentResult> {
 const actor = identity(t); const match = RONDA_REVIEW.exec(callback);
 if (!match) throw new Error('Revisión original inválida.');
 const review = result(await rpc(client, 'fn_ronda_telegram_revisar_ajuste', { ...actor, p_propuesta: match[1] }));
 if (review.aplicado) return review;
 if (review.propuesta_id !== match[1]) throw new Error('No se verificó la propuesta original.');
 return deliverOriginalReview(client, t, review, deliver);
}

export async function confirmTelegramAdjustment(client: Client, t: Transport, callback: string): Promise<AdjustmentResult> {
  const actor = identity(t); const match = RONDA_FORCE.exec(callback);
  if (!match || !Number.isSafeInteger(t.message) || (t.message ?? 0) <= 0) throw new Error('Usa el botón de la revisión privada original.');
  const answer = result(await rpc(client, 'fn_ronda_telegram_confirmar_ajuste', { ...actor, p_message: t.message, p_propuesta: match[1] }));
  if (!answer.aplicado) throw new Error('El ajuste requiere una nueva revisión explícita.');
  return answer;
}
