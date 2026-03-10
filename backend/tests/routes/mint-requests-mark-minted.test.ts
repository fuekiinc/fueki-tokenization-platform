import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MintRequestVerificationError } from '../../src/services/mintRequestVerification';

const mocks = vi.hoisted(() => ({
  prisma: {
    mintApprovalRequest: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
  verifyMintRequestOnChain: vi.fn(),
}));

vi.mock('../../src/prisma', () => ({
  prisma: mocks.prisma,
}));

vi.mock('../../src/middleware/auth', () => ({
  authenticate: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    req.userId = 'user-1';
    next();
  },
}));

vi.mock('../../src/services/mintRequestVerification', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/mintRequestVerification')>(
    '../../src/services/mintRequestVerification',
  );
  return {
    ...actual,
    verifyMintRequestOnChain: mocks.verifyMintRequestOnChain,
  };
});

import mintRequestRoutes from '../../src/routes/mintRequests';

const requestId = '11111111-1111-4111-8111-111111111111';
const txHash = `0x${'ab'.repeat(32)}`;
const recipient = '0x1111111111111111111111111111111111111111';
const assetAddress = '0x2222222222222222222222222222222222222222';
const walletAddress = '0x3333333333333333333333333333333333333333';
const reviewedAt = new Date('2026-03-09T18:00:00.000Z');

type MockResponse = {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  statusCode: number;
  body: unknown;
};

function createMockResponse(): MockResponse {
  const response: MockResponse = {
    statusCode: 200,
    body: null,
    status: vi.fn((code: number) => {
      response.statusCode = code;
      return response;
    }),
    json: vi.fn((body: unknown) => {
      response.body = body;
      return response;
    }),
  };

  return response;
}

function getMarkMintedHandler() {
  const layer = (mintRequestRoutes as express.Router & {
    stack: Array<{
      route?: {
        path?: string;
        methods?: Record<string, boolean>;
        stack: Array<{ handle: express.Handler }>;
      };
    }>;
  }).stack.find(
    (candidate) =>
      candidate.route?.path === '/:requestId/mark-minted' &&
      candidate.route.methods?.post,
  );

  if (!layer?.route) {
    throw new Error('mark-minted route handler not found');
  }

  return layer.route.stack[layer.route.stack.length - 1]?.handle as express.Handler;
}

function buildApprovedRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: requestId,
    status: 'approved',
    reviewNotes: 'Approved by banker.',
    reviewedAt,
    chainId: 17000,
    tokenName: 'Invoice Asset',
    tokenSymbol: 'INV',
    mintAmount: '10.5',
    recipient,
    documentHash: `0x${'11'.repeat(32)}`,
    documentType: 'invoice',
    originalValue: '100.25',
    user: {
      walletAddress,
    },
    ...overrides,
  };
}

describe('POST /api/mint-requests/:requestId/mark-minted', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks an approved request as minted only after on-chain verification succeeds', async () => {
    mocks.prisma.mintApprovalRequest.findFirst
      .mockResolvedValueOnce(buildApprovedRequest())
      .mockResolvedValueOnce(null);
    mocks.verifyMintRequestOnChain.mockResolvedValue({
      assetAddress,
      blockNumber: 4321,
    });
    mocks.prisma.mintApprovalRequest.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.mintApprovalRequest.findUnique.mockResolvedValue({
      id: requestId,
      status: 'minted',
      reviewNotes:
        `Approved by banker.\nMint verified on-chain. Tx: ${txHash} Asset: ${assetAddress} Block: 4321.`,
      reviewedAt,
    });

    const handler = getMarkMintedHandler();
    const response = createMockResponse();
    await handler(
      {
        params: { requestId },
        body: { txHash },
        userId: 'user-1',
      } as express.Request,
      response as unknown as express.Response,
      vi.fn(),
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({ alreadyMinted: false });
    expect(mocks.verifyMintRequestOnChain).toHaveBeenCalledWith({
      chainId: 17000,
      txHash,
      tokenName: 'Invoice Asset',
      tokenSymbol: 'INV',
      mintAmount: '10.5',
      recipient,
      documentHash: `0x${'11'.repeat(32)}`,
      documentType: 'invoice',
      originalValue: '100.25',
      expectedCreatorAddress: walletAddress,
    });
    expect(mocks.prisma.mintApprovalRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: requestId,
        status: 'approved',
      },
      data: {
        status: 'minted',
        reviewNotes:
          `Approved by banker.\nMint verified on-chain. Tx: ${txHash} Asset: ${assetAddress} Block: 4321.`,
      },
    });
  });

  it('returns an idempotent success when the same verified txHash is replayed', async () => {
    mocks.prisma.mintApprovalRequest.findFirst.mockResolvedValue(
      buildApprovedRequest({
        status: 'minted',
        reviewNotes:
          `Approved by banker.\nMint verified on-chain. Tx: ${txHash} Asset: ${assetAddress} Block: 4321.`,
      }),
    );

    const handler = getMarkMintedHandler();
    const response = createMockResponse();
    await handler(
      {
        params: { requestId },
        body: { txHash },
        userId: 'user-1',
      } as express.Request,
      response as unknown as express.Response,
      vi.fn(),
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({ alreadyMinted: true });
    expect(mocks.verifyMintRequestOnChain).not.toHaveBeenCalled();
    expect(mocks.prisma.mintApprovalRequest.updateMany).not.toHaveBeenCalled();
  });

  it('returns an idempotent success when a concurrent update already finalized the same txHash', async () => {
    mocks.prisma.mintApprovalRequest.findFirst
      .mockResolvedValueOnce(buildApprovedRequest())
      .mockResolvedValueOnce(null);
    mocks.verifyMintRequestOnChain.mockResolvedValue({
      assetAddress,
      blockNumber: 4321,
    });
    mocks.prisma.mintApprovalRequest.updateMany.mockResolvedValue({ count: 0 });
    mocks.prisma.mintApprovalRequest.findUnique.mockResolvedValue({
      id: requestId,
      status: 'minted',
      reviewNotes:
        `Approved by banker.\nMint verified on-chain. Tx: ${txHash} Asset: ${assetAddress} Block: 4321.`,
      reviewedAt,
    });

    const handler = getMarkMintedHandler();
    const response = createMockResponse();
    await handler(
      {
        params: { requestId },
        body: { txHash },
        userId: 'user-1',
      } as express.Request,
      response as unknown as express.Response,
      vi.fn(),
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({ alreadyMinted: true });
    expect(mocks.verifyMintRequestOnChain).toHaveBeenCalledTimes(1);
  });

  it('rejects replays when the request was already finalized with a different txHash', async () => {
    const otherTxHash = `0x${'cd'.repeat(32)}`;
    mocks.prisma.mintApprovalRequest.findFirst.mockResolvedValue(
      buildApprovedRequest({
        status: 'minted',
        reviewNotes:
          `Approved by banker.\nMint verified on-chain. Tx: ${otherTxHash} Asset: ${assetAddress} Block: 4321.`,
      }),
    );

    const handler = getMarkMintedHandler();
    const response = createMockResponse();
    await handler(
      {
        params: { requestId },
        body: { txHash },
        userId: 'user-1',
      } as express.Request,
      response as unknown as express.Response,
      vi.fn(),
    );

    expect(response.statusCode).toBe(409);
    expect(response.body).toMatchObject({
      error: {
        code: 'MINT_REQUEST_TX_MISMATCH',
      },
    });
    expect(mocks.verifyMintRequestOnChain).not.toHaveBeenCalled();
    expect(mocks.prisma.mintApprovalRequest.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an unverifiable txHash without mutating the request', async () => {
    mocks.prisma.mintApprovalRequest.findFirst
      .mockResolvedValueOnce(buildApprovedRequest())
      .mockResolvedValueOnce(null);
    mocks.verifyMintRequestOnChain.mockRejectedValue(
      new MintRequestVerificationError(
        'TX_FAILED',
        'Mint transaction did not succeed on-chain.',
      ),
    );

    const handler = getMarkMintedHandler();
    const response = createMockResponse();
    await handler(
      {
        params: { requestId },
        body: { txHash },
        userId: 'user-1',
      } as express.Request,
      response as unknown as express.Response,
      vi.fn(),
    );

    expect(response.statusCode).toBe(409);
    expect(response.body).toMatchObject({
      error: {
        code: 'MINT_REQUEST_TX_UNVERIFIED',
      },
    });
    expect(mocks.prisma.mintApprovalRequest.updateMany).not.toHaveBeenCalled();
  });

  it('rejects tx hashes that are already recorded on a different minted request', async () => {
    mocks.prisma.mintApprovalRequest.findFirst
      .mockResolvedValueOnce(buildApprovedRequest())
      .mockResolvedValueOnce({ id: '22222222-2222-4222-8222-222222222222' });

    const handler = getMarkMintedHandler();
    const response = createMockResponse();
    await handler(
      {
        params: { requestId },
        body: { txHash },
        userId: 'user-1',
      } as express.Request,
      response as unknown as express.Response,
      vi.fn(),
    );

    expect(response.statusCode).toBe(409);
    expect(response.body).toMatchObject({
      error: {
        code: 'MINT_REQUEST_TX_ALREADY_USED',
      },
    });
    expect(mocks.verifyMintRequestOnChain).not.toHaveBeenCalled();
    expect(mocks.prisma.mintApprovalRequest.updateMany).not.toHaveBeenCalled();
  });
});
