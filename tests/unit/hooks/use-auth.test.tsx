/**
 * useAuth hook tests.
 *
 * Verifies the hook reflects auth-store state, computes derived fields,
 * and updates after login actions.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../../src/hooks/useAuth';
import { useAuthStore } from '../../../src/store/authStore';
import type { User } from '../../../src/types/auth';

vi.mock('../../../src/lib/api/auth', () => {
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

import * as authApi from '../../../src/lib/api/auth';

const userFixture: User = {
  id: 'user-1',
  email: 'user1@fueki.test',
  role: 'user',
  kycStatus: 'approved',
  helpLevel: 'novice',
  demoActive: false,
  demoUsed: false,
  firstName: 'Ada',
  lastName: 'Lovelace',
};

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    useAuthStore.getState().clearAuth();
    useAuthStore.setState({ isInitialized: true, isLoading: false });
  });

  it('exposes derived user display fields from store state', () => {
    useAuthStore.setState({ user: userFixture, isAuthenticated: true });

    const { result } = renderHook(() => useAuth());

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.kycStatus).toBe('approved');
    expect(result.current.isKYCApproved).toBe(true);
    expect(result.current.userDisplayName).toBe('Ada Lovelace');
  });

  it('updates hook values after login action', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      user: userFixture,
      tokens: {
        accessToken: 'header.payload.signature',
      },
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login({
        email: 'user1@fueki.test',
        password: 'StrongPass123!',
        rememberMe: true,
      });
    });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user?.email).toBe('user1@fueki.test');
      expect(result.current.userDisplayName).toBe('Ada Lovelace');
    });
  });
});
