import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { PropsWithChildren } from 'react';
import { reversePurchase, type PurchaseProtocolClient } from '@/utils/purchaseIntegrity';
import { NewPurchase } from '@/components/inventory/NewPurchase';
import { PurchaseHistory } from '@/components/inventory/PurchaseHistory';
import { FormDraftBanner } from '@/components/shared/FormDraftBanner';
import { draftStorageKey } from '@/utils/draftStorage';
import { owner, other, product, supplier, purchase, expected, receipt, reversed, memory, storage, testLocks, sdkHarness, type Call } from './purchaseProtocolFixtures';
const state = vi.hoisted(() => ({ owner: '', client: null as unknown, navigate: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() }));
vi.mock('@/utils/supabase/client', () => ({ getSupabase: () => state.client }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: state.owner } }) }));
vi.mock('@/contexts/SafeModeContext', () => ({ useSafeMode: () => ({ isSafeModeEnabled: false }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => state.navigate, Link: ({ children }: PropsWithChildren) => <span>{children}</span> }));
vi.mock('sonner', () => ({ toast: { error: state.error, success: state.success } }));
vi.mock('@/components/shared/Toast', () => ({ useToast: () => ({ showError: state.error, showSuccess: state.success, showWarning: state.warning, showInfo: vi.fn(), ToastContainer: () => null }) }));
vi.mock('@/components/shared/ProveedorDialog', () => ({ ProveedorDialog: () => null }));
vi.mock('@/components/shared/FacturaUploader', () => ({ FacturaUploader: () => null }));
vi.mock('@/components/inventory/InventorySubNav', () => ({ InventorySubNav: () => null }));
vi.mock('@/components/ui/select', () => {
  const Box = ({ children }: PropsWithChildren) => <section>{children}</section>;
  return { Select: Box, SelectTrigger: Box, SelectContent: Box, SelectItem: Box, SelectValue: () => null };
});
vi.mock('@/components/ui/radio-group', () => ({ RadioGroup: ({ children }: PropsWithChildren) => <section>{children}</section>, RadioGroupItem: () => null }));
let tree: ReactTestRenderer;
const draftKey = draftStorageKey(owner, 'compra-new-v1')!;
function seed() {
  memory.set(draftKey, JSON.stringify({ ownerId: owner, version: 1, timestamp: new Date().toISOString(), data: {
    datosCompra: { fecha: '2026-10-10', proveedor_id: supplier, numero_factura: 'F1', url_factura: expected.url_factura },
    productosCompra: [{ id: 'temp', producto_id: product, producto_nombre: 'Product', presentacion_cantidad: 3,
      presentacion_unidad: 'Kilos', cantidad_bultos: 1, precio_por_bulto: 3.015, numero_lote: '', fecha_vencimiento: '',
      permitido_gerencia: false, cantidad_total: 999, costo_total: 999, precio_unitario_real: 999 }],
  } }));
}
async function harness(mutate: (call: Call) => unknown | Promise<unknown>, historyRows?: unknown[]) {
  const h = await sdkHarness(c => {
    if (c.url.pathname === '/rest/v1/productos') return [{ id: product, nombre: 'Product', unidad_medida: 'Kilos', activo: true }];
    if (c.url.pathname === '/rest/v1/fin_proveedores') return [{ id: supplier, nombre: 'Supplier', activo: true }];
    if (c.url.pathname === '/rest/v1/compras') return historyRows ?? [{ ...expected, producto: { nombre: 'Product', categoria: 'Fertilizante', permitido_gerencia: true } }];
    return mutate(c);
  });
  state.client = h.client;
  return h;
}
async function mountNew() { await act(async () => { tree = create(<NewPurchase onSuccess={state.success} />); }); act(() => tree.root.findByType(FormDraftBanner).props.onRestore()); }
function saveButton() { return tree.root.findAllByType('button').find(b => b.children.includes('Registrar Compra'))!; }
async function save() { await act(async () => { await saveButton().props.onClick(); }); }
function rpcCalls(h: Awaited<ReturnType<typeof harness>>) { return h.calls.filter(c => c.url.pathname.includes('/rpc/')); }
async function mountHistory() { await act(async () => { tree = create(<PurchaseHistory />); }); }
function selectDelete() { act(() => tree.root.findAllByType('button').find(b => b.props.title === 'Eliminar compra')!.props.onClick()); }
function deleteButton() { return tree.root.findAllByType('button').find(b => b.children.some(c => typeof c === 'string' && c.includes('Eliminar Compra')))!; }
beforeEach(() => { vi.clearAllMocks(); memory.clear(); state.owner = owner; vi.stubGlobal('localStorage', storage); vi.stubGlobal('navigator', { locks: testLocks }); });
afterEach(() => { act(() => tree?.unmount()); vi.unstubAllGlobals(); });
describe('mounted purchase screens with actual SDK and draft hook', () => {
  it('retains form and key on malformed response, refuses changed retry, then recovers exact original payload', async () => {
    seed(); let malformed = true; const h = await harness(() => malformed ? null : receipt); await mountNew(); await save();
    expect(state.navigate).not.toHaveBeenCalled(); expect(state.success).not.toHaveBeenCalled(); expect(memory.has(draftKey)).toBe(true);
    const invoice = () => tree.root.findAllByType('input').find(i => i.props.id === 'numero_factura')!;
    act(() => invoice().props.onChange({ target: { value: 'changed' } })); await save(); expect(rpcCalls(h)).toHaveLength(1);
    act(() => invoice().props.onChange({ target: { value: 'F1' } })); malformed = false; await save();
    expect(rpcCalls(h)[0].body).toEqual(rpcCalls(h)[1].body); expect(memory.has(draftKey)).toBe(false);
    expect(rpcCalls(h)[0].body.p_payload).toMatchObject({ lines: [{ cantidad: 3, costo_total: 3.015 }] });
    expect(((rpcCalls(h)[0].body.p_payload as { lines: { costo_unitario: number }[] }).lines[0]).costo_unitario).toBeCloseTo(1.005);
    expect(JSON.stringify(tree.toJSON())).toContain('¡Compra registrada con éxito!');
  });
  it('blocks duplicate same-render submit and does not navigate or clear draft after account switch mid-request', async () => {
    seed(); let release!: (value: unknown) => void;
    const h = await harness(() => new Promise(resolve => { release = resolve; })); await mountNew();
    const handler = saveButton().props.onClick; let pending!: Promise<void>;
    await act(async () => { pending = handler(); await handler(); });
    expect(rpcCalls(h)).toHaveLength(1);
    state.owner = other; act(() => tree.update(<NewPurchase onSuccess={state.success} />)); h.switchOwner(other);
    await act(async () => { release(receipt); await pending; });
    expect(state.navigate).not.toHaveBeenCalled(); expect(state.success).not.toHaveBeenCalled(); expect(memory.has(draftKey)).toBe(true);
    expect(memory.has(`purchase_integrity_attempt_v1:${owner}:post:`)).toBe(true);
  });
  it('preserves pending confirmation and key after reversal response loss and retries without proof rebasing', async () => {
    let lose = true; const h = await harness(c => c.url.pathname.endsWith('fn_purchase_proof') ? { purchase_id: purchase, expected } : lose ? null : reversed);
    await mountHistory(); selectDelete(); expect(JSON.stringify(tree.toJSON())).toContain('Conservará todos los gastos');
    await act(async () => { await deleteButton().props.onClick(); });
    expect(state.success).not.toHaveBeenCalled(); expect(deleteButton()).toBeTruthy(); lose = false;
    await act(async () => { await deleteButton().props.onClick(); });
    expect(rpcCalls(h)).toHaveLength(3); expect(rpcCalls(h)[1].body).toEqual(rpcCalls(h)[2].body); expect(state.success).toHaveBeenCalledOnce();
  });
  it('clears selected confirmation on owner switch and refuses stale captured handler', async () => {
    const h = await harness(() => reversed); await mountHistory(); selectDelete(); const stale = deleteButton().props.onClick;
    state.owner = other; h.switchOwner(other); await act(async () => tree.update(<PurchaseHistory />));
    expect(JSON.stringify(tree.toJSON())).not.toContain('Confirmar Eliminación'); await act(async () => { await stale(); });
    expect(rpcCalls(h)).toHaveLength(0); expect(state.success).not.toHaveBeenCalled();
  });
});

function resolveButton() { return tree.root.findAllByType('button').find(b => b.children.includes('Verificar intento pendiente'))!; }
describe('mounted explicit pending purchase verification', () => {
  it('cancelled original posting retains edited form and permits fresh reviewed save with a new key', async () => {
    seed(); const h = await harness(c => c.url.pathname.endsWith('fn_purchase_resolve') ? { state: 'cancelled', request_key: c.body.p_request_key, operation: 'post' } : null);
    await mountNew(); await save();
    const invoice = () => tree.root.findAllByType('input').find(i => i.props.id === 'numero_factura')!;
    act(() => invoice().props.onChange({ target: { value: 'reviewed' } }));
    await act(async () => { await resolveButton().props.onClick(); });
    expect(invoice().props.value).toBe('reviewed'); expect(state.navigate).not.toHaveBeenCalled(); expect(state.success).not.toHaveBeenCalled();
    expect(memory.has(draftKey)).toBe(true); await save();
    const calls = rpcCalls(h); expect(calls.map(c => c.url.pathname.split('/').pop())).toEqual(['fn_purchase_post','fn_purchase_resolve','fn_purchase_post']);
    expect(calls[0].body.p_request_key).not.toBe(calls[2].body.p_request_key);
  });
  it('committed lost posting response validates receipt then follows normal successful workflow', async () => {
    seed(); const h = await harness(c => c.url.pathname.endsWith('fn_purchase_resolve') ? { state: 'committed', request_key: c.body.p_request_key, operation: 'post', receipt } : null);
    await mountNew(); await save(); await act(async () => { await resolveButton().props.onClick(); });
    expect(memory.has(draftKey)).toBe(false); expect(state.success).toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).toContain('¡Compra registrada con éxito!'); expect(rpcCalls(h)).toHaveLength(2);
  });
  it('committed original posting preserves later unposted edits and does not claim they were saved', async () => {
    seed(); await harness(c => c.url.pathname.endsWith('fn_purchase_resolve') ? { state: 'committed', request_key: c.body.p_request_key, operation: 'post', receipt } : null);
    await mountNew(); await save();
    const invoice = () => tree.root.findAllByType('input').find(i => i.props.id === 'numero_factura')!;
    act(() => invoice().props.onChange({ target: { value: 'edited' } })); await act(async () => { await resolveButton().props.onClick(); });
    expect(invoice().props.value).toBe('edited'); expect(memory.has(draftKey)).toBe(true); expect(state.warning).toHaveBeenCalled();
    expect(state.success).not.toHaveBeenCalled(); expect(state.navigate).not.toHaveBeenCalled();
  });
  it('unknown resolution retains pending button, form and original request evidence', async () => {
    seed(); await harness(() => null); await mountNew(); await save(); const slot = `purchase_integrity_attempt_v1:${owner}:post:`; const old = memory.get(slot);
    await act(async () => { await resolveButton().props.onClick(); });
    expect(resolveButton()).toBeTruthy(); expect(memory.get(slot)).toBe(old); expect(state.success).not.toHaveBeenCalled();
  });
  it('owner changed during resolution cannot clear original attempt or trigger successful workflow', async () => {
    seed(); let release!: (value: unknown) => void; let status!: Record<string, unknown>;
    const h = await harness(c => { if (!c.url.pathname.endsWith('fn_purchase_resolve')) return null; status = { state: 'committed', request_key: c.body.p_request_key, operation: 'post', receipt }; return new Promise(resolve => { release = resolve; }); });
    await mountNew(); await save(); let pending!: Promise<void>;
    await act(async () => { pending = resolveButton().props.onClick(); }); state.error.mockClear(); state.owner = other; h.switchOwner(other);
    act(() => tree.update(<NewPurchase onSuccess={state.success} />)); await act(async () => { release(status); await pending; });
    expect(memory.has(`purchase_integrity_attempt_v1:${owner}:post:`)).toBe(true); expect(memory.has(draftKey)).toBe(true);
    expect(state.success).not.toHaveBeenCalled(); expect(state.navigate).not.toHaveBeenCalled(); expect(state.error).not.toHaveBeenCalled();
  });
  it('history remount resolves original pending reversal even when purchase row is already gone', async () => {
    const h = await harness(c => c.url.pathname.endsWith('fn_purchase_proof') ? { purchase_id: purchase, expected } : c.url.pathname.endsWith('fn_purchase_resolve') ? { state: 'committed', request_key: c.body.p_request_key, operation: 'reverse', receipt: reversed } : null, []);
    await expect(reversePurchase(h.client as unknown as PurchaseProtocolClient, owner, expected)).rejects.toThrow();
    await mountHistory(); await act(async () => { await resolveButton().props.onClick(); });
    expect(memory.has(`purchase_integrity_attempt_v1:${owner}:reverse:${purchase}`)).toBe(false); expect(state.success).toHaveBeenCalledOnce();
    expect(rpcCalls(h).map(c => c.url.pathname.split('/').pop())).toEqual(['fn_purchase_proof','fn_purchase_reverse','fn_purchase_resolve']);
  });
});
