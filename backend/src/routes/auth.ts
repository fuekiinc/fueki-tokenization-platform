import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { hashPassword, verifyPassword, createSession, refreshSession, invalidateSession } from '../services/auth';
import { authenticate } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

// POST /api/auth/register
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

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        walletAddress: user.walletAddress,
        kycStatus: user.kycStatus,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      tokens,
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

// POST /api/auth/login
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

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: undefined, // Will be populated from KYC data if available
        lastName: undefined,
        walletAddress: user.walletAddress,
        kycStatus: user.kycStatus,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      tokens,
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

// POST /api/auth/logout
router.post('/logout', authenticate, async (req, res) => {
  try {
    const refreshToken = req.body.refreshToken;
    if (refreshToken) {
      await invalidateSession(refreshToken);
    }
    res.json({ success: true });
  } catch {
    res.json({ success: true }); // Always succeed on logout
  }
});

// GET /api/auth/me
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

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ error: { message: 'Refresh token required', code: 'MISSING_TOKEN' } });
      return;
    }

    const tokens = await refreshSession(refreshToken);
    res.json(tokens);
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(401).json({ error: { message: 'Invalid refresh token', code: 'INVALID_TOKEN' } });
  }
});

export default router;
