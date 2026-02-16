import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { config } from '../config';

const prisma = new PrismaClient();
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

export async function createSession(userId: string): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = generateAccessToken(userId);
  const refreshToken = generateRefreshToken(userId);

  // Store refresh token in DB with 7 day expiry
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.session.create({
    data: {
      userId,
      refreshToken,
      expiresAt,
    },
  });

  return { accessToken, refreshToken };
}

export async function refreshSession(oldRefreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  // Verify the token
  const payload = verifyRefreshToken(oldRefreshToken);

  // Find and validate the session
  const session = await prisma.session.findUnique({
    where: { refreshToken: oldRefreshToken },
  });

  if (!session || session.expiresAt < new Date()) {
    throw new Error('Invalid or expired refresh token');
  }

  // Rotate: delete old session, create new one
  await prisma.session.delete({ where: { id: session.id } });

  return createSession(payload.userId);
}

export async function invalidateSession(refreshToken: string): Promise<void> {
  await prisma.session.deleteMany({
    where: { refreshToken },
  });
}

export async function invalidateAllSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({
    where: { userId },
  });
}
