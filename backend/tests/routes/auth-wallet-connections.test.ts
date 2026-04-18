import { Wallet } from 'ethers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMockReq,
  createMockRes,
  getRouteHandlers,
  invokeHandler,
} from '../helpers/routeHarness';

const mocks = vi.hoisted(() => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    userWalletConnection: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  createSession: vi.fn(),
  refreshSession: vi.fn(),
  invalidateSession: vi.fn(),
  invalidateAllSessions: vi.fn(),
  verifyAccessToken: vi.fn(),
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
}));

import authRoutes from '../../src/routes/auth';

function getFinalHandler(path: string, method: 'post') {
  const handlers = getRouteHandlers(authRoutes, method, path);
  return handlers[handlers.length - 1]!;
}

describe('POST /api/auth/wallets/connect', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.prisma.userWalletConnection.findUnique.mockResolvedValue(null);
    mocks.prisma.userWalletConnection.upsert.mockResolvedValue({
      id: 'wallet-link-1',
    });
    mocks.prisma.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'wallet.user@example.com',
      role: 'user',
      accessRevokedAt: null,
      accessRevocationReason: null,
      walletAddress: '0x1111111111111111111111111111111111111111',
      kycStatus: 'approved',
      helpLevel: 'novice',
      demoUsed: false,
      demoActive: false,
      createdAt: new Date('2026-04-10T00:00:00.000Z'),
      updatedAt: new Date('2026-04-17T00:00:00.000Z'),
      kycData: null,
    });
    mocks.prisma.$transaction.mockImplementation(
      async (
        callback: (tx: {
          user: typeof mocks.prisma.user;
          userWalletConnection: typeof mocks.prisma.userWalletConnection;
        }) => Promise<unknown>,
      ) =>
        callback({
          user: mocks.prisma.user,
          userWalletConnection: mocks.prisma.userWalletConnection,
        }),
    );
  });

  it('returns a wallet verification challenge for a first-time wallet', async () => {
    const handler = getFinalHandler('/wallets/connect', 'post');
    const req = createMockReq({
      userId: 'user-1',
      body: {
        walletAddress: '0x1111111111111111111111111111111111111111',
      },
    });
    const res = createMockRes();

    await invokeHandler(handler, req, res);

    expect(res.statusCode).toBe(202);
    expect((res.body as any).verificationRequired).toBe(true);
    expect(typeof (res.body as any).challengeToken).toBe('string');
    expect((res.body as any).message).toContain(
      '0x1111111111111111111111111111111111111111',
    );
    expect(mocks.prisma.userWalletConnection.upsert).not.toHaveBeenCalled();
  });

  it('verifies a signed wallet challenge and records the wallet link', async () => {
    const wallet = Wallet.createRandom();
    const normalizedAddress = wallet.address.toLowerCase();
    mocks.prisma.user.update.mockResolvedValueOnce({
      id: 'user-1',
      email: 'wallet.user@example.com',
      role: 'user',
      accessRevokedAt: null,
      accessRevocationReason: null,
      walletAddress: normalizedAddress,
      kycStatus: 'approved',
      helpLevel: 'novice',
      demoUsed: false,
      demoActive: false,
      createdAt: new Date('2026-04-10T00:00:00.000Z'),
      updatedAt: new Date('2026-04-17T00:00:00.000Z'),
      kycData: null,
    });

    const handler = getFinalHandler('/wallets/connect', 'post');
    const challengeReq = createMockReq({
      userId: 'user-1',
      body: {
        walletAddress: normalizedAddress,
      },
    });
    const challengeRes = createMockRes();

    await invokeHandler(handler, challengeReq, challengeRes);

    const signature = await wallet.signMessage(
      (challengeRes.body as any).message as string,
    );

    const verifyReq = createMockReq({
      userId: 'user-1',
      body: {
        walletAddress: normalizedAddress,
        challengeToken: (challengeRes.body as any).challengeToken,
        signature,
      },
    });
    const verifyRes = createMockRes();

    await invokeHandler(handler, verifyReq, verifyRes);

    expect(verifyRes.statusCode).toBe(200);
    expect(mocks.prisma.userWalletConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_walletAddress: {
            userId: 'user-1',
            walletAddress: normalizedAddress,
          },
        },
      }),
    );
    expect((verifyRes.body as any).user.walletAddress).toBe(normalizedAddress);
  });

  it('reuses previously linked wallets without a fresh signature challenge', async () => {
    mocks.prisma.userWalletConnection.findUnique.mockResolvedValue({
      id: 'wallet-link-1',
    });

    const handler = getFinalHandler('/wallets/connect', 'post');
    const req = createMockReq({
      userId: 'user-1',
      body: {
        walletAddress: '0x1111111111111111111111111111111111111111',
      },
    });
    const res = createMockRes();

    await invokeHandler(handler, req, res);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).verificationRequired).toBe(false);
    expect(mocks.prisma.userWalletConnection.upsert).toHaveBeenCalledTimes(1);
  });

  it('rejects mismatched wallet signatures', async () => {
    const challengeWallet = Wallet.createRandom();
    const mismatchedWallet = Wallet.createRandom();
    const normalizedAddress = challengeWallet.address.toLowerCase();
    const handler = getFinalHandler('/wallets/connect', 'post');

    const challengeReq = createMockReq({
      userId: 'user-1',
      body: {
        walletAddress: normalizedAddress,
      },
    });
    const challengeRes = createMockRes();

    await invokeHandler(handler, challengeReq, challengeRes);

    const signature = await mismatchedWallet.signMessage(
      (challengeRes.body as any).message as string,
    );

    const verifyReq = createMockReq({
      userId: 'user-1',
      body: {
        walletAddress: normalizedAddress,
        challengeToken: (challengeRes.body as any).challengeToken,
        signature,
      },
    });
    const verifyRes = createMockRes();

    await invokeHandler(handler, verifyReq, verifyRes);

    expect(verifyRes.statusCode).toBe(401);
    expect((verifyRes.body as any).error.code).toBe('WALLET_VERIFICATION_FAILED');
    expect(mocks.prisma.userWalletConnection.upsert).not.toHaveBeenCalled();
  });
});
