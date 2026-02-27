import { PrismaClient } from '@prisma/client';

/**
 * Global PrismaClient singleton.
 *
 * Previously, every route/service/middleware file instantiated its own
 * `new PrismaClient()`.  Each instance opens a separate connection pool
 * (default: 10 connections), so 9 instances = ~90 connections, which
 * quickly exhausts database connection limits on Cloud Run and causes
 * "rate exceeded" / "too many connections" errors.
 *
 * Import this single instance everywhere instead:
 *
 *   import { prisma } from '../prisma';
 */

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

// Prevent creating multiple instances during hot-reload in development.
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}
