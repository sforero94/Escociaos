import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { PropsWithChildren } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { Gasto } from '@/types/finanzas';
import { GastoForm } from '@/components/finanzas/components/GastoForm';
import { CompletarGastoDialog } from '@/components/finanzas/components/CompletarGastoDialog';
import { crearGastoDraft, crearCompletarGastoDraft } from '@/utils/gastoDraft';
import { draftStorageKey } from '@/utils/draftStorage';

type BoxProps = PropsWithChildren;
const sdk = vi.hoisted(() => ({ client: null as ReturnType<typeof createClient<Database>> | null, error: vi.fn() }));
vi.mock('@/utils/supabase/client', () => ({ getSupabase: () => sdk.client }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'A' } }) }));
vi.mock('sonner', () => ({ toast: { error: sdk.error } }));
vi.mock('@/components/shared/ProveedorDialog', () => ({ ProveedorDialog: () => null }));
vi.mock('@/components/shared/FacturaUploader', () => ({ FacturaUploader: () => null }));
vi.mock('@/components/ui/dialog', () => {
  const Box = ({ children }: BoxProps) => <section>{children}</section>;
  return { Dialog: Box, DialogContent: Box, DialogHeader: Box, DialogTitle: Box,
    DialogDescription: Box, DialogBody: Box, DialogFooter: Box };
});
vi.mock('@/components/ui/select', () => {
  const Box = ({ children }: BoxProps) => <div>{children}</div>;
  return { Select: Box, SelectTrigger: Box, SelectContent: Box, SelectItem: Box, SelectValue: () => null };
});
vi.mock('@/components/ui/confirm-dialog', () => ({ ConfirmDialog: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) =>
  open ? <button data-confirm="future" onClick={onConfirm}>Confirmar fecha</button> : null }));
const base: Gasto = { id: 'gasto-a', fecha: '2026-10-01', negocio_id: 'n', region_id: 'r', categoria_id: 'c',
  concepto_id: 'co', nombre: 'source', proveedor_id: 'p', valor: 20, medio_pago_id: 'm', observaciones: 'source notes',
  estado: 'Pendiente', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T10:00:00.000Z' };
const nextVersion = '2026-10-10T10:00:00.000Z';
const callbacks = { onSuccess: vi.fn(), onCancel: vi.fn(), onOpenChange: vi.fn(), onError: vi.fn() };
let renderer: ReactTestRenderer;
let rows: unknown;
let patches: Array<{ url: URL; body: Record<string, unknown> }>;
const memory = new Map<string, string>();
function seed(key: string, data: unknown) {
  memory.set(draftStorageKey('A', key)!, JSON.stringify({ data, ownerId: 'A', version: 1, timestamp: new Date().toISOString() }));
}
function form(gasto = base) { return <GastoForm open gasto={gasto} {...callbacks} />; }
function complete(gasto = base) { return <CompletarGastoDialog open gasto={gasto} {...callbacks} />; }
async function mount(node: Parameters<typeof create>[0]) { await act(async () => { renderer = create(node); }); }
async function submit() {
  await act(async () => { await renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
}
function value(id: string) { return renderer.root.findAllByType('input').find(input => input.props.id === id)!.props.value; }
function text() { return JSON.stringify(renderer.toJSON()); }
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); memory.clear(); patches = []; rows = [{ id: base.id, updated_at: nextVersion }];
  const target = new EventTarget();
  vi.stubGlobal('localStorage', { getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, raw: string) => memory.set(key, raw), removeItem: (key: string) => memory.delete(key) });
  vi.stubGlobal('window', { addEventListener: target.addEventListener.bind(target), removeEventListener: target.removeEventListener.bind(target) });
  sdk.client = createClient<Database>('https://expenses.invalid', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      if (init?.method === 'PATCH') patches.push({ url: new URL(String(input)), body: JSON.parse(init.body as string) });
      return new Response(JSON.stringify(init?.method === 'PATCH' ? rows : []), { status: 200,
        headers: { 'Content-Type': 'application/json' } });
    } },
  });
});
afterEach(() => { act(() => renderer?.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('real expense forms preserve draft provenance through restore and reset', () => {
  it('restores typed values and original revision instead of overwriting from fresh parent data', async () => {
    seed(`gasto-edit-${base.id}`, { ...crearGastoDraft(base), nombre: 'restored typed expense', valor: 25 });
    await mount(form({ ...base, updated_at: nextVersion, nombre: 'new server name' }));
    expect(value('nombre')).toBe('restored typed expense'); rows = [];
    await submit();
    expect(patches[0].url.searchParams.get('updated_at')).toBe(`eq.${base.updated_at}`);
    expect(patches[0].body.nombre).toBe('restored typed expense'); expect(patches[0].body.__gastoOriginal).toBeUndefined();
    expect(callbacks.onSuccess).not.toHaveBeenCalled(); expect(value('nombre')).toBe('restored typed expense');
    expect(text()).toContain('El gasto cambió');
  });
  it('refuses old metadata-free owned drafts without assigning a fresh revision', async () => {
    const { __gastoOriginal: _original, ...legacy } = crearGastoDraft(base);
    seed(`gasto-edit-${base.id}`, { ...legacy, nombre: 'legacy typed values' });
    await mount(form()); await submit();
    expect(patches).toHaveLength(0); expect(callbacks.onSuccess).not.toHaveBeenCalled();
    expect(value('nombre')).toBe('legacy typed values'); expect(text()).toContain('versión original');
  });
  it('discard rebuilds latest source values and revision without auto-saving the reset', async () => {
    seed(`gasto-edit-${base.id}`, { ...crearGastoDraft(base), nombre: 'old typed values' });
    await mount(form({ ...base, updated_at: nextVersion, nombre: 'fresh source' }));
    act(() => renderer.root.findAllByType('button').find(button => button.children.includes('Empezar de nuevo'))!.props.onClick());
    act(() => { vi.advanceTimersByTime(1001); });
    expect(value('nombre')).toBe('fresh source'); expect(memory.has(draftStorageKey('A', `gasto-edit-${base.id}`)!)).toBe(false);
    rows = [{ id: base.id, updated_at: '2026-10-10T10:00:01Z' }]; await submit();
    expect(patches[0].url.searchParams.get('updated_at')).toBe(`eq.${nextVersion}`); expect(callbacks.onSuccess).toHaveBeenCalledTimes(1);
  });
  it('key transition rebuilds the new expense snapshot and does not write old values to its id', async () => {
    await mount(form());
    act(() => renderer.root.findAllByType('input').find(input => input.props.id === 'nombre')!.props.onChange({ target: { value: 'A typed' } }));
    const other = { ...base, id: 'gasto-b', nombre: 'B source', updated_at: nextVersion };
    await act(async () => renderer.update(form(other)));
    expect(value('nombre')).toBe('B source'); rows = [{ id: other.id, updated_at: '2026-10-10T10:00:01Z' }];
    await submit(); expect(patches[0].url.searchParams.get('id')).toBe('eq.gasto-b');
    expect(patches[0].body.nombre).toBe('B source'); expect(patches[0].url.searchParams.get('updated_at')).toBe(`eq.${nextVersion}`);
  });
  it('future-date confirmation retains the submitted original version despite a parent refresh', async () => {
    seed(`gasto-edit-${base.id}`, { ...crearGastoDraft(base), fecha: '2099-01-01', nombre: 'future typed' });
    await mount(form()); await submit(); expect(patches).toHaveLength(0);
    await act(async () => renderer.update(form({ ...base, updated_at: nextVersion })));
    rows = [];
    await act(async () => { renderer.root.findByProps({ 'data-confirm': 'future' }).props.onClick(); });
    expect(patches[0].url.searchParams.get('updated_at')).toBe(`eq.${base.updated_at}`);
    expect(patches[0].body.fecha).toBe('2099-01-01'); expect(callbacks.onSuccess).not.toHaveBeenCalled();
    expect(value('nombre')).toBe('future typed');
  });
  it.each([[], null, [{ id: 'foreign', updated_at: nextVersion }], [{ id: base.id, updated_at: base.updated_at }]])(
    'never clears typed completion data or signals success for unconfirmed writes (%j)', async response => {
      seed(`completar-gasto-${base.id}`, { ...crearCompletarGastoDraft(base), observaciones: 'completion typed' });
      rows = response; await mount(complete({ ...base, updated_at: nextVersion })); await submit();
      expect(patches[0].url.searchParams.get('updated_at')).toBe(`eq.${base.updated_at}`);
      expect(patches[0].body.estado).toBe('Confirmado'); expect(patches[0].body.__gastoOriginal).toBeUndefined();
      expect(callbacks.onSuccess).not.toHaveBeenCalled(); expect(callbacks.onOpenChange).not.toHaveBeenCalled();
      expect(renderer.root.findByType('textarea').props.value).toBe('completion typed'); expect(text()).toContain('El gasto cambió');
    });
  it('completing a valid original expense confirms exactly one matching changed row', async () => {
    await mount(complete()); await submit();
    expect(patches[0].body.estado).toBe('Confirmado'); expect(callbacks.onSuccess).toHaveBeenCalledTimes(1);
    expect(callbacks.onOpenChange).toHaveBeenCalledWith(false);
  });
  it('GastoForm blocks a nonfinite edited amount without issuing a PATCH', async () => {
    await mount(form());
    act(() => renderer.root.findAllByType('input').find(input => input.props.id === 'valor')!.props.onChange({ target: { value: 'Infinity' } }));
    await submit(); expect(patches).toHaveLength(0); expect(callbacks.onSuccess).not.toHaveBeenCalled();
  });
  it('completion discard rebuilds its source snapshot and the next save uses the fresh revision', async () => {
    seed(`completar-gasto-${base.id}`, { ...crearCompletarGastoDraft(base), observaciones: 'old completion' });
    await mount(complete({ ...base, updated_at: nextVersion, observaciones: 'fresh completion' }));
    act(() => renderer.root.findAllByType('button').find(button => button.children.includes('Empezar de nuevo'))!.props.onClick());
    act(() => { vi.advanceTimersByTime(1001); });
    expect(renderer.root.findByType('textarea').props.value).toBe('fresh completion');
    expect(memory.has(draftStorageKey('A', `completar-gasto-${base.id}`)!)).toBe(false);
    rows = [{ id: base.id, updated_at: '2026-10-10T10:00:01Z' }]; await submit();
    expect(patches[0].url.searchParams.get('updated_at')).toBe(`eq.${nextVersion}`);
    expect(callbacks.onSuccess).toHaveBeenCalledTimes(1);
  });
  it('completion refuses nonfinite original amount and preserves its typed values', async () => {
    await mount(complete({ ...base, valor: Infinity })); await submit();
    expect(patches).toHaveLength(0); expect(callbacks.onSuccess).not.toHaveBeenCalled();
    expect(text()).toContain('número finito');
  });
});
