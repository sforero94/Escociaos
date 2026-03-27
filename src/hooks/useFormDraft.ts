import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  FORM_AUTOSAVE_PREFIX,
  CURRENT_VERSION,
  RETENTION_DAYS,
  type StoredFormData,
} from './useFormPersistence';

interface UseFormDraftOptions {
  debounceMs?: number;
  enabled?: boolean;
}

interface UseFormDraftReturn<T> {
  hasDraft: boolean;
  draftData: T | null;
  acceptDraft: () => void;
  discardDraft: () => void;
  clearDraft: () => void;
}

/**
 * Snapshot-based draft persistence for forms with fragmented state.
 *
 * Unlike useFormPersistence (which replaces useState), this hook *observes*
 * the current form state and auto-saves a snapshot to localStorage.
 * Restoration is manual — the form reads `draftData` and applies it.
 *
 * @example
 * const draft = useFormDraft('my-form-v1', { fecha, nombre, valor });
 * // Show banner when draft.hasDraft is true
 * // On restore: read draft.draftData and call your setters
 * // On submit success: call draft.clearDraft()
 */
export function useFormDraft<T>(
  key: string,
  currentData: T,
  options?: UseFormDraftOptions
): UseFormDraftReturn<T> {
  const { debounceMs = 1000, enabled = true } = options ?? {};
  const storageKey = `${FORM_AUTOSAVE_PREFIX}${key}`;

  const [hasDraft, setHasDraft] = useState(false);
  const [draftData, setDraftData] = useState<T | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialMountRef = useRef(true);

  // Read draft from localStorage on mount
  useEffect(() => {
    if (!enabled) return;

    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed: StoredFormData<T> = JSON.parse(raw);
        if (parsed.version === CURRENT_VERSION) {
          const age = Date.now() - new Date(parsed.timestamp).getTime();
          if (age < RETENTION_DAYS * 24 * 60 * 60 * 1000) {
            setDraftData(parsed.data);
            setHasDraft(true);
            return;
          }
        }
        localStorage.removeItem(storageKey);
      }
    } catch {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey, enabled]);

  // Stable ref to currentData for the debounce callback
  const currentDataRef = useRef(currentData);
  currentDataRef.current = currentData;

  // Debounce-save currentData to localStorage
  // Skip while hasDraft is true (avoids overwriting the saved draft before user restores)
  useEffect(() => {
    if (!enabled || hasDraft) return;

    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(() => {
      try {
        const toSave: StoredFormData<T> = {
          data: currentDataRef.current,
          timestamp: new Date().toISOString(),
          version: CURRENT_VERSION,
        };
        localStorage.setItem(storageKey, JSON.stringify(toSave));
      } catch (error) {
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
          clearOldFormData();
          try {
            const toSave: StoredFormData<T> = {
              data: currentDataRef.current,
              timestamp: new Date().toISOString(),
              version: CURRENT_VERSION,
            };
            localStorage.setItem(storageKey, JSON.stringify(toSave));
          } catch {
            // give up
          }
        }
      }
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentData, storageKey, debounceMs, enabled, hasDraft]);

  const acceptDraft = useCallback(() => {
    setHasDraft(false);
    setDraftData(null);
  }, []);

  const discardDraft = useCallback(() => {
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    setHasDraft(false);
    setDraftData(null);
  }, [storageKey]);

  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    setHasDraft(false);
    setDraftData(null);
  }, [storageKey]);

  return useMemo(() => ({
    hasDraft,
    draftData,
    acceptDraft,
    discardDraft,
    clearDraft,
  }), [hasDraft, draftData, acceptDraft, discardDraft, clearDraft]);
}

function clearOldFormData() {
  try {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith(FORM_AUTOSAVE_PREFIX)) {
        try {
          const raw = localStorage.getItem(k);
          if (raw) {
            const parsed: StoredFormData<unknown> = JSON.parse(raw);
            if (new Date(parsed.timestamp).getTime() < cutoff) {
              localStorage.removeItem(k);
            }
          }
        } catch {
          localStorage.removeItem(k);
        }
      }
    });
  } catch {
    // ignore
  }
}
