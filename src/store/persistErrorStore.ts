import { create } from 'zustand';
import { withStoreMiddleware } from './storeMiddleware';

interface PersistErrorStore {
  errors: Record<string, string>;
  setPersistError: (scope: string, error: string) => void;
  clearPersistError: (scope: string) => void;
  clearPersistErrors: (scopes?: string[]) => void;
  getPersistError: (scopes?: string[]) => string | null;
}

export const usePersistErrorStore = create<PersistErrorStore>()(
  withStoreMiddleware('persist-error', (set, get) => ({
    errors: {},

    setPersistError: (scope, error) =>
      set((state) => ({
        errors: state.errors[scope] === error
          ? state.errors
          : { ...state.errors, [scope]: error },
      })),

    clearPersistError: (scope) =>
      set((state) => {
        if (!(scope in state.errors)) {
          return state;
        }

        const nextErrors = { ...state.errors };
        delete nextErrors[scope];
        return { errors: nextErrors };
      }),

    clearPersistErrors: (scopes) =>
      set((state) => {
        if (!scopes || scopes.length === 0) {
          if (Object.keys(state.errors).length === 0) {
            return state;
          }
          return { errors: {} };
        }

        let changed = false;
        const nextErrors = { ...state.errors };
        for (const scope of scopes) {
          if (scope in nextErrors) {
            delete nextErrors[scope];
            changed = true;
          }
        }

        return changed ? { errors: nextErrors } : state;
      }),

    getPersistError: (scopes) => {
      const entries = get().errors;

      if (!scopes || scopes.length === 0) {
        return Object.values(entries)[0] ?? null;
      }

      for (const scope of scopes) {
        if (entries[scope]) {
          return entries[scope];
        }
      }

      return null;
    },
  })),
);

export function reportPersistError(scope: string, error: string): void {
  usePersistErrorStore.getState().setPersistError(scope, error);
}

export function clearPersistError(scope: string): void {
  usePersistErrorStore.getState().clearPersistError(scope);
}

export function clearPersistErrors(scopes?: string[]): void {
  usePersistErrorStore.getState().clearPersistErrors(scopes);
}

export function getPersistError(scopes?: string[]): string | null {
  return usePersistErrorStore.getState().getPersistError(scopes);
}
