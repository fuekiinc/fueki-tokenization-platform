import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../prisma';
import { buildTokenLookupCandidates, hashToken } from './tokenHash';
const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateAccessToken(userId: string): string {
  return jwt.sign({ userId }, config.jwt.accessSecret, { expiresIn: config.jwt.accessExpiresIn });
}

export function generateRefreshToken(userId: string): string {
  return jwt.sign({ userId }, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiresIn });
}

export function verifyAccessToken(token: string): { userId: string } {
  return jwt.verify(token, config.jwt.accessSecret) as { userId: string };
}

export function verifyRefreshToken(token: string): { userId: string } {
  return jwt.verify(token, config.jwt.refreshSecret) as { userId: string };
}

interface SessionCreateOptions {
  rememberMe?: boolean;
}

interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  rememberMe: boolean;
}

export async function createSession(
  userId: string,
  options: SessionCreateOptions = {},
): Promise<SessionTokens> {
  const rememberMe = options.rememberMe === true;
  const accessToken = generateAccessToken(userId);
  const refreshToken = generateRefreshToken(userId);

  // Session TTL must match the refresh token JWT lifetime so the DB session
  // doesn't expire before the token does — a mismatch causes unexpected
  // sign-outs when the still-valid JWT hits a deleted DB row.
  const sessionTtlSeconds = config.jwt.refreshExpiresIn;
  const expiresAt = new Date();
  expiresAt.setTime(expiresAt.getTime() + sessionTtlSeconds * 1000);

  await prisma.session.create({
    data: {
      userId,
      refreshToken: hashToken(refreshToken),
      rememberMe,
      expiresAt,
    },
  });

  return { accessToken, refreshToken, rememberMe };
}

export async function refreshSession(oldRefreshToken: string): Promise<SessionTokens> {
  // Verify the token
  const payload = verifyRefreshToken(oldRefreshToken);
  const refreshTokenCandidates = buildTokenLookupCandidates(oldRefreshToken);

  // Find and validate the session
  const session = await prisma.session.findFirst({
    where: {
      OR: refreshTokenCandidates.map((candidate) => ({
        refreshToken: candidate,
      })),
    },
  });

  if (!session || session.expiresAt < new Date()) {
    throw new Error('Invalid or expired refresh token');
  }

  // Rotate: delete old session, create new one
  await prisma.session.delete({ where: { id: session.id } });

  return createSession(payload.userId, { rememberMe: session.rememberMe });
}

export async function invalidateSession(refreshToken: string): Promise<void> {
  const refreshTokenCandidates = buildTokenLookupCandidates(refreshToken);
  await prisma.session.deleteMany({
    where: {
      OR: refreshTokenCandidates.map((candidate) => ({
        refreshToken: candidate,
      })),
    },
  });
}

export async function invalidateAllSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({
    where: { userId },
  });
}
