import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, getRouteHandlers, invokeHandler } from '../helpers/routeHarness';

const mocks = vi.hoisted(() => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    mintApprovalRequest: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    mintApprovalActionToken: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  sendMintApprovalRequestEmail: vi.fn(),
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
  sendMintApprovalRequestEmail: mocks.sendMintApprovalRequestEmail,
}));

vi.mock('../../src/config', () => ({
  config: {
    backendUrl: 'https://backend.example.test',
    mintApproval: {
      requestRecipient: 'mint-approver@example.com',
      actionTokenTtlHours: 24,
    },
  },
}));

import mintRequestRoutes from '../../src/routes/mintRequests';

function getFinalHandler(path: string, method: 'get' | 'post') {
  const handlers = getRouteHandlers(mintRequestRoutes, method, path);
  return handlers[handlers.length - 1]!;
}

describe('mint request wallet ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (ops: Array<Promise<unknown>>) =>
      Promise.all(ops),
    );
    mocks.prisma.mintApprovalActionToken.create.mockResolvedValue({});
    mocks.sendMintApprovalRequestEmail.mockResolvedValue(undefined);
  });

  it('stores the submitting wallet address on new mint requests', async () => {
    const submittedAt = new Date('2026-03-18T18:00:00.000Z');
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    });
    mocks.prisma.mintApprovalRequest.findFirst.mockResolvedValue(null);
    mocks.prisma.mintApprovalRequest.create.mockResolvedValue({
      id: 'req-1',
      status: 'pending',
      reviewNotes: null,
      submittedAt,
    });

    const handler = getFinalHandler('/submit', 'post');
    const req = createMockReq({
      userId: 'user-1',
      body: {
        tokenName: 'Invoice Token',
        tokenSymbol: 'INV',
        mintAmount: '100',
        recipient: '0x1111111111111111111111111111111111111111',
        documentHash: '0x' + '11'.repeat(32),
        documentType: 'PDF',
        originalValue: '100',
        currency: 'USD',
        chainId: 1,
        requesterWalletAddress: '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD',
      },
      file: {
        originalname: 'invoice.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('invoice'),
      },
    });
    const res = createMockRes();

    await invokeHandler(handler, req, res);

    expect(mocks.prisma.mintApprovalRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          requesterWalletAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        }),
      }),
    );
    expect(mocks.prisma.mintApprovalRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fileName: 'invoice.pdf',
          fileMimeType: 'application/pdf',
          requesterWalletAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        }),
      }),
    );
    expect(mocks.sendMintApprovalRequestEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentFileName: 'invoice.pdf',
        attachmentMimeType: 'application/pdf',
      }),
    );
    expect(res.statusCode).toBe(201);
  });

  it('filters status checks by the submitting wallet address', async () => {
    mocks.prisma.mintApprovalRequest.findFirst.mockResolvedValue(null);

    const handler = getFinalHandler('/status', 'get');
    const req = createMockReq({
      userId: 'user-1',
      query: {
        tokenName: 'Invoice Token',
        tokenSymbol: 'INV',
        mintAmount: '100',
        recipient: '0x1111111111111111111111111111111111111111',
        documentHash: '0x' + '11'.repeat(32),
        chainId: '1',
        requesterWalletAddress: '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD',
      },
    });
    const res = createMockRes();

    await invokeHandler(handler, req, res);

    expect(mocks.prisma.mintApprovalRequest.findFirst).toHaveBeenCalledWith(
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
    mocks.prisma.mintApprovalRequest.findMany.mockResolvedValue([]);

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

    expect(mocks.prisma.mintApprovalRequest.findMany).toHaveBeenCalledWith(
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
