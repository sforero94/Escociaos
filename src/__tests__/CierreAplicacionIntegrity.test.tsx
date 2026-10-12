import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import type { PropsWithChildren } from 'react';
import { CierreAplicacion } from '@/components/aplicaciones/CierreAplicacion';
import type { Aplicacion } from '@/types/aplicaciones';
import { FormDraftBanner } from '@/components/shared/FormDraftBanner';
import { draftStorageKey } from '@/utils/draftStorage';
import { closureAttemptSlot } from '@/utils/applicationClosureIntegrity';
import { owner, other, product, purchase as application, movement as closure, memory, storage, testLocks, sdkHarness, type Call } from './purchaseProtocolFixtures';
const state = vi.hoisted(() => ({ owner: '', client: null as unknown, navigate: vi.fn() }));
vi.mock('@/utils/supabase/client', () => ({ getSupabase: () => state.client }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: state.owner } }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => state.navigate, Link: ({ children }: PropsWithChildren) => <span>{children}</span> }));
vi.mock('@/components/aplicaciones/shared/AplicacionShell', () => ({ AplicacionShell: ({ children }: PropsWithChildren) => <section>{children}</section> }));
vi.mock('@/components/aplicaciones/SeccionInsumosCierre', () => ({ SeccionInsumosCierre: () => null }));
vi.mock('@/components/aplicaciones/SeccionConfirmarCierre', () => ({ SeccionConfirmarCierre: () => null }));
vi.mock('@/components/aplicaciones/SeccionLaboresCierre', () => ({ SeccionLaboresCierre: (props: { observaciones: string; onCambiarObservaciones(v: string): void }) => <textarea value={props.observaciones} onChange={e => props.onCambiarObservaciones(e.target.value)} /> }));
vi.mock('@/components/ui/alert-dialog', () => {
  const Box = ({ children }: PropsWithChildren) => <div>{children}</div>;
  return { AlertDialog: ({ children, open }: PropsWithChildren<{ open: boolean }>) => open ? <div>{children}</div> : null,
    AlertDialogContent: Box, AlertDialogHeader: Box, AlertDialogTitle: Box, AlertDialogDescription: Box, AlertDialogFooter: Box,
    AlertDialogCancel: (props: React.ComponentProps<'button'>) => <button {...props} />,
    AlertDialogAction: (props: React.ComponentProps<'button'>) => <button {...props} /> };
});
const expected = { aplicacion: { id: application, updated_at: '2026-10-10T10:00:00.123456Z' }, registros_trabajo: [], empleados: [], contratistas: [] };
const receipt = { aplicacionId: application, cierreId: closure, registrosEliminados: 0, registrosInsertados: 0, registrosActualizados: 0, productosActualizados: 1 };
const app = { id: application, nombre_aplicacion: 'Synthetic application', estado: 'En ejecución', tipo_aplicacion: 'Fumigación', tarea_id: null } as Aplicacion;
const draftKey = draftStorageKey(owner, `cierre-aplicacion-${application}-v1`)!;
const slot = closureAttemptSlot(owner, application);
let tree: ReactTestRenderer;
function seed(original = expected) { memory.set(draftKey, JSON.stringify({ ownerId: owner, version: 1, timestamp: new Date().toISOString(), data: {
  registrosEditados: [], datosFinales: { fechaInicioReal: '2026-10-10', fechaFinReal: '2026-10-10', observaciones: 'Original' }, originalExpected: original,
} })); }
async function harness(mutate: (call: Call) => unknown | Promise<unknown>, options: { changeSnapshot?: boolean; appError?: boolean } = {}) {
  let snapshots = 0;
  const h = await sdkHarness(c => {
    const path = c.url.pathname;
    if (path.endsWith('fn_application_closure_snapshot')) return { aplicacion_id: application, expected: options.changeSnapshot && snapshots++ > 0 ? { ...expected, changed: true } : expected };
    if (path === '/rest/v1/aplicaciones') return options.appError ? new Response(JSON.stringify({ message: 'app unavailable' }), { status: 403 }) : { ...app, aplicaciones_calculos: [], aplicaciones_lotes: [{ lote_id: product, lotes: { id: product, nombre: 'Lot', total_arboles: 100 } }] };
    if (path === '/rest/v1/movimientos_diarios') return [{ id: closure, fecha_movimiento: '2026-10-10', numero_canecas: 1 }];
    if (path === '/rest/v1/movimientos_diarios_productos') return [{ movimiento_diario_id: closure, producto_id: product, producto_nombre: 'Product', cantidad_utilizada: 2.345, unidad: 'Kilos' }];
    if (path === '/rest/v1/productos') return [{ id: product, precio_unitario: 2 }];
    if (path === '/rest/v1/aplicaciones_calculos' || path === '/rest/v1/aplicaciones_mezclas') return [];
    return mutate(c);
  });
  state.client = h.client; return h;
}
async function mount(restore = true) { await act(async () => { tree = create(<CierreAplicacion aplicacion={app} />); }); if (restore) act(() => tree.root.findByType(FormDraftBanner).props.onRestore()); }
const renderedText = (node: ReactTestInstance): string => node.children.map(child => typeof child === 'string' ? child : renderedText(child)).join('');
const button = (label: string) => tree.root.findAllByType('button').find(b => renderedText(b).includes(label))!;
async function click(label: string) { await act(async () => { button(label).props.onClick({ preventDefault() {} }); await new Promise(resolve => setTimeout(resolve, 0)); }); }
async function close() { await click('Cerrar Aplicación'); await click('Sí, cerrar aplicación'); }
const posts = (h: Awaited<ReturnType<typeof harness>>) => h.calls.filter(c => c.url.pathname.endsWith('fn_application_close'));
beforeEach(() => { vi.clearAllMocks(); memory.clear(); state.owner = owner; vi.stubGlobal('localStorage', storage); vi.stubGlobal('navigator', { locks: testLocks }); });
afterEach(() => { act(() => tree?.unmount()); vi.unstubAllGlobals(); });
describe('actual closure screen with SDK and owner-scoped draft hook', () => {
  it('brackets reads and sends preserved original with stable request; success clears draft only after receipt', async () => {
    seed(); const h = await harness(c => ({ request_key: c.body.p_request_key, receipt })); await mount(); await close();
    expect(h.calls.filter(c => c.url.pathname.endsWith('fn_application_closure_snapshot'))).toHaveLength(2);
    expect(posts(h)[0].body.p_expected).toEqual(expected); expect(memory.has(draftKey)).toBe(false); expect(memory.has(slot)).toBe(false); expect(state.navigate).toHaveBeenCalledWith('/aplicaciones');
  });
  it('mixed load snapshots fail closed before user can close', async () => {
    const h = await harness(() => null, { changeSnapshot: true }); await mount(false);
    expect(JSON.stringify(tree.toJSON())).toContain('cambiaron durante la carga'); expect(posts(h)).toHaveLength(0);
  });
  it('application read error fails closed rather than replacing input with empty records', async () => {
    const h = await harness(() => null, { appError: true }); await mount(false); expect(JSON.stringify(tree.toJSON())).toContain('app unavailable'); expect(posts(h)).toHaveLength(0);
  });
  it('restored stale draft retains exact original rather than adopting fresh load snapshot', async () => {
    const old = { ...expected, aplicacion: { ...expected.aplicacion, updated_at: '2026-10-09T10:00:00.123456Z' } }; seed(old);
    const h = await harness(() => null); await mount(); await close(); expect(posts(h)[0].body.p_expected).toEqual(old); expect(memory.has(draftKey)).toBe(true); expect(state.navigate).not.toHaveBeenCalled();
  });
  it('malformed close retains draft/key, explicit cancelled status preserves later edits and requires review', async () => {
    seed(); const h = await harness(c => c.url.pathname.endsWith('fn_application_closure_status') ? { state: 'cancelled', request_key: c.body.p_request_key } : null);
    await mount(); await close(); expect(memory.has(slot)).toBe(true); expect(memory.has(draftKey)).toBe(true);
    await click('Verificar cierre pendiente'); expect(memory.has(slot)).toBe(false); expect(memory.has(draftKey)).toBe(true); expect(state.navigate).not.toHaveBeenCalled(); expect(posts(h)).toHaveLength(1);
    expect(JSON.stringify(tree.toJSON())).toContain('Las ediciones se conservaron');
  });
  it('committed lost response resolves original and follows confirmed normal workflow', async () => {
    seed(); const h = await harness(c => c.url.pathname.endsWith('fn_application_closure_status') ? { state: 'committed', request_key: c.body.p_request_key, receipt } : null);
    await mount(); await close(); await click('Verificar cierre pendiente'); expect(memory.has(slot)).toBe(false); expect(memory.has(draftKey)).toBe(false); expect(state.navigate).toHaveBeenCalled(); expect(posts(h)).toHaveLength(1);
  });
  it('account switch while posting cannot clear draft, evidence, or navigate', async () => {
    seed(); let release!: (value: unknown) => void; let response!: unknown;
    const h = await harness(c => { response = { request_key: c.body.p_request_key, receipt }; return new Promise(resolve => { release = resolve; }); });
    await mount(); await close(); state.owner = other; h.switchOwner(other); act(() => tree.update(<CierreAplicacion aplicacion={app} />));
    await act(async () => { release(response); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(memory.has(slot)).toBe(true); expect(memory.has(draftKey)).toBe(true); expect(state.navigate).not.toHaveBeenCalled();
  });
  it('confirmed original preserves and durably saves edits made during the request', async () => {
    seed(); let release!: (value: unknown) => void; let response!: unknown;
    await harness(c => { response = { request_key: c.body.p_request_key, receipt }; return new Promise(resolve => { release = resolve; }); });
    await mount(); await close(); act(() => tree.root.findByType('textarea').props.onChange({ target: { value: 'Later edit' } }));
    await act(async () => { release(response); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(state.navigate).not.toHaveBeenCalled(); expect(JSON.parse(memory.get(draftKey)!).data.datosFinales.observaciones).toBe('Later edit');
    expect(JSON.stringify(tree.toJSON())).toContain('Las ediciones posteriores');
  });
  it('same-frame double confirmation posts one request only', async () => {
    seed(); const h = await harness(() => null); await mount(); await click('Cerrar Aplicación');
    const action = button('Sí, cerrar aplicación'); await act(async () => { action.props.onClick({ preventDefault() {} }); action.props.onClick({ preventDefault() {} }); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(posts(h)).toHaveLength(1);
  });
});
