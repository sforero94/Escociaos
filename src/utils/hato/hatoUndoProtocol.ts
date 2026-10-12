// Local candidate adapter; not wired to the bot. The caller must durably retain
// this owner-bound attempt before sending and keep it on every unknown outcome.
export interface HatoUndoClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}
type Row = Record<string, unknown>;
type Operation = 'event' | 'treatment';
export interface HatoUndoProof {
  actor: string; sender: number; operation: Operation; target_id: string;
  snapshot: { target: Row; steps: Row[] };
}
export interface HatoUndoAttempt { version: 1; key: string; payload: HatoUndoProof }
export interface HatoUndoReceipt {
  actor: string; sender: number; request_key: string; operation: Operation; target_id: string;
  before: HatoUndoProof['snapshot']; after: { target: null; steps: [] };
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function object(v: unknown): v is Row { return !!v && typeof v === 'object' && !Array.isArray(v); }
function keys(v: Row, expected: string[]) { return Object.keys(v).sort().join('|') === expected.sort().join('|'); }
function id(v: unknown): v is string { return typeof v === 'string' && uuid.test(v); }
function senderValid(sender: number) { return Number.isSafeInteger(sender) && sender > 0; }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function equal(a: unknown, b: unknown) { return canonical(a) === canonical(b); }
function requireProof(value: unknown): asserts value is HatoUndoProof {
  if (!object(value) || !keys(value, ['actor', 'sender', 'operation', 'target_id', 'snapshot'])
    || !id(value.actor) || typeof value.sender !== 'number' || !senderValid(value.sender)
    || !['event', 'treatment'].includes(String(value.operation)) || !id(value.target_id)
    || !object(value.snapshot) || !keys(value.snapshot, ['target', 'steps'])
    || !object(value.snapshot.target) || value.snapshot.target.id !== value.target_id
    || value.snapshot.target.fuente !== 'telegram' || !Array.isArray(value.snapshot.steps)) throw new Error('Prueba canónica de Hato inválida.');
  const target = value.snapshot.target;
  if (value.operation === 'event') {
    if (value.snapshot.steps.length || !['celo', 'confirmacion_prenez', 'parto', 'aborto', 'secado_real', 'cambio_etapa', 'rechequeo', 'servicio'].includes(String(target.tipo))
      || target.chequeo_vaca_id !== null || target.cria_id !== null || target.alerta_id !== null || target.transaccion_ganado_id !== null
      || target.cria_destino === 'retenida' || (target.tipo === 'servicio' && target.tipo_servicio !== 'monta')
      || (target.datos !== null && (!object(target.datos) || 'pajilla_uso_id' in target.datos))) throw new Error('Evento asociado o ambiguo: no se puede deshacer.');
  } else {
    if (target.estado !== 'activo' || target.chequeo_id !== null) throw new Error('Tratamiento no elegible.');
    const ids = new Set<string>();
    for (const step of value.snapshot.steps) {
      if (!object(step) || !id(step.id) || ids.has(step.id) || step.tratamiento_id !== value.target_id || step.fecha_ejecutada !== null) throw new Error('Pasos canónicos inválidos o ejecutados.');
      ids.add(step.id);
    }
  }
}
export function validateHatoUndoAttempt(value: unknown, sender: number): asserts value is HatoUndoAttempt {
  if (!senderValid(sender) || !object(value) || !keys(value, ['version', 'key', 'payload']) || value.version !== 1 || !id(value.key)) throw new Error('Intento pendiente de Hato inválido.');
  requireProof(value.payload);
  if (value.payload.sender !== sender) throw new Error('El intento pertenece a otra cuenta de Telegram.');
}
function requireReceipt(value: unknown, attempt: HatoUndoAttempt): asserts value is HatoUndoReceipt {
  const p = attempt.payload;
  if (!object(value) || !keys(value, ['actor', 'sender', 'request_key', 'operation', 'target_id', 'before', 'after'])
    || value.actor !== p.actor || value.sender !== p.sender || value.request_key !== attempt.key
    || value.operation !== p.operation || value.target_id !== p.target_id || !equal(value.before, p.snapshot)
    || !equal(value.after, { target: null, steps: [] })) throw new Error('Resultado de Hato sin confirmación canónica. Conserva el intento pendiente.');
}
async function rpc(client: HatoUndoClient, name: string, args: Record<string, unknown>) {
  const response = await client.rpc(name, args);
  if (response.error) throw new Error('No se confirmó el intento de Hato. Conserva el intento pendiente.');
  return response.data;
}
export async function prepareHatoUndo(client: HatoUndoClient, sender: number, operation: Operation, target: string): Promise<HatoUndoAttempt> {
  if (!senderValid(sender) || !id(target) || !['event', 'treatment'].includes(operation)) throw new Error('Solicitud de Hato inválida.');
  const proof = await rpc(client, 'fn_hato_undo_prepare', { p_sender: sender, p_operation: operation, p_target_id: target });
  requireProof(proof);
  if (proof.sender !== sender || proof.operation !== operation || proof.target_id !== target) throw new Error('Prueba de otro intento de Hato.');
  return { version: 1, key: crypto.randomUUID(), payload: proof };
}
export async function postHatoUndo(client: HatoUndoClient, sender: number, attempt: HatoUndoAttempt): Promise<HatoUndoReceipt> {
  validateHatoUndoAttempt(attempt, sender);
  const receipt = await rpc(client, 'fn_hato_undo', { p_sender: sender, p_request_key: attempt.key, p_payload: attempt.payload });
  requireReceipt(receipt, attempt);
  return receipt;
}
export async function resolveHatoUndo(client: HatoUndoClient, sender: number, attempt: HatoUndoAttempt): Promise<{ state: 'cancelled' } | { state: 'committed'; receipt: HatoUndoReceipt }> {
  validateHatoUndoAttempt(attempt, sender);
  const result = await rpc(client, 'fn_hato_undo_resolve', { p_sender: sender, p_request_key: attempt.key, p_payload: attempt.payload });
  if (!object(result) || result.request_key !== attempt.key || result.operation !== attempt.payload.operation) throw new Error('Estado de Hato desconocido. Conserva el intento pendiente.');
  if (result.state === 'cancelled' && keys(result, ['state', 'request_key', 'operation'])) return { state: 'cancelled' };
  if (result.state === 'committed' && keys(result, ['state', 'request_key', 'operation', 'receipt'])) {
    requireReceipt(result.receipt, attempt);
    return { state: 'committed', receipt: result.receipt };
  }
  throw new Error('Estado de Hato desconocido. Conserva el intento pendiente.');
}
