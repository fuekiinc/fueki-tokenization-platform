import { type Request, type Response, Router } from 'express';
import crypto from 'node:crypto';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { mintApprovalUpload } from '../middleware/upload';
import { config } from '../config';
import { sendSecurityTokenApprovalRequestEmail } from '../services/email';
import { prisma } from '../prisma';

const router = Router();

type SecurityTokenRequestStatus = 'pending' | 'approved' | 'rejected';

const submitSchema = z.object({
  tokenName: z.string().trim().min(1, 'Token name is required').max(120),
  tokenSymbol: z
    .string()
    .trim()
    .min(1, 'Token symbol is required')
    .max(11)
    .regex(/^[a-zA-Z0-9]+$/, 'Token symbol must be alphanumeric'),
  decimals: z.coerce.number().int().min(0).max(18),
  totalSupply: z.string().trim().min(1, 'Total supply is required').max(120),
  maxTotalSupply: z.string().trim().min(1, 'Max total supply is required').max(120),
  minTimelockAmount: z.string().trim().min(1, 'Min timelock amount is required').max(120),
  maxReleaseDelayDays: z.coerce.number().int().min(0).max(36500),
  originalValue: z
    .string()
    .trim()
    .min(1, 'Original value is required')
    .max(120)
    .regex(/^\d+$/, 'Original value must be a non-negative whole number'),
  documentHash: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{1,64}$/, 'Document hash must be a hex string starting with 0x'),
  documentType: z.string().trim().min(1, 'Document type is required').max(64),
  hashSource: z.enum(['file', 'manual']),
  chainId: z.coerce.number().int().positive(),
});

const statusSchema = z.object({
  tokenName: z.string().trim().min(1).max(120),
  tokenSymbol: z.string().trim().min(1).max(11),
  decimals: z.coerce.number().int().min(0).max(18),
  totalSupply: z.string().trim().min(1).max(120),
  maxTotalSupply: z.string().trim().min(1).max(120),
  minTimelockAmount: z.string().trim().min(1).max(120),
  maxReleaseDelayDays: z.coerce.number().int().min(0).max(36500),
  originalValue: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^\d+$/),
  documentHash: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{1,64}$/),
  documentType: z.string().trim().min(1).max(64),
  chainId: z.coerce.number().int().positive(),
});

const listSchema = z.object({
  chainId: z.coerce.number().int().positive().optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

function requestRateLimitKey(req: Request): string {
  return req.userId ? `user:${req.userId}` : 'user:unknown';
}

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: requestRateLimitKey,
  message: {
    error: {
      message: 'Too many security token deployment submissions, please try again later',
      code: 'RATE_LIMIT',
    },
  },
});

const statusLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: requestRateLimitKey,
  message: {
    error: {
      message: 'Too many deployment status checks, please try again shortly',
      code: 'RATE_LIMIT',
    },
  },
});

const listLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: requestRateLimitKey,
  message: {
    error: {
      message: 'Too many deployment history checks, please try again shortly',
      code: 'RATE_LIMIT',
    },
  },
});

function normalizeDecimalAmount(input: string): string {
  const sanitized = input.replace(/[,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(sanitized)) {
    throw new Error('Amount must be a valid positive decimal number');
  }
  if (Number(sanitized) < 0) {
    throw new Error('Amount must be non-negative');
  }
  const [whole, fractional = ''] = sanitized.split('.');
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '') || '0';
  const normalizedFractional = fractional.replace(/0+$/, '');
  return normalizedFractional
    ? `${normalizedWhole}.${normalizedFractional}`
    : normalizedWhole;
}

function buildRequestFingerprint(input: {
  chainId: number;
  tokenName: string;
  tokenSymbol: string;
  decimals: number;
  totalSupply: string;
  maxTotalSupply: string;
  minTimelockAmount: string;
  maxReleaseDelayDays: number;
  originalValue: string;
  documentHash: string;
  documentType: string;
}): string {
  const canonical = JSON.stringify({
    chainId: input.chainId,
    tokenName: input.tokenName.trim(),
    tokenSymbol: input.tokenSymbol.trim().toUpperCase(),
    decimals: input.decimals,
    totalSupply: input.totalSupply,
    maxTotalSupply: input.maxTotalSupply,
    minTimelockAmount: input.minTimelockAmount,
    maxReleaseDelayDays: input.maxReleaseDelayDays,
    originalValue: input.originalValue,
    documentHash: input.documentHash.toLowerCase(),
    documentType: input.documentType.trim(),
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function sendActionHtml(
  res: Response,
  {
    title,
    message,
    accent = '#4f46e5',
  }: { title: string; message: string; accent?: string },
): void {
  res
    .status(200)
    .type('html')
    .send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="margin:0;background:#0b1220;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;">
      <div style="max-width:560px;width:100%;background:#111827;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:28px;box-shadow:0 10px 40px rgba(0,0,0,0.4);">
        <div style="width:48px;height:48px;border-radius:999px;background:${accent}22;border:1px solid ${accent}66;display:flex;align-items:center;justify-content:center;font-weight:700;color:${accent};margin-bottom:16px;">F</div>
        <h1 style="margin:0 0 8px;font-size:22px;color:#ffffff;">${title}</h1>
        <p style="margin:0;color:#9ca3af;line-height:1.6;">${message}</p>
      </div>
    </div>
  </body>
</html>`);
}

// POST /api/security-token-requests/submit
router.post(
  '/submit',
  authenticate,
  submitLimiter,
  mintApprovalUpload.single('document'),
  async (req, res) => {
    try {
      const parsed = submitSchema.parse(req.body);
      const file = req.file;

      if (parsed.hashSource === 'file' && !file) {
        res.status(400).json({
          error: {
            message:
              'Document file is required when hash source is file upload.',
            code: 'DOCUMENT_REQUIRED',
          },
        });
        return;
      }

      const normalizedTotalSupply = normalizeDecimalAmount(parsed.totalSupply);
      const normalizedMaxTotalSupply = normalizeDecimalAmount(parsed.maxTotalSupply);
      const normalizedMinTimelockAmount = normalizeDecimalAmount(
        parsed.minTimelockAmount,
      );

      if (Number(normalizedTotalSupply) <= 0) {
        res.status(400).json({
          error: {
            message: 'Total supply must be greater than zero.',
            code: 'VALIDATION_ERROR',
          },
        });
        return;
      }

      if (Number(normalizedMaxTotalSupply) < Number(normalizedTotalSupply)) {
        res.status(400).json({
          error: {
            message: 'Max total supply must be greater than or equal to total supply.',
            code: 'VALIDATION_ERROR',
          },
        });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: req.userId! },
        select: { id: true, email: true },
      });

      if (!user) {
        res.status(401).json({
          error: { message: 'Authentication required', code: 'AUTH_REQUIRED' },
        });
        return;
      }

      const fingerprint = buildRequestFingerprint({
        chainId: parsed.chainId,
        tokenName: parsed.tokenName,
        tokenSymbol: parsed.tokenSymbol,
        decimals: parsed.decimals,
        totalSupply: normalizedTotalSupply,
        maxTotalSupply: normalizedMaxTotalSupply,
        minTimelockAmount: normalizedMinTimelockAmount,
        maxReleaseDelayDays: parsed.maxReleaseDelayDays,
        originalValue: parsed.originalValue.trim(),
        documentHash: parsed.documentHash,
        documentType: parsed.documentType,
      });

      const existing = await prisma.securityTokenApprovalRequest.findFirst({
        where: {
          userId: user.id,
          requestFingerprint: fingerprint,
          status: { in: ['pending', 'approved'] },
        },
        orderBy: { submittedAt: 'desc' },
      });

      if (existing) {
        res.status(200).json({
          success: true,
          reused: true,
          requestId: existing.id,
          status: existing.status,
          reviewNotes: existing.reviewNotes,
          submittedAt: existing.submittedAt.toISOString(),
          reviewedAt: existing.reviewedAt?.toISOString() ?? null,
        });
        return;
      }

      const request = await prisma.securityTokenApprovalRequest.create({
        data: {
          userId: user.id,
          requesterEmail: user.email,
          chainId: parsed.chainId,
          tokenName: parsed.tokenName.trim(),
          tokenSymbol: parsed.tokenSymbol.trim().toUpperCase(),
          decimals: parsed.decimals,
          totalSupply: normalizedTotalSupply,
          maxTotalSupply: normalizedMaxTotalSupply,
          minTimelockAmount: normalizedMinTimelockAmount,
          maxReleaseDelayDays: parsed.maxReleaseDelayDays,
          originalValue: parsed.originalValue.trim(),
          documentHash: parsed.documentHash.trim(),
          documentType: parsed.documentType.trim(),
          hashSource: parsed.hashSource,
          fileName: file?.originalname,
          fileMimeType: file?.mimetype,
          requestFingerprint: fingerprint,
          status: 'pending',
        },
      });

      const expiresAt = new Date(
        Date.now() + config.securityTokenApproval.actionTokenTtlHours * 60 * 60 * 1000,
      );

      const [approveToken, rejectToken] = await prisma.$transaction([
        prisma.securityTokenApprovalActionToken.create({
          data: {
            requestId: request.id,
            action: 'approve',
            token: crypto.randomUUID(),
            expiresAt,
          },
        }),
        prisma.securityTokenApprovalActionToken.create({
          data: {
            requestId: request.id,
            action: 'reject',
            token: crypto.randomUUID(),
            expiresAt,
          },
        }),
      ]);

      const approveUrl = `${config.backendUrl}/api/security-token-requests/action/${approveToken.token}`;
      const rejectUrl = `${config.backendUrl}/api/security-token-requests/action/${rejectToken.token}`;

      try {
        await sendSecurityTokenApprovalRequestEmail({
          requestId: request.id,
          requesterUserId: user.id,
          requesterEmail: user.email,
          chainId: request.chainId,
          tokenName: request.tokenName,
          tokenSymbol: request.tokenSymbol,
          decimals: request.decimals,
          totalSupply: request.totalSupply,
          maxTotalSupply: request.maxTotalSupply,
          minTimelockAmount: request.minTimelockAmount,
          maxReleaseDelayDays: request.maxReleaseDelayDays,
          originalValue: request.originalValue,
          documentHash: request.documentHash,
          documentType: request.documentType,
          hashSource: request.hashSource,
          submittedAtIso: request.submittedAt.toISOString(),
          approveUrl,
          rejectUrl,
          attachmentFileName: file?.originalname ?? null,
          attachmentMimeType: file?.mimetype ?? null,
          attachmentContent: file?.buffer ?? null,
        });
      } catch (emailErr) {
        await prisma.$transaction([
          prisma.securityTokenApprovalActionToken.deleteMany({
            where: { requestId: request.id },
          }),
          prisma.securityTokenApprovalRequest.delete({
            where: { id: request.id },
          }),
        ]);
        throw emailErr;
      }

      res.status(201).json({
        success: true,
        reused: false,
        requestId: request.id,
        status: request.status,
        reviewNotes: request.reviewNotes,
        submittedAt: request.submittedAt.toISOString(),
        reviewedAt: null,
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
      if (err instanceof multer.MulterError) {
        res.status(400).json({
          error: {
            message: `Document upload failed: ${err.message}`,
            code: 'UPLOAD_ERROR',
          },
        });
        return;
      }
      if (err instanceof Error && err.message.includes('Amount')) {
        res.status(400).json({
          error: { message: err.message, code: 'VALIDATION_ERROR' },
        });
        return;
      }
      console.error('Security token request submit error:', err);
      res.status(500).json({
        error: {
          message: 'Unable to submit security token deployment request',
          code: 'SECURITY_TOKEN_REQUEST_SUBMIT_FAILED',
        },
      });
    }
  },
);

// GET /api/security-token-requests/status
router.get('/status', authenticate, statusLimiter, async (req, res) => {
  try {
    const parsed = statusSchema.parse(req.query);
    const normalizedTotalSupply = normalizeDecimalAmount(parsed.totalSupply);
    const normalizedMaxTotalSupply = normalizeDecimalAmount(parsed.maxTotalSupply);
    const normalizedMinTimelockAmount = normalizeDecimalAmount(
      parsed.minTimelockAmount,
    );

    const fingerprint = buildRequestFingerprint({
      chainId: parsed.chainId,
      tokenName: parsed.tokenName,
      tokenSymbol: parsed.tokenSymbol,
      decimals: parsed.decimals,
      totalSupply: normalizedTotalSupply,
      maxTotalSupply: normalizedMaxTotalSupply,
      minTimelockAmount: normalizedMinTimelockAmount,
      maxReleaseDelayDays: parsed.maxReleaseDelayDays,
      originalValue: parsed.originalValue.trim(),
      documentHash: parsed.documentHash,
      documentType: parsed.documentType,
    });

    const request = await prisma.securityTokenApprovalRequest.findFirst({
      where: {
        userId: req.userId!,
        requestFingerprint: fingerprint,
      },
      orderBy: { submittedAt: 'desc' },
    });

    if (!request) {
      res.json({
        status: 'none',
        requestId: null,
        reviewNotes: null,
        submittedAt: null,
        reviewedAt: null,
        canDeploy: false,
      });
      return;
    }

    res.json({
      status: request.status,
      requestId: request.id,
      reviewNotes: request.reviewNotes,
      submittedAt: request.submittedAt.toISOString(),
      reviewedAt: request.reviewedAt?.toISOString() ?? null,
      canDeploy: request.status === 'approved',
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        error: {
          message: err.errors[0]?.message ?? 'Invalid status query',
          code: 'VALIDATION_ERROR',
        },
      });
      return;
    }
    if (err instanceof Error && err.message.includes('Amount')) {
      res.status(400).json({
        error: { message: err.message, code: 'VALIDATION_ERROR' },
      });
      return;
    }
    console.error('Security token request status error:', err);
    res.status(500).json({
      error: {
        message: 'Unable to fetch security token request status',
        code: 'SECURITY_TOKEN_REQUEST_STATUS_FAILED',
      },
    });
  }
});

// GET /api/security-token-requests/list
router.get('/list', authenticate, listLimiter, async (req, res) => {
  try {
    const parsed = listSchema.parse(req.query);

    const requests = await prisma.securityTokenApprovalRequest.findMany({
      where: {
        userId: req.userId!,
        ...(parsed.chainId ? { chainId: parsed.chainId } : {}),
        ...(parsed.status ? { status: parsed.status } : {}),
      },
      orderBy: { submittedAt: 'desc' },
      take: parsed.limit,
      select: {
        id: true,
        chainId: true,
        tokenName: true,
        tokenSymbol: true,
        decimals: true,
        totalSupply: true,
        maxTotalSupply: true,
        minTimelockAmount: true,
        maxReleaseDelayDays: true,
        originalValue: true,
        documentHash: true,
        documentType: true,
        hashSource: true,
        fileName: true,
        status: true,
        reviewNotes: true,
        approvedBy: true,
        submittedAt: true,
        reviewedAt: true,
      },
    });

    res.json({
      requests: requests.map((request) => ({
        id: request.id,
        chainId: request.chainId,
        tokenName: request.tokenName,
        tokenSymbol: request.tokenSymbol,
        decimals: request.decimals,
        totalSupply: request.totalSupply,
        maxTotalSupply: request.maxTotalSupply,
        minTimelockAmount: request.minTimelockAmount,
        maxReleaseDelayDays: request.maxReleaseDelayDays,
        originalValue: request.originalValue,
        documentHash: request.documentHash,
        documentType: request.documentType,
        hashSource: request.hashSource,
        fileName: request.fileName,
        status: request.status,
        reviewNotes: request.reviewNotes,
        approvedBy: request.approvedBy,
        submittedAt: request.submittedAt.toISOString(),
        reviewedAt: request.reviewedAt?.toISOString() ?? null,
        canDeploy: request.status === 'approved',
      })),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        error: {
          message: err.errors[0]?.message ?? 'Invalid list query',
          code: 'VALIDATION_ERROR',
        },
      });
      return;
    }
    console.error('Security token request list error:', err);
    res.status(500).json({
      error: {
        message: 'Unable to fetch security token deployment requests',
        code: 'SECURITY_TOKEN_REQUEST_LIST_FAILED',
      },
    });
  }
});

// GET /api/security-token-requests/action/:token
router.get('/action/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) {
      sendActionHtml(res, {
        title: 'Invalid Action Link',
        message: 'This approval link is missing a token.',
        accent: '#dc2626',
      });
      return;
    }

    const actionToken = await prisma.securityTokenApprovalActionToken.findUnique({
      where: { token },
      include: { request: true },
    });

    if (!actionToken) {
      sendActionHtml(res, {
        title: 'Link Not Found',
        message:
          'This security token deployment action link is invalid or has already been removed.',
        accent: '#dc2626',
      });
      return;
    }

    if (actionToken.used) {
      sendActionHtml(res, {
        title: 'Action Already Used',
        message:
          'This deployment action link has already been used and cannot be reused.',
        accent: '#f59e0b',
      });
      return;
    }

    if (actionToken.expiresAt.getTime() < Date.now()) {
      await prisma.securityTokenApprovalActionToken.update({
        where: { id: actionToken.id },
        data: { used: true },
      });

      sendActionHtml(res, {
        title: 'Action Link Expired',
        message:
          'This deployment action link has expired. Ask the requester to submit a new deployment request.',
        accent: '#f59e0b',
      });
      return;
    }

    const desiredStatus: SecurityTokenRequestStatus =
      actionToken.action === 'approve' ? 'approved' : 'rejected';

    if (actionToken.request.status !== 'pending') {
      await prisma.securityTokenApprovalActionToken.update({
        where: { id: actionToken.id },
        data: { used: true },
      });

      sendActionHtml(res, {
        title: 'Request Already Reviewed',
        message: `This deployment request is already ${actionToken.request.status}. No additional action was applied.`,
        accent: '#4f46e5',
      });
      return;
    }

    await prisma.$transaction([
      prisma.securityTokenApprovalActionToken.update({
        where: { id: actionToken.id },
        data: { used: true },
      }),
      prisma.securityTokenApprovalActionToken.updateMany({
        where: {
          requestId: actionToken.requestId,
          id: { not: actionToken.id },
          used: false,
        },
        data: { used: true },
      }),
      prisma.securityTokenApprovalRequest.update({
        where: { id: actionToken.requestId },
        data: {
          status: desiredStatus,
          reviewedAt: new Date(),
          reviewNotes:
            desiredStatus === 'approved'
              ? 'Approved via banker email link.'
              : 'Rejected via banker email link.',
          approvedBy: config.securityTokenApproval.requestRecipient,
        },
      }),
    ]);

    sendActionHtml(res, {
      title:
        desiredStatus === 'approved'
          ? 'Deployment Request Approved'
          : 'Deployment Request Rejected',
      message:
        desiredStatus === 'approved'
          ? 'The user can now proceed with security token deployment in the app.'
          : 'The deployment request was rejected. The user must update details and resubmit.',
      accent: desiredStatus === 'approved' ? '#059669' : '#dc2626',
    });
  } catch (err) {
    console.error('Security token request action error:', err);
    sendActionHtml(res, {
      title: 'Action Failed',
      message:
        'An unexpected error occurred while processing this deployment action link.',
      accent: '#dc2626',
    });
  }
});

export default router;
