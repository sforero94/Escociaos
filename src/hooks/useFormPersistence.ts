import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { draftStorageKey, readOwnedDraft, removeOwnedDraft, parseOwnedDraft, writeOwnedDraft } from '@/utils/draftStorage';
export { FORM_AUTOSAVE_PREFIX, CURRENT_VERSION, RETENTION_DAYS, type StoredFormData } from '@/utils/draftStorage';

interface UseFormPersistenceOptions<T> {
  key: string;
  initialState: T;
  debounceMs?: number;
  enabled?: boolean;
}

/** Account-owned autosave. Clearing resets without writing the empty form back. */
export function useFormPersistence<T>({ key, initialState, debounceMs = 1000, enabled = true }: UseFormPersistenceOptions<T>):
  [T, (value: T | ((prev: T) => T)) => void, () => void, boolean] {
  const { user } = useAuth();
  const ownerId = user?.id ?? null;
  const storageKey = enabled ? draftStorageKey(ownerId, key) : null;
  const load = () => {
    const draft = readOwnedDraft<T>(storageKey, ownerId);
    return { storageKey, data: draft ? draft.data : initialState, restored: !!draft, dirty: false };
  };
  const [snapshot, setSnapshot] = useState(load);
  // Reset during render so neither UI nor effects expose the previous account's state.
  if (snapshot.storageKey !== storageKey) setSnapshot(load());
  const current = snapshot.storageKey === storageKey ? snapshot : load();
  const liveScope = useRef(storageKey);
  useLayoutEffect(() => { liveScope.current = storageKey; }, [storageKey]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; };

  useEffect(() => {
    if (!storageKey || !ownerId || snapshot.storageKey !== storageKey || !snapshot.dirty) return;
    timer.current = setTimeout(() => {
      if (liveScope.current === storageKey) writeOwnedDraft(storageKey, ownerId, snapshot.data);
    }, debounceMs);
    return () => { if (timer.current !== null) clearTimeout(timer.current); };
  }, [storageKey, ownerId, snapshot, debounceMs]);

  useEffect(() => {
    if (!storageKey || !ownerId) return;
    const sync = (event: StorageEvent) => {
      if (event.key !== storageKey || (event.storageArea && event.storageArea !== localStorage)) return;
      const draft = parseOwnedDraft<T>(event.newValue, ownerId);
      if (!draft && event.newValue !== null) return;
      cancel();
      setSnapshot({ storageKey, data: draft ? draft.data : initialState, restored: !!draft, dirty: false });
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [storageKey, ownerId, initialState]);

  const setState = (value: T | ((prev: T) => T)) => {
    setSnapshot(prev => {
      const data = prev.storageKey === storageKey ? prev.data : initialState;
      return { storageKey, data: typeof value === 'function' ? (value as (prev: T) => T)(data) : value,
        restored: prev.storageKey === storageKey && prev.restored, dirty: true };
    });
  };
  const clearFormData = () => {
    cancel();
    removeOwnedDraft(storageKey);
    setSnapshot({ storageKey, data: initialState, restored: false, dirty: false });
  };
  return [current.data, setState, clearFormData, current.restored];
}
