import { create } from 'zustand';
import type {
  DocumentUploadResponse,
  HelpLevel,
  KYCFormData,
  KYCStatus,
  KYCStatusResponse,
  KYCSubmitResponse,
  KYCUploadPayload,
  LoginRequest,
  RegisterRequest,
  User,
} from '../types/auth';
import * as authApi from '../lib/api/auth';
import { normalizeKycStatus } from '../lib/auth/kycStatus';
import { isJwtExpired } from '../lib/auth/jwt';
import {
  type AuthStorageMode,
  clearPersistedAuth,
  persistAuthSession,
  persistUser,
  readAuthSnapshot,
} from '../lib/authStorage';
import { clearAccessToken, getAccessToken, setAccessToken } from '../lib/authSession';
import { withStoreMiddleware } from './storeMiddleware';
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface AuthStore {
  // State
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  storageMode: AuthStorageMode;

  // Actions
  initialize: () => Promise<void>;
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  submitKYC: (data: KYCFormData) => Promise<KYCSubmitResponse>;
  uploadDocument: (payload: KYCUploadPayload) => Promise<DocumentUploadResponse>;
  checkKYCStatus: () => Promise<KYCStatusResponse>;
  updateHelpLevel: (helpLevel: HelpLevel) => Promise<User>;
  startDemo: () => Promise<void>;
  endDemo: () => Promise<void>;
  setUser: (user: User) => void;
  clearAuth: () => void;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState = {
  user: null as User | null,
  isAuthenticated: false,
  isLoading: false,
  isInitialized: false,
  storageMode: 'local' as AuthStorageMode,
};

function normalizeUser(user: User | null | undefined): User {
  if (!user || typeof user !== 'object') {
    throw new Error(
      'Authentication response is invalid (missing user profile). Please try again.',
    );
  }
  return {
    ...user,
    kycStatus: normalizeKycStatus((user as { kycStatus?: unknown }).kycStatus),
  };
}

// ---------------------------------------------------------------------------
// Double-init guard: ensures concurrent calls to initialize() share a single
// in-flight promise rather than racing against each other.
// ---------------------------------------------------------------------------

let _initPromise: Promise<void> | null = null;
const AUTH_BOOTSTRAP_TIMEOUT_MS = 10_000;
let _latestAuthSessionOperationId = 0;
let _latestAuthProfileOperationId = 0;

function beginAuthSessionOperation(): number {
  _latestAuthSessionOperationId += 1;
  _latestAuthProfileOperationId += 1;
  return _latestAuthSessionOperationId;
}

function beginAuthProfileOperation(): number {
  _latestAuthProfileOperationId += 1;
  return _latestAuthProfileOperationId;
}

function isCurrentAuthSessionOperation(operationId: number): boolean {
  return operationId === _latestAuthSessionOperationId;
}

function isCurrentAuthProfileOperation(operationId: number): boolean {
  return operationId === _latestAuthProfileOperationId;
}

function invalidateAuthOperations(): void {
  _latestAuthSessionOperationId += 1;
  _latestAuthProfileOperationId += 1;
}

async function withAuthBootstrapTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Auth bootstrap timeout during ${operation}`));
      }, AUTH_BOOTSTRAP_TIMEOUT_MS);
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Session-expired listener — reacts to refresh failures from the API client
// without a hard window.location redirect.
// ---------------------------------------------------------------------------

let _sessionExpiredListenerAttached = false;

function attachSessionExpiredListener(): void {
  if (_sessionExpiredListenerAttached || typeof window === 'undefined') return;
  _sessionExpiredListenerAttached = true;
  window.addEventListener('fueki:session-expired', () => {
    const store = useAuthStore.getState();
    if (store.isAuthenticated) {
      store.clearAuth();
      console.warn('[auth] Session expired — user signed out.');
    }
  });
}

export const useAuthStore = create<AuthStore>()(withStoreMiddleware('auth', (set, get) => ({
  ...initialState,

  // ---- initialize ----------------------------------------------------------
  initialize: async () => {
    attachSessionExpiredListener();
    if (_initPromise) return _initPromise;

    _initPromise = (async () => {
      const operationId = beginAuthSessionOperation();
      set({ isLoading: true });
      const snapshot = readAuthSnapshot();

      if (!snapshot) {
        clearAccessToken();
        if (!isCurrentAuthSessionOperation(operationId)) {
          return;
        }
        set({ isInitialized: true, isLoading: false, isAuthenticated: false, user: null });
        return;
      }

      const { user: savedUser, mode: storageMode } = snapshot;

      const refreshAndHydrate = async (): Promise<void> => {
        const newTokens = await withAuthBootstrapTimeout(
          authApi.refreshToken(),
          'token refresh',
        );
        if (!isCurrentAuthSessionOperation(operationId)) {
          return;
        }
        setAccessToken(newTokens.accessToken);

        let user: User | null = savedUser ? normalizeUser(savedUser) : null;
        try {
          const fetchedUser = await withAuthBootstrapTimeout(
            authApi.getProfile(),
            'profile fetch after refresh',
          );
          if (!isCurrentAuthSessionOperation(operationId)) {
            return;
          }
          user = normalizeUser(fetchedUser);
          persistUser(storageMode, user);
        } catch {
          // Degraded state — use saved user data.
        }

        if (!isCurrentAuthSessionOperation(operationId)) {
          return;
        }
        set({
          user,
          isAuthenticated: true,
          isInitialized: true,
          isLoading: false,
          storageMode,
        });
      };
      
      // No saved token to check — always attempt refresh via httpOnly cookie.
      try {
        await refreshAndHydrate();
      } catch {
        if (!isCurrentAuthSessionOperation(operationId)) {
          return;
        }
        get().clearAuth();
        set({ isInitialized: true, isLoading: false });
      }
    })();

    try {
      await _initPromise;
    } finally {
      _initPromise = null;
    }
  },

  // ---- login ---------------------------------------------------------------
  login: async (data) => {
    const operationId = beginAuthSessionOperation();
    set({ isLoading: true });
    try {
      const response = await authApi.login(data);
      if (!isCurrentAuthSessionOperation(operationId)) {
        return;
      }
      const storageMode: AuthStorageMode = data.rememberMe ? 'local' : 'session';
      const normalizedUser = normalizeUser(response.user);
      setAccessToken(response.tokens.accessToken);
      persistAuthSession(storageMode, normalizedUser);
      set({
        user: normalizedUser,
        isAuthenticated: true,
        isLoading: false,
        storageMode,
      });
    } catch (error) {
      if (isCurrentAuthSessionOperation(operationId)) {
        set({ isLoading: false });
      }
      throw error;
    }
  },

  // ---- register ------------------------------------------------------------
  register: async (data) => {
    const operationId = beginAuthSessionOperation();
    set({ isLoading: true });
    try {
      const response = await authApi.register(data);
      if (!isCurrentAuthSessionOperation(operationId)) {
        return;
      }
      const normalizedUser = normalizeUser(response.user);
      setAccessToken(response.tokens.accessToken);
      persistAuthSession('local', normalizedUser);
      set({
        user: normalizedUser,
        isAuthenticated: true,
        isLoading: false,
        storageMode: 'local',
      });
    } catch (error) {
      if (isCurrentAuthSessionOperation(operationId)) {
        set({ isLoading: false });
      }
      throw error;
    }
  },

  // ---- logout --------------------------------------------------------------
  logout: async () => {
    const operationId = beginAuthSessionOperation();
    let activeToken = getAccessToken();
    const hasPersistedSession = readAuthSnapshot() !== null;

    const user = get().user;
    if (user?.demoActive) {
      try { await authApi.endDemo(); } catch { /* best-effort */ }
    }

    // FIX: read fresh from auth session to avoid stale token snapshots.
    if (activeToken && isJwtExpired(activeToken, 0)) {
      try {
        const refreshed = await authApi.refreshToken({ skipAuthRefresh: true });
        if (!isCurrentAuthSessionOperation(operationId)) {
          return;
        }
        setAccessToken(refreshed.accessToken);
        activeToken = getAccessToken();
      } catch {
        activeToken = getAccessToken();
      }
    }

    if (!isCurrentAuthSessionOperation(operationId)) {
      return;
    }
    if (activeToken || hasPersistedSession) {
      authApi.logout(getAccessToken() ?? undefined).catch(() => {});
    }
    if (!isCurrentAuthSessionOperation(operationId)) {
      return;
    }
    get().clearAuth();
  },

  // ---- submitKYC -----------------------------------------------------------
  submitKYC: async (data) => {
    const operationId = beginAuthProfileOperation();
    const response = await authApi.submitKYC(data);
    if (!isCurrentAuthProfileOperation(operationId)) {
      return response;
    }
    const currentUser = get().user;
    const storageMode = get().storageMode;
    if (currentUser) {
      set((state) => {
        if (!state.user) {
          return state;
        }
        const updatedUser: User = {
          ...state.user,
          kycStatus: 'pending',
          subscriptionPlan: data.subscriptionPlan,
        };
        persistUser(storageMode, updatedUser);
        return { user: updatedUser };
      });
    }
    return response;
  },

  // ---- uploadDocument ------------------------------------------------------
  uploadDocument: async (payload) => {
    const response = await authApi.uploadDocument(payload);
    return response;
  },

  // ---- checkKYCStatus ------------------------------------------------------
  checkKYCStatus: async () => {
    const operationId = beginAuthProfileOperation();
    const response = await authApi.getKYCStatus();
    if (!isCurrentAuthProfileOperation(operationId)) {
      return response;
    }
    const currentUser = get().user;
    const storageMode = get().storageMode;
    if (currentUser) {
      set((state) => {
        if (!state.user) {
          return state;
        }
        const updatedUser: User = {
          ...state.user,
          kycStatus: normalizeKycStatus(response.status as KYCStatus),
        };
        persistUser(storageMode, updatedUser);
        return { user: updatedUser };
      });
    }
    return response;
  },

  // ---- updateHelpLevel -----------------------------------------------------
  updateHelpLevel: async (helpLevel) => {
    const operationId = beginAuthProfileOperation();
    const updatedUser = normalizeUser(await authApi.updatePreferences({ helpLevel }));
    if (!isCurrentAuthProfileOperation(operationId)) {
      return updatedUser;
    }
    persistUser(get().storageMode, updatedUser);
    set({ user: updatedUser });
    return updatedUser;
  },

  // ---- startDemo -----------------------------------------------------------
  startDemo: async () => {
    const operationId = beginAuthProfileOperation();
    set({ isLoading: true });
    try {
      const response = await authApi.startDemo();
      if (!isCurrentAuthProfileOperation(operationId)) {
        return;
      }
      const normalizedUser = normalizeUser(response.user);
      persistUser(get().storageMode, normalizedUser);
      set({ user: normalizedUser, isLoading: false });
    } catch (error) {
      if (isCurrentAuthProfileOperation(operationId)) {
        set({ isLoading: false });
      }
      throw error;
    }
  },

  // ---- endDemo -------------------------------------------------------------
  endDemo: async () => {
    const operationId = beginAuthProfileOperation();
    try {
      await authApi.endDemo();
      if (!isCurrentAuthProfileOperation(operationId)) {
        return;
      }
      const currentUser = get().user;
      if (currentUser) {
        set((state) => {
          if (!state.user) {
            return state;
          }
          const updatedUser: User = {
            ...state.user,
            demoActive: false,
            demoUsed: true,
          };
          persistUser(get().storageMode, updatedUser);
          return { user: updatedUser };
        });
      }
    } catch { /* best-effort */ }
  },

  // ---- setUser -------------------------------------------------------------
  setUser: (user) => {
    const normalizedUser = normalizeUser(user);
    persistUser(get().storageMode, normalizedUser);
    set({ user: normalizedUser });
  },

  // ---- clearAuth -----------------------------------------------------------
  clearAuth: () => {
    invalidateAuthOperations();
    clearPersistedAuth();
    clearAccessToken();
    set({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      storageMode: 'local',
    });
  },
})));
