import type { AuthTokens, User } from '../types/auth';

export type AuthStorageMode = 'local' | 'session';

export const AUTH_TOKENS_KEY = 'fueki-auth-tokens';
export const AUTH_USER_KEY = 'fueki-auth-user';
const AUTH_STORAGE_MODE_KEY = 'fueki-auth-storage-mode';

function getStorage(mode: AuthStorageMode): Storage {
  return mode === 'session' ? sessionStorage : localStorage;
}

function readJson<T>(storage: Storage, key: string): T | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson<T>(storage: Storage, key: string, value: T): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures (quota, private mode restrictions, etc.).
  }
}

function removeKey(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Ignore.
  }
}

function isAuthStorageMode(value: string | null): value is AuthStorageMode {
  return value === 'local' || value === 'session';
}

function isPlausibleTokens(value: unknown): value is AuthTokens {
  if (!value || typeof value !== 'object') return false;
  const token = (value as Record<string, unknown>).accessToken;
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

export function readStorageMode(): AuthStorageMode | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_MODE_KEY);
    return isAuthStorageMode(raw) ? raw : null;
  } catch {
    return null;
  }
}

function writeStorageMode(mode: AuthStorageMode): void {
  try {
    localStorage.setItem(AUTH_STORAGE_MODE_KEY, mode);
  } catch {
    // Ignore.
  }
}

function clearStorageMode(): void {
  try {
    localStorage.removeItem(AUTH_STORAGE_MODE_KEY);
  } catch {
    // Ignore.
  }
}

export function readTokensByMode(mode: AuthStorageMode): AuthTokens | null {
  const value = readJson<unknown>(getStorage(mode), AUTH_TOKENS_KEY);
  return isPlausibleTokens(value) ? value : null;
}

export function readUserByMode(mode: AuthStorageMode): User | null {
  return readJson<User>(getStorage(mode), AUTH_USER_KEY);
}

export function resolveActiveStorageMode(): AuthStorageMode | null {
  const preferred = readStorageMode();
  if (preferred && readTokensByMode(preferred)) {
    return preferred;
  }
  if (readTokensByMode('local')) return 'local';
  if (readTokensByMode('session')) return 'session';
  return null;
}

export function readAuthSnapshot(): {
  mode: AuthStorageMode;
  tokens: AuthTokens;
  user: User | null;
} | null {
  const mode = resolveActiveStorageMode();
  if (!mode) return null;
  const tokens = readTokensByMode(mode);
  if (!tokens) return null;
  return {
    mode,
    tokens,
    user: readUserByMode(mode),
  };
}

function clearModeStorage(mode: AuthStorageMode): void {
  const storage = getStorage(mode);
  removeKey(storage, AUTH_TOKENS_KEY);
  removeKey(storage, AUTH_USER_KEY);
}

export function clearPersistedAuth(): void {
  clearModeStorage('local');
  clearModeStorage('session');
  clearStorageMode();
}

export function persistAuthSnapshot(
  mode: AuthStorageMode,
  tokens: AuthTokens,
  user: User,
): void {
  clearModeStorage(mode === 'local' ? 'session' : 'local');
  const storage = getStorage(mode);
  writeJson(storage, AUTH_TOKENS_KEY, tokens);
  writeJson(storage, AUTH_USER_KEY, user);
  writeStorageMode(mode);
}

export function persistTokens(mode: AuthStorageMode, tokens: AuthTokens): void {
  clearModeStorage(mode === 'local' ? 'session' : 'local');
  writeJson(getStorage(mode), AUTH_TOKENS_KEY, tokens);
  writeStorageMode(mode);
}

export function persistUser(mode: AuthStorageMode, user: User): void {
  clearModeStorage(mode === 'local' ? 'session' : 'local');
  writeJson(getStorage(mode), AUTH_USER_KEY, user);
  writeStorageMode(mode);
}
