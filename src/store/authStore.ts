import { create } from 'zustand';
import type {
  AuthTokens,
  DocumentUploadResponse,
  HelpLevel,
  KYCUploadPayload,
  KYCStatus,
  KYCFormData,
  KYCStatusResponse,
  KYCSubmitResponse,
  LoginRequest,
  RegisterRequest,
  User,
} from '../types/auth';
import * as authApi from '../lib/api/auth';
import { normalizeKycStatus } from '../lib/auth/kycStatus';
import {
  type AuthStorageMode,
  clearPersistedAuth,
  persistAuthSnapshot,
  persistTokens,
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

// ---------------------------------------------------------------------------
// Double-init guard: ensures concurrent calls to initialize() share a single
// in-flight promise rather than racing against each other.
// ---------------------------------------------------------------------------

let _initPromise: Promise<void> | null = null;

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
        set({ isInitialized: true });
        return;
      }

      const { tokens: savedTokens, user: savedUser, mode: storageMode } =
        snapshot;

      // Tokens found in storage -- try to validate them by fetching the profile.
      try {
        const user = normalizeUser(await authApi.getProfile());
        persistUser(storageMode, user);
        set({
          user,
          tokens: savedTokens,
          isAuthenticated: true,
          isInitialized: true,
          storageMode,
        });
      } catch {
        // Access token may have expired -- attempt a refresh.
        // The refresh token is sent automatically via httpOnly cookie.
        try {
          const newTokens = await authApi.refreshToken();

          persistTokens(storageMode, newTokens);

          // Fetch the user profile with the new access token.
          let user: User | null = savedUser ? normalizeUser(savedUser) : null;
          try {
            user = normalizeUser(await authApi.getProfile());
            if (user) {
              persistUser(storageMode, user);
            }
          } catch {
            // If profile fetch fails, use the previously saved user data.
            // This is a degraded state but better than logging the user out.
          }

          set({
            user,
            tokens: newTokens,
            isAuthenticated: true,
            isInitialized: true,
            storageMode,
          });
        } catch {
          // Refresh also failed -- clear everything.
          get().clearAuth();
          set({ isInitialized: true });
        }
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
      persistAuthSnapshot(storageMode, response.tokens, normalizedUser);
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
      persistAuthSnapshot('local', response.tokens, normalizedUser);
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
    // If in demo mode, end it first so the backend marks demoUsed=true.
    const user = get().user;
    if (user?.demoActive) {
      try { await authApi.endDemo(); } catch { /* best-effort */ }
    }
    // Fire-and-forget -- don't block the UI on the server call.
    // The refresh token is sent via httpOnly cookie automatically.
    authApi.logout().catch(() => {});
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
    set({
      user: null,
      tokens: null,
      isAuthenticated: false,
      storageMode: 'local',
    });
  },
}));
