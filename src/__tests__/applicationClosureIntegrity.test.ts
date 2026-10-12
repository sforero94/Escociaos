import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { closeApplication, loadClosureExpected, resolveClosure, closureAttemptSlot, validateClosureWork,
  type ApplicationClosureClient } from '@/utils/applicationClosureIntegrity';
import { construirPayloadCierreAplicacion } from '@/utils/calculosCierreAplicacion';
import { owner, other, product, purchase as application, movement as closure, memory, storage, testLocks, sdkHarness } from './purchaseProtocolFixtures';
export const expectedClosure = { aplicacion: { id: application, updated_at: '2026-10-10T10:00:00.123456Z' }, registros_trabajo: [], empleados: [], contratistas: [] };
export const closurePayload = () => construirPayloadCierreAplicacion({ aplicacionId: application, registrosEditados: [],
  datosFinales: { fechaInicioReal: '2026-10-10', fechaFinReal: '2026-10-10', observaciones: 'Original' },
  lotes: [{ lote_id: product, nombre: 'Lot', arboles: 100 }],
  movimientos: [{ producto_id: product, producto_nombre: 'Product', cantidad_utilizada: 2.345, costo_unitario: 2 }] });
export const closureReceipt = { aplicacionId: application, cierreId: closure, registrosEliminados: 0, registrosInsertados: 0, registrosActualizados: 0, productosActualizados: 1 };
const client = (value: unknown) => value as ApplicationClosureClient;
const slot = closureAttemptSlot(owner, application);
beforeEach(() => { memory.clear(); vi.stubGlobal('localStorage', storage); vi.stubGlobal('navigator', { locks: testLocks }); });
afterEach(() => vi.unstubAllGlobals());
describe('closure protocol through actual Supabase SDK', () => {
  it('brackets trusted snapshot owner/application and preserves microsecond original text', async () => {
    const h = await sdkHarness(() => ({ aplicacion_id: application, expected: expectedClosure }));
    expect(await loadClosureExpected(client(h.client), owner, application, () => true)).toEqual(expectedClosure);
    expect(h.calls[0].body).toEqual({ p_aplicacion_id: application });
  });
  it('persists exact original before send and clears only a complete matching receipt', async () => {
    const h = await sdkHarness(c => { expect(memory.has(slot)).toBe(true); return { request_key: c.body.p_request_key, receipt: closureReceipt }; });
    expect(await closeApplication(client(h.client), owner, closurePayload(), expectedClosure, () => true)).toEqual(closureReceipt);
    expect(memory.has(slot)).toBe(false); expect(h.calls[0].url.pathname).toContain('fn_application_close');
  });
  it('lost or malformed responses retain original then exact retry uses identical key/body', async () => {
    let valid = false; const h = await sdkHarness(c => valid ? { request_key: c.body.p_request_key, receipt: closureReceipt } : null);
    await expect(closeApplication(client(h.client), owner, closurePayload(), expectedClosure, () => true)).rejects.toThrow();
    const original = memory.get(slot); valid = true;
    await closeApplication(client(h.client), owner, closurePayload(), expectedClosure, () => true);
    expect(h.calls[0].body).toEqual(h.calls[1].body); expect(original).toBeTruthy(); expect(memory.has(slot)).toBe(false);
  });
  it('changed draft and changed original refuse before another RPC', async () => {
    const h = await sdkHarness(() => null);
    await expect(closeApplication(client(h.client), owner, closurePayload(), expectedClosure, () => true)).rejects.toThrow();
    const p = closurePayload(); p.observaciones_cierre = 'Edited';
    await expect(closeApplication(client(h.client), owner, p, expectedClosure, () => true)).rejects.toThrow('pendiente');
    await expect(closeApplication(client(h.client), owner, closurePayload(), { ...expectedClosure, changed: true }, () => true)).rejects.toThrow('pendiente');
    expect(h.calls).toHaveLength(1);
  });
  it.each([null, {}, { ...closureReceipt, productosActualizados: 99 }, { ...closureReceipt, aplicacionId: product }, { ...closureReceipt, cierreId: 'bad' }])('rejects unsupported receipt %#', async receipt => {
    const h = await sdkHarness(c => ({ request_key: c.body.p_request_key, receipt }));
    await expect(closeApplication(client(h.client), owner, closurePayload(), expectedClosure, () => true)).rejects.toThrow();
    expect(memory.has(slot)).toBe(true);
  });
  it('explicit absent status fences original key and clears local attempt without resubmitting', async () => {
    const h = await sdkHarness(c => c.url.pathname.endsWith('fn_application_closure_status') ? { state: 'cancelled', request_key: c.body.p_request_key } : null);
    await expect(closeApplication(client(h.client), owner, closurePayload(), expectedClosure, () => true)).rejects.toThrow();
    const resolved = await resolveClosure(client(h.client), owner, application, () => true);
    expect(resolved.state).toBe('cancelled'); expect(resolved.payload).toEqual(closurePayload());
    expect(h.calls[0].body).toEqual(h.calls[1].body); expect(memory.has(slot)).toBe(false);
  });
  it('committed status validates original receipt after remount', async () => {
    const h = await sdkHarness(c => c.url.pathname.endsWith('fn_application_closure_status') ? { state: 'committed', request_key: c.body.p_request_key, receipt: closureReceipt } : null);
    await expect(closeApplication(client(h.client), owner, closurePayload(), expectedClosure, () => true)).rejects.toThrow();
    expect((await resolveClosure(client(h.client), owner, application, () => true)).receipt).toEqual(closureReceipt);
  });
  it('unknown status retains original key and does not silently start a new attempt', async () => {
    const h = await sdkHarness(() => null);
    await expect(closeApplication(client(h.client), owner, closurePayload(), expectedClosure, () => true)).rejects.toThrow();
    const original = memory.get(slot);
    await expect(resolveClosure(client(h.client), owner, application, () => true)).rejects.toThrow();
    expect(memory.get(slot)).toBe(original);
  });
  it('owner switch after result cannot clear original evidence', async () => {
    let current = true; const h = await sdkHarness(c => { current = false; h.switchOwner(other); return { request_key: c.body.p_request_key, receipt: closureReceipt }; });
    await expect(closeApplication(client(h.client), owner, closurePayload(), expectedClosure, () => current)).rejects.toThrow('sesión');
    expect(memory.has(slot)).toBe(true); expect(memory.has(closureAttemptSlot(other, application))).toBe(false);
  });
  it('storage failure and unavailable Web Locks fail before mutation', async () => {
    const h = await sdkHarness(() => null); vi.stubGlobal('localStorage', { ...storage, setItem: () => { throw new Error('full'); } });
    await expect(closeApplication(client(h.client), owner, closurePayload(), expectedClosure, () => true)).rejects.toThrow('full');
    vi.stubGlobal('navigator', {});
    await expect(closeApplication(client(h.client), owner, closurePayload(), expectedClosure, () => true)).rejects.toThrow('HTTPS'); expect(h.calls).toHaveLength(0);
  });
  it('restored corrupt attempts fail closed without mutation or evidence deletion', async () => {
    memory.set(slot, JSON.stringify({ version: 1, owner: other, application, key: product, payload: closurePayload(), expected: expectedClosure }));
    const h = await sdkHarness(() => null);
    await expect(closeApplication(client(h.client), owner, closurePayload(), expectedClosure, () => true)).rejects.toThrow();
    expect(memory.has(slot)).toBe(true); expect(h.calls).toHaveLength(0);
  });
  it('nonfinite payloads fail before JSON could convert exceptional numbers to null', async () => {
    const p = closurePayload(); p.costo_total = NaN; const h = await sdkHarness(() => null);
    await expect(closeApplication(client(h.client), owner, p, expectedClosure, () => true)).rejects.toThrow(); expect(h.calls).toHaveLength(0);
  });
  it('work-reader omission is refused rather than represented as zero labor', () => {
    expect(() => validateClosureWork({ registros_trabajo: [{ id: product }], empleados: [], contratistas: [] }, [])).toThrow();
  });
});
