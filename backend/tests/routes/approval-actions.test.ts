import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
    user: {
      findUnique: vi.fn(),
    },
    adminActionToken: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    mintApprovalActionToken: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    mintApprovalRequest: {
      update: vi.fn(),
    },
    securityTokenApprovalActionToken: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    securityTokenApprovalRequest: {
      update: vi.fn(),
    },
  },
  approveKYC: vi.fn(),
  rejectKYC: vi.fn(),
  requireRole: vi.fn(() => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next()),
  decrypt: vi.fn((value: string) => value),
  authenticate: vi.fn((_req: express.Request, _res: express.Response, next: express.NextFunction) => next()),
  mintApprovalUpload: {
    single: vi.fn(() => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next()),
  },
  sendMintApprovalRequestEmail: vi.fn(),
  sendSecurityTokenApprovalRequestEmail: vi.fn(),
}));

vi.mock('../../src/prisma', () => ({
  prisma: mocks.prisma,
}));

vi.mock('../../src/services/kyc', () => ({
  approveKYC: mocks.approveKYC,
  rejectKYC: mocks.rejectKYC,
}));

vi.mock('../../src/middleware/rbac', () => ({
  requireRole: mocks.requireRole,
}));

vi.mock('../../src/services/encryption', () => ({
  decrypt: mocks.decrypt,
}));

vi.mock('../../src/middleware/auth', () => ({
  authenticate: mocks.authenticate,
}));

vi.mock('../../src/middleware/upload', () => ({
  mintApprovalUpload: mocks.mintApprovalUpload,
}));

vi.mock('../../src/services/email', () => ({
  sendMintApprovalRequestEmail: mocks.sendMintApprovalRequestEmail,
  sendSecurityTokenApprovalRequestEmail: mocks.sendSecurityTokenApprovalRequestEmail,
}));

vi.mock('multer', () => {
  class MockMulterError extends Error {}

  const multer = Object.assign(
    () => ({
      single: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
        next(),
    }),
    { MulterError: MockMulterError },
  );

  return { default: multer };
});

vi.mock('express-rate-limit', () => ({
  default:
    () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

import adminRoutes from '../../src/routes/admin';
import mintRequestRoutes from '../../src/routes/mintRequests';
import securityTokenRequestRoutes from '../../src/routes/securityTokenRequests';

async function dispatch(
  router: express.Router,
  {
    method,
    url,
    body = {},
  }: {
    method: string;
    url: string;
    body?: Record<string, string>;
  },
): Promise<{ status: number; text: string; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    let statusCode = 200;
    let finished = false;

    const req = {
      method,
      url,
      originalUrl: url,
      path: url,
      body,
      params: {},
      query: {},
      headers: {},
      get(name: string) {
        return this.headers[name.toLowerCase()];
      },
      header(name: string) {
        return this.get(name);
      },
    };

    const res = {
      locals: {},
      status(code: number) {
        statusCode = code;
        return this;
      },
      set(values: Record<string, string>) {
        for (const [key, value] of Object.entries(values)) {
          headers[key.toLowerCase()] = value;
        }
        return this;
      },
      type(value: string) {
        headers['content-type'] = value;
        return this;
      },
      send(payload: unknown) {
        if (!finished) {
          finished = true;
          resolve({
            status: statusCode,
            text: typeof payload === 'string' ? payload : JSON.stringify(payload),
            headers,
          });
        }
        return this;
      },
    };

    router.handle(req as never, res as never, (err?: unknown) => {
      if (finished) {
        return;
      }
      if (err) {
        reject(err);
        return;
      }
      resolve({
        status: statusCode,
        text: '',
        headers,
      });
    });
  });
}

function extractHiddenValue(html: string, name: string): string {
  const match = html.match(new RegExp(`name="${name}" value="([^"]+)"`));
  if (!match) {
    throw new Error(`Hidden input ${name} not found in response HTML`);
  }
  return match[1];
}

describe('scanner-safe approval links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );
    mocks.prisma.adminActionToken.updateMany.mockResolvedValue({ count: 2 });
    mocks.prisma.mintApprovalActionToken.updateMany.mockResolvedValue({ count: 2 });
    mocks.prisma.securityTokenApprovalActionToken.updateMany.mockResolvedValue({ count: 2 });
    mocks.prisma.mintApprovalRequest.update.mockResolvedValue({ id: 'mint-request-1' });
    mocks.prisma.securityTokenApprovalRequest.update.mockResolvedValue({
      id: 'security-request-1',
    });
    mocks.approveKYC.mockResolvedValue(undefined);
    mocks.rejectKYC.mockResolvedValue(undefined);
  });

  it('serves a read-only KYC confirmation page and only mutates on signed POST', async () => {
    const actionToken = {
      id: 'kyc-token-1',
      token: 'kyc-token',
      userId: 'user-1',
      action: 'approve',
      used: false,
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    };
    const user = {
      id: 'user-1',
      email: 'alice@example.com',
      kycStatus: 'pending',
    };

    mocks.prisma.adminActionToken.findFirst
      .mockResolvedValueOnce(actionToken)
      .mockResolvedValueOnce(actionToken);
    mocks.prisma.user.findUnique
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(user);

    const getResponse = await dispatch(adminRoutes, {
      method: 'GET',
      url: '/kyc/action/kyc-token',
    });

    expect(getResponse.status).toBe(200);
    expect(getResponse.text).toContain('Confirm KYC Approval');
    expect(mocks.approveKYC).not.toHaveBeenCalled();
    expect(mocks.prisma.adminActionToken.updateMany).not.toHaveBeenCalled();

    const payload = extractHiddenValue(getResponse.text, 'payload');
    const signature = extractHiddenValue(getResponse.text, 'signature');

    const postResponse = await dispatch(adminRoutes, {
      method: 'POST',
      url: '/kyc/action/kyc-token',
      body: {
        payload,
        signature,
        confirm: 'approve',
      },
    });

    expect(postResponse.status).toBe(200);
    expect(postResponse.text).toContain('KYC Approved');
    expect(mocks.approveKYC).toHaveBeenCalledWith('user-1', 'Approved via confirmation page.');
    expect(mocks.prisma.adminActionToken.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        used: false,
      },
      data: { used: true },
    });
  });

  it('rejects tampered KYC confirmations without mutating state', async () => {
    const actionToken = {
      id: 'kyc-token-1',
      token: 'kyc-token',
      userId: 'user-1',
      action: 'reject',
      used: false,
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    };
    const user = {
      id: 'user-1',
      email: 'alice@example.com',
      kycStatus: 'pending',
    };

    mocks.prisma.adminActionToken.findFirst
      .mockResolvedValueOnce(actionToken)
      .mockResolvedValueOnce(actionToken);
    mocks.prisma.user.findUnique.mockResolvedValueOnce(user);

    const getResponse = await dispatch(adminRoutes, {
      method: 'GET',
      url: '/kyc/action/kyc-token',
    });

    const payload = extractHiddenValue(getResponse.text, 'payload');
    const originalSignature = extractHiddenValue(getResponse.text, 'signature');
    const signature = `${originalSignature.slice(0, -1)}${
      originalSignature.endsWith('0') ? '1' : '0'
    }`;

    const postResponse = await dispatch(adminRoutes, {
      method: 'POST',
      url: '/kyc/action/kyc-token',
      body: {
        payload,
        signature,
        confirm: 'reject',
      },
    });

    expect(postResponse.status).toBe(400);
    expect(postResponse.text).toContain('Invalid Confirmation');
    expect(mocks.rejectKYC).not.toHaveBeenCalled();
    expect(mocks.prisma.adminActionToken.updateMany).not.toHaveBeenCalled();
  });

  it('applies mint approval directly on GET request (one-click from email)', async () => {
    const actionToken = {
      id: 'mint-token-1',
      token: 'mint-token',
      requestId: 'mint-request-1',
      action: 'approve',
      used: false,
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      request: {
        id: 'mint-request-1',
        requesterEmail: 'maker@example.com',
        tokenName: 'Asset Token',
        tokenSymbol: 'AST',
        chainId: 11155111,
        mintAmount: '1000',
        currency: 'USD',
        status: 'pending',
      },
    };

    mocks.prisma.mintApprovalActionToken.findFirst
      .mockResolvedValueOnce(actionToken);

    const getResponse = await dispatch(mintRequestRoutes, {
      method: 'GET',
      url: '/action/mint-token',
    });

    expect(getResponse.status).toBe(200);
    expect(getResponse.text).toContain('Mint Request Approved');
    expect(mocks.prisma.mintApprovalRequest.update).toHaveBeenCalledWith({
      where: { id: 'mint-request-1' },
      data: {
        status: 'approved',
        reviewedAt: expect.any(Date),
        reviewNotes: 'Approved via banker email link.',
        approvedBy: 'mark@fueki-tech.com',
      },
    });
    expect(mocks.prisma.mintApprovalActionToken.updateMany).toHaveBeenCalledWith({
      where: {
        requestId: 'mint-request-1',
        used: false,
      },
      data: { used: true },
    });
  });

  it('applies security token rejection directly on GET request (one-click from email)', async () => {
    const actionToken = {
      id: 'security-token-1',
      token: 'security-token',
      requestId: 'security-request-1',
      action: 'reject',
      used: false,
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      request: {
        id: 'security-request-1',
        requesterEmail: 'issuer@example.com',
        tokenName: 'Security Token',
        tokenSymbol: 'SEC',
        chainId: 421614,
        totalSupply: '500000',
        status: 'pending',
      },
    };

    mocks.prisma.securityTokenApprovalActionToken.findFirst
      .mockResolvedValueOnce(actionToken);

    const getResponse = await dispatch(securityTokenRequestRoutes, {
      method: 'GET',
      url: '/action/security-token',
    });

    expect(getResponse.status).toBe(200);
    expect(getResponse.text).toContain('Deployment Request Rejected');
    expect(mocks.prisma.securityTokenApprovalRequest.update).toHaveBeenCalledWith({
      where: { id: 'security-request-1' },
      data: {
        status: 'rejected',
        reviewedAt: expect.any(Date),
        reviewNotes: 'Rejected via banker email link.',
        approvedBy: 'mark@fueki-tech.com',
      },
    });
    expect(mocks.prisma.securityTokenApprovalActionToken.updateMany).toHaveBeenCalledWith({
      where: {
        requestId: 'security-request-1',
        used: false,
      },
      data: { used: true },
    });
  });
});
