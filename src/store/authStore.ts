import { create } from 'zustand';
import type {
  User,
  AuthTokens,
  LoginRequest,
  RegisterRequest,
  KYCFormData,
  KYCSubmitResponse,
  KYCStatusResponse,
  DocumentUploadResponse,
} from '../types/auth';
import * as authApi from '../lib/api/auth';

// ---------------------------------------------------------------------------
// localStorage keys
// ---------------------------------------------------------------------------

// Only the short-lived access token is stored in localStorage.
// The long-lived refresh token is managed via an httpOnly cookie set by the
// backend, keeping it out of reach of XSS attacks (security audit H-01 fix).
const TOKENS_KEY = 'fueki-auth-tokens';
const USER_KEY = 'fueki-auth-user';

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function loadFromStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Silently ignore storage errors (e.g. quota exceeded, SSR).
  }
}

function removeFromStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Silently ignore.
  }
}

// ---------------------------------------------------------------------------
// Token validation
// ---------------------------------------------------------------------------

/**
 * Minimal structural check that a token string looks like a JWT (three
 * dot-separated, non-empty segments). This does NOT verify the signature.
 */
function isPlausibleJWT(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

/**
 * Validates that a stored tokens object has the expected shape and that the
 * access token string is structurally plausible.
 * (The refresh token is now in an httpOnly cookie, not in localStorage.)
 */
function validateTokens(tokens: AuthTokens | null): tokens is AuthTokens {
  if (!tokens) return false;
  return (
    typeof tokens.accessToken === 'string' &&
    isPlausibleJWT(tokens.accessToken)
  );
}

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

  // Actions
  initialize: () => Promise<void>;
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  submitKYC: (data: KYCFormData) => Promise<KYCSubmitResponse>;
  uploadDocument: (file: File, documentType: string) => Promise<DocumentUploadResponse>;
  checkKYCStatus: () => Promise<KYCStatusResponse>;
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
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAuthStore = create<AuthStore>()((set, get) => ({
  ...initialState,

  // ---- initialize ----------------------------------------------------------
  initialize: async () => {
    const savedTokens = loadFromStorage<AuthTokens>(TOKENS_KEY);
    const savedUser = loadFromStorage<User>(USER_KEY);

    if (!savedTokens || !validateTokens(savedTokens)) {
      // No valid tokens -- clear any partial/corrupt state and mark ready.
      if (savedTokens) {
        removeFromStorage(TOKENS_KEY);
      }
      set({ isInitialized: true });
      return;
    }

    // Tokens found in storage -- try to validate them by fetching the profile.
    try {
      const user = await authApi.getProfile();
      saveToStorage(USER_KEY, user);
      set({
        user,
        tokens: savedTokens,
        isAuthenticated: true,
        isInitialized: true,
      });
    } catch {
      // Access token may have expired -- attempt a refresh.
      // The refresh token is sent automatically via httpOnly cookie.
      try {
        const newTokens = await authApi.refreshToken();

        saveToStorage(TOKENS_KEY, newTokens);

        // Fetch the user profile with the new access token.
        let user: User | null = savedUser;
        try {
          user = await authApi.getProfile();
          saveToStorage(USER_KEY, user);
        } catch {
          // If profile fetch fails, use the previously saved user data.
          // This is a degraded state but better than logging the user out.
        }

        set({
          user,
          tokens: newTokens,
          isAuthenticated: true,
          isInitialized: true,
        });
      } catch {
        // Refresh also failed -- clear everything.
        get().clearAuth();
        set({ isInitialized: true });
      }
    }
  },

  // ---- login ---------------------------------------------------------------
  login: async (data) => {
    set({ isLoading: true });
    try {
      const response = await authApi.login(data);
      saveToStorage(TOKENS_KEY, response.tokens);
      saveToStorage(USER_KEY, response.user);
      set({
        user: response.user,
        tokens: response.tokens,
        isAuthenticated: true,
        isLoading: false,
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
      saveToStorage(TOKENS_KEY, response.tokens);
      saveToStorage(USER_KEY, response.user);
      set({
        user: response.user,
        tokens: response.tokens,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  // ---- logout --------------------------------------------------------------
  logout: async () => {
    // Fire-and-forget -- don't block the UI on the server call.
    // The refresh token is sent via httpOnly cookie automatically.
    authApi.logout().catch(() => {});
    get().clearAuth();
  },

  // ---- submitKYC -----------------------------------------------------------
  submitKYC: async (data) => {
    const response = await authApi.submitKYC(data);
    const currentUser = get().user;
    if (currentUser) {
      const updatedUser: User = { ...currentUser, kycStatus: 'pending' };
      saveToStorage(USER_KEY, updatedUser);
      set({ user: updatedUser });
    }
    return response;
  },

  // ---- uploadDocument ------------------------------------------------------
  uploadDocument: async (file, documentType) => {
    const response = await authApi.uploadDocument(file, documentType);
    return response;
  },

  // ---- checkKYCStatus ------------------------------------------------------
  checkKYCStatus: async () => {
    const response = await authApi.getKYCStatus();
    const currentUser = get().user;
    if (currentUser) {
      const updatedUser: User = { ...currentUser, kycStatus: response.status };
      saveToStorage(USER_KEY, updatedUser);
      set({ user: updatedUser });
    }
    return response;
  },

  // ---- setUser -------------------------------------------------------------
  setUser: (user) => {
    saveToStorage(USER_KEY, user);
    set({ user });
  },

  // ---- clearAuth -----------------------------------------------------------
  clearAuth: () => {
    removeFromStorage(TOKENS_KEY);
    removeFromStorage(USER_KEY);
    set({
      user: null,
      tokens: null,
      isAuthenticated: false,
    });
  },
}));
