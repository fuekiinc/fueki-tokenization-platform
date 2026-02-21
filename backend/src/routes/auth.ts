import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import { z } from 'zod';
import { hashPassword, verifyPassword, createSession, refreshSession, invalidateSession, invalidateAllSessions } from '../services/auth';
import { authenticate } from '../middleware/auth';
import { config } from '../config';
import { sendPasswordResetEmail } from '../services/email';

const router = Router();
const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Cookie configuration for refresh tokens
// ---------------------------------------------------------------------------

const REFRESH_COOKIE_NAME = 'fueki_refresh_token';

function setRefreshCookie(
  res: Response,
  refreshToken: string,
  rememberMe = true,
): void {
  const isProduction = config.nodeEnv === 'production';

  const cookieOptions: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'strict' | 'lax';
    path: string;
    maxAge?: number;
  } = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/api/auth',
  };

  if (rememberMe) {
    cookieOptions.maxAge = config.jwt.refreshExpiresIn * 1000;
  }

  (res as any).cookie(REFRESH_COOKIE_NAME, refreshToken, cookieOptions);
}

function clearRefreshCookie(res: Response): void {
  const isProduction = config.nodeEnv === 'production';

  (res as any).cookie(REFRESH_COOKIE_NAME, '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
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
  password: z.string().min(8, 'Password must be at least 8 characters'),
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

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------

router.post('/register', async (req, res) => {
  try {
    const { email, password, helpLevel } = registerSchema.parse(req.body);

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
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        walletAddress: user.walletAddress,
        kycStatus: user.kycStatus,
        helpLevel: user.helpLevel,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      tokens: {
        accessToken: tokens.accessToken,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { message: err.errors[0].message, code: 'VALIDATION_ERROR' } });
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
    const { email, password, rememberMe } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ error: { message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' } });
      return;
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: { message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' } });
      return;
    }

    const tokens = await createSession(user.id, { rememberMe });

    // Set refresh token as httpOnly cookie
    setRefreshCookie(res, tokens.refreshToken, rememberMe);

    // Return only the access token in the response body
    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        walletAddress: user.walletAddress,
        kycStatus: user.kycStatus,
        helpLevel: user.helpLevel,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
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
    });

    if (!user) {
      res.status(404).json({ error: { message: 'User not found', code: 'NOT_FOUND' } });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      walletAddress: user.walletAddress,
      kycStatus: user.kycStatus,
      helpLevel: user.helpLevel,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    });
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
    });

    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      walletAddress: user.walletAddress,
      kycStatus: user.kycStatus,
      helpLevel: user.helpLevel,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    });
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
        token,
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
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = resetPasswordSchema.parse(req.body);

    // Find a valid, unexpired, unused token
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
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

export default router;
