import { Response, Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import {
  AccountAccessRevokedError,
  createSession,
  hashPassword,
  invalidateAllSessions,
  invalidateSession,
  refreshSession,
  verifyPassword,
} from '../services/auth';
import { authenticate } from '../middleware/auth';
import { config } from '../config';
import { sendPasswordResetEmail } from '../services/email';
import { decrypt } from '../services/encryption';
import { prisma } from '../prisma';
import { buildTokenLookupCandidates, hashToken } from '../services/tokenHash';

const router = Router();

// ---------------------------------------------------------------------------
// Cookie configuration for refresh tokens
// ---------------------------------------------------------------------------

const REFRESH_COOKIE_NAME = 'fueki_refresh_token';

function setRefreshCookie(
  res: Response,
  refreshToken: string,
  rememberMe = true,
): void {
  const secureCookies =
    config.nodeEnv === 'production' || config.auth.refreshCookieSameSite === 'none';

  const cookieOptions: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'strict' | 'lax' | 'none';
    path: string;
    maxAge?: number;
  } = {
    httpOnly: true,
    secure: secureCookies,
    sameSite: config.auth.refreshCookieSameSite,
    path: '/api/auth',
  };

  if (rememberMe) {
    cookieOptions.maxAge = config.jwt.refreshExpiresIn * 1000;
  }

  (res as any).cookie(REFRESH_COOKIE_NAME, refreshToken, cookieOptions);
}

function clearRefreshCookie(res: Response): void {
  const secureCookies =
    config.nodeEnv === 'production' || config.auth.refreshCookieSameSite === 'none';

  (res as any).cookie(REFRESH_COOKIE_NAME, '', {
    httpOnly: true,
    secure: secureCookies,
    sameSite: config.auth.refreshCookieSameSite,
    path: '/api/auth',
    maxAge: 0,
  });
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const helpLevelSchema = z.enum(['novice', 'intermediate', 'expert']);

const registerSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one digit')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  helpLevel: helpLevelSchema.optional().default('novice'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
});

const updatePreferencesSchema = z.object({
  helpLevel: helpLevelSchema,
});

function mapUserResponse(
  user: {
    id: string;
    email: string;
    role: string;
    accessRevokedAt?: Date | null;
    accessRevocationReason?: string | null;
    walletAddress: string | null;
    kycStatus: string;
    helpLevel: string;
    demoUsed: boolean;
    demoActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    kycData?: { subscriptionPlan: string | null; encryptedFirstName?: string } | null;
  },
) {
  const normalizedKycStatus = normalizeKycStatus(user.kycStatus);

  // Decrypt first name from KYC data if available (only for approved users)
  let firstName: string | undefined;
  if (user.kycData?.encryptedFirstName) {
    try {
      firstName = decrypt(user.kycData.encryptedFirstName);
    } catch {
      // Decryption failed — omit rather than crash
    }
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    accessRevoked: Boolean(user.accessRevokedAt),
    accessRevokedAt: user.accessRevokedAt?.toISOString() ?? null,
    accessRevocationReason: user.accessRevocationReason ?? null,
    walletAddress: user.walletAddress,
    kycStatus: normalizedKycStatus,
    helpLevel: user.helpLevel,
    subscriptionPlan: user.kycData?.subscriptionPlan ?? null,
    firstName,
    demoUsed: user.demoUsed,
    demoActive: user.demoActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function normalizeKycStatus(raw: string): 'not_submitted' | 'pending' | 'approved' | 'rejected' {
  const value = raw.trim().toLowerCase();
  if (
    value === 'not_submitted' ||
    value === 'pending' ||
    value === 'approved' ||
    value === 'rejected'
  ) {
    return value;
  }
  if (value.includes('approve')) return 'approved';
  if (value.includes('verif')) return 'approved';
  if (value.includes('complete')) return 'approved';
  if (value.includes('active')) return 'approved';
  if (value.includes('reject')) return 'rejected';
  if (value.includes('pend')) return 'pending';
  if (value.includes('submit')) return 'not_submitted';
  return 'not_submitted';
}

function isPrismaUniqueConstraintError(
  err: unknown,
  targetField?: string,
): boolean {
  const maybeErr = err as {
    code?: unknown;
    meta?: { target?: unknown };
  };

  if (maybeErr.code !== 'P2002') {
    return false;
  }

  if (!targetField) return true;

  const target = maybeErr.meta?.target;
  if (Array.isArray(target)) {
    return target.includes(targetField);
  }
  if (typeof target === 'string') {
    return target.includes(targetField);
  }

  return true;
}

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------

router.post('/register', async (req, res) => {
  try {
    const parsed = registerSchema.parse(req.body);
    const email = parsed.email.toLowerCase().trim();
    const { password, helpLevel } = parsed;

    // Check if user exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: { message: 'An account with this email already exists', code: 'EMAIL_EXISTS' } });
      return;
    }

    // Create user
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, passwordHash, helpLevel },
    });

    // Create session
    const tokens = await createSession(user.id);

    // Set refresh token as httpOnly cookie
    setRefreshCookie(res, tokens.refreshToken, true);

    // Return only the access token in the response body
    res.status(201).json({
      user: mapUserResponse(user),
      tokens: {
        accessToken: tokens.accessToken,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { message: err.errors[0].message, code: 'VALIDATION_ERROR' } });
      return;
    }
    if (isPrismaUniqueConstraintError(err, 'email')) {
      res.status(409).json({ error: { message: 'An account with this email already exists', code: 'EMAIL_EXISTS' } });
      return;
    }
    console.error('Register error:', err);
    res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

router.post('/login', async (req, res) => {
  try {
    const parsed = loginSchema.parse(req.body);
    const email = parsed.email.toLowerCase().trim();
    const { password, rememberMe } = parsed;

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        kycData: {
          select: {
            subscriptionPlan: true,
            encryptedFirstName: true,
          },
        },
      },
    });
    if (!user) {
      res.status(401).json({ error: { message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' } });
      return;
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: { message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' } });
      return;
    }

    if (user.accessRevokedAt) {
      await invalidateAllSessions(user.id);
      res.status(403).json({
        error: {
          message: 'Your access to the platform has been revoked by an administrator.',
          code: 'ACCOUNT_ACCESS_REVOKED',
        },
      });
      return;
    }

    const tokens = await createSession(user.id, { rememberMe });

    // Set refresh token as httpOnly cookie
    setRefreshCookie(res, tokens.refreshToken, rememberMe);

    // Return only the access token in the response body
    res.json({
      user: mapUserResponse(user),
      tokens: {
        accessToken: tokens.accessToken,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { message: err.errors[0].message, code: 'VALIDATION_ERROR' } });
      return;
    }
    console.error('Login error:', err);
    res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------

router.post('/logout', authenticate, async (req, res) => {
  try {
    // If user is in demo mode, end it: mark demoUsed=true, demoActive=false
    const currentUser = await prisma.user.findUnique({ where: { id: req.userId } });
    if (currentUser?.demoActive) {
      await prisma.user.update({
        where: { id: req.userId },
        data: { demoActive: false, demoUsed: true },
      });
    }

    // Read refresh token from httpOnly cookie (preferred) or body (legacy)
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body.refreshToken;
    if (refreshToken) {
      await invalidateSession(refreshToken);
    }

    // Clear the refresh token cookie
    clearRefreshCookie(res);

    res.json({ success: true });
  } catch {
    // Clear cookie even on error
    clearRefreshCookie(res);
    res.json({ success: true }); // Always succeed on logout
  }
});

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------

router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: {
        kycData: {
          select: {
            subscriptionPlan: true,
            encryptedFirstName: true,
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: { message: 'User not found', code: 'NOT_FOUND' } });
      return;
    }

    res.json(mapUserResponse(user));
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/auth/preferences
// ---------------------------------------------------------------------------

router.put('/preferences', authenticate, async (req, res) => {
  try {
    const { helpLevel } = updatePreferencesSchema.parse(req.body);

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { helpLevel },
      include: {
        kycData: {
          select: {
            subscriptionPlan: true,
            encryptedFirstName: true,
          },
        },
      },
    });

    res.json(mapUserResponse(user));
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        error: { message: err.errors[0].message, code: 'VALIDATION_ERROR' },
      });
      return;
    }
    console.error('Update preferences error:', err);
    res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/refresh
// ---------------------------------------------------------------------------

router.post('/refresh', async (req, res) => {
  try {
    // Read refresh token from httpOnly cookie (preferred) or body (legacy)
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body.refreshToken;
    if (!refreshToken) {
      res.status(400).json({ error: { message: 'Refresh token required', code: 'MISSING_TOKEN' } });
      return;
    }

    const tokens = await refreshSession(refreshToken);

    // Set new refresh token as httpOnly cookie (rotation)
    setRefreshCookie(res, tokens.refreshToken, tokens.rememberMe);

    // Return only the access token in the response body
    res.json({ accessToken: tokens.accessToken });
  } catch (err) {
    if (err instanceof AccountAccessRevokedError) {
      clearRefreshCookie(res);
      res.status(403).json({
        error: {
          message: err.message,
          code: 'ACCOUNT_ACCESS_REVOKED',
        },
      });
      return;
    }
    console.error('Refresh error:', err);
    // Clear any stale cookie on refresh failure
    clearRefreshCookie(res);
    res.status(401).json({ error: { message: 'Invalid refresh token', code: 'INVALID_TOKEN' } });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/forgot-password
// ---------------------------------------------------------------------------

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email'),
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);

    // Always return success to avoid leaking whether an account exists
    const genericResponse = {
      success: true,
      message: 'If an account exists with that email, a password reset link has been sent.',
    };

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.json(genericResponse);
      return;
    }

    // Invalidate any existing unused tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    // Generate a new reset token with 1-hour expiry
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: hashToken(token),
        expiresAt,
      },
    });

    // Send the reset email (fire-and-forget; don't block response on email delivery)
    sendPasswordResetEmail(email, token).catch((err) => {
      console.error('Failed to send password reset email:', err);
    });

    res.json(genericResponse);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { message: err.errors[0].message, code: 'VALIDATION_ERROR' } });
      return;
    }
    console.error('Forgot password error:', err);
    res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/reset-password
// ---------------------------------------------------------------------------

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one digit')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = resetPasswordSchema.parse(req.body);
    const tokenCandidates = buildTokenLookupCandidates(token);

    // Find a valid, unexpired, unused token
    const resetToken = await prisma.passwordResetToken.findFirst({
      where: {
        OR: tokenCandidates.map((candidate) => ({
          token: candidate,
        })),
      },
    });

    if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
      res.status(400).json({
        error: { message: 'Invalid or expired reset token', code: 'INVALID_TOKEN' },
      });
      return;
    }

    // Hash the new password
    const passwordHash = await hashPassword(newPassword);

    // Update user password and mark token as used in a transaction
    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      }),
    ]);

    // Invalidate all existing sessions for this user (force re-login)
    await invalidateAllSessions(resetToken.userId);

    res.json({ success: true, message: 'Password has been reset successfully.' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { message: err.errors[0].message, code: 'VALIDATION_ERROR' } });
      return;
    }
    console.error('Reset password error:', err);
    res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/auth/change-password
// ---------------------------------------------------------------------------

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one digit')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
});

router.put('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      res.status(404).json({ error: { message: 'User not found', code: 'NOT_FOUND' } });
      return;
    }

    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: { message: 'Current password is incorrect', code: 'INVALID_CREDENTIALS' } });
      return;
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: req.userId },
      data: { passwordHash },
    });

    // Invalidate all other sessions (keep the current one would require
    // knowing which refresh token belongs to this session, so invalidate
    // all and let the client re-authenticate with the new password).
    await invalidateAllSessions(req.userId!);
    clearRefreshCookie(res);

    res.json({ success: true, message: 'Password changed successfully. Please sign in again.' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { message: err.errors[0].message, code: 'VALIDATION_ERROR' } });
      return;
    }
    console.error('Change password error:', err);
    res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout-all
// ---------------------------------------------------------------------------

router.post('/logout-all', authenticate, async (req, res) => {
  try {
    await invalidateAllSessions(req.userId!);
    clearRefreshCookie(res);
    res.json({ success: true, message: 'All sessions have been invalidated.' });
  } catch (err) {
    console.error('Logout all error:', err);
    res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/demo/start
// ---------------------------------------------------------------------------

router.post('/demo/start', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      res.status(404).json({ error: { message: 'User not found', code: 'NOT_FOUND' } });
      return;
    }

    const kycStatus = normalizeKycStatus(user.kycStatus);

    if (kycStatus !== 'pending') {
      res.status(400).json({ error: { message: 'Demo mode is only available for users with pending KYC', code: 'DEMO_NOT_ELIGIBLE' } });
      return;
    }

    if (user.demoUsed) {
      res.status(400).json({ error: { message: 'Demo mode has already been used. It is a one-time preview.', code: 'DEMO_ALREADY_USED' } });
      return;
    }

    if (user.demoActive) {
      res.status(400).json({ error: { message: 'Demo mode is already active', code: 'DEMO_ALREADY_ACTIVE' } });
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.userId },
      data: { demoActive: true },
      include: { kycData: { select: { subscriptionPlan: true } } },
    });

    res.json({ user: mapUserResponse(updatedUser) });
  } catch (err) {
    console.error('Demo start error:', err);
    res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/demo/end
// ---------------------------------------------------------------------------

router.post('/demo/end', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      res.status(404).json({ error: { message: 'User not found', code: 'NOT_FOUND' } });
      return;
    }

    if (!user.demoActive) {
      res.json({ success: true, message: 'Demo was not active' });
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.userId },
      data: { demoActive: false, demoUsed: true },
      include: { kycData: { select: { subscriptionPlan: true } } },
    });

    res.json({ success: true, user: mapUserResponse(updatedUser) });
  } catch (err) {
    console.error('Demo end error:', err);
    res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
  }
});

export default router;
