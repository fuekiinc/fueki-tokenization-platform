import { type Request, Router } from 'express';
import crypto from 'node:crypto';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { mintApprovalUpload } from '../middleware/upload';
import { config } from '../config';
import {
  createConfirmationFormState,
  parseApprovalAction,
  sendActionConfirmationPage,
  sendActionInfoPage,
  verifyConfirmationFormState,
} from '../services/approvalActionFlow';
import { sendMintApprovalRequestEmail } from '../services/email';
import { prisma } from '../prisma';

const router = Router();

type MintRequestStatus = 'pending' | 'approved' | 'rejected' | 'minted';

const submitSchema = z.object({
  tokenName: z.string().trim().min(1, 'Token name is required').max(120),
  tokenSymbol: z
    .string()
    .trim()
    .min(1, 'Token symbol is required')
    .max(11)
    .regex(/^[a-zA-Z0-9]+$/, 'Token symbol must be alphanumeric'),
  mintAmount: z.string().trim().min(1, 'Mint amount is required').max(100),
  recipient: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Recipient must be a valid EVM address'),
  documentHash: z.string().trim().min(1, 'Document hash is required').max(256),
  documentType: z.string().trim().min(1, 'Document type is required').max(64),
  originalValue: z.string().trim().min(1, 'Original value is required').max(100),
  currency: z.string().trim().min(1, 'Currency is required').max(16),
  chainId: z.coerce.number().int().positive(),
});

const statusSchema = z.object({
  tokenName: z.string().trim().min(1).max(120),
  tokenSymbol: z.string().trim().min(1).max(11),
  mintAmount: z.string().trim().min(1).max(100),
  recipient: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{40}$/),
  documentHash: z.string().trim().min(1).max(256),
  chainId: z.coerce.number().int().positive(),
});

const listSchema = z.object({
  chainId: z.coerce.number().int().positive().optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'minted']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const requestIdSchema = z.string().trim().uuid('Invalid mint request id');

const markMintedSchema = z.object({
  txHash: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{64}$/, 'Transaction hash must be a valid 0x-prefixed 32-byte hex string')
    .optional(),
});

function mintRateLimitKey(req: Request): string {
  return req.userId ? `user:${req.userId}` : 'user:unknown';
}

const mintSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: mintRateLimitKey,
  message: {
    error: {
      message: 'Too many mint approval submissions, please try again later',
      code: 'RATE_LIMIT',
    },
  },
});

const mintStatusLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: mintRateLimitKey,
  message: {
    error: {
      message: 'Too many mint status checks, please try again shortly',
      code: 'RATE_LIMIT',
    },
  },
});

const mintListLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: mintRateLimitKey,
  message: {
    error: {
      message: 'Too many mint request history checks, please try again shortly',
      code: 'RATE_LIMIT',
    },
  },
});

function normalizeAmount(input: string): string {
  const sanitized = input.replace(/[,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(sanitized)) {
    throw new Error('Amount must be a valid positive decimal number');
  }
  if (Number(sanitized) <= 0) {
    throw new Error('Amount must be greater than zero');
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
  mintAmount: string;
  recipient: string;
  documentHash: string;
}): string {
  const canonical = JSON.stringify({
    chainId: input.chainId,
    tokenName: input.tokenName.trim(),
    tokenSymbol: input.tokenSymbol.trim().toUpperCase(),
    mintAmount: input.mintAmount,
    recipient: input.recipient.toLowerCase(),
    documentHash: input.documentHash.toLowerCase(),
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

// POST /api/mint-requests/submit
router.post(
  '/submit',
  authenticate,
  mintSubmitLimiter,
  mintApprovalUpload.single('document'),
  async (req, res) => {
    try {
      const parsed = submitSchema.parse(req.body);
      const file = req.file;

      if (!file) {
        res.status(400).json({
          error: { message: 'Document file is required', code: 'DOCUMENT_REQUIRED' },
        });
        return;
      }

      const normalizedMintAmount = normalizeAmount(parsed.mintAmount);
      const normalizedOriginalValue = normalizeAmount(parsed.originalValue);

      if (Number(normalizedMintAmount) > Number(normalizedOriginalValue)) {
        res.status(400).json({
          error: {
            message: 'Mint amount cannot exceed original document value',
            code: 'MINT_EXCEEDS_DOCUMENT_VALUE',
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
        mintAmount: normalizedMintAmount,
        recipient: parsed.recipient,
        documentHash: parsed.documentHash,
      });

      const existing = await prisma.mintApprovalRequest.findFirst({
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

      const request = await prisma.mintApprovalRequest.create({
        data: {
          userId: user.id,
          requesterEmail: user.email,
          chainId: parsed.chainId,
          tokenName: parsed.tokenName.trim(),
          tokenSymbol: parsed.tokenSymbol.trim().toUpperCase(),
          mintAmount: normalizedMintAmount,
          recipient: parsed.recipient,
          documentHash: parsed.documentHash,
          documentType: parsed.documentType,
          originalValue: normalizedOriginalValue,
          currency: parsed.currency.trim().toUpperCase(),
          fileName: file.originalname,
          fileMimeType: file.mimetype,
          requestFingerprint: fingerprint,
          status: 'pending',
        },
      });

      const expiresAt = new Date(
        Date.now() + config.mintApproval.actionTokenTtlHours * 60 * 60 * 1000,
      );

      const [approveToken, rejectToken] = await prisma.$transaction([
        prisma.mintApprovalActionToken.create({
          data: {
            requestId: request.id,
            action: 'approve',
            token: crypto.randomUUID(),
            expiresAt,
          },
        }),
        prisma.mintApprovalActionToken.create({
          data: {
            requestId: request.id,
            action: 'reject',
            token: crypto.randomUUID(),
            expiresAt,
          },
        }),
      ]);

      const approveUrl = `${config.backendUrl}/api/mint-requests/action/${approveToken.token}`;
      const rejectUrl = `${config.backendUrl}/api/mint-requests/action/${rejectToken.token}`;

      try {
        await sendMintApprovalRequestEmail({
          requestId: request.id,
          requesterUserId: user.id,
          requesterEmail: user.email,
          chainId: request.chainId,
          tokenName: request.tokenName,
          tokenSymbol: request.tokenSymbol,
          mintAmount: request.mintAmount,
          recipient: request.recipient,
          documentHash: request.documentHash,
          documentType: request.documentType,
          originalValue: request.originalValue,
          currency: request.currency,
          submittedAtIso: request.submittedAt.toISOString(),
          approveUrl,
          rejectUrl,
          attachmentFileName: file.originalname,
          attachmentMimeType: file.mimetype,
          attachmentContent: file.buffer,
        });
      } catch (emailErr) {
        await prisma.$transaction([
          prisma.mintApprovalActionToken.deleteMany({
            where: { requestId: request.id },
          }),
          prisma.mintApprovalRequest.delete({
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
      console.error('Mint request submit error:', err);
      res.status(500).json({
        error: {
          message: 'Unable to submit mint approval request',
          code: 'MINT_REQUEST_SUBMIT_FAILED',
        },
      });
    }
  },
);

// GET /api/mint-requests/status
router.get('/status', authenticate, mintStatusLimiter, async (req, res) => {
  try {
    const parsed = statusSchema.parse(req.query);
    const normalizedMintAmount = normalizeAmount(parsed.mintAmount);
    const fingerprint = buildRequestFingerprint({
      chainId: parsed.chainId,
      tokenName: parsed.tokenName,
      tokenSymbol: parsed.tokenSymbol,
      mintAmount: normalizedMintAmount,
      recipient: parsed.recipient,
      documentHash: parsed.documentHash,
    });

    const request = await prisma.mintApprovalRequest.findFirst({
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
        canMint: false,
      });
      return;
    }

    res.json({
      status: request.status,
      requestId: request.id,
      reviewNotes: request.reviewNotes,
      submittedAt: request.submittedAt.toISOString(),
      reviewedAt: request.reviewedAt?.toISOString() ?? null,
      canMint: request.status === 'approved',
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
    console.error('Mint request status error:', err);
    res.status(500).json({
      error: {
        message: 'Unable to fetch mint request status',
        code: 'MINT_REQUEST_STATUS_FAILED',
      },
    });
  }
});

// GET /api/mint-requests/list
router.get('/list', authenticate, mintListLimiter, async (req, res) => {
  try {
    const parsed = listSchema.parse(req.query);

    const requests = await prisma.mintApprovalRequest.findMany({
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
        mintAmount: true,
        recipient: true,
        documentHash: true,
        documentType: true,
        originalValue: true,
        currency: true,
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
        mintAmount: request.mintAmount,
        recipient: request.recipient,
        documentHash: request.documentHash,
        documentType: request.documentType,
        originalValue: request.originalValue,
        currency: request.currency,
        fileName: request.fileName,
        status: request.status,
        reviewNotes: request.reviewNotes,
        approvedBy: request.approvedBy,
        submittedAt: request.submittedAt.toISOString(),
        reviewedAt: request.reviewedAt?.toISOString() ?? null,
        canMint: request.status === 'approved',
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
    console.error('Mint request list error:', err);
    res.status(500).json({
      error: {
        message: 'Unable to fetch mint requests',
        code: 'MINT_REQUEST_LIST_FAILED',
      },
    });
  }
});

// POST /api/mint-requests/:requestId/mark-minted
router.post('/:requestId/mark-minted', authenticate, mintStatusLimiter, async (req, res) => {
  try {
    const requestId = requestIdSchema.parse(String(req.params.requestId ?? ''));
    const parsedBody = markMintedSchema.parse(req.body ?? {});

    const request = await prisma.mintApprovalRequest.findFirst({
      where: {
        id: requestId,
        userId: req.userId!,
      },
      select: {
        id: true,
        status: true,
        reviewNotes: true,
        reviewedAt: true,
      },
    });

    if (!request) {
      res.status(404).json({
        error: {
          message: 'Mint approval request not found',
          code: 'MINT_REQUEST_NOT_FOUND',
        },
      });
      return;
    }

    if (request.status === 'minted') {
      res.json({
        success: true,
        requestId: request.id,
        status: request.status,
        reviewNotes: request.reviewNotes,
        reviewedAt: request.reviewedAt?.toISOString() ?? null,
        canMint: false,
        alreadyMinted: true,
      });
      return;
    }

    if (request.status !== 'approved') {
      res.status(409).json({
        error: {
          message: `Only approved requests can be marked minted (current status: ${request.status}).`,
          code: 'MINT_REQUEST_STATUS_INVALID',
        },
      });
      return;
    }

    const mintedNote = parsedBody.txHash
      ? `Minted on-chain. Tx: ${parsedBody.txHash}`
      : 'Minted on-chain.';
    const reviewNotes = request.reviewNotes
      ? `${request.reviewNotes}\n${mintedNote}`
      : mintedNote;

    const updated = await prisma.mintApprovalRequest.update({
      where: { id: request.id },
      data: {
        status: 'minted',
        reviewNotes,
      },
      select: {
        id: true,
        status: true,
        reviewNotes: true,
        reviewedAt: true,
      },
    });

    res.json({
      success: true,
      requestId: updated.id,
      status: updated.status,
      reviewNotes: updated.reviewNotes,
      reviewedAt: updated.reviewedAt?.toISOString() ?? null,
      canMint: false,
      alreadyMinted: false,
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
    console.error('Mint request mark minted error:', err);
    res.status(500).json({
      error: {
        message: 'Unable to update mint request status',
        code: 'MINT_REQUEST_MARK_MINTED_FAILED',
      },
    });
  }
});

// GET /api/mint-requests/action/:token
router.get('/action/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) {
      sendActionInfoPage(res, {
        status: 400,
        title: 'Invalid Action Link',
        message: 'This approval link is missing a token.',
        accent: '#dc2626',
      });
      return;
    }

    const actionToken = await prisma.mintApprovalActionToken.findUnique({
      where: { token },
      include: { request: true },
    });

    if (!actionToken) {
      sendActionInfoPage(res, {
        status: 404,
        title: 'Link Not Found',
        message:
          'This mint action link is invalid or has already been removed.',
        accent: '#dc2626',
      });
      return;
    }

    if (actionToken.used) {
      sendActionInfoPage(res, {
        status: 400,
        title: 'Action Already Used',
        message:
          'This mint action link has already been used and cannot be reused.',
        accent: '#f59e0b',
      });
      return;
    }

    if (actionToken.expiresAt.getTime() < Date.now()) {
      sendActionInfoPage(res, {
        status: 400,
        title: 'Action Link Expired',
        message:
          'This mint action link has expired. Ask the requester to submit a new mint request.',
        accent: '#f59e0b',
      });
      return;
    }

    const action = parseApprovalAction(actionToken.action);
    if (!action) {
      sendActionInfoPage(res, {
        status: 400,
        title: 'Invalid Action Link',
        message: 'This mint action link is malformed and cannot be processed.',
        accent: '#dc2626',
      });
      return;
    }

    if (actionToken.request.status !== 'pending') {
      sendActionInfoPage(res, {
        title: 'Request Already Reviewed',
        message: `This mint request is already ${actionToken.request.status}. No additional action was applied.`,
        accent: '#4f46e5',
        details: [
          { label: 'Request ID', value: actionToken.request.id },
          { label: 'Requester Email', value: actionToken.request.requesterEmail },
          { label: 'Current Status', value: actionToken.request.status },
        ],
      });
      return;
    }

    const confirmation = createConfirmationFormState({
      token,
      action,
      scope: 'mint',
      expiresAt: actionToken.expiresAt,
    });

    sendActionConfirmationPage(res, {
      title: action === 'approve' ? 'Confirm Mint Approval' : 'Confirm Mint Rejection',
      message:
        'Review this mint approval request below. Opening this page is safe; the request changes only after explicit confirmation.',
      action,
      formAction: `/api/mint-requests/action/${encodeURIComponent(token)}`,
      payload: confirmation.payload,
      signature: confirmation.signature,
      details: [
        { label: 'Request ID', value: actionToken.request.id },
        { label: 'Requester Email', value: actionToken.request.requesterEmail },
        { label: 'Token', value: `${actionToken.request.tokenName} (${actionToken.request.tokenSymbol})` },
        { label: 'Chain ID', value: String(actionToken.request.chainId) },
        { label: 'Mint Amount', value: `${actionToken.request.mintAmount} ${actionToken.request.currency}` },
        { label: 'Current Status', value: actionToken.request.status },
        { label: 'Requested Action', value: action === 'approve' ? 'Approve' : 'Reject' },
        { label: 'Action Link Expires', value: actionToken.expiresAt.toUTCString() },
      ],
    });
  } catch (err) {
    console.error('Mint request action error:', err);
    sendActionInfoPage(res, {
      status: 500,
      title: 'Action Failed',
      message:
        'An unexpected error occurred while loading this mint action link.',
      accent: '#dc2626',
    });
  }
});

router.post('/action/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) {
      sendActionInfoPage(res, {
        status: 400,
        title: 'Invalid Action Link',
        message: 'This approval link is missing a token.',
        accent: '#dc2626',
      });
      return;
    }

    const actionToken = await prisma.mintApprovalActionToken.findUnique({
      where: { token },
      include: { request: true },
    });

    if (!actionToken) {
      sendActionInfoPage(res, {
        status: 404,
        title: 'Link Not Found',
        message:
          'This mint action link is invalid or has already been removed.',
        accent: '#dc2626',
      });
      return;
    }

    if (actionToken.used) {
      sendActionInfoPage(res, {
        status: 400,
        title: 'Action Already Used',
        message:
          'This mint action link has already been used and cannot be reused.',
        accent: '#f59e0b',
      });
      return;
    }

    const action = parseApprovalAction(actionToken.action);
    if (!action) {
      sendActionInfoPage(res, {
        status: 400,
        title: 'Invalid Action Link',
        message: 'This mint action link is malformed and cannot be processed.',
        accent: '#dc2626',
      });
      return;
    }

    if (String(req.body?.confirm || '') !== action) {
      sendActionInfoPage(res, {
        status: 400,
        title: 'Confirmation Required',
        message: 'No action was applied because the confirmation button was not used.',
        accent: '#f59e0b',
      });
      return;
    }

    const confirmation = verifyConfirmationFormState({
      payload: String(req.body?.payload || ''),
      signature: String(req.body?.signature || ''),
      token,
      action,
      scope: 'mint',
    });

    if (!confirmation.ok) {
      sendActionInfoPage(res, {
        status: 400,
        title: confirmation.reason === 'expired' ? 'Confirmation Expired' : 'Invalid Confirmation',
        message:
          confirmation.reason === 'expired'
            ? 'This confirmation page has expired. Re-open the original email link to review the action again.'
            : 'This confirmation request is invalid or has been tampered with.',
        accent: '#dc2626',
      });
      return;
    }

    if (actionToken.expiresAt.getTime() < Date.now()) {
      sendActionInfoPage(res, {
        status: 400,
        title: 'Action Link Expired',
        message:
          'This mint action link has expired. Ask the requester to submit a new mint request.',
        accent: '#f59e0b',
      });
      return;
    }

    if (actionToken.request.status !== 'pending') {
      await prisma.mintApprovalActionToken.updateMany({
        where: {
          requestId: actionToken.requestId,
          used: false,
        },
        data: { used: true },
      });

      sendActionInfoPage(res, {
        title: 'Request Already Reviewed',
        message: `This mint request is already ${actionToken.request.status}. No additional action was applied.`,
        accent: '#4f46e5',
        details: [
          { label: 'Request ID', value: actionToken.request.id },
          { label: 'Requester Email', value: actionToken.request.requesterEmail },
          { label: 'Current Status', value: actionToken.request.status },
        ],
      });
      return;
    }

    const desiredStatus: MintRequestStatus = action === 'approve' ? 'approved' : 'rejected';

    await prisma.$transaction([
      prisma.mintApprovalActionToken.updateMany({
        where: {
          requestId: actionToken.requestId,
          used: false,
        },
        data: { used: true },
      }),
      prisma.mintApprovalRequest.update({
        where: { id: actionToken.requestId },
        data: {
          status: desiredStatus,
          reviewedAt: new Date(),
          reviewNotes:
            desiredStatus === 'approved'
              ? 'Approved via banker confirmation page.'
              : 'Rejected via banker confirmation page.',
          approvedBy: config.mintApproval.requestRecipient,
        },
      }),
    ]);

    sendActionInfoPage(res, {
      title:
        desiredStatus === 'approved'
          ? 'Mint Request Approved'
          : 'Mint Request Rejected',
      message:
        desiredStatus === 'approved'
          ? 'The user can now proceed with minting this token configuration in the app.'
          : 'The mint request was rejected. The user must update details and resubmit.',
      accent: desiredStatus === 'approved' ? '#059669' : '#dc2626',
      details: [
        { label: 'Request ID', value: actionToken.request.id },
        { label: 'Requester Email', value: actionToken.request.requesterEmail },
        { label: 'Final Status', value: desiredStatus },
      ],
    });
  } catch (err) {
    console.error('Mint request action submit error:', err);
    sendActionInfoPage(res, {
      status: 500,
      title: 'Action Failed',
      message:
        'An unexpected error occurred while processing this mint action link.',
      accent: '#dc2626',
    });
  }
});

export default router;
