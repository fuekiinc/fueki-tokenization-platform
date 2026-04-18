import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { ethers } from 'ethers';
import { config } from '../config';
import { prisma } from '../prisma';

const WALLET_CHALLENGE_PURPOSE = 'wallet-link';
const WALLET_CHALLENGE_TTL_SECONDS = 5 * 60;

interface WalletChallengePayload {
  purpose: typeof WALLET_CHALLENGE_PURPOSE;
  userId: string;
  walletAddress: string;
  nonce: string;
  issuedAt: string;
  exp?: number;
  iat?: number;
}

export class WalletChallengeError extends Error {
  constructor(message = 'Wallet verification challenge is invalid or expired.') {
    super(message);
    this.name = 'WalletChallengeError';
  }
}

export class WalletVerificationError extends Error {
  constructor(message = 'Wallet signature could not be verified.') {
    super(message);
    this.name = 'WalletVerificationError';
  }
}

export function normalizeWalletAddress(value: string): string {
  const trimmed = value.trim();
  if (!ethers.isAddress(trimmed)) {
    throw new WalletVerificationError('Wallet address is invalid.');
  }
  return trimmed.toLowerCase();
}

function buildWalletChallengeMessage(payload: {
  issuedAt: string;
  nonce: string;
  userId: string;
  walletAddress: string;
}): string {
  return [
    'Fueki wallet verification',
    '',
    'Sign this message to link your wallet to your authenticated Fueki account.',
    '',
    `User ID: ${payload.userId}`,
    `Wallet: ${payload.walletAddress}`,
    `Nonce: ${payload.nonce}`,
    `Issued At: ${payload.issuedAt}`,
    '',
    'No blockchain transaction or gas fee is required.',
  ].join('\n');
}

export function createWalletChallenge(
  userId: string,
  walletAddress: string,
): { challengeToken: string; message: string } {
  const normalizedWalletAddress = normalizeWalletAddress(walletAddress);
  const issuedAt = new Date().toISOString();
  const nonce = crypto.randomUUID();

  const challengeToken = jwt.sign(
    {
      purpose: WALLET_CHALLENGE_PURPOSE,
      userId,
      walletAddress: normalizedWalletAddress,
      nonce,
      issuedAt,
    } satisfies WalletChallengePayload,
    config.jwt.accessSecret,
    { expiresIn: WALLET_CHALLENGE_TTL_SECONDS },
  );

  return {
    challengeToken,
    message: buildWalletChallengeMessage({
      issuedAt,
      nonce,
      userId,
      walletAddress: normalizedWalletAddress,
    }),
  };
}

export function verifyWalletChallenge(input: {
  challengeToken: string;
  signature: string;
  userId: string;
  walletAddress: string;
}): void {
  const normalizedWalletAddress = normalizeWalletAddress(input.walletAddress);

  let payload: WalletChallengePayload;
  try {
    payload = jwt.verify(
      input.challengeToken,
      config.jwt.accessSecret,
    ) as WalletChallengePayload;
  } catch {
    throw new WalletChallengeError();
  }

  if (
    payload.purpose !== WALLET_CHALLENGE_PURPOSE
    || payload.userId !== input.userId
    || payload.walletAddress !== normalizedWalletAddress
    || typeof payload.nonce !== 'string'
    || typeof payload.issuedAt !== 'string'
  ) {
    throw new WalletChallengeError();
  }

  let recoveredAddress: string;
  try {
    recoveredAddress = ethers.verifyMessage(
      buildWalletChallengeMessage({
        issuedAt: payload.issuedAt,
        nonce: payload.nonce,
        userId: payload.userId,
        walletAddress: payload.walletAddress,
      }),
      input.signature,
    ).toLowerCase();
  } catch {
    throw new WalletVerificationError();
  }

  if (recoveredAddress !== normalizedWalletAddress) {
    throw new WalletVerificationError(
      'Wallet signature does not match the connected address.',
    );
  }
}

export async function hasLinkedWallet(
  userId: string,
  walletAddress: string,
): Promise<boolean> {
  const normalizedWalletAddress = normalizeWalletAddress(walletAddress);

  const connection = await prisma.userWalletConnection.findUnique({
    where: {
      userId_walletAddress: {
        userId,
        walletAddress: normalizedWalletAddress,
      },
    },
    select: { id: true },
  });

  return Boolean(connection);
}

export async function linkWalletToUser(userId: string, walletAddress: string) {
  const normalizedWalletAddress = normalizeWalletAddress(walletAddress);
  const connectedAt = new Date();

  return prisma.$transaction(async (tx) => {
    await tx.userWalletConnection.upsert({
      where: {
        userId_walletAddress: {
          userId,
          walletAddress: normalizedWalletAddress,
        },
      },
      update: {
        lastConnectedAt: connectedAt,
        connectionCount: {
          increment: 1,
        },
      },
      create: {
        userId,
        walletAddress: normalizedWalletAddress,
        firstConnectedAt: connectedAt,
        lastConnectedAt: connectedAt,
      },
    });

    return tx.user.update({
      where: { id: userId },
      data: {
        walletAddress: normalizedWalletAddress,
      },
      include: {
        kycData: {
          select: {
            subscriptionPlan: true,
            encryptedFirstName: true,
          },
        },
      },
    });
  });
}

export function toAdminWalletConnection(
  connection: {
    connectionCount: number;
    firstConnectedAt: Date;
    lastConnectedAt: Date;
    walletAddress: string;
  },
  currentWalletAddress: string | null,
) {
  const normalizedCurrentWalletAddress = currentWalletAddress
    ? currentWalletAddress.toLowerCase()
    : null;

  return {
    walletAddress: connection.walletAddress,
    firstConnectedAt: connection.firstConnectedAt.toISOString(),
    lastConnectedAt: connection.lastConnectedAt.toISOString(),
    connectionCount: connection.connectionCount,
    isCurrent: normalizedCurrentWalletAddress === connection.walletAddress.toLowerCase(),
  };
}
