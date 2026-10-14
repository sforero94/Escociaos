import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { draftStorageKey, readOwnedDraft, removeOwnedDraft, writeOwnedDraft } from '@/utils/draftStorage';

interface UseFormDraftOptions { debounceMs?: number; enabled?: boolean; }
interface UseFormDraftReturn<T> {
  hasDraft: boolean;
  draftData: T | null;
  acceptDraft: () => void;
  discardDraft: () => void;
  clearDraft: () => void;
}

/**
 * Observes caller-owned state; restore remains manual. Forms must remount on
 * account changes: this hook cannot reset fragmented caller state safely, so
 * autosave fails closed for the remainder of an instance after owner changes.
 */
export function useFormDraft<T>(key: string, currentData: T, options?: UseFormDraftOptions): UseFormDraftReturn<T> {
  const { debounceMs = 1000, enabled = true } = options ?? {};
  const { user } = useAuth();
  const ownerId = user?.id ?? null;
  const storageKey = enabled ? draftStorageKey(ownerId, key) : null;
  const [mountedOwner] = useState(ownerId);
  const quarantined = useRef(false);
  const load = () => ({ storageKey, draft: readOwnedDraft<T>(storageKey, ownerId), baseline: JSON.stringify(currentData), suppressReset: false });
  const [snapshot, setSnapshot] = useState(load);
  if (snapshot.storageKey !== storageKey) setSnapshot(load());
  const current = snapshot.storageKey === storageKey ? snapshot : load();
  const serialized = JSON.stringify(currentData);
  if (snapshot.storageKey === storageKey && snapshot.suppressReset) {
    setSnapshot({ ...snapshot, baseline: serialized, suppressReset: false });
  }
  const dataRef = useRef(serialized);
  const liveScope = useRef(storageKey);
  useLayoutEffect(() => {
    liveScope.current = storageKey;
    dataRef.current = serialized;
    if (mountedOwner !== ownerId) quarantined.current = true;
  }, [storageKey, serialized, mountedOwner, ownerId]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; };

  useEffect(() => {
    if (!storageKey || !ownerId || quarantined.current || snapshot.storageKey !== storageKey || snapshot.draft || serialized === snapshot.baseline) return;
    // Capture this render's data, never a ref that may later belong to another owner.
    timer.current = setTimeout(() => {
      if (liveScope.current === storageKey && !quarantined.current) writeOwnedDraft(storageKey, ownerId, currentData);
    }, debounceMs);
    return () => { if (timer.current !== null) clearTimeout(timer.current); };
  }, [storageKey, ownerId, snapshot, serialized, currentData, debounceMs]);

  const acceptDraft = useCallback(() => {
    cancel();
    setSnapshot({ storageKey, draft: null, baseline: dataRef.current, suppressReset: false });
  }, [storageKey]);
  const clearDraft = useCallback(() => {
    cancel();
    removeOwnedDraft(storageKey);
    // Baseline suppresses the reset render without blocking the next real edit.
    setSnapshot({ storageKey, draft: null, baseline: dataRef.current, suppressReset: true });
  }, [storageKey]);
  return useMemo(() => ({ hasDraft: !!current.draft, draftData: current.draft?.data ?? null,
    acceptDraft, discardDraft: clearDraft, clearDraft }), [current.draft, acceptDraft, clearDraft]);
}
