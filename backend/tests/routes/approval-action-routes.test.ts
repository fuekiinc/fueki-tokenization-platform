import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, getRouteHandlers, invokeHandler } from '../helpers/routeHarness';

const mocks = vi.hoisted(() => ({
  prisma: {
    adminActionToken: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    mintApprovalActionToken: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    mintApprovalRequest: {
      update: vi.fn(),
      delete: vi.fn(),
    },
    securityTokenApprovalActionToken: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    securityTokenApprovalRequest: {
      update: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  approveKYC: vi.fn(),
  rejectKYC: vi.fn(),
  sendMintApprovalRequestEmail: vi.fn(),
  sendSecurityTokenApprovalRequestEmail: vi.fn(),
}));

vi.mock('../../src/prisma', () => ({
  prisma: mocks.prisma,
}));

vi.mock('../../src/middleware/rbac', () => ({
  requireRole: () => (_req: Record<string, unknown>, _res: Record<string, unknown>, next: (err?: unknown) => void) => next(),
}));

vi.mock('../../src/services/kyc', () => ({
  approveKYC: mocks.approveKYC,
  rejectKYC: mocks.rejectKYC,
}));

vi.mock('../../src/services/encryption', () => ({
  decrypt: vi.fn((value: string) => value),
}));

vi.mock('../../src/middleware/auth', () => ({
  authenticate: (_req: Record<string, unknown>, _res: Record<string, unknown>, next: (err?: unknown) => void) => next(),
}));

vi.mock('../../src/middleware/upload', () => ({
  mintApprovalUpload: {
    single: () => (_req: Record<string, unknown>, _res: Record<string, unknown>, next: (err?: unknown) => void) => next(),
  },
}));

vi.mock('../../src/services/email', () => ({
  sendMintApprovalRequestEmail: mocks.sendMintApprovalRequestEmail,
  sendSecurityTokenApprovalRequestEmail: mocks.sendSecurityTokenApprovalRequestEmail,
}));

vi.mock('../../src/config', () => ({
  config: {
    backendUrl: 'https://backend.example.test',
    mintApproval: {
      requestRecipient: 'mint-approver@example.com',
      actionTokenTtlHours: 24,
    },
    securityTokenApproval: {
      requestRecipient: 'security-approver@example.com',
      actionTokenTtlHours: 24,
    },
  },
}));

import adminRoutes from '../../src/routes/admin';
import mintRequestRoutes from '../../src/routes/mintRequests';
import securityTokenRequestRoutes from '../../src/routes/securityTokenRequests';
import { hashToken } from '../../src/services/tokenHash';

const [adminActionHandler] = getRouteHandlers(adminRoutes, 'get', '/kyc/action/:token');
const [mintActionHandler] = getRouteHandlers(mintRequestRoutes, 'get', '/action/:token');
const [securityActionHandler] = getRouteHandlers(
  securityTokenRequestRoutes,
  'get',
  '/action/:token',
);

describe('approval action token lookups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (ops: Array<Promise<unknown>>) =>
      Promise.all(ops),
    );
    mocks.prisma.adminActionToken.update.mockResolvedValue({});
    mocks.prisma.adminActionToken.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.mintApprovalActionToken.update.mockResolvedValue({});
    mocks.prisma.mintApprovalActionToken.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.mintApprovalRequest.update.mockResolvedValue({});
    mocks.prisma.securityTokenApprovalActionToken.update.mockResolvedValue({});
    mocks.prisma.securityTokenApprovalActionToken.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.securityTokenApprovalRequest.update.mockResolvedValue({});
    mocks.approveKYC.mockResolvedValue(undefined);
    mocks.rejectKYC.mockResolvedValue(undefined);
  });

  it('accepts hashed-or-legacy admin action tokens', async () => {
    mocks.prisma.adminActionToken.findFirst.mockResolvedValue({
      id: 'admin-token-1',
      userId: 'user-1',
      action: 'approve',
      used: false,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const req = createMockReq({
      params: { token: 'admin-raw-token' },
    });
    const res = createMockRes();

    await invokeHandler(adminActionHandler, req, res);

    expect(res.statusCode).toBe(200);
    expect(mocks.prisma.adminActionToken.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { token: hashToken('admin-raw-token') },
          { token: 'admin-raw-token' },
        ],
      },
    });
    expect(mocks.approveKYC).toHaveBeenCalledWith('user-1', 'Approved via email');
  });

  it('accepts hashed-or-legacy mint approval action tokens', async () => {
    mocks.prisma.mintApprovalActionToken.findFirst.mockResolvedValue({
      id: 'mint-token-1',
      requestId: 'request-1',
      action: 'approve',
      used: false,
      expiresAt: new Date(Date.now() + 60_000),
      request: {
        status: 'pending',
      },
    });

    const req = createMockReq({
      params: { token: 'mint-raw-token' },
    });
    const res = createMockRes();

    await invokeHandler(mintActionHandler, req, res);

    expect(res.statusCode).toBe(200);
    expect(mocks.prisma.mintApprovalActionToken.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { token: hashToken('mint-raw-token') },
          { token: 'mint-raw-token' },
        ],
      },
      include: { request: true },
    });
    expect(mocks.prisma.mintApprovalRequest.update).toHaveBeenCalledWith({
      where: { id: 'request-1' },
      data: expect.objectContaining({
        status: 'approved',
        approvedBy: 'mint-approver@example.com',
      }),
    });
  });

  it('accepts hashed-or-legacy security token approval action tokens', async () => {
    mocks.prisma.securityTokenApprovalActionToken.findFirst.mockResolvedValue({
      id: 'security-token-1',
      requestId: 'request-2',
      action: 'approve',
      used: false,
      expiresAt: new Date(Date.now() + 60_000),
      request: {
        status: 'pending',
      },
    });

    const req = createMockReq({
      params: { token: 'security-raw-token' },
    });
    const res = createMockRes();

    await invokeHandler(securityActionHandler, req, res);

    expect(res.statusCode).toBe(200);
    expect(
      mocks.prisma.securityTokenApprovalActionToken.findFirst,
    ).toHaveBeenCalledWith({
      where: {
        OR: [
          { token: hashToken('security-raw-token') },
          { token: 'security-raw-token' },
        ],
      },
      include: { request: true },
    });
    expect(mocks.prisma.securityTokenApprovalRequest.update).toHaveBeenCalledWith({
      where: { id: 'request-2' },
      data: expect.objectContaining({
        status: 'approved',
        approvedBy: 'security-approver@example.com',
      }),
    });
  });
});
