import { useState, useEffect, useRef } from 'react';

interface UseFormPersistenceOptions<T> {
  key: string; // Unique storage key for this form
  initialState: T; // Default state when no saved data exists
  debounceMs?: number; // Debounce delay (default: 1000ms)
  enabled?: boolean; // Allow disabling persistence (default: true)
}

interface StoredFormData<T> {
  data: T;
  timestamp: string;
  version: number;
}

const CURRENT_VERSION = 1;
const RETENTION_DAYS = 7;

/**
 * Custom hook for auto-saving form state to localStorage
 *
 * Features:
 * - Debounced auto-save while typing
 * - Automatic restoration on mount
 * - Unique storage keys per form
 * - Manual clear method
 * - Version tracking for schema migration
 * - 7-day retention with automatic cleanup
 *
 * @example
 * const [formData, setFormData, clearFormData] = useFormPersistence({
 *   key: 'calculadora-aplicaciones-v1',
 *   initialState: { paso_actual: 1, configuracion: null }
 * });
 */
export function useFormPersistence<T>({
  key,
  initialState,
  debounceMs = 1000,
  enabled = true
}: UseFormPersistenceOptions<T>): [T, (value: T | ((prev: T) => T)) => void, () => void] {

  // Storage key with prefix for namespacing
  const storageKey = `form_autosave_${key}`;

  // Initialize state from localStorage or use initial state
  const [state, setStateInternal] = useState<T>(() => {
    if (!enabled) return initialState;

    try {
      const savedData = localStorage.getItem(storageKey);
      if (savedData) {
        const parsed: StoredFormData<T> = JSON.parse(savedData);

        // Check version compatibility
        if (parsed.version !== CURRENT_VERSION) {
          console.warn(`⚠️ Form version mismatch for ${key}, clearing old data`);
          localStorage.removeItem(storageKey);
          return initialState;
        }

        console.log(`📂 Restored form state for: ${key}`);
        return parsed.data;
      }
    } catch (error) {
      console.warn(`⚠️ Failed to restore form state for: ${key}`, error);
      // Clear corrupted data
      try {
        localStorage.removeItem(storageKey);
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    return initialState;
  });

  // Debounce timer ref
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Track if this is the initial mount (don't save on first render)
  const isInitialMountRef = useRef(true);

  // Clear old form data (keep only last N days) — declared before effects that reference it
  const clearOldFormData = () => {
    try {
      const cutoffTime = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;

      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('form_autosave_')) {
          try {
            const item = localStorage.getItem(k);
            if (item) {
              const parsed: StoredFormData<unknown> = JSON.parse(item);
              const savedTime = new Date(parsed.timestamp).getTime();

              if (savedTime < cutoffTime) {
                localStorage.removeItem(k);
              }
            }
          } catch (e) {
            localStorage.removeItem(k);
          }
        }
      });
    } catch (error) {
      console.error('Failed to clear old form data', error);
    }
  };

  // Save to localStorage with debouncing
  useEffect(() => {
    if (!enabled) return;

    // Skip saving on initial mount (we just loaded the data)
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer
    debounceTimerRef.current = setTimeout(() => {
      try {
        const dataToSave: StoredFormData<T> = {
          data: state,
          timestamp: new Date().toISOString(),
          version: CURRENT_VERSION
        };

        localStorage.setItem(storageKey, JSON.stringify(dataToSave));
        console.log(`💾 Auto-saved form state for: ${key}`);
      } catch (error) {
        // Handle quota exceeded or other errors
        console.error(`❌ Failed to save form state for: ${key}`, error);

        // If quota exceeded, try to clear old form data
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
          clearOldFormData();

          // Try saving again after cleanup
          try {
            const dataToSave: StoredFormData<T> = {
              data: state,
              timestamp: new Date().toISOString(),
              version: CURRENT_VERSION
            };
            localStorage.setItem(storageKey, JSON.stringify(dataToSave));
            console.log(`💾 Auto-saved form state for: ${key} (after cleanup)`);
          } catch (retryError) {
            console.error(`❌ Failed to save after cleanup for: ${key}`, retryError);
          }
        }
      }
    }, debounceMs);

    // Cleanup
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [state, storageKey, debounceMs, enabled, key]);

  // Listen for storage events from other tabs
  useEffect(() => {
    if (!enabled) return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue) {
        try {
          const parsed: StoredFormData<T> = JSON.parse(e.newValue);

          // Check version compatibility
          if (parsed.version === CURRENT_VERSION) {
            setStateInternal(parsed.data);
            console.log(`🔄 Form state updated from another tab: ${key}`);
          }
        } catch (error) {
          console.warn(`⚠️ Failed to sync form state from another tab: ${key}`, error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [storageKey, key, enabled]);

  // Wrapper for setState to match React.useState signature
  const setState = (value: T | ((prev: T) => T)) => {
    if (typeof value === 'function') {
      setStateInternal(prev => (value as (prev: T) => T)(prev));
    } else {
      setStateInternal(value);
    }
  };

  // Clear saved data
  const clearFormData = () => {
    try {
      localStorage.removeItem(storageKey);
      console.log(`🗑️ Cleared form state for: ${key}`);
      setStateInternal(initialState);
    } catch (error) {
      console.error(`❌ Failed to clear form state for: ${key}`, error);
    }
  };


  return [state, setState, clearFormData];
}
