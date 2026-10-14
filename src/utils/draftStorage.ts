/** Local drafts are conveniences, never authorization or conflict detection. */
export const FORM_AUTOSAVE_PREFIX = 'form_autosave_';
export const CURRENT_VERSION = 1;
export const RETENTION_DAYS = 7;
export interface StoredFormData<T> {
  data: T;
  timestamp: string;
  version: number;
  ownerId?: string;
}

export function draftStorageKey(ownerId: string | null, key: string): string | null {
  return ownerId ? `${FORM_AUTOSAVE_PREFIX}owned:${encodeURIComponent(ownerId)}:${encodeURIComponent(key)}` : null;
}

export function parseOwnedDraft<T>(raw: string | null, ownerId: string): StoredFormData<T> | null {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (!value || value.ownerId !== ownerId || value.version !== CURRENT_VERSION ||
        !Object.prototype.hasOwnProperty.call(value, 'data') || typeof value.timestamp !== 'string') return null;
    const age = Date.now() - Date.parse(value.timestamp);
    return Number.isFinite(age) && age >= 0 && age < RETENTION_DAYS * 86400000 ? value : null;
  } catch { return null; }
}

export function readOwnedDraft<T>(storageKey: string | null, ownerId: string | null): StoredFormData<T> | null {
  if (!storageKey || !ownerId) return null;
  try {
    const raw = localStorage.getItem(storageKey);
    const draft = parseOwnedDraft<T>(raw, ownerId);
    if (raw && !draft) localStorage.removeItem(storageKey);
    return draft;
  } catch { return null; }
}

export function removeOwnedDraft(storageKey: string | null) {
  if (!storageKey) return;
  try { localStorage.removeItem(storageKey); } catch { /* Storage may be unavailable. */ }
}

export function writeOwnedDraft<T>(storageKey: string, ownerId: string, data: T) {
  const raw = JSON.stringify({ data, ownerId, version: CURRENT_VERSION, timestamp: new Date().toISOString() });
  try { localStorage.setItem(storageKey, raw); } catch (error) {
    if (!(error instanceof DOMException) || error.name !== 'QuotaExceededError') return;
    // Reclaim only this owner's invalid/expired drafts, never another account's data.
    try {
      const prefix = `${FORM_AUTOSAVE_PREFIX}owned:${encodeURIComponent(ownerId)}:`;
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(prefix) && !parseOwnedDraft(localStorage.getItem(key), ownerId)) localStorage.removeItem(key);
      }
      localStorage.setItem(storageKey, raw);
    } catch { /* Best-effort autosave. */ }
  }
}
