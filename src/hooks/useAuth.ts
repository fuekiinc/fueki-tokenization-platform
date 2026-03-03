import { useAuthStore } from '../store/authStore';
import type { KYCStatus, User } from '../types/auth';

// ---------------------------------------------------------------------------
// useAuth
//
// A convenience hook that wraps the most commonly used selectors and actions
// from the Zustand auth store. Using this hook instead of calling
// `useAuthStore()` directly has two benefits:
//
// 1. Reduced boilerplate -- components don't need to destructure the full
//    store or repeat the same selector patterns.
// 2. Stable references -- actions are selected individually (Zustand returns
//    stable references for functions), so components that only need one action
//    won't re-render when unrelated state changes.
// ---------------------------------------------------------------------------

interface UseAuthReturn {
  // State
  user: User | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  isLoading: boolean;

  // Derived state
  kycStatus: KYCStatus | undefined;
  isKYCApproved: boolean;
  userDisplayName: string;

  // Actions
  login: ReturnType<typeof useAuthStore.getState>['login'];
  register: ReturnType<typeof useAuthStore.getState>['register'];
  logout: ReturnType<typeof useAuthStore.getState>['logout'];
  initialize: ReturnType<typeof useAuthStore.getState>['initialize'];
}

export function useAuth(): UseAuthReturn {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const isLoading = useAuthStore((s) => s.isLoading);

  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const logout = useAuthStore((s) => s.logout);
  const initialize = useAuthStore((s) => s.initialize);

  // Derived state -- computed from user, so changes when user changes.
  const kycStatus = user?.kycStatus;
  const isKYCApproved = kycStatus === 'approved';

  const userDisplayName = user
    ? user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.email
    : '';

  return {
    user,
    isAuthenticated,
    isInitialized,
    isLoading,
    kycStatus,
    isKYCApproved,
    userDisplayName,
    login,
    register,
    logout,
    initialize,
  };
}

/**
 * A narrower hook for components that only need to know if the user is
 * logged in. Minimizes re-renders by selecting only the boolean flag.
 */
export function useIsAuthenticated(): boolean {
  return useAuthStore((s) => s.isAuthenticated);
}

/**
 * Returns the current user or null. Useful for components that display
 * user information without needing auth actions.
 */
export function useCurrentUser(): User | null {
  return useAuthStore((s) => s.user);
}
