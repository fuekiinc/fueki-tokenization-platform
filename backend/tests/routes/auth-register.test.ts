import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, getRouteHandlers, invokeHandler } from '../helpers/routeHarness';

const mocks = vi.hoisted(() => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    session: {
      deleteMany: vi.fn(),
    },
  },
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  createSession: vi.fn(),
  refreshSession: vi.fn(),
  invalidateSession: vi.fn(),
  invalidateAllSessions: vi.fn(),
  verifyAccessToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
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

import authRoutes from '../../src/routes/auth';

const [registerHandler] = getRouteHandlers(authRoutes, 'post', '/register');

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    mocks.hashPassword.mockResolvedValue('hashed-password');
    mocks.prisma.user.create.mockResolvedValue({
      id: 'user-1',
      email: 'new.user@example.com',
      role: 'user',
      walletAddress: null,
      kycStatus: 'not_submitted',
      helpLevel: 'novice',
      demoUsed: false,
      demoActive: false,
      createdAt: new Date('2026-03-03T00:00:00.000Z'),
      updatedAt: new Date('2026-03-03T00:00:00.000Z'),
    });
    mocks.createSession.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      rememberMe: true,
    });
  });

  it('returns 201 for valid payload and sets refresh cookie', async () => {
    const req = createMockReq({
      body: {
        email: 'NEW.USER@example.com',
        password: 'StrongPass1!',
        helpLevel: 'expert',
      },
    });
    const res = createMockRes();

    await invokeHandler(registerHandler, req, res);

    expect(res.statusCode).toBe(201);
    expect((res.body as any).tokens.accessToken).toBe('access-token');
    expect((res.headers['set-cookie'] as string[] | undefined)?.[0]).toContain('fueki_refresh_token=');
    expect(mocks.prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'new.user@example.com' },
    });
    expect(mocks.prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: 'new.user@example.com',
        passwordHash: 'hashed-password',
        helpLevel: 'expert',
      },
    });
  });

  it('returns 409 when email already exists', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'existing-user',
    });

    const req = createMockReq({
      body: {
        email: 'existing.user@example.com',
        password: 'StrongPass1!',
      },
    });
    const res = createMockRes();

    await invokeHandler(registerHandler, req, res);

    expect(res.statusCode).toBe(409);
    expect((res.body as any).error.code).toBe('EMAIL_EXISTS');
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid payload', async () => {
    const req = createMockReq({
      body: {
        email: 'invalid-email',
        password: 'weak',
      },
    });
    const res = createMockRes();

    await invokeHandler(registerHandler, req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as any).error.code).toBe('VALIDATION_ERROR');
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
  });

  it('returns 409 when create hits a unique email race (P2002)', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    mocks.prisma.user.create.mockRejectedValue({
      code: 'P2002',
      meta: { target: ['email'] },
    });

    const req = createMockReq({
      body: {
        email: 'racing.user@example.com',
        password: 'StrongPass1!',
      },
    });
    const res = createMockRes();

    await invokeHandler(registerHandler, req, res);

    expect(res.statusCode).toBe(409);
    expect((res.body as any).error.code).toBe('EMAIL_EXISTS');
  });
});
