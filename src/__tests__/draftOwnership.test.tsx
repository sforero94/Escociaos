import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useFormPersistence } from '@/hooks/useFormPersistence';
import { useFormDraft } from '@/hooks/useFormDraft';
import { draftStorageKey, CURRENT_VERSION } from '@/utils/draftStorage';

const auth = vi.hoisted(() => ({ user: { id: 'A' } as { id: string } | null }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
const initial = { value: '' };
let persistent: ReturnType<typeof useFormPersistence<typeof initial>>;
let manual: ReturnType<typeof useFormDraft<typeof initial>>;
function Persistent({ formKey = 'test' }: { formKey?: string }) {
  const result = useFormPersistence({ key: formKey, initialState: initial, debounceMs: 10 });
  useLayoutEffect(() => { persistent = result; });
  return null;
}
function Manual({ value = '' }: { value?: string }) {
  const result = useFormDraft('test', { value }, { debounceMs: 10 });
  useLayoutEffect(() => { manual = result; });
  return null;
}
let renderer: ReactTestRenderer;
let target: EventTarget;
const memory = new Map<string, string>();
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
};
const key = (owner: string) => draftStorageKey(owner, 'test')!;
function seed(owner: string, value: string, days = 0, envelopeOwner = owner) {
  memory.set(key(owner), JSON.stringify({ data: { value }, ownerId: envelopeOwner, version: CURRENT_VERSION,
    timestamp: new Date(Date.now() - days * 86400000).toISOString() }));
}
function tick() { act(() => { vi.advanceTimersByTime(20); }); }
function mount(node: Parameters<typeof create>[0]) { act(() => { renderer = create(node); }); }
beforeEach(() => {
  vi.useFakeTimers(); memory.clear(); auth.user = { id: 'A' }; target = new EventTarget();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { addEventListener: target.addEventListener.bind(target), removeEventListener: target.removeEventListener.bind(target) });
});
afterEach(() => { act(() => renderer?.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('account-owned form drafts in real React hooks', () => {
  it('ignores unowned legacy data and never persists anonymous state on login', () => {
    memory.set('form_autosave_test', JSON.stringify({ data: { value: 'legacy A' }, version: 1, timestamp: new Date().toISOString() }));
    auth.user = null; mount(<Persistent />);
    act(() => persistent[1]({ value: 'anonymous' })); tick();
    expect(memory.size).toBe(1);
    auth.user = { id: 'B' }; act(() => renderer.update(<Persistent />)); tick();
    expect(persistent[0]).toEqual(initial); expect(memory.has(key('B'))).toBe(false);
  });
  it('restores only the matching owner and cancels a pending A save on direct switch', () => {
    seed('A', 'A draft'); seed('B', 'B draft'); mount(<Persistent />);
    expect(persistent[0].value).toBe('A draft'); expect(persistent[3]).toBe(true);
    act(() => persistent[1]({ value: 'unsaved A' }));
    auth.user = { id: 'B' }; act(() => renderer.update(<Persistent />)); tick();
    expect(persistent[0].value).toBe('B draft');
    expect(JSON.parse(memory.get(key('A'))!).data.value).toBe('A draft');
    expect(JSON.parse(memory.get(key('B'))!).data.value).toBe('B draft');
    act(() => persistent[1]({ value: 'B edit' })); tick();
    expect(JSON.parse(memory.get(key('B'))!).ownerId).toBe('B');
  });
  it('logout resets visible state, cancels pending save, and does not create anonymous storage', () => {
    mount(<Persistent />); act(() => persistent[1]({ value: 'A edit' }));
    auth.user = null; act(() => renderer.update(<Persistent />)); tick();
    expect(persistent[0]).toEqual(initial); expect(memory.size).toBe(0);
  });
  it('clear cancels pending writes and suppresses reset while allowing later edits', () => {
    seed('A', 'stored'); mount(<Persistent />);
    act(() => persistent[1]({ value: 'pending' })); act(() => persistent[2]()); tick();
    expect(memory.has(key('A'))).toBe(false); expect(persistent[0]).toEqual(initial); expect(persistent[3]).toBe(false);
    act(() => persistent[1]({ value: 'next' })); tick();
    expect(JSON.parse(memory.get(key('A'))!).data.value).toBe('next');
  });
  it.each([8, NaN])('rejects expired or invalid timestamps (%s) on restore', days => {
    seed('A', 'stale'); const envelope = JSON.parse(memory.get(key('A'))!);
    envelope.timestamp = Number.isNaN(days) ? 'bad-date' : new Date(Date.now() - days * 86400000).toISOString();
    memory.set(key('A'), JSON.stringify(envelope)); mount(<Persistent />);
    expect(persistent[0]).toEqual(initial); expect(memory.has(key('A'))).toBe(false);
  });
  it('rejects forged owners and expired cross-tab updates; accepts valid current-owner updates', () => {
    mount(<Persistent />);
    const sync = (storageKey: string, owner: string, days: number) => {
      const event = new Event('storage');
      Object.assign(event, { key: storageKey, newValue: JSON.stringify({ ownerId: owner, version: 1,
        data: { value: owner }, timestamp: new Date(Date.now() - days * 86400000).toISOString() }) });
      act(() => { target.dispatchEvent(event); });
    };
    sync(key('B'), 'B', 0); sync(key('A'), 'B', 0); sync(key('A'), 'A', 8);
    expect(persistent[0]).toEqual(initial);
    sync(key('A'), 'A', 0); expect(persistent[0].value).toBe('A'); tick();
    expect(memory.size).toBe(0); // Synced data must not echo back as an autosave.
  });
  it('manual hook offers A draft without overwriting it, then saves edits after acceptance', () => {
    seed('A', 'stored'); mount(<Manual value="fresh" />); tick();
    expect(manual.draftData?.value).toBe('stored');
    act(() => { manual.acceptDraft(); renderer.update(<Manual value="stored" />); }); tick();
    expect(JSON.parse(memory.get(key('A'))!).data.value).toBe('stored');
    act(() => renderer.update(<Manual value="edited" />)); tick();
    expect(JSON.parse(memory.get(key('A'))!).data.value).toBe('edited');
  });
  it('manual restore banner switches to B-owned data without exposing the A draft', () => {
    seed('A', 'A private draft'); seed('B', 'B private draft'); mount(<Manual />);
    expect(manual.draftData?.value).toBe('A private draft');
    auth.user = { id: 'B' }; act(() => renderer.update(<Manual />));
    expect(manual.draftData?.value).toBe('B private draft');
    auth.user = null; act(() => renderer.update(<Manual />));
    expect(manual.hasDraft).toBe(false); expect(manual.draftData).toBeNull();
  });
  it('manual hook fails closed across A→B→A and anonymous→login without promoting caller state', () => {
    mount(<Manual value="old A" />); act(() => renderer.update(<Manual value="pending A" />));
    auth.user = { id: 'B' }; act(() => renderer.update(<Manual value="old A" />)); tick();
    act(() => renderer.update(<Manual value="still A with edits" />)); tick();
    auth.user = { id: 'A' }; act(() => renderer.update(<Manual value="still A" />)); tick();
    expect(memory.size).toBe(0);
    act(() => renderer.unmount()); auth.user = null; mount(<Manual value="anonymous" />);
    auth.user = { id: 'B' }; act(() => renderer.update(<Manual value="anonymous" />));
    act(() => renderer.update(<Manual value="anonymous edited" />)); tick(); expect(memory.size).toBe(0);
  });
  it('keeps manual clear callbacks stable across typing for caller effect dependencies', () => {
    mount(<Manual />); const clear = manual.clearDraft; const discard = manual.discardDraft;
    act(() => renderer.update(<Manual value="typed" />));
    expect(manual.clearDraft).toBe(clear); expect(manual.discardDraft).toBe(discard);
  });
  it('manual clear and a batched caller reset do not recreate the draft; next edit saves', () => {
    mount(<Manual />); act(() => renderer.update(<Manual value="working" />)); tick();
    act(() => { manual.clearDraft(); renderer.update(<Manual />); }); tick();
    expect(memory.has(key('A'))).toBe(false);
    act(() => renderer.update(<Manual value="new work" />)); tick();
    expect(JSON.parse(memory.get(key('A'))!).data.value).toBe('new work');
  });
  it('changing a persistent form key resets state and cancels the prior form save', () => {
    mount(<Persistent />); act(() => persistent[1]({ value: 'old form' }));
    act(() => renderer.update(<Persistent formKey="other" />)); tick();
    expect(persistent[0]).toEqual(initial); expect(memory.size).toBe(0);
  });
});
