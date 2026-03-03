import type { NextFunction, Request, Response } from 'express';
import { authenticate } from './auth';
import { prisma } from '../prisma';

/**
 * Express middleware factory that enforces role-based access control.
 * Requires authentication first, then checks that the authenticated user
 * has one of the specified roles.
 *
 * @param roles - One or more role strings the user must have (e.g. 'admin', 'super_admin')
 * @returns Express middleware chain (authenticate + role check)
 *
 * @example
 * router.get('/admin/stats', requireRole('admin', 'super_admin'), handler);
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // First run the existing authenticate middleware
    authenticate(req, res, async () => {
      try {
        const user = await prisma.user.findUnique({
          where: { id: req.userId },
          select: { id: true, role: true },
        });

        if (!user) {
          res.status(401).json({
            error: { message: 'User not found', code: 'AUTH_REQUIRED' },
          });
          return;
        }

        if (!roles.includes(user.role)) {
          res.status(403).json({
            error: { message: 'Insufficient permissions', code: 'FORBIDDEN' },
          });
          return;
        }

        // Attach role to request for downstream handlers
        (req as any).userRole = user.role;
        next();
      } catch (err) {
        console.error('RBAC middleware error:', err);
        res.status(500).json({
          error: { message: 'Internal server error', code: 'INTERNAL_ERROR' },
        });
      }
    });
  };
}
