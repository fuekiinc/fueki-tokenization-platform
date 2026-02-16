import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/auth';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: { message: 'Authentication required', code: 'AUTH_REQUIRED' } });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: { message: 'Invalid or expired token', code: 'INVALID_TOKEN' } });
  }
}
