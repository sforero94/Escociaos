import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useLayoutEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useScopedStorageOpen } from '@/hooks/useScopedStorageOpen';
import { sdkHarness, owner, other } from './purchaseProtocolFixtures';

const state = vi.hoisted(() => ({ owner: '', client: null as unknown }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: state.owner } }) }));
vi.mock('@/utils/supabase/client', () => ({ getSupabase: () => state.client }));
let api: ReturnType<typeof useScopedStorageOpen>;
function Probe({ path = 'a.pdf', target = 'a', open = true }: { path?: string; target?: string; open?: boolean }) {
  const result = useScopedStorageOpen('facturas', path, target, open);
  useLayoutEffect(() => { api = result; });
  return null;
}
function deferred() {
  let resolve!: (value: { signedURL: string }) => void;
  const promise = new Promise<{ signedURL: string }>(r => { resolve = r; });
  return { resolve, promise };
}
describe('reader presentation follows current account and record', () => {
  let tree: ReactTestRenderer | undefined;
  const popup = vi.fn();
  beforeEach(() => { state.owner = owner; popup.mockClear(); vi.stubGlobal('window', { open: popup }); });
  afterEach(() => { if (tree) act(() => tree!.unmount()); tree = undefined; vi.unstubAllGlobals(); });
  async function mount(handler: Parameters<typeof sdkHarness>[0]) {
    const h = await sdkHarness(handler); state.client = h.client;
    act(() => { tree = create(<Probe />); }); return h;
  }
  it('uses real SDK signing and checks owner before presenting a short-lived URL', async () => {
    const h = await mount(() => ({ signedURL: '/object/sign/facturas/a.pdf?token=synthetic' }));
    await act(async () => { await api.openFile(); });
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].url.pathname).toBe('/storage/v1/object/sign/facturas/a.pdf');
    expect(h.calls[0].body).toEqual({ expiresIn: 60 });
    expect(popup).toHaveBeenCalledWith(expect.stringContaining('/facturas/a.pdf?token=synthetic'), '_blank', 'noopener,noreferrer');
  });
  it.each(['path', 'target', 'close', 'account', 'unmount', 'aba'])('discards a delayed signing response after %s', async (change) => {
    const d = deferred(); const started = deferred();
    await mount(() => { started.resolve({ signedURL: '' }); return d.promise; });
    let pending!: Promise<void>;
    await act(async () => { pending = api.openFile(); await started.promise; });
    act(() => {
      if (change === 'unmount') { tree!.unmount(); tree = undefined; }
      else if (change === 'account') { state.owner = other; tree!.update(<Probe />); }
      else if (change === 'close') tree!.update(<Probe open={false} />);
      else if (change === 'target') tree!.update(<Probe target="b" />);
      else tree!.update(<Probe path="b.pdf" />);
    });
    if (change === 'aba') act(() => { tree!.update(<Probe />); });
    await act(async () => { d.resolve({ signedURL: '/object/sign/facturas/a.pdf?token=synthetic' }); await pending; });
    expect(popup).not.toHaveBeenCalled();
  });
  it('refuses a server-confirmed owner change without relying on a React update', async () => {
    const d = deferred(); const started = deferred();
    const h = await mount(() => { started.resolve({ signedURL: '' }); return d.promise; });
    let pending!: Promise<void>;
    await act(async () => { pending = api.openFile(); await started.promise; });
    h.switchOwner(other);
    await act(async () => { d.resolve({ signedURL: '/object/sign/facturas/a.pdf?token=synthetic' }); await expect(pending).rejects.toThrow('cuenta cambió'); });
    expect(popup).not.toHaveBeenCalled();
  });
  it('suppresses simultaneous clicks and preserves current opening state', async () => {
    const d = deferred(); const started = deferred();
    const h = await mount(() => { started.resolve({ signedURL: '' }); return d.promise; });
    let pending!: Promise<void>;
    await act(async () => { pending = api.openFile(); await api.openFile(); await started.promise; });
    expect(h.calls).toHaveLength(1); expect(api.opening).toBe(true);
    await act(async () => { d.resolve({ signedURL: '/object/sign/facturas/a.pdf?token=synthetic' }); await pending; });
    expect(popup).toHaveBeenCalledOnce(); expect(api.opening).toBe(false);
  });
});
