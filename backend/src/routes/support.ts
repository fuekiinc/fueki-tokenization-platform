import { Router } from 'express';
import { z } from 'zod';
import { authenticateOptional } from '../middleware/auth';
import { sendSupportRequestEmail } from '../services/email';
import { prisma } from '../prisma';

const router = Router();

const supportCategorySchema = z.enum([
  'general',
  'technical',
  'wallet',
  'swap',
  'compliance',
  'billing',
]);

const supportRequestSchema = z.object({
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().email('Enter a valid email address').max(320).optional(),
  subject: z.string().trim().min(4, 'Subject must be at least 4 characters').max(160),
  message: z.string().trim().min(20, 'Message must be at least 20 characters').max(4000),
  category: supportCategorySchema.default('general'),
  route: z.string().trim().max(260).optional(),
});

router.post('/request', authenticateOptional, async (req, res) => {
  try {
    const parsed = supportRequestSchema.parse(req.body);

    let accountEmail: string | undefined;

    if (req.userId) {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { email: true },
      });
      accountEmail = user?.email;
    }

    const contactEmail = parsed.email ?? accountEmail;
    if (!contactEmail) {
      res.status(400).json({
        error: {
          message: 'Email is required when you are not signed in.',
          code: 'EMAIL_REQUIRED',
        },
      });
      return;
    }

    const submittedAtIso = new Date().toISOString();

    await sendSupportRequestEmail({
      subject: parsed.subject,
      message: parsed.message,
      category: parsed.category,
      contactEmail,
      contactName: parsed.name,
      route: parsed.route,
      userId: req.userId,
      accountEmail,
      userAgent: req.get('user-agent') || undefined,
      ipAddress: req.ip || req.socket.remoteAddress || undefined,
      submittedAtIso,
    });

    res.status(201).json({
      success: true,
      submittedAt: submittedAtIso,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        error: {
          message: err.errors[0]?.message ?? 'Invalid request payload',
          code: 'VALIDATION_ERROR',
        },
      });
      return;
    }

    console.error('Support request error:', err);
    res.status(500).json({
      error: {
        message: 'Unable to send support request right now',
        code: 'SUPPORT_REQUEST_FAILED',
      },
    });
  }
});

export default router;
