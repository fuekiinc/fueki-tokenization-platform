import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, getRouteHandlers, invokeHandler } from '../helpers/routeHarness';

const mocks = vi.hoisted(() => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    session: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../src/middleware/rbac', () => ({
  requireRole:
    (...roles: string[]) =>
    (req: Record<string, unknown>, _res: Record<string, unknown>, next: (err?: unknown) => void) => {
      req.userId = 'super-admin-id';
      req.userRole = roles.includes('super_admin') ? 'super_admin' : 'admin';
      next();
    },
}));

vi.mock('../../src/prisma', () => ({
  prisma: mocks.prisma,
}));

vi.mock('../../src/services/encryption', () => ({
  decrypt: vi.fn(),
}));

vi.mock('../../src/services/storage', () => ({
  readEncryptedDocument: vi.fn(),
}));

vi.mock('../../src/services/kyc', () => ({
  approveKYC: vi.fn(),
  rejectKYC: vi.fn(),
}));

vi.mock('../../src/services/tokenHash', () => ({
  buildTokenLookupCandidates: vi.fn((token: string) => [token]),
}));

import adminRoutes from '../../src/routes/admin';

const [, updateUserAccessHandler] = getRouteHandlers(
  adminRoutes,
  'put',
  '/users/:id/access',
);

describe('PUT /api/admin/users/:id/access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (operations: Array<Promise<unknown>>) =>
      Promise.all(operations),
    );
    mocks.prisma.session.deleteMany.mockResolvedValue({ count: 2 });
  });

  it('revokes platform access and clears active sessions', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'target-user-id',
      role: 'user',
      accessRevokedAt: null,
      accessRevokedBy: null,
    });
    mocks.prisma.user.update.mockResolvedValue({
      id: 'target-user-id',
      email: 'user@example.com',
      role: 'user',
      accessRevokedAt: new Date('2026-03-29T12:00:00.000Z'),
      accessRevocationReason: 'Compliance hold',
    });

    const req = createMockReq({
      params: { id: 'target-user-id' },
      body: { revoked: true, reason: 'Compliance hold' },
      userId: 'super-admin-id',
      userRole: 'admin',
    });
    const res = createMockRes();

    await invokeHandler(updateUserAccessHandler, req, res);

    expect(res.statusCode).toBe(200);
    expect(mocks.prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'target-user-id' },
    });
    expect((res.body as any).user.accessRevocationReason).toBe('Compliance hold');
    expect((res.body as any).user.accessRevokedAt).toBe('2026-03-29T12:00:00.000Z');
  });

  it('restores platform access without deleting sessions again', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'target-user-id',
      role: 'user',
      accessRevokedAt: new Date('2026-03-29T12:00:00.000Z'),
      accessRevokedBy: 'super-admin-id',
    });
    mocks.prisma.user.update.mockResolvedValue({
      id: 'target-user-id',
      email: 'user@example.com',
      role: 'user',
      accessRevokedAt: null,
      accessRevocationReason: null,
    });

    const req = createMockReq({
      params: { id: 'target-user-id' },
      body: { revoked: false },
      userId: 'super-admin-id',
      userRole: 'admin',
    });
    const res = createMockRes();

    await invokeHandler(updateUserAccessHandler, req, res);

    expect(res.statusCode).toBe(200);
    expect(mocks.prisma.session.deleteMany).not.toHaveBeenCalled();
    expect((res.body as any).user.accessRevokedAt).toBeNull();
  });

  it('prevents administrators from changing their own platform access', async () => {
    const req = createMockReq({
      params: { id: 'super-admin-id' },
      body: { revoked: true, reason: 'oops' },
      userId: 'super-admin-id',
      userRole: 'admin',
    });
    const res = createMockRes();

    await invokeHandler(updateUserAccessHandler, req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as any).error.code).toBe('SELF_ACCESS_CHANGE');
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('lets admins revoke regular user accounts', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'target-user-id',
      role: 'user',
      accessRevokedAt: null,
      accessRevokedBy: null,
    });
    mocks.prisma.user.update.mockResolvedValue({
      id: 'target-user-id',
      email: 'user@example.com',
      role: 'user',
      accessRevokedAt: new Date('2026-03-29T12:00:00.000Z'),
      accessRevocationReason: 'Risk review',
    });

    const req = createMockReq({
      params: { id: 'target-user-id' },
      body: { revoked: true, reason: 'Risk review' },
      userId: 'admin-id',
      userRole: 'admin',
    });
    const res = createMockRes();

    await invokeHandler(updateUserAccessHandler, req, res);

    expect(res.statusCode).toBe(200);
    expect(mocks.prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'target-user-id' },
    });
  });

  it('blocks admins from revoking another admin account', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'target-admin-id',
      role: 'admin',
      accessRevokedAt: null,
      accessRevokedBy: null,
    });

    const req = createMockReq({
      params: { id: 'target-admin-id' },
      body: { revoked: true, reason: 'oops' },
      userId: 'admin-id',
      userRole: 'admin',
    });
    const res = createMockRes();

    await invokeHandler(updateUserAccessHandler, req, res);

    expect(res.statusCode).toBe(403);
    expect((res.body as any).error.code).toBe('FORBIDDEN');
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
    expect(mocks.prisma.session.deleteMany).not.toHaveBeenCalled();
  });
});
