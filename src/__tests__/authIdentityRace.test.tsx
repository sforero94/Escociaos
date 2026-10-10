import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLayoutEffect, useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { Session } from '@supabase/supabase-js';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

const sdk = vi.hoisted(() => ({ getSession: vi.fn(), getUserProfile: vi.fn(), signOut: vi.fn(),
  subscribe: vi.fn(), unsubscribe: vi.fn() }));
vi.mock('@/utils/supabase/client', () => ({ getSupabase: () => ({ auth: { getSession: sdk.getSession,
  onAuthStateChange: sdk.subscribe } }), getUserProfile: sdk.getUserProfile, signOut: sdk.signOut }));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const session = (id: string, token = id) => ({ user: { id }, access_token: token } as Session);
const profile = (id: string, activo: boolean | null = true, rol = 'Gerencia') => ({
  id, nombre: id, email: `${id}@example.com`, rol, modulos: [], activo,
});
type Profile = ReturnType<typeof profile>;
let initial: ReturnType<typeof deferred<{ data: { session: Session | null }; error: null }>>;
let requests: Array<{ owner: string; result: ReturnType<typeof deferred<Profile | null>> }>;
let event: (name: string, next: Session | null) => unknown;
let observed: ReturnType<typeof useAuth>;
let renders: Array<{ user: string | undefined; session: string | undefined; profile: string | undefined }>;
let renderer: ReactTestRenderer;
function Probe() {
  const auth = useAuth();
  useLayoutEffect(() => {
    observed = auth;
    renders.push({ user: auth.user?.id, session: auth.session?.user.id, profile: auth.profile?.id });
  });
  return null;
}
function Form() {
  const [value, setValue] = useState('');
  return <input value={value} onChange={() => setValue('A entered state')} />;
}
async function flush() { await act(async () => { await Promise.resolve(); }); }
async function emit(name: string, next: Session | null) {
  let returned: unknown;
  const lookupCount = sdk.getUserProfile.mock.calls.length;
  act(() => { returned = event(name, next); });
  expect(sdk.getUserProfile).toHaveBeenCalledTimes(lookupCount);
  expect(returned).toBeUndefined(); // SDK callback never awaits SDK work under its lock.
  await flush();
}
async function resolveProfile(index: number, result: Profile | null) {
  await act(async () => { requests[index].result.resolve(result); await Promise.resolve(); });
}
function text() { return JSON.stringify(renderer.toJSON()); }
beforeEach(async () => {
  vi.useFakeTimers(); vi.clearAllMocks(); requests = []; renders = [];
  initial = deferred(); sdk.getSession.mockReturnValue(initial.promise);
  sdk.subscribe.mockImplementation((callback: typeof event) => {
    event = callback; return { data: { subscription: { unsubscribe: sdk.unsubscribe } } };
  });
  sdk.getUserProfile.mockImplementation((owner: string) => {
    const result = deferred<Profile | null>(); requests.push({ owner, result }); return result.promise;
  });
  sdk.signOut.mockResolvedValue(true);
  await act(async () => { renderer = create(<AuthProvider><Probe /><ProtectedRoute><Form /></ProtectedRoute></AuthProvider>); });
});
afterEach(() => {
  for (const render of renders) {
    expect(render.user).toBe(render.session);
    if (render.profile) expect(render.profile).toBe(render.user);
  }
  act(() => renderer.unmount()); vi.useRealTimers();
});

describe('AuthProvider identity coherence and real route boundary', () => {
  it('loads B after SIGNED_IN A, resets old form state, and never carries the A profile', async () => {
    await emit('SIGNED_IN', session('A')); await resolveProfile(0, profile('A'));
    act(() => renderer.root.findByType('input').props.onChange());
    await emit('SIGNED_IN', session('B'));
    expect(observed.user?.id).toBe('B'); expect(observed.profile).toBeNull();
    expect(renderer.root.findAllByType('input')).toHaveLength(0);
    await resolveProfile(1, profile('B'));
    expect(renderer.root.findByType('input').props.value).toBe('');
    expect(requests.map(r => r.owner)).toEqual(['A', 'B']);
  });
  it('ignores pending A profile and stale initial getSession after B login', async () => {
    await emit('SIGNED_IN', session('A')); await emit('SIGNED_IN', session('B'));
    await resolveProfile(1, profile('B')); await resolveProfile(0, profile('A'));
    await act(async () => { initial.resolve({ data: { session: session('A') }, error: null }); });
    expect(observed.user?.id).toBe('B'); expect(observed.profile?.id).toBe('B');
  });
  it('invalidates A profile before local signOut and does not overwrite a later B login on completion', async () => {
    await emit('SIGNED_IN', session('A'));
    const logout = deferred<boolean>(); sdk.signOut.mockReturnValue(logout.promise);
    let completion!: Promise<void>;
    act(() => { completion = observed.signOut(); });
    expect(observed.user).toBeNull(); expect(observed.profile).toBeNull();
    await emit('SIGNED_IN', session('B')); await resolveProfile(1, profile('B'));
    await resolveProfile(0, profile('A'));
    await act(async () => { logout.resolve(true); await completion; });
    expect(observed.user?.id).toBe('B'); expect(observed.profile?.id).toBe('B');
  });
  it('SIGNED_OUT invalidates both profile load and refresh without resurrecting A', async () => {
    await emit('SIGNED_IN', session('A')); await resolveProfile(0, profile('A'));
    act(() => { void observed.refreshProfile(); }); await flush();
    await emit('SIGNED_OUT', null); await resolveProfile(1, profile('A'));
    expect(observed.user).toBeNull(); expect(observed.profile).toBeNull();
  });
  it('late profile success after the two-second deadline recovers unverified access', async () => {
    await emit('SIGNED_IN', session('A'));
    act(() => { vi.advanceTimersByTime(2001); });
    expect(observed.isLoading).toBe(false); expect(observed.profile).toBeNull();
    expect(text()).toContain('No pudimos verificar tu acceso'); expect(text()).not.toContain('Cuenta desactivada');
    await resolveProfile(0, profile('A'));
    expect(renderer.root.findAllByType('input')).toHaveLength(1);
  });
  it('missing profile offers retry and accepts only the newest refresh result', async () => {
    await emit('SIGNED_IN', session('A')); await resolveProfile(0, null);
    expect(text()).toContain('Reintentar verificación');
    const retry = renderer.root.findAllByType('button').find(button => button.children.includes('Reintentar verificación'))!;
    act(() => { retry.props.onClick(); }); await flush();
    act(() => { void observed.refreshProfile(); }); await flush();
    await resolveProfile(2, profile('A', false)); await resolveProfile(1, profile('A'));
    expect(observed.profile?.activo).toBe(false); expect(text()).toContain('Cuenta desactivada');
    expect(renderer.root.findAllByType('input')).toHaveLength(0);
  });
  it('same-account token refresh preserves verified profile, spinner state, and mounted form', async () => {
    await emit('SIGNED_IN', session('A')); await resolveProfile(0, profile('A'));
    act(() => renderer.root.findByType('input').props.onChange());
    await emit('TOKEN_REFRESHED', session('A', 'new-token'));
    await emit('SIGNED_IN', session('A', 'newer-token'));
    expect(observed.session?.access_token).toBe('newer-token'); expect(observed.isLoading).toBe(false);
    expect(observed.profile?.id).toBe('A'); expect(requests).toHaveLength(1);
    expect(renderer.root.findByType('input').props.value).toBe('A entered state');
  });
  it('different-account TOKEN_REFRESHED triggers a fresh fail-closed identity load', async () => {
    await emit('SIGNED_IN', session('A')); await resolveProfile(0, profile('A'));
    await emit('TOKEN_REFRESHED', session('B'));
    expect(observed.user?.id).toBe('B'); expect(observed.profile).toBeNull(); expect(observed.isLoading).toBe(true);
    await resolveProfile(1, profile('B')); expect(observed.profile?.id).toBe('B');
  });
  it('rejects wrong-owner and incomplete profiles, with no default role or access', async () => {
    await emit('SIGNED_IN', session('A')); await resolveProfile(0, profile('B'));
    expect(observed.profile).toBeNull(); expect(observed.hasRole(['Gerencia'])).toBe(false);
    expect(observed.hasModulo('finanzas')).toBe(false);
    act(() => { void observed.refreshProfile(); }); await flush();
    await resolveProfile(1, profile('A', null, ''));
    expect(text()).toContain('No pudimos verificar tu acceso'); expect(renderer.root.findAllByType('input')).toHaveLength(0);
    expect(observed.hasRole([''])).toBe(false);
  });
});
