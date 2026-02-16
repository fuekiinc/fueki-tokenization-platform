import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { hashPassword, verifyPassword, createSession, refreshSession, invalidateSession } from '../services/auth';
import { authenticate } from '../middleware/auth';
import { config } from '../config';

const router = Router();
const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Cookie configuration for refresh tokens
// ---------------------------------------------------------------------------

const REFRESH_COOKIE_NAME = 'fueki_refresh_token';

function setRefreshCookie(res: Response, refreshToken: string): void {
  const isProduction = config.nodeEnv === 'production';

  (res as any).cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/api/auth',
    maxAge: config.jwt.refreshExpiresIn * 1000, // 7 days in ms
  });
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

const registerSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------

router.post('/register', async (req, res) => {
  try {
    const { email, password } = registerSchema.parse(req.body);

    // Check if user exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: { message: 'An account with this email already exists', code: 'EMAIL_EXISTS' } });
      return;
    }

    // Create user
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, passwordHash },
    });

    // Create session
    const tokens = await createSession(user.id);

    // Set refresh token as httpOnly cookie
    setRefreshCookie(res, tokens.refreshToken);

    // Return only the access token in the response body
    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        walletAddress: user.walletAddress,
        kycStatus: user.kycStatus,
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
    const { email, password } = loginSchema.parse(req.body);

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

    const tokens = await createSession(user.id);

    // Set refresh token as httpOnly cookie
    setRefreshCookie(res, tokens.refreshToken);

    // Return only the access token in the response body
    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: undefined,
        lastName: undefined,
        walletAddress: user.walletAddress,
        kycStatus: user.kycStatus,
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
      walletAddress: user.walletAddress,
      kycStatus: user.kycStatus,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    });
  } catch (err) {
    console.error('Profile error:', err);
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
    setRefreshCookie(res, tokens.refreshToken);

    // Return only the access token in the response body
    res.json({ accessToken: tokens.accessToken });
  } catch (err) {
    console.error('Refresh error:', err);
    // Clear any stale cookie on refresh failure
    clearRefreshCookie(res);
    res.status(401).json({ error: { message: 'Invalid refresh token', code: 'INVALID_TOKEN' } });
  }
});

export default router;
