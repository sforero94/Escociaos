import { calcularTotalesCompra } from '@/utils/calculosCompras';

// Deployment gate: the reviewed purchase-integrity candidate must be installed first.
// No direct-table or legacy-cleanup fallback is safe for these operations.
export interface PurchaseProtocolClient {
  auth: { getUser(): PromiseLike<{ data: { user: { id: string } | null }; error: { message: string } | null }> };
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}
type JsonObject = Record<string, unknown>;
export interface PurchaseLine {
  producto_id: string; fecha_compra: string; proveedor: string; proveedor_id: string;
  numero_factura: string; cantidad: number; unidad: string; numero_lote_producto: string | null;
  fecha_vencimiento: string | null; costo_unitario: number; costo_total: number;
  link_factura: null; url_factura: string | null;
}
interface CartLine {
  producto_id: string; presentacion_cantidad: number; presentacion_unidad: string;
  cantidad_bultos: number; precio_por_bulto: number; numero_lote: string;
  fecha_vencimiento: string; permitido_gerencia: boolean | null;
}
interface Attempt { version: 1; owner: string; operation: 'post' | 'reverse'; key: string; payload: JsonObject }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (): never => { throw new Error('No se pudo verificar la compra. Reintente con los mismos datos o solicite revisión a Gerencia.'); };
const object = (v: unknown): JsonObject => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as JsonObject : fail();
const uuid = (v: unknown): string => typeof v === 'string' && UUID.test(v) ? v : fail();
const text = (v: unknown): string => typeof v === 'string' ? v : fail();
function date(v: unknown): string {
  const s = text(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0, 10) !== s) fail();
  return s;
}
// PostgreSQL rounds the decimal representation sent as JSON, independently for each
// numeric(12,2) field. Avoid binary floating-point rounding of prices such as 1.005.
export function purchaseMoney(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fail();
  const [mantissa, exponent = '0'] = value.toString().split('e');
  const fraction = (mantissa.split('.')[1] || '').length;
  const digits = BigInt(mantissa.replace('.', ''));
  const power = Number(exponent) - fraction + 2;
  const divisor = power < 0 ? 10n ** BigInt(-power) : 1n;
  const cents = power >= 0 ? digits * 10n ** BigInt(power) : (digits + divisor / 2n) / divisor;
  if (cents <= 0n || cents > 999999999999n) fail();
  return Number(cents) / 100;
}
export function buildPurchasePayload(
  form: { fecha: string; proveedor_id: string; numero_factura: string; url_factura: string },
  cart: readonly CartLine[], products: readonly { id: string; unidad_medida: string }[],
  suppliers: readonly { id: string; nombre: string }[],
): { lines: PurchaseLine[] } {
  const supplier = suppliers.find(p => p.id === form.proveedor_id);
  if (!supplier) return fail();
  if (!supplier.nombre.trim() || !text(form.numero_factura).trim() || cart.length === 0) fail();
  uuid(form.proveedor_id); date(form.fecha); text(form.url_factura);
  return { lines: cart.map(item => {
    const product = products.find(p => p.id === item.producto_id);
    if (!product || item.presentacion_unidad !== product.unidad_medida || typeof item.permitido_gerencia !== 'boolean') fail();
    uuid(item.producto_id);
    for (const n of [item.cantidad_bultos, item.precio_por_bulto, item.presentacion_cantidad]) {
      if (!Number.isFinite(n) || n <= 0) fail();
    }
    const totals = calcularTotalesCompra(item.cantidad_bultos, item.precio_por_bulto, item.presentacion_cantidad);
    for (const n of [totals.cantidadTotal, totals.costoTotal, totals.precioUnitarioReal]) purchaseMoney(n);
    const expiry = text(item.fecha_vencimiento) || null;
    if (expiry) date(expiry);
    return { producto_id: item.producto_id, fecha_compra: form.fecha, proveedor: supplier.nombre,
      proveedor_id: form.proveedor_id, numero_factura: form.numero_factura, cantidad: totals.cantidadTotal,
      unidad: item.presentacion_unidad, numero_lote_producto: text(item.numero_lote) || null,
      fecha_vencimiento: expiry, costo_unitario: totals.precioUnitarioReal, costo_total: totals.costoTotal,
      link_factura: null, url_factura: form.url_factura || null };
  }) };
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical((value as JsonObject)[k])).join(',') + '}';
  return JSON.stringify(value);
}
function slot(owner: string, operation: Attempt['operation'], target = ''): string {
  return `purchase_integrity_attempt_v1:${uuid(owner).toLowerCase()}:${operation}:${target.toLowerCase()}`;
}
function readAttempt(owner: string, operation: Attempt['operation'], target = ''): Attempt | null {
  const raw = localStorage.getItem(slot(owner, operation, target));
  if (raw === null) return null;
  const a = object(JSON.parse(raw));
  exactKeys(a, ['version','owner','operation','key','payload']);
  if (a.version !== 1 || a.owner !== owner || a.operation !== operation) fail();
  uuid(a.key); object(a.payload);
  if (operation === 'reverse') {
    exactKeys(object(a.payload), ['purchase_id','expected']);
    if (object(a.payload).purchase_id !== target) fail();
    snapshot(object(a.payload).expected, target);
  } else exactKeys(object(a.payload), ['lines']);
  return a as unknown as Attempt;
}
function withAttemptLock<T>(owner: string, operation: Attempt['operation'], target: string, run: () => T): Promise<T> {
  const locks = globalThis.navigator?.locks;
  if (!locks) throw new Error('Este navegador no permite guardar compras de forma segura. Abra la compra en un navegador actualizado con conexión HTTPS.');
  return locks.request(slot(owner, operation, target), { mode: 'exclusive' }, run);
}
function attempt(owner: string, operation: Attempt['operation'], payload: JsonObject, target = ''): Promise<Attempt> {
  return withAttemptLock(owner, operation, target, () => reserveAttempt(owner, operation, payload, target));
}
function reserveAttempt(owner: string, operation: Attempt['operation'], payload: JsonObject, target: string): Attempt {
  const previous = readAttempt(owner, operation, target);
  if (previous) {
    if (canonical(previous.payload) !== canonical(payload)) throw new Error('Hay una compra pendiente de verificar. Reintente con los mismos datos antes de registrar otra compra.');
    return previous;
  }
  const a: Attempt = { version: 1, owner, operation, key: crypto.randomUUID(), payload };
  // Durable before RPC. Unknown outcomes retain this exact owner/key/payload with no TTL.
  // This is retry state, not a policy for retention of protected server audit evidence.
  localStorage.setItem(slot(owner, operation, target), JSON.stringify(a));
  return a;
}
async function authorize(client: PurchaseProtocolClient, owner: string, current: () => boolean) {
  uuid(owner);
  const { data, error } = await client.auth.getUser();
  if (error || data.user?.id !== owner || !current()) throw new Error('La sesión cambió. Vuelva a abrir la compra con su cuenta.');
}
async function rpc(client: PurchaseProtocolClient, name: string, args: JsonObject): Promise<unknown> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}
const snapshotFields = ['id','fecha_compra','proveedor','numero_factura','producto_id','cantidad','unidad',
  'numero_lote_producto','fecha_vencimiento','costo_unitario','costo_total','link_factura','usuario_registro',
  'created_at','updated_at','updated_by','proveedor_id','url_factura'];
function snapshot(value: unknown, id: string): JsonObject {
  const s = object(value);
  if (Object.keys(s).length !== snapshotFields.length || snapshotFields.some(k => !(k in s)) || s.id !== id) fail();
  uuid(s.id); uuid(s.producto_id); if (s.proveedor_id !== null) uuid(s.proveedor_id); date(s.fecha_compra);
  if (s.fecha_vencimiento !== null) date(s.fecha_vencimiento);
  for (const k of ['cantidad','costo_unitario','costo_total']) if (purchaseMoney(s[k]) !== s[k]) fail();
  for (const k of ['proveedor','unidad','created_at']) if (!text(s[k]).trim()) fail();
  if (!Number.isFinite(Date.parse(text(s.created_at)))) fail();
  for (const k of ['numero_factura','numero_lote_producto','link_factura','usuario_registro','url_factura','updated_at','updated_by']) if (s[k] !== null) text(s[k]);
  if (s.updated_at !== null && !Number.isFinite(Date.parse(text(s.updated_at)))) fail();
  if (s.updated_by !== null) uuid(s.updated_by);
  return s;
}
function exactKeys(value: JsonObject, keys: readonly string[]) {
  if (Object.keys(value).length !== keys.length || keys.some(k => !(k in value))) fail();
}
function validatePostingPayload(payload: { lines: PurchaseLine[] }) {
  exactKeys(object(payload), ['lines']);
  if (!Array.isArray(payload.lines) || payload.lines.length === 0) fail();
  for (const line of payload.lines) {
    exactKeys(object(line), ['producto_id','fecha_compra','proveedor','proveedor_id','numero_factura','cantidad','unidad',
      'numero_lote_producto','fecha_vencimiento','costo_unitario','costo_total','link_factura','url_factura']);
    uuid(line.producto_id); uuid(line.proveedor_id); date(line.fecha_compra);
    for (const value of [line.proveedor, line.numero_factura, line.unidad]) if (!text(value).trim()) fail();
    for (const value of [line.cantidad, line.costo_unitario, line.costo_total]) purchaseMoney(value);
    for (const value of [line.numero_lote_producto, line.link_factura, line.url_factura]) if (value !== null) text(value);
    if (line.fecha_vencimiento !== null) date(line.fecha_vencimiento);
  }
}
function validatePostingReceipt(result: JsonObject, payload: { lines: PurchaseLine[] }) {
  exactKeys(result, ['purchases']);
  if (!Array.isArray(result.purchases) || result.purchases.length !== payload.lines.length) fail();
  const purchases = new Set<string>(), movements = new Set<string>();
  (result.purchases as unknown[]).forEach((value, index) => {
    const entry = object(value); exactKeys(entry, ['purchase_id','expected','movement_id']);
    const id = uuid(entry.purchase_id), movement = uuid(entry.movement_id);
    if (purchases.has(id) || movements.has(movement)) fail();
    purchases.add(id); movements.add(movement);
    const s = snapshot(entry.expected, id), line = payload.lines[index];
    for (const [key, value] of Object.entries(line)) {
      const expected = ['cantidad','costo_unitario','costo_total'].includes(key) ? purchaseMoney(value) : value;
      if (s[key] !== expected) fail();
    }
  });
}
function validateReversalReceipt(result: JsonObject, id: string) {
  exactKeys(result, ['purchase_id','reversal_movement_id','preserved_expenses']);
  if (result.purchase_id !== id || !Number.isSafeInteger(result.preserved_expenses) || (result.preserved_expenses as number) < 0) fail();
  uuid(result.reversal_movement_id);
}
export async function postPurchase(client: PurchaseProtocolClient, owner: string, payload: { lines: PurchaseLine[] }, current: () => boolean = () => true): Promise<void> {
  payload = JSON.parse(JSON.stringify(payload)) as { lines: PurchaseLine[] };
  validatePostingPayload(payload);
  await authorize(client, owner, current);
  const a = await attempt(owner, 'post', payload);
  await authorize(client, owner, current);
  const result = object(await rpc(client, 'fn_purchase_post', { p_request_key: a.key, p_payload: a.payload }));
  validatePostingReceipt(result, payload);
  await authorize(client, owner, current);
  await withAttemptLock(owner, 'post', '', () => {
    if (!current()) fail();
    const pending = readAttempt(owner, 'post');
    if (pending && (pending.key !== a.key || canonical(pending.payload) !== canonical(a.payload))) fail();
    localStorage.removeItem(slot(owner, 'post'));
  });
}
export async function reversePurchase(client: PurchaseProtocolClient, owner: string, selected: { id: string } & object, current: () => boolean = () => true): Promise<void> {
  await authorize(client, owner, current);
  const id = uuid(selected.id);
  let a = await withAttemptLock(owner, 'reverse', id, () => readAttempt(owner, 'reverse', id));
  if (!a) {
    const proof = object(await rpc(client, 'fn_purchase_proof', { p_purchase_id: id }));
    exactKeys(proof, ['purchase_id','expected']);
    if (proof.purchase_id !== id) fail();
    const s = snapshot(proof.expected, id);
    // Bind the authoritative version to the row the manager actually reviewed.
    for (const k of snapshotFields) if (k in selected && (selected as JsonObject)[k] !== s[k]) fail();
    await authorize(client, owner, current);
    a = await attempt(owner, 'reverse', { purchase_id: id, expected: s }, id);
  } else {
    const s = snapshot(a.payload.expected, id);
    for (const k of snapshotFields) if (k in selected && (selected as JsonObject)[k] !== s[k]) fail();
  }
  await authorize(client, owner, current);
  const result = object(await rpc(client, 'fn_purchase_reverse', { p_request_key: a.key, p_payload: a.payload }));
  validateReversalReceipt(result, id);
  await authorize(client, owner, current);
  await withAttemptLock(owner, 'reverse', id, () => {
    if (!current()) fail();
    const pending = readAttempt(owner, 'reverse', id);
    if (pending && (pending.key !== a.key || canonical(pending.payload) !== canonical(a.payload))) fail();
    localStorage.removeItem(slot(owner, 'reverse', id));
  });
}

/** Discovery reads only the current owner's browser slots; contents still need validation. */
export function hasPendingPurchaseAttempt(owner: string, operation: Attempt['operation'], target = ''): boolean {
  try { return localStorage.getItem(slot(owner, operation, target)) !== null; } catch { return false; }
}
export function pendingPurchaseReversals(owner: string): string[] {
  const prefix = slot(owner, 'reverse');
  const ids: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) {
        const id = key.slice(prefix.length);
        if (UUID.test(id)) ids.push(id);
      }
    }
  } catch { /* Discovery cannot authorize or clear an attempt. */ }
  return ids.sort();
}
/** Explicit resolution never resubmits and never replaces the original payload. */
export async function resolvePendingPurchase(
  client: PurchaseProtocolClient, owner: string, operation: Attempt['operation'], target = '',
  current: () => boolean = () => true,
): Promise<{ state: 'cancelled' | 'committed'; payload: JsonObject }> {
  await authorize(client, owner, current);
  if (operation === 'reverse') uuid(target);
  const a = await withAttemptLock(owner, operation, target, () => readAttempt(owner, operation, target));
  if (!a) throw new Error('No hay un intento pendiente para verificar.');
  if (operation === 'post') validatePostingPayload(a.payload as unknown as { lines: PurchaseLine[] });
  await authorize(client, owner, current);
  const result = object(await rpc(client, 'fn_purchase_resolve', { p_request_key: a.key, p_operation: operation, p_payload: a.payload }));
  if (result.request_key !== a.key || result.operation !== operation) fail();
  if (result.state === 'committed') {
    exactKeys(result, ['state','request_key','operation','receipt']);
    if (operation === 'post') validatePostingReceipt(object(result.receipt), a.payload as unknown as { lines: PurchaseLine[] });
    else validateReversalReceipt(object(result.receipt), target);
  } else if (result.state === 'cancelled') exactKeys(result, ['state','request_key','operation']);
  else fail();
  await authorize(client, owner, current);
  await withAttemptLock(owner, operation, target, () => {
    if (!current()) fail();
    const pending = readAttempt(owner, operation, target);
    if (pending && (pending.key !== a.key || canonical(pending.payload) !== canonical(a.payload))) fail();
    localStorage.removeItem(slot(owner, operation, target));
  });
  return { state: result.state as 'cancelled' | 'committed', payload: a.payload };
}

export function matchesPurchasePayload(left: unknown, right: unknown): boolean { return canonical(left) === canonical(right); }
