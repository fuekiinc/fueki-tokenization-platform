import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, getRouteHandlers, invokeHandler } from '../helpers/routeHarness';

const mocks = vi.hoisted(() => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    passwordResetToken: {
      updateMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    session: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  createSession: vi.fn(),
  refreshSession: vi.fn(),
  invalidateSession: vi.fn(),
  invalidateAllSessions: vi.fn(),
  verifyAccessToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock('../../src/prisma', () => ({
  prisma: mocks.prisma,
}));

vi.mock('../../src/services/auth', () => ({
  hashPassword: mocks.hashPassword,
  verifyPassword: mocks.verifyPassword,
  createSession: mocks.createSession,
  refreshSession: mocks.refreshSession,
  invalidateSession: mocks.invalidateSession,
  invalidateAllSessions: mocks.invalidateAllSessions,
  verifyAccessToken: mocks.verifyAccessToken,
  verifyRefreshToken: mocks.verifyRefreshToken,
}));

vi.mock('../../src/services/email', () => ({
  sendPasswordResetEmail: mocks.sendPasswordResetEmail,
}));

import authRoutes from '../../src/routes/auth';
import { hashToken } from '../../src/services/tokenHash';

const [forgotPasswordHandler] = getRouteHandlers(authRoutes, 'post', '/forgot-password');
const [resetPasswordHandler] = getRouteHandlers(authRoutes, 'post', '/reset-password');

describe('password reset token routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
    mocks.prisma.passwordResetToken.create.mockResolvedValue({ id: 'reset-1' });
    mocks.prisma.user.update.mockResolvedValue({ id: 'user-1' });
    mocks.prisma.passwordResetToken.update.mockResolvedValue({ id: 'reset-1' });
    mocks.prisma.$transaction.mockResolvedValue([]);
    mocks.sendPasswordResetEmail.mockResolvedValue(undefined);
    mocks.hashPassword.mockResolvedValue('new-password-hash');
    mocks.invalidateAllSessions.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores only the reset token digest and emails the raw token', async () => {
    const randomUuidSpy = vi
      .spyOn(crypto, 'randomUUID')
      .mockReturnValue('reset-token-uuid');

    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    });

    const req = createMockReq({
      body: { email: 'user@example.com' },
    });
    const res = createMockRes();

    await invokeHandler(forgotPasswordHandler, req, res);

    expect(res.statusCode).toBe(200);
    expect(mocks.prisma.passwordResetToken.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        token: hashToken('reset-token-uuid'),
        expiresAt: expect.any(Date),
      },
    });
    expect(mocks.sendPasswordResetEmail).toHaveBeenCalledWith(
      'user@example.com',
      'reset-token-uuid',
    );

    randomUuidSpy.mockRestore();
  });

  it('resolves password reset tokens by digest while accepting legacy raw rows', async () => {
    const futureExpiry = new Date(Date.now() + 60_000);
    mocks.prisma.passwordResetToken.findFirst.mockResolvedValue({
      id: 'reset-1',
      userId: 'user-1',
      used: false,
      expiresAt: futureExpiry,
    });

    const req = createMockReq({
      body: {
        token: 'reset-token-uuid',
        newPassword: 'StrongerPass1!',
      },
    });
    const res = createMockRes();

    await invokeHandler(resetPasswordHandler, req, res);

    expect(res.statusCode).toBe(200);
    expect(mocks.prisma.passwordResetToken.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { token: hashToken('reset-token-uuid') },
          { token: 'reset-token-uuid' },
        ],
      },
    });
    expect(mocks.hashPassword).toHaveBeenCalledWith('StrongerPass1!');
    expect(mocks.invalidateAllSessions).toHaveBeenCalledWith('user-1');
  });
});
