import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, getRouteHandlers, invokeHandler } from '../helpers/routeHarness';

const mocks = vi.hoisted(() => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    securityTokenApprovalRequest: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    securityTokenApprovalActionToken: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  sendSecurityTokenApprovalRequestEmail: vi.fn(),
}));

vi.mock('../../src/prisma', () => ({
  prisma: mocks.prisma,
}));

vi.mock('../../src/middleware/auth', () => ({
  authenticate: (req: Record<string, unknown>, _res: Record<string, unknown>, next: (err?: unknown) => void) => {
    req.userId = 'user-1';
    next();
  },
}));

vi.mock('../../src/middleware/upload', () => ({
  mintApprovalUpload: {
    single: () => (_req: Record<string, unknown>, _res: Record<string, unknown>, next: (err?: unknown) => void) => next(),
  },
}));

vi.mock('../../src/services/email', () => ({
  sendSecurityTokenApprovalRequestEmail: mocks.sendSecurityTokenApprovalRequestEmail,
}));

vi.mock('../../src/config', () => ({
  config: {
    backendUrl: 'https://backend.example.test',
    securityTokenApproval: {
      requestRecipient: 'banker@example.com',
      actionTokenTtlHours: 24,
    },
  },
}));

import securityTokenRequestRoutes from '../../src/routes/securityTokenRequests';

function getFinalHandler(path: string, method: 'get' | 'post') {
  const handlers = getRouteHandlers(securityTokenRequestRoutes, method, path);
  return handlers[handlers.length - 1]!;
}

describe('security token request wallet ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (ops: Array<Promise<unknown>>) =>
      Promise.all(ops),
    );
    mocks.prisma.securityTokenApprovalActionToken.create.mockResolvedValue({});
    mocks.sendSecurityTokenApprovalRequestEmail.mockResolvedValue(undefined);
  });

  it('stores the submitting wallet address on new deployment requests', async () => {
    const submittedAt = new Date('2026-03-18T19:00:00.000Z');
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    });
    mocks.prisma.securityTokenApprovalRequest.findFirst.mockResolvedValue(null);
    mocks.prisma.securityTokenApprovalRequest.create.mockResolvedValue({
      id: 'req-1',
      status: 'pending',
      reviewNotes: null,
      submittedAt,
    });

    const handler = getFinalHandler('/submit', 'post');
    const req = createMockReq({
      userId: 'user-1',
      body: {
        tokenName: 'Security Token',
        tokenSymbol: 'STK',
        decimals: 18,
        totalSupply: '1000',
        maxTotalSupply: '2000',
        minTimelockAmount: '1',
        maxReleaseDelayDays: 365,
        originalValue: '100',
        documentHash: '0x' + '11'.repeat(32),
        documentType: 'Prospectus',
        hashSource: 'file',
        chainId: 1,
        requesterWalletAddress: '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD',
      },
      file: {
        originalname: 'prospectus.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('pdf'),
      },
    });
    const res = createMockRes();

    await invokeHandler(handler, req, res);

    expect(mocks.prisma.securityTokenApprovalRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          requesterWalletAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        }),
      }),
    );
    expect(mocks.prisma.securityTokenApprovalRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requesterWalletAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        }),
      }),
    );
    expect(res.statusCode).toBe(201);
  });

  it('filters status checks by the submitting wallet address', async () => {
    mocks.prisma.securityTokenApprovalRequest.findFirst.mockResolvedValue(null);

    const handler = getFinalHandler('/status', 'get');
    const req = createMockReq({
      userId: 'user-1',
      query: {
        tokenName: 'Security Token',
        tokenSymbol: 'STK',
        decimals: '18',
        totalSupply: '1000',
        maxTotalSupply: '2000',
        minTimelockAmount: '1',
        maxReleaseDelayDays: '365',
        originalValue: '100',
        documentHash: '0x' + '11'.repeat(32),
        documentType: 'Prospectus',
        chainId: '1',
        requesterWalletAddress: '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD',
      },
    });
    const res = createMockRes();

    await invokeHandler(handler, req, res);

    expect(mocks.prisma.securityTokenApprovalRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          requesterWalletAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        }),
      }),
    );
    expect(res.statusCode).toBe(200);
  });

  it('filters list views by the submitting wallet address', async () => {
    mocks.prisma.securityTokenApprovalRequest.findMany.mockResolvedValue([]);

    const handler = getFinalHandler('/list', 'get');
    const req = createMockReq({
      userId: 'user-1',
      query: {
        walletAddress: '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD',
        limit: '10',
      },
    });
    const res = createMockRes();

    await invokeHandler(handler, req, res);

    expect(mocks.prisma.securityTokenApprovalRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          requesterWalletAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        }),
      }),
    );
    expect(res.statusCode).toBe(200);
  });
});
