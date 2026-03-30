import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, getRouteHandlers, invokeHandler } from '../helpers/routeHarness';

const mocks = vi.hoisted(() => {
  class AccountAccessRevokedError extends Error {
    constructor(message = 'Your access to the platform has been revoked by an administrator.') {
      super(message);
      this.name = 'AccountAccessRevokedError';
    }
  }

  return {
    prisma: {
      user: {
        findUnique: vi.fn(),
      },
    },
    verifyPassword: vi.fn(),
    createSession: vi.fn(),
    refreshSession: vi.fn(),
    hashPassword: vi.fn(),
    invalidateSession: vi.fn(),
    invalidateAllSessions: vi.fn(),
    verifyAccessToken: vi.fn(),
    AccountAccessRevokedError,
  };
});

vi.mock('../../src/prisma', () => ({
  prisma: mocks.prisma,
}));

vi.mock('../../src/services/auth', () => ({
  AccountAccessRevokedError: mocks.AccountAccessRevokedError,
  verifyPassword: mocks.verifyPassword,
  createSession: mocks.createSession,
  refreshSession: mocks.refreshSession,
  hashPassword: mocks.hashPassword,
  invalidateSession: mocks.invalidateSession,
  invalidateAllSessions: mocks.invalidateAllSessions,
  verifyAccessToken: mocks.verifyAccessToken,
}));

import authRoutes from '../../src/routes/auth';

const [loginHandler] = getRouteHandlers(authRoutes, 'post', '/login');
const [refreshHandler] = getRouteHandlers(authRoutes, 'post', '/refresh');

describe('auth access revocation handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks login for a revoked account after credential verification', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'revoked@example.com',
      passwordHash: 'hashed-password',
      role: 'user',
      accessRevokedAt: new Date('2026-03-29T00:00:00.000Z'),
      accessRevocationReason: 'Compliance hold',
      walletAddress: null,
      kycStatus: 'approved',
      helpLevel: 'novice',
      demoUsed: false,
      demoActive: false,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-02T00:00:00.000Z'),
      kycData: null,
    });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.invalidateAllSessions.mockResolvedValue(undefined);

    const req = createMockReq({
      body: {
        email: 'revoked@example.com',
        password: 'StrongPass1!',
        rememberMe: true,
      },
    });
    const res = createMockRes();

    await invokeHandler(loginHandler, req, res);

    expect(res.statusCode).toBe(403);
    expect((res.body as any).error.code).toBe('ACCOUNT_ACCESS_REVOKED');
    expect(mocks.invalidateAllSessions).toHaveBeenCalledWith('user-1');
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('returns a revoked-account response and clears the refresh cookie when refresh is blocked', async () => {
    mocks.refreshSession.mockRejectedValue(
      new mocks.AccountAccessRevokedError(),
    );

    const req = createMockReq({
      body: {},
      cookies: {
        fueki_refresh_token: 'refresh-token',
      },
    });
    const res = createMockRes();

    await invokeHandler(refreshHandler, req, res);

    expect(res.statusCode).toBe(403);
    expect((res.body as any).error.code).toBe('ACCOUNT_ACCESS_REVOKED');
    expect((res.headers['set-cookie'] as string[] | undefined)?.[0]).toContain('fueki_refresh_token=');
  });
});
