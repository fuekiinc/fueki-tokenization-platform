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
import { clearAccessToken, getAccessToken, setAccessToken, } from '../lib/authSession';
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
    if (_initPromise) return _initPromise;

    _initPromise = (async () => {
      const snapshot = readAuthSnapshot();

      if (!snapshot) {
        set({ isInitialized: true });
        return;
      }

      const { user: savedUser, mode: storageMode } = snapshot;

      const refreshAndHydrate = async (): Promise<void> => {
        const newTokens = await withAuthBootstrapTimeout(
          authApi.refreshToken(),
          'token refresh',
        );
        setAccessToken(newTokens.accessToken);
      
        let user: User | null = savedUser ? normalizeUser(savedUser) : null;
        try {
          user = normalizeUser(
            await withAuthBootstrapTimeout(authApi.getProfile(), 'profile fetch after refresh'),
          );
          persistUser(storageMode, user);
        } catch {
          // Degraded state — use saved user data.
        }
      
        set({
          user,
          isAuthenticated: true,
          isInitialized: true,
          storageMode,
        });
      };
      
      // No saved token to check — always attempt refresh via httpOnly cookie.
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
  const inMemoryToken = getAccessToken();
  const shouldCallServerLogout =
    !!inMemoryToken && !isJwtExpired(inMemoryToken, 0);

  const user = get().user;
  if (user?.demoActive) {
    try { await authApi.endDemo(); } catch { /* best-effort */ }
  }
  if (shouldCallServerLogout) {
    authApi.logout().catch(() => {});
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
    clearPersistedAuth();
    clearAccessToken();
    set({
      user: null,
      isAuthenticated: false,
      storageMode: 'local',
    });
  },
}));
