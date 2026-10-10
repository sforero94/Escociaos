import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { PurchaseLine } from '@/utils/purchaseIntegrity';
export const owner = '10000000-0000-4000-8000-000000000001';
export const other = '10000000-0000-4000-8000-000000000002';
export const product = '20000000-0000-4000-8000-000000000001';
export const supplier = '30000000-0000-4000-8000-000000000001';
export const purchase = '40000000-0000-4000-8000-000000000001';
export const movement = '50000000-0000-4000-8000-000000000001';
export const line: PurchaseLine = { producto_id: product, fecha_compra: '2026-10-10', proveedor: 'Supplier', proveedor_id: supplier,
  numero_factura: 'F1', cantidad: 3, unidad: 'Kilos', numero_lote_producto: null, fecha_vencimiento: null,
  costo_unitario: 1.005, costo_total: 3.015, link_factura: null, url_factura: 'https://invoice.invalid/a.pdf' };
export const expected = { ...line, id: purchase, costo_unitario: 1.01, costo_total: 3.02,
  usuario_registro: 'trusted@example.invalid', created_at: '2026-10-10T12:00:00.123456+00:00', updated_at: null, updated_by: null };
export const receipt = { purchases: [{ purchase_id: purchase, expected, movement_id: movement }] };
export const reversed = { purchase_id: purchase, reversal_movement_id: movement, preserved_expenses: 3 };
export const memory = new Map<string, string>();
export const storage = { get length() { return memory.size; }, key: (i: number) => [...memory.keys()][i] ?? null, getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) };
export type Call = { url: URL; method: string; body: Record<string, unknown> };
export async function sdkHarness(handler: (call: Call) => unknown | Promise<unknown>) {
  const calls: Call[] = [];
  let active = owner;
  const client = createClient<Database>('https://purchase.invalid', 'synthetic-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === '/auth/v1/user') return new Response(JSON.stringify({ id: active, email: 'trusted@example.invalid' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      const call = { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : {} };
      calls.push(call);
      const result = await handler(call);
      if (result instanceof Response) return result;
      return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } },
  });
  const jwt = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify({ sub: owner, exp: 4102444800 }))}.c3ludGhldGlj`;
  const session = await client.auth.setSession({ access_token: jwt, refresh_token: 'synthetic' });
  if (session.error) throw session.error;
  return { client, calls, switchOwner: (id: string) => { active = id; } };
}

// Serial queue models the browser's exclusive Web Locks boundary across callers.
const queues = new Map<string, Promise<unknown>>();
export const testLocks = { request: <T>(name: string, _options: unknown, run: () => T): Promise<T> => {
  const prior = queues.get(name) ?? Promise.resolve();
  const next = prior.catch(() => {}).then(run);
  queues.set(name, next);
  return next;
} };
