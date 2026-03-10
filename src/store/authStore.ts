import { create } from 'zustand';
import type {
  AuthTokens,
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
import { clearAccessToken, setAccessToken } from '../lib/authSession';
import {
  type AuthStorageMode,
  clearPersistedAuth,
  persistAuthSession,
  persistUser,
  readAuthSnapshot,
} from '../lib/authStorage';

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface AuthStore {
  // State
  user: User | null;
  tokens: AuthTokens | null;
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
  tokens: null as AuthTokens | null,
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

function normalizeStoredUser(user: User | null): User | null {
  if (!user) return null;
  try {
    return normalizeUser(user);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Double-init guard: ensures concurrent calls to initialize() share a single
// in-flight promise rather than racing against each other.
// ---------------------------------------------------------------------------

let _initPromise: Promise<void> | null = null;
const AUTH_BOOTSTRAP_TIMEOUT_MS = 3500;

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

export const useAuthStore = create<AuthStore>()((set, get) => ({
  ...initialState,

  // ---- initialize ----------------------------------------------------------
  initialize: async () => {
    // If an initialization is already in flight, piggyback on it.
    if (_initPromise) return _initPromise;

    _initPromise = (async () => {
      const snapshot = readAuthSnapshot();

      if (!snapshot) {
        clearAccessToken();
        set({ isInitialized: true });
        return;
      }

      const { user: savedUser, mode: storageMode } = snapshot;
      const normalizedSavedUser = normalizeStoredUser(savedUser);

      const refreshAndHydrate = async (): Promise<void> => {
        const newTokens = await withAuthBootstrapTimeout(
          authApi.refreshToken(),
          'token refresh',
        );
        setAccessToken(newTokens.accessToken);

        let user: User | null = normalizedSavedUser;
        try {
          user = normalizeUser(
            await withAuthBootstrapTimeout(authApi.getProfile(), 'profile fetch after refresh'),
          );
        } catch {
          // If profile fetch fails, use the previously saved user data.
          // This is a degraded state but better than logging the user out.
        }

        persistAuthSession(storageMode, user);

        set({
          user,
          tokens: newTokens,
          isAuthenticated: true,
          isInitialized: true,
          storageMode,
        });
      };

      try {
        await refreshAndHydrate();
      } catch {
        get().clearAuth();
        set({ isInitialized: true });
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
    set({ isLoading: true });
    try {
      const response = await authApi.login(data);
      const storageMode: AuthStorageMode = data.rememberMe ? 'local' : 'session';
      const normalizedUser = normalizeUser(response.user);
      setAccessToken(response.tokens.accessToken);
      persistAuthSession(storageMode, normalizedUser);
      set({
        user: normalizedUser,
        tokens: response.tokens,
        isAuthenticated: true,
        isLoading: false,
        storageMode,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  // ---- register ------------------------------------------------------------
  register: async (data) => {
    set({ isLoading: true });
    try {
      const response = await authApi.register(data);
      const normalizedUser = normalizeUser(response.user);
      setAccessToken(response.tokens.accessToken);
      persistAuthSession('local', normalizedUser);
      set({
        user: normalizedUser,
        tokens: response.tokens,
        isAuthenticated: true,
        isLoading: false,
        storageMode: 'local',
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  // ---- logout --------------------------------------------------------------
  logout: async () => {
    const currentTokens = get().tokens;
    const shouldCallServerLogout = !!currentTokens?.accessToken;

    // If in demo mode, end it first so the backend marks demoUsed=true.
    const user = get().user;
    if (user?.demoActive) {
      try { await authApi.endDemo(); } catch { /* best-effort */ }
    }

    const invalidateServerSession = async (): Promise<void> => {
      if (currentTokens?.accessToken && !isJwtExpired(currentTokens.accessToken, 0)) {
        await authApi.logout(currentTokens.accessToken);
        return;
      }

      const refreshed = await authApi.refreshToken({ skipAuthRefresh: true });
      await authApi.logout(refreshed.accessToken);
    };

    // Fire-and-forget -- don't block the UI on the server call.
    if (shouldCallServerLogout) {
      invalidateServerSession().catch(() => {});
    }
    get().clearAuth();
  },

  // ---- submitKYC -----------------------------------------------------------
  submitKYC: async (data) => {
    const response = await authApi.submitKYC(data);
    const currentUser = get().user;
    const storageMode = get().storageMode;
    if (currentUser) {
      const updatedUser: User = {
        ...currentUser,
        kycStatus: 'pending',
        subscriptionPlan: data.subscriptionPlan,
      };
      persistUser(storageMode, updatedUser);
      set({ user: updatedUser });
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
    const response = await authApi.getKYCStatus();
    const currentUser = get().user;
    const storageMode = get().storageMode;
    if (currentUser) {
      const updatedUser: User = {
        ...currentUser,
        kycStatus: normalizeKycStatus(response.status as KYCStatus),
      };
      persistUser(storageMode, updatedUser);
      set({ user: updatedUser });
    }
    return response;
  },

  // ---- updateHelpLevel -----------------------------------------------------
  updateHelpLevel: async (helpLevel) => {
    const updatedUser = normalizeUser(await authApi.updatePreferences({ helpLevel }));
    persistUser(get().storageMode, updatedUser);
    set({ user: updatedUser });
    return updatedUser;
  },

  // ---- startDemo -----------------------------------------------------------
  startDemo: async () => {
    set({ isLoading: true });
    try {
      const response = await authApi.startDemo();
      const normalizedUser = normalizeUser(response.user);
      persistUser(get().storageMode, normalizedUser);
      set({ user: normalizedUser, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  // ---- endDemo -------------------------------------------------------------
  endDemo: async () => {
    try {
      await authApi.endDemo();
      const currentUser = get().user;
      if (currentUser) {
        const updatedUser: User = {
          ...currentUser,
          demoActive: false,
          demoUsed: true,
        };
        persistUser(get().storageMode, updatedUser);
        set({ user: updatedUser });
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
    clearAccessToken();
    clearPersistedAuth();
    set({
      user: null,
      tokens: null,
      isAuthenticated: false,
      storageMode: 'local',
    });
  },
}));
