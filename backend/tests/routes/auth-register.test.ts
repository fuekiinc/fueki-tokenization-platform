import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRoutes);
  return app;
}

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
    const app = createApp();
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'NEW.USER@example.com',
        password: 'StrongPass1!',
        helpLevel: 'expert',
      });

    expect(response.status).toBe(201);
    expect(response.body.tokens.accessToken).toBe('access-token');
    expect(response.headers['set-cookie']?.[0]).toContain('fueki_refresh_token=');
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

    const app = createApp();
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'existing.user@example.com',
        password: 'StrongPass1!',
      });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_EXISTS');
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid payload', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'invalid-email',
        password: 'weak',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
  });
});
