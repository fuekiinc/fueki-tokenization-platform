import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../../src/lib/api/auth';
import { AUTH_SESSION_KEY, AUTH_TOKENS_KEY, AUTH_USER_KEY } from '../../src/lib/authStorage';
import { getAccessToken, setAccessToken } from '../../src/lib/authSession';
import { useAuthStore } from '../../src/store/authStore';
import type { User } from '../../src/types/auth';

vi.mock('../../src/lib/api/auth', () => {
  return {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    refreshToken: vi.fn(),
    getProfile: vi.fn(),
    submitKYC: vi.fn(),
    uploadDocument: vi.fn(),
    getKYCStatus: vi.fn(),
    updatePreferences: vi.fn(),
    startDemo: vi.fn(),
    endDemo: vi.fn(),
  };
});

const userFixture: User = {
  id: 'user-1',
  email: 'user1@fueki.test',
  walletAddress: null,
  role: 'user',
  kycStatus: 'approved',
  helpLevel: 'novice',
  demoActive: false,
  demoUsed: false,
  firstName: 'Ada',
  lastName: 'Lovelace',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function buildJwt(expiresInSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  })).toString('base64url');
  return `${header}.${payload}.signature`;
}

describe('auth session handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    useAuthStore.getState().clearAuth();
    useAuthStore.setState({ isInitialized: false, isLoading: false });
  });

  it('persists only session metadata on remember-me login', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      user: userFixture,
      tokens: {
        accessToken: buildJwt(600),
      },
    });

    await useAuthStore.getState().login({
      email: 'user1@fueki.test',
      password: 'StrongPass123!',
      rememberMe: true,
    });

    expect(getAccessToken()).not.toBeNull();
    expect(localStorage.getItem(AUTH_SESSION_KEY)).toBe(JSON.stringify({ active: true }));
    expect(localStorage.getItem(AUTH_USER_KEY)).not.toBeNull();
    expect(localStorage.getItem(AUTH_TOKENS_KEY)).toBeNull();
    expect(sessionStorage.getItem(AUTH_TOKENS_KEY)).toBeNull();
  });

  it('bootstraps from persisted session metadata via refresh cookie flow', async () => {
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ active: true }));
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(userFixture));

    vi.mocked(authApi.refreshToken).mockResolvedValue({
      accessToken: buildJwt(600),
    });
    vi.mocked(authApi.getProfile).mockResolvedValue({
      ...userFixture,
      helpLevel: 'expert',
    });

    await useAuthStore.getState().initialize();

    expect(authApi.refreshToken).toHaveBeenCalledTimes(1);
    expect(authApi.getProfile).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).not.toBeNull();
    expect(localStorage.getItem(AUTH_TOKENS_KEY)).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user?.helpLevel).toBe('expert');
  });

  it('clears any stale in-memory access token when no persisted session exists on startup', async () => {
    setAccessToken(buildJwt(600));

    await useAuthStore.getState().initialize();

    expect(authApi.refreshToken).not.toHaveBeenCalled();
    expect(getAccessToken()).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().isInitialized).toBe(true);
  });

  it('clears stored session state on logout while sending the current bearer', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      user: userFixture,
      tokens: {
        accessToken: buildJwt(600),
      },
    });

    await useAuthStore.getState().login({
      email: 'user1@fueki.test',
      password: 'StrongPass123!',
      rememberMe: true,
    });
    await useAuthStore.getState().logout();

    expect(authApi.logout).toHaveBeenCalledWith(expect.stringMatching(/\./));
    expect(getAccessToken()).toBeNull();
    expect(localStorage.getItem(AUTH_SESSION_KEY)).toBeNull();
    expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull();
    expect(localStorage.getItem(AUTH_TOKENS_KEY)).toBeNull();
    expect(sessionStorage.getItem(AUTH_TOKENS_KEY)).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('refreshes once to invalidate the server session when logout starts with an expired bearer', async () => {
    const expiredAccessToken = buildJwt(-60);
    const refreshedAccessToken = buildJwt(600);

    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ active: true }));
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(userFixture));
    useAuthStore.setState({
      user: userFixture,
      isAuthenticated: true,
      storageMode: 'local',
    });
    setAccessToken(expiredAccessToken);

    vi.mocked(authApi.refreshToken).mockResolvedValue({
      accessToken: refreshedAccessToken,
    });

    await useAuthStore.getState().logout();
    await Promise.resolve();
    await Promise.resolve();

    expect(authApi.refreshToken).toHaveBeenCalledWith(
      expect.objectContaining({ skipAuthRefresh: true }),
    );
    expect(authApi.logout).toHaveBeenCalledWith(refreshedAccessToken);
    expect(getAccessToken()).toBeNull();
    expect(localStorage.getItem(AUTH_SESSION_KEY)).toBeNull();
    expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull();
  });
});
