import {
  createJSONStorage,
  type StateStorage,
} from 'zustand/middleware';
import logger from '../lib/logger';

const inMemoryPersistStorage = new Map<string, string>();
const warnedStorageKeys = new Set<string>();

function warnStorageFailure(key: string, action: 'read' | 'write' | 'remove', error: unknown): void {
  const warningKey = `${action}:${key}`;
  if (warnedStorageKeys.has(warningKey)) {
    return;
  }

  warnedStorageKeys.add(warningKey);
  logger.warn(
    `[persistStorage] Failed to ${action} "${key}" in localStorage. Falling back to in-memory persistence.`,
    error,
  );
}

export function createSafeStateStorage(scope: string): StateStorage {
  const scopedKey = (key: string) => `${scope}:${key}`;

  return {
    getItem: (key) => {
      const memoryKey = scopedKey(key);

      if (typeof window === 'undefined') {
        return inMemoryPersistStorage.get(memoryKey) ?? null;
      }

      try {
        const storedValue = window.localStorage.getItem(key);
        if (storedValue !== null) {
          inMemoryPersistStorage.set(memoryKey, storedValue);
          return storedValue;
        }
      } catch (error) {
        warnStorageFailure(key, 'read', error);
      }

      return inMemoryPersistStorage.get(memoryKey) ?? null;
    },

    setItem: (key, value) => {
      const memoryKey = scopedKey(key);
      inMemoryPersistStorage.set(memoryKey, value);

      if (typeof window === 'undefined') {
        return;
      }

      try {
        window.localStorage.setItem(key, value);
      } catch (error) {
        warnStorageFailure(key, 'write', error);
      }
    },

    removeItem: (key) => {
      const memoryKey = scopedKey(key);
      inMemoryPersistStorage.delete(memoryKey);

      if (typeof window === 'undefined') {
        return;
      }

      try {
        window.localStorage.removeItem(key);
      } catch (error) {
        warnStorageFailure(key, 'remove', error);
      }
    },
  };
}

export function createSafeJsonStorage(scope: string) {
  return createJSONStorage(() => createSafeStateStorage(scope));
}
