import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../services/auth';
import { prisma } from '../prisma';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: { message: 'Authentication required', code: 'AUTH_REQUIRED' } });
    return;
  }

  const token = authHeader.substring(7);

  let payload: { userId: string };
  try {
    payload = verifyAccessToken(token);
  } catch {
    res.status(401).json({ error: { message: 'Invalid or expired token', code: 'INVALID_TOKEN' } });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        accessRevokedAt: true,
      },
    });

    if (!user) {
      res.status(401).json({ error: { message: 'Authentication required', code: 'AUTH_REQUIRED' } });
      return;
    }

    if (user.accessRevokedAt) {
      res.status(401).json({
        error: {
          message: 'Your access to the platform has been revoked by an administrator.',
          code: 'ACCOUNT_ACCESS_REVOKED',
        },
      });
      return;
    }

    req.userId = payload.userId;
    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);
    res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
  }
}

/**
 * Optional auth middleware for mixed public/private endpoints.
 *
 * - If a valid Bearer token exists, req.userId is populated.
 * - If the token is missing or invalid, the request still proceeds.
 */
export async function authenticateOptional(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.substring(7);

  let payload: { userId: string };
  try {
    payload = verifyAccessToken(token);
  } catch {
    next();
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        accessRevokedAt: true,
      },
    });
    if (user && !user.accessRevokedAt) {
      req.userId = payload.userId;
    }
  } catch {
    // Ignore lookup failures for optional-auth endpoints.
  }

  next();
}
