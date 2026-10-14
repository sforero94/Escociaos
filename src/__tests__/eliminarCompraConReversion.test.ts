import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { eliminarCompraConReversion } from '@/components/inventory/PurchaseHistory';
import { owner, purchase, expected, reversed, memory, storage, testLocks, sdkHarness } from './purchaseProtocolFixtures';
const selected = expected as Parameters<typeof eliminarCompraConReversion>[1];
const slot = `purchase_integrity_attempt_v1:${owner}:reverse:${purchase}`;
beforeEach(() => { memory.clear(); vi.stubGlobal('localStorage', storage); vi.stubGlobal('navigator', { locks: testLocks }); });
afterEach(() => vi.unstubAllGlobals());
// Stock debit, price restoration, immutable original Entrada and compensatory Salida
// now belong to the SQL transaction (89 independent PG assertions). These caller
// regressions verify the browser delegates once, preserves evidence and refuses fallback.
describe('transactional purchase reversal public caller', () => {
  it('preserves every linked expense and invoice by issuing only proof and reversal RPCs', async () => {
    const h = await sdkHarness(c => c.url.pathname.endsWith('fn_purchase_proof') ? { purchase_id: purchase, expected } : reversed);
    await eliminarCompraConReversion(h.client, selected, owner);
    expect(h.calls.map(c => c.url.pathname)).toEqual(['/rest/v1/rpc/fn_purchase_proof', '/rest/v1/rpc/fn_purchase_reverse']);
    expect(h.calls[1].body.p_payload).toEqual({ purchase_id: purchase, expected });
    expect(JSON.stringify(h.calls)).not.toContain('cleanup'); expect(JSON.stringify(h.calls)).not.toContain('/storage/');
  });
  it.each(['insufficient stock', 'edited original movement', 'unproven legacy purchase', 'suppressed stock update', 'expense changed during detach', 'inactive actor'])('propagates atomic refusal: %s', async message => {
    const h = await sdkHarness(c => c.url.pathname.endsWith('fn_purchase_proof') ? { purchase_id: purchase, expected } : new Response(JSON.stringify({ message, code: 'P0001' }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    await expect(eliminarCompraConReversion(h.client, selected, owner)).rejects.toThrow(message);
    expect(h.calls).toHaveLength(2); expect(memory.has(slot)).toBe(true);
  });
  it('does not fall back to cleanup or direct CRUD when candidate is not installed', async () => {
    const h = await sdkHarness(() => new Response(JSON.stringify({ message: 'function not found', code: 'PGRST202' }), { status: 404, headers: { 'Content-Type': 'application/json' } }));
    await expect(eliminarCompraConReversion(h.client, selected, owner)).rejects.toThrow('function not found'); expect(h.calls).toHaveLength(1);
  });
  it('refuses unauthenticated and stale-session requests before proof lookup', async () => {
    const h = await sdkHarness(() => reversed);
    await expect(eliminarCompraConReversion(h.client, selected, null)).rejects.toThrow('sesión');
    await expect(eliminarCompraConReversion(h.client, selected, owner, () => false)).rejects.toThrow('sesión'); expect(h.calls).toHaveLength(0);
  });
});
