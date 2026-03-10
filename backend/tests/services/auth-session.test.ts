import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
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

  it('looks refresh sessions up by digest first while still accepting legacy raw rows', async () => {
    const oldRefreshToken = (await createSession('user-456')).refreshToken;
    const futureExpiry = new Date(Date.now() + 60_000);

    mocks.prisma.session.findFirst.mockResolvedValue({
      id: 'session-1',
      userId: 'user-456',
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
});
