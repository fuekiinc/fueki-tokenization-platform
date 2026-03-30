import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes } from '../helpers/routeHarness';

const mocks = vi.hoisted(() => ({
  verifyAccessToken: vi.fn(),
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../../src/services/auth', () => ({
  verifyAccessToken: mocks.verifyAccessToken,
}));

vi.mock('../../src/prisma', () => ({
  prisma: mocks.prisma,
}));

import { authenticate } from '../../src/middleware/auth';

describe('authenticate middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects revoked users even when the access token verifies', async () => {
    mocks.verifyAccessToken.mockReturnValue({ userId: 'user-1' });
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      accessRevokedAt: new Date('2026-03-29T00:00:00.000Z'),
    });

    const req = createMockReq({
      headers: { authorization: 'Bearer valid-token' },
    });
    const res = createMockRes();
    const next = vi.fn();

    await authenticate(req as never, res as never, next);

    expect(res.statusCode).toBe(401);
    expect((res.body as any).error.code).toBe('ACCOUNT_ACCESS_REVOKED');
    expect(next).not.toHaveBeenCalled();
  });
});
