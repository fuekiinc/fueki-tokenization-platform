import type { User } from '../types/auth';

export type AuthStorageMode = 'local' | 'session';

export const AUTH_SESSION_KEY = 'fueki-auth-session';
export const AUTH_TOKENS_KEY = 'fueki-auth-tokens';
export const AUTH_USER_KEY = 'fueki-auth-user';
const LEGACY_AUTH_STORAGE_MODE_KEY = 'fueki-auth-storage-mode';

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

function hasPersistedSession(mode: AuthStorageMode): boolean {
  const session = readJson<{ active?: unknown }>(getStorage(mode), AUTH_SESSION_KEY);
  return session?.active === true;
}

function hasLegacyAuthData(mode: AuthStorageMode): boolean {
  try {
    const storage = getStorage(mode);
    return storage.getItem(AUTH_TOKENS_KEY) !== null || storage.getItem(AUTH_USER_KEY) !== null;
  } catch {
    return false;
  }
}

function readLegacyStorageMode(): AuthStorageMode | null {
  try {
    const raw = localStorage.getItem(LEGACY_AUTH_STORAGE_MODE_KEY);
    return isAuthStorageMode(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function readUserByMode(mode: AuthStorageMode): User | null {
  return readJson<User>(getStorage(mode), AUTH_USER_KEY);
}

export function resolveActiveStorageMode(): AuthStorageMode | null {
  if (hasPersistedSession('local')) return 'local';
  if (hasPersistedSession('session')) return 'session';

  const legacyPreferred = readLegacyStorageMode();
  if (legacyPreferred && hasLegacyAuthData(legacyPreferred)) {
    return legacyPreferred;
  }
  if (hasLegacyAuthData('local')) return 'local';
  if (hasLegacyAuthData('session')) return 'session';
  return null;
}

export function readAuthSnapshot(): {
  mode: AuthStorageMode;
  user: User | null;
} | null {
  const mode = resolveActiveStorageMode();
  if (!mode) return null;
  return {
    mode,
    user: readUserByMode(mode),
  };
}

function clearModeStorage(mode: AuthStorageMode): void {
  const storage = getStorage(mode);
  removeKey(storage, AUTH_SESSION_KEY);
  removeKey(storage, AUTH_TOKENS_KEY);
  removeKey(storage, AUTH_USER_KEY);
}

function clearLegacyStorageMode(): void {
  try {
    localStorage.removeItem(LEGACY_AUTH_STORAGE_MODE_KEY);
  } catch {
    // Ignore.
  }
}

export function clearPersistedAuth(): void {
  clearModeStorage('local');
  clearModeStorage('session');
  clearLegacyStorageMode();
}

function writeSessionMarker(mode: AuthStorageMode): void {
  writeJson(getStorage(mode), AUTH_SESSION_KEY, { active: true });
}

export function persistAuthSession(mode: AuthStorageMode, user: User | null): void {
  clearModeStorage('local');
  clearModeStorage('session');
  clearLegacyStorageMode();

  const storage = getStorage(mode);
  writeSessionMarker(mode);
  if (user) {
    writeJson(storage, AUTH_USER_KEY, user);
    return;
  }
  removeKey(storage, AUTH_USER_KEY);
}

export function persistUser(mode: AuthStorageMode, user: User): void {
  const otherMode = mode === 'local' ? 'session' : 'local';
  const storage = getStorage(mode);
  clearModeStorage(otherMode);
  clearLegacyStorageMode();
  removeKey(storage, AUTH_TOKENS_KEY);
  writeSessionMarker(mode);
  writeJson(storage, AUTH_USER_KEY, user);
}
