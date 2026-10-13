import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { buildPurchasePayload, postPurchase, purchaseMoney, reversePurchase, resolvePendingPurchase, pendingPurchaseReversals, type PurchaseProtocolClient } from '@/utils/purchaseIntegrity';
import { owner, other, product, supplier, purchase, line, expected, receipt, reversed, memory, storage, testLocks, sdkHarness } from './purchaseProtocolFixtures';
const postSlot = `purchase_integrity_attempt_v1:${owner}:post:`;
const reverseSlot = `purchase_integrity_attempt_v1:${owner}:reverse:${purchase}`;
const protocol = (client: unknown) => client as PurchaseProtocolClient;
beforeEach(() => { memory.clear(); vi.stubGlobal('localStorage', storage); vi.stubGlobal('navigator', { locks: testLocks }); });
afterEach(() => vi.unstubAllGlobals());
describe('purchase protocol through real Supabase transport', () => {
  it('keeps the same owner/key/exact payload after lost response and validates canonical rounding', async () => {
    let lose = true;
    const h = await sdkHarness(() => { if (lose) throw new Error('lost response'); return receipt; });
    await expect(postPurchase(protocol(h.client), owner, { lines: [line] })).rejects.toThrow();
    const attempt = memory.get(postSlot);
    lose = false;
    await postPurchase(protocol(h.client), owner, { lines: [{ ...line }] });
    expect(h.calls[0].body).toEqual(h.calls[1].body); expect(attempt).toBeTruthy(); expect(memory.has(postSlot)).toBe(false);
    expect(h.calls.map(c => c.url.pathname)).toEqual(['/rest/v1/rpc/fn_purchase_post', '/rest/v1/rpc/fn_purchase_post']);
  });
  it('refuses changed data instead of rebasing an unresolved request onto a new key', async () => {
    const h = await sdkHarness(() => null);
    await expect(postPurchase(protocol(h.client), owner, { lines: [line] })).rejects.toThrow();
    const attempt = memory.get(postSlot);
    await expect(postPurchase(protocol(h.client), owner, { lines: [{ ...line, numero_factura: 'changed' }] })).rejects.toThrow('pendiente');
    expect(h.calls).toHaveLength(1); expect(memory.get(postSlot)).toBe(attempt);
  });
  it.each([
    null,
    { purchases: [] },
    { purchases: [{ ...receipt.purchases[0], purchase_id: other }] },
    { purchases: [{ ...receipt.purchases[0], movement_id: 'invalid' }] },
    { purchases: [{ ...receipt.purchases[0], expected: { ...expected, costo_unitario: 1 } }] },
    { purchases: [{ ...receipt.purchases[0], expected: { ...expected, unknown: true } }] },
  ])('retains unknown-outcome evidence for malformed or mismatched receipt %j', async result => {
    const h = await sdkHarness(() => result);
    await expect(postPurchase(protocol(h.client), owner, { lines: [line] })).rejects.toThrow(); expect(memory.has(postSlot)).toBe(true);
  });
  it('rejects duplicated purchase IDs and movement IDs across repeated product lines', async () => {
    for (const duplicate of ['purchase_id', 'movement_id']) {
      memory.clear();
      const second = { purchase_id: other, movement_id: supplier, expected: { ...expected, id: other } };
      const h = await sdkHarness(() => ({ purchases: [receipt.purchases[0], { ...second, [duplicate]: receipt.purchases[0][duplicate as 'purchase_id' | 'movement_id'] }] }));
      await expect(postPurchase(protocol(h.client), owner, { lines: [line, line] })).rejects.toThrow(); expect(memory.has(postSlot)).toBe(true);
    }
  });
  it('uses canonical proof verbatim and retries reversal without rereading a deleted purchase', async () => {
    let lose = true;
    const h = await sdkHarness(c => { if (c.url.pathname.endsWith('fn_purchase_proof')) return { purchase_id: purchase, expected }; if (lose) throw new Error('lost'); return reversed; });
    await expect(reversePurchase(protocol(h.client), owner, expected)).rejects.toThrow(); lose = false;
    await reversePurchase(protocol(h.client), owner, expected);
    expect(h.calls).toHaveLength(3); expect(h.calls[1].body).toEqual(h.calls[2].body);
    expect(h.calls[1].body.p_payload).toEqual({ purchase_id: purchase, expected }); expect(memory.has(reverseSlot)).toBe(false);
  });
  it.each([
    null,
    { ...reversed, purchase_id: other },
    { ...reversed, reversal_movement_id: 'invalid' },
    { ...reversed, preserved_expenses: -1 },
    { ...reversed, preserved_expenses: 1.5 },
    { ...reversed, extra: true },
  ])('retains canonical reversal proof on malformed receipt %j', async result => {
    const h = await sdkHarness(c => c.url.pathname.endsWith('fn_purchase_proof') ? { purchase_id: purchase, expected } : result);
    await expect(reversePurchase(protocol(h.client), owner, expected)).rejects.toThrow();
    expect(JSON.parse(memory.get(reverseSlot)!).payload).toEqual({ purchase_id: purchase, expected });
  });
  it('refuses an edited selected row on retry without replacing canonical proof or key', async () => {
    const h = await sdkHarness(c => c.url.pathname.endsWith('fn_purchase_proof') ? { purchase_id: purchase, expected } : null);
    await expect(reversePurchase(protocol(h.client), owner, expected)).rejects.toThrow(); const attempt = memory.get(reverseSlot);
    const edited = { ...expected, link_factura: 'changed' };
    await expect(reversePurchase(protocol(h.client), owner, edited)).rejects.toThrow();
    expect(h.calls).toHaveLength(2); expect(memory.get(reverseSlot)).toBe(attempt);
  });
  it('refuses stale selected values and a different proof ID before reversal', async () => {
    for (const proof of [{ purchase_id: other, expected }, { purchase_id: purchase, expected: { ...expected, numero_factura: 'new' } }]) {
      const h = await sdkHarness(() => proof);
      await expect(reversePurchase(protocol(h.client), owner, expected)).rejects.toThrow(); expect(h.calls).toHaveLength(1); expect(memory.has(reverseSlot)).toBe(false);
    }
  });
  it('fails closed on corrupt/foreign/tampered stored attempts without domain RPC', async () => {
    for (const attempt of ['{', JSON.stringify({ version: 1, owner: other, operation: 'reverse', key: supplier, payload: {} }), JSON.stringify({ version: 1, owner, operation: 'reverse', key: supplier, payload: { purchase_id: purchase, expected, extra: true } })]) {
      memory.set(reverseSlot, attempt); const h = await sdkHarness(() => reversed);
      await expect(reversePurchase(protocol(h.client), owner, expected)).rejects.toThrow(); expect(h.calls).toHaveLength(0); expect(memory.get(reverseSlot)).toBe(attempt);
    }
  });
  it('reauthorizes response completion and preserves retry evidence on account switch', async () => {
    const h = await sdkHarness(() => { h.switchOwner(other); return receipt; });
    await expect(postPurchase(protocol(h.client), owner, { lines: [line] })).rejects.toThrow('sesión'); expect(memory.has(postSlot)).toBe(true);
    await expect(postPurchase(protocol(h.client), owner, { lines: [line] })).rejects.toThrow('sesión'); expect(h.calls).toHaveLength(1);
  });
  it('serializes cross-context attempt reservation and refuses a competing different payload', async () => {
    const first = await sdkHarness(() => null), second = await sdkHarness(() => null);
    const results = await Promise.allSettled([
      postPurchase(protocol(first.client), owner, { lines: [line] }),
      postPurchase(protocol(second.client), owner, { lines: [{ ...line, numero_factura: 'other tab' }] }),
    ]);
    expect(results.every(r => r.status === 'rejected')).toBe(true);
    expect(first.calls.length + second.calls.length).toBe(1);
    expect(JSON.parse(memory.get(postSlot)!).payload.lines[0].numero_factura).toBe('F1');
  });
  it('reserves the same key across concurrent matching callers', async () => {
    const first = await sdkHarness(() => null), second = await sdkHarness(() => null);
    await Promise.allSettled([postPurchase(protocol(first.client), owner, { lines: [line] }), postPurchase(protocol(second.client), owner, { lines: [line] })]);
    expect(first.calls).toHaveLength(1); expect(second.calls).toHaveLength(1); expect(first.calls[0].body).toEqual(second.calls[0].body);
  });
  it.each([{ lines: [] }, { lines: [line, { ...line, cantidad: NaN }] }, { lines: [line, { ...line, costo_total: .0001 }] }, { lines: [{ ...line, producto_id: 'invalid' }] }])('preflights every line before reserving an attempt or issuing any RPC', async ({ lines }) => {
    const h = await sdkHarness(() => receipt);
    await expect(postPurchase(protocol(h.client), owner, { lines })).rejects.toThrow();
    expect(h.calls).toHaveLength(0); expect(memory.has(postSlot)).toBe(false);
  });
  it('fails closed before RPC when the browser cannot coordinate durable attempts', async () => {
    vi.stubGlobal('navigator', {}); const h = await sdkHarness(() => receipt);
    await expect(postPurchase(protocol(h.client), owner, { lines: [line] })).rejects.toThrow('navegador');
    expect(h.calls).toHaveLength(0); expect(memory.has(postSlot)).toBe(false);
  });
  it('does not issue a domain request when durable storage is unavailable', async () => {
    const h = await sdkHarness(() => receipt); vi.stubGlobal('localStorage', { ...storage, setItem: () => { throw new Error('quota'); } });
    await expect(postPurchase(protocol(h.client), owner, { lines: [line] })).rejects.toThrow('quota'); expect(h.calls).toHaveLength(0);
  });
});
describe('complete payload numeric preflight', () => {
  const cart = { producto_id: product, presentacion_cantidad: 3, presentacion_unidad: 'Kilos', cantidad_bultos: 1, precio_por_bulto: 3.015, numero_lote: '', fecha_vencimiento: '', permitido_gerencia: false };
  const form = { fecha: line.fecha_compra, proveedor_id: supplier, numero_factura: 'F1', url_factura: '' };
  const build = (items = [cart]) => buildPurchasePayload(form, items, [{ id: product, unidad_medida: 'Kilos' }], [{ id: supplier, nombre: 'Supplier' }]);
  it('recalculates totals from editable source fields and accepts fractional unit cost', () => {
    expect(build().lines[0].costo_unitario).toBeCloseTo(1.005); expect(purchaseMoney(1.005)).toBe(1.01); expect(purchaseMoney(1e-2)).toBe(.01);
  });
  it.each([NaN, Infinity, -1, 0, .00001, 1e12])('rejects invalid/unrepresentable later lines %s', value => {
    expect(() => build([cart, { ...cart, precio_por_bulto: value }])).toThrow();
  });
});

describe('explicit server-proven pending-attempt resolution', () => {
  it('clears only durably cancelled original attempt and permits a reviewed new payload/new key', async () => {
    const h = await sdkHarness(c => c.url.pathname.endsWith('fn_purchase_resolve') ? { state: 'cancelled', request_key: c.body.p_request_key, operation: c.body.p_operation } : null);
    await expect(postPurchase(protocol(h.client), owner, { lines: [line] })).rejects.toThrow();
    const old = JSON.parse(memory.get(postSlot)!);
    expect((await resolvePendingPurchase(protocol(h.client), owner, 'post')).state).toBe('cancelled');
    expect(memory.has(postSlot)).toBe(false);
    expect(h.calls[1].body).toEqual({ p_request_key: old.key, p_operation: 'post', p_payload: old.payload, p_expected_owner: owner });
    await expect(postPurchase(protocol(h.client), owner, { lines: [{ ...line, numero_factura: 'reviewed' }] })).rejects.toThrow();
    expect(h.calls[2].body.p_request_key).not.toBe(old.key);
    expect(h.calls[2].body.p_payload).toEqual({ lines: [{ ...line, numero_factura: 'reviewed' }] });
  });
  it('validates canonical committed posting receipt against original payload before clearing', async () => {
    const h = await sdkHarness(c => c.url.pathname.endsWith('fn_purchase_resolve') ? { state: 'committed', request_key: c.body.p_request_key, operation: c.body.p_operation, receipt } : null);
    await expect(postPurchase(protocol(h.client), owner, { lines: [line] })).rejects.toThrow();
    expect(await resolvePendingPurchase(protocol(h.client), owner, 'post')).toEqual({ state: 'committed', payload: { lines: [line] } });
    expect(memory.has(postSlot)).toBe(false); expect(h.calls).toHaveLength(2);
  });
  it.each(['state', 'key', 'operation', 'extra', 'receipt', 'empty', 'cancelReceipt'])('keeps original evidence for unknown or malformed status: %s', async fault => {
    const h = await sdkHarness(c => {
      if (!c.url.pathname.endsWith('fn_purchase_resolve')) return null;
      const status = { state: 'committed', request_key: c.body.p_request_key, operation: c.body.p_operation, receipt };
      if (fault === 'state') return { ...status, state: 'unposted' };
      if (fault === 'key') return { ...status, request_key: other };
      if (fault === 'operation') return { ...status, operation: 'reverse' };
      if (fault === 'extra') return { ...status, extra: true };
      if (fault === 'receipt') return { ...status, receipt: { purchases: [{ ...receipt.purchases[0], expected: { ...expected, costo_total: 1 } }] } };
      if (fault === 'cancelReceipt') return { ...status, state: 'cancelled' };
      return null;
    });
    await expect(postPurchase(protocol(h.client), owner, { lines: [line] })).rejects.toThrow(); const old = memory.get(postSlot);
    await expect(resolvePendingPurchase(protocol(h.client), owner, 'post')).rejects.toThrow(); expect(memory.get(postSlot)).toBe(old);
  });
  it('keeps pending evidence if active account changes during status response', async () => {
    const h = await sdkHarness(c => {
      if (!c.url.pathname.endsWith('fn_purchase_resolve')) return null;
      h.switchOwner(other); return { state: 'cancelled', request_key: c.body.p_request_key, operation: 'post' };
    });
    await expect(postPurchase(protocol(h.client), owner, { lines: [line] })).rejects.toThrow(); const old = memory.get(postSlot);
    await expect(resolvePendingPurchase(protocol(h.client), owner, 'post')).rejects.toThrow('sesión'); expect(memory.get(postSlot)).toBe(old);
  });
  it('refuses stale record replacement while resolution is in flight', async () => {
    const h = await sdkHarness(c => {
      if (!c.url.pathname.endsWith('fn_purchase_resolve')) return null;
      const a = JSON.parse(memory.get(postSlot)!); memory.set(postSlot, JSON.stringify({ ...a, key: other }));
      return { state: 'cancelled', request_key: c.body.p_request_key, operation: 'post' };
    });
    await expect(postPurchase(protocol(h.client), owner, { lines: [line] })).rejects.toThrow();
    await expect(resolvePendingPurchase(protocol(h.client), owner, 'post')).rejects.toThrow(); expect(JSON.parse(memory.get(postSlot)!).key).toBe(other);
  });
  it('resolves committed reversal using original proof after purchase is gone and discovers only owner slots', async () => {
    const h = await sdkHarness(c => c.url.pathname.endsWith('fn_purchase_proof') ? { purchase_id: purchase, expected } : c.url.pathname.endsWith('fn_purchase_resolve') ? { state: 'committed', request_key: c.body.p_request_key, operation: 'reverse', receipt: reversed } : null);
    await expect(reversePurchase(protocol(h.client), owner, expected)).rejects.toThrow();
    memory.set(`purchase_integrity_attempt_v1:${other}:reverse:${supplier}`, '{}');
    expect(pendingPurchaseReversals(owner)).toEqual([purchase]);
    expect((await resolvePendingPurchase(protocol(h.client), owner, 'reverse', purchase)).state).toBe('committed');
    expect(memory.has(reverseSlot)).toBe(false); expect(h.calls).toHaveLength(3);
    expect(h.calls[2].body.p_payload).toEqual({ purchase_id: purchase, expected });
  });
  it('refuses malformed committed reversal receipts and unavailable status without local reset', async () => {
    for (const unavailable of [false, true]) {
      memory.clear();
      const h = await sdkHarness(c => c.url.pathname.endsWith('fn_purchase_proof') ? { purchase_id: purchase, expected } : c.url.pathname.endsWith('fn_purchase_resolve') ? unavailable ? new Response(JSON.stringify({ message: 'unavailable' }), { status: 404, headers: { 'Content-Type': 'application/json' } }) : { state: 'committed', request_key: c.body.p_request_key, operation: 'reverse', receipt: { ...reversed, preserved_expenses: -1 } } : null);
      await expect(reversePurchase(protocol(h.client), owner, expected)).rejects.toThrow(); const old = memory.get(reverseSlot);
      await expect(resolvePendingPurchase(protocol(h.client), owner, 'reverse', purchase)).rejects.toThrow(); expect(memory.get(reverseSlot)).toBe(old);
    }
  });
});
