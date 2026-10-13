// Requires the reviewed manual-stock-movement SQL candidate. No table-write fallback.
export interface ManualStockClient {
  auth: { getUser(): PromiseLike<{ data: { user: { id: string } | null }; error: { message: string } | null }> };
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}
export interface ManualMovementPayload {
  producto_id: string; tipo: 'Entrada' | 'Salida Otros' | 'Ajuste'; quantity: number;
  observed_quantity: number | null; observed_revision: string | null; fecha: string; observaciones: string | null;
}
interface Attempt { owner: string; key: string; payload: ManualMovementPayload }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (): never => { throw new Error('No se pudo verificar el movimiento. Reintente con los mismos datos.'); };
export function normalizeManualQuantity(input: string, zero: boolean): number {
  if (!/^\d+(?:\.\d+)?$/.test(input)) return fail();
  const [whole, fraction = ''] = input.split('.');
  const cents = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2)) + (Number(fraction[2] ?? 0) >= 5 ? 1n : 0n);
  if (cents > 999999999999n || cents < 0n || (!zero && cents === 0n)) return fail();
  return Number(cents) / 100;
}
export function buildManualMovementPayload(product: { id: string; cantidad_actual: number | null; updated_at: string | null },
  tipo: ManualMovementPayload['tipo'], input: string, fecha: string, observaciones: string): ManualMovementPayload {
  if (!UUID.test(product.id) || !['Entrada','Salida Otros','Ajuste'].includes(tipo) || observaciones.length > 2000
    || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(Date.parse(fecha)) || new Date(fecha).toISOString().slice(0,10) !== fecha) return fail();
  if (product.cantidad_actual === null || !Number.isFinite(product.cantidad_actual) || product.cantidad_actual < 0
    || product.cantidad_actual > 9999999999.99 || (product.updated_at !== null && !Number.isFinite(Date.parse(product.updated_at)))) return fail();
  if (tipo === 'Ajuste' && product.updated_at === null) return fail();
  return { producto_id: product.id, tipo, quantity: normalizeManualQuantity(input, tipo === 'Ajuste'),
    observed_quantity: product.cantidad_actual, observed_revision: product.updated_at, fecha, observaciones: observaciones || null };
}
const slot = (owner: string, product: string) => `manual_stock_attempt_v1:${owner.toLowerCase()}:${product.toLowerCase()}`;
// This screen assigns its date automatically. Retries retain the first date,
// even across midnight, and the originally reviewed stock/revision.
const business = (p: ManualMovementPayload) => JSON.stringify([p.producto_id,p.tipo,p.quantity,p.observaciones]);
function validatePayload(p: ManualMovementPayload) {
  const keys = ['producto_id','tipo','quantity','observed_quantity','observed_revision','fecha','observaciones'];
  if (!p || Object.keys(p).length !== keys.length || keys.some(k => !(k in p)) || typeof p.quantity !== 'number'
    || (p.observaciones !== null && typeof p.observaciones !== 'string') || (p.observed_revision !== null && typeof p.observed_revision !== 'string')) return fail();
  const validated = buildManualMovementPayload({ id:p.producto_id,cantidad_actual:p.observed_quantity,updated_at:p.observed_revision },
    p.tipo,String(p.quantity),p.fecha,p.observaciones ?? '');
  if (JSON.stringify(validated) !== JSON.stringify(p)) {
    // Compare fields, since persisted JSON property order has no semantic meaning.
    if (keys.some(k => (validated as unknown as Record<string,unknown>)[k] !== (p as unknown as Record<string,unknown>)[k])) return fail();
  }
}

async function authorize(client: ManualStockClient, owner: string, current: () => boolean) {
  const { data, error } = await client.auth.getUser();
  if (error || data.user?.id !== owner || !current()) throw new Error('La sesión cambió. Abra el movimiento con su cuenta.');
}
export async function postManualMovement(client: ManualStockClient, owner: string, payload: ManualMovementPayload,
  current: () => boolean = () => true): Promise<{ noop: boolean }> {
  validatePayload(payload);
  if (!UUID.test(owner) || !UUID.test(payload.producto_id)) return fail();
  // The cross-tab lock serializes reserving and clearing this owner's durable attempt.
  const locks = globalThis.navigator?.locks;
  if (!locks) throw new Error('Use un navegador actualizado con conexión HTTPS para registrar el movimiento.');
  await authorize(client,owner,current);
  const a = await locks.request(slot(owner,payload.producto_id), { mode: 'exclusive' }, () => {
    const saved = localStorage.getItem(slot(owner,payload.producto_id));
    let a: Attempt;
    if (saved !== null) {
      const parsed = JSON.parse(saved) as Attempt;
      if (!parsed || Object.keys(parsed).length !== 3 || !('owner' in parsed) || !('key' in parsed) || !('payload' in parsed) || parsed.owner !== owner || !UUID.test(parsed.key) || !parsed.payload || business(parsed.payload) !== business(payload))
        throw new Error('Hay un movimiento pendiente de verificar. Reintente con los mismos datos antes de registrar otro.');
      validatePayload(parsed.payload);
      a = parsed;
    } else {
      a = { owner, key: crypto.randomUUID(), payload: JSON.parse(JSON.stringify(payload)) as ManualMovementPayload };
      localStorage.setItem(slot(owner,payload.producto_id),JSON.stringify(a));
    }
    return a;
  });
  await authorize(client,owner,current);
  const args = { p_request_key:a.key,p_payload:a.payload,p_expected_owner:a.owner };
  const response = await client.rpc('fn_manual_stock_movement',args);
  let data = response.data;
  const error = response.error;
  if (error) {
    await authorize(client,owner,current);
    const status = await client.rpc('fn_manual_stock_request_status',args);
    if (status.error || !status.data || typeof status.data !== 'object' || Array.isArray(status.data)) return fail();
    const proof = status.data as Record<string,unknown>;
    if (Object.keys(proof).length !== 2 || !('result' in proof) || typeof proof.committed !== 'boolean') return fail();
    if (!proof.committed) {
      if (proof.result !== null) return fail();
      await authorize(client,owner,current);
      await locks.request(slot(owner,payload.producto_id), { mode:'exclusive' }, () => {
        if (!current()) return fail();
        const pending = localStorage.getItem(slot(owner,payload.producto_id));
        if (pending !== null && (JSON.parse(pending) as Attempt).key !== a.key) return fail();
        localStorage.removeItem(slot(owner,payload.producto_id));
      });
      throw new Error(`${error.message} El movimiento no se registró. Revise el producto y vuelva a intentar.`);
    }
    data = proof.result;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return fail();
  const r = data as Record<string,unknown>;
  const fields = ['actor','request_key','producto_id','movement_id','quantity_before','quantity_after','delta','noop'];
  if (Object.keys(r).length !== fields.length || fields.some(k => !(k in r)) || r.actor !== owner || r.request_key !== a.key
    || r.producto_id !== a.payload.producto_id || typeof r.noop !== 'boolean') return fail();
  for (const key of ['quantity_before','quantity_after','delta']) if (typeof r[key] !== 'number' || !Number.isFinite(r[key])) return fail();
  const before = r.quantity_before as number, after = r.quantity_after as number, delta = r.delta as number;
  for (const n of [before,after,delta]) if (Math.abs(n*100-Math.round(n*100)) > 0.001) return fail();
  if (a.payload.tipo === 'Ajuste' && before !== a.payload.observed_quantity) return fail();
  if (before < 0 || after < 0 || before > 9999999999.99 || after > 9999999999.99
    || Math.abs((after-before)-delta) > 0.000001 || (r.noop ? r.movement_id !== null || delta !== 0 : typeof r.movement_id !== 'string' || !UUID.test(r.movement_id))) return fail();
  const expected = a.payload.tipo === 'Entrada' ? before+a.payload.quantity : a.payload.tipo === 'Salida Otros' ? before-a.payload.quantity : a.payload.quantity;
  if (Math.abs(after-expected) > 0.000001 || (a.payload.tipo !== 'Ajuste' && r.noop)) return fail();
  await authorize(client,owner,current);
  await locks.request(slot(owner,payload.producto_id), { mode: 'exclusive' }, () => {
    if (!current()) return fail();
    const pending = localStorage.getItem(slot(owner,payload.producto_id));
    if (pending !== null && (JSON.parse(pending) as Attempt).key !== a.key) return fail();
    localStorage.removeItem(slot(owner,payload.producto_id));
  });
  return { noop:r.noop };
}
