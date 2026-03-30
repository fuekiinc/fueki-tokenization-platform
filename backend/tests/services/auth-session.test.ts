import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    session: {
      create: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('../../src/prisma', () => ({
  prisma: mocks.prisma,
}));

import { createSession, invalidateSession, refreshSession } from '../../src/services/auth';
import { hashToken } from '../../src/services/tokenHash';

describe('auth session token storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.session.create.mockResolvedValue({
      id: 'session-created',
    });
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-123',
      accessRevokedAt: null,
    });
    mocks.prisma.session.delete.mockResolvedValue({
      id: 'session-deleted',
    });
    mocks.prisma.session.deleteMany.mockResolvedValue({ count: 1 });
  });

  it('stores the refresh token digest while returning the raw token to the client', async () => {
    const result = await createSession('user-123', { rememberMe: true });

    expect(result.refreshToken).toEqual(expect.any(String));
    expect(mocks.prisma.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-123',
        refreshToken: hashToken(result.refreshToken),
        rememberMe: true,
        expiresAt: expect.any(Date),
      }),
    });
  });

  it('rejects session creation when platform access has been revoked', async () => {
    mocks.prisma.user.findUnique.mockResolvedValueOnce({
      id: 'user-123',
      accessRevokedAt: new Date('2026-03-29T00:00:00.000Z'),
    });

    await expect(createSession('user-123')).rejects.toThrow(
      'Your access to the platform has been revoked by an administrator.',
    );
    expect(mocks.prisma.session.create).not.toHaveBeenCalled();
  });

  it('looks refresh sessions up by digest first while still accepting legacy raw rows', async () => {
    const oldRefreshToken = (await createSession('user-456')).refreshToken;
    const futureExpiry = new Date(Date.now() + 60_000);

    mocks.prisma.session.findFirst.mockResolvedValue({
      id: 'session-1',
      userId: 'user-456',
      user: {
        id: 'user-456',
        accessRevokedAt: null,
      },
      rememberMe: false,
      expiresAt: futureExpiry,
    });

    const refreshed = await refreshSession(oldRefreshToken);

    expect(mocks.prisma.session.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { refreshToken: hashToken(oldRefreshToken) },
          { refreshToken: oldRefreshToken },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            accessRevokedAt: true,
          },
        },
      },
    });
    expect(mocks.prisma.session.delete).toHaveBeenCalledWith({
      where: { id: 'session-1' },
    });
    expect(mocks.prisma.session.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        userId: 'user-456',
        refreshToken: hashToken(refreshed.refreshToken),
        rememberMe: false,
        expiresAt: expect.any(Date),
      }),
    });
  });

  it('invalidates sessions using both digest and legacy raw token candidates', async () => {
    await invalidateSession('legacy-refresh-token');

    expect(mocks.prisma.session.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { refreshToken: hashToken('legacy-refresh-token') },
          { refreshToken: 'legacy-refresh-token' },
        ],
      },
    });
  });

  it('invalidates all sessions and rejects refresh when the user has been revoked', async () => {
    const oldRefreshToken = (await createSession('user-789')).refreshToken;
    const futureExpiry = new Date(Date.now() + 60_000);

    mocks.prisma.session.findFirst.mockResolvedValueOnce({
      id: 'session-2',
      userId: 'user-789',
      user: {
        id: 'user-789',
        accessRevokedAt: new Date('2026-03-29T00:00:00.000Z'),
      },
      rememberMe: true,
      expiresAt: futureExpiry,
    });

    await expect(refreshSession(oldRefreshToken)).rejects.toThrow(
      'Your access to the platform has been revoked by an administrator.',
    );
    expect(mocks.prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-789' },
    });
    expect(mocks.prisma.session.delete).not.toHaveBeenCalledWith({
      where: { id: 'session-2' },
    });
  });
});
