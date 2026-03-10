import { Request, Response, Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireRole } from '../middleware/rbac';
import {
  createConfirmationFormState,
  parseApprovalAction,
  sendActionConfirmationPage,
  sendActionInfoPage,
  verifyConfirmationFormState,
} from '../services/approvalActionFlow';
import { approveKYC, rejectKYC } from '../services/kyc';
import { decrypt } from '../services/encryption';
import { prisma } from '../prisma';
import { buildTokenLookupCandidates } from '../services/tokenHash';

const router = Router();

// All admin routes require at least "admin" role
const adminOnly = requireRole('admin', 'super_admin');
const superAdminOnly = requireRole('super_admin');

// ---------------------------------------------------------------------------
// GET /api/admin/stats — Dashboard statistics
// ---------------------------------------------------------------------------

router.get('/stats', adminOnly, async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      newUsersLast30Days,
      kycNotSubmitted,
      kycPending,
      kycApproved,
      kycRejected,
      totalSessions,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({
        where: { createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.user.count({ where: { kycStatus: 'not_submitted' } }),
      prisma.user.count({ where: { kycStatus: 'pending' } }),
      prisma.user.count({ where: { kycStatus: 'approved' } }),
      prisma.user.count({ where: { kycStatus: 'rejected' } }),
      prisma.session.count(),
    ]);

    // Return flat shape to match the frontend AdminStats interface.
    res.json({
      totalUsers,
      newUsersLast30Days,
      kycNotSubmitted,
      kycPending,
      kycApproved,
      kycRejected,
      totalSessions,
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: { message: 'Failed to fetch statistics', code: 'INTERNAL_ERROR' } });
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/users — Paginated user list
// ---------------------------------------------------------------------------

const userListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  role: z.string().optional(),
  kycStatus: z.string().optional(),
  sortBy: z.enum(['email', 'createdAt', 'role', 'kycStatus']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

router.get('/users', adminOnly, async (req: Request, res: Response) => {
  try {
    const params = userListSchema.parse(req.query);

    // Build where clause
    const where: Prisma.UserWhereInput = {};

    if (params.search) {
      where.email = { contains: params.search, mode: 'insensitive' };
    }

    if (params.role) {
      where.role = params.role;
    }

    if (params.kycStatus) {
      where.kycStatus = params.kycStatus;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          role: true,
          walletAddress: true,
          kycStatus: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { [params.sortBy]: params.sortOrder },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.user.count({ where }),
    ]);

    const totalPages = Math.ceil(total / params.limit);

    res.json({
      users: users.map((u) => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
      })),
      total,
      page: params.page,
      limit: params.limit,
      totalPages,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { message: err.errors[0].message, code: 'VALIDATION_ERROR' } });
      return;
    }
    console.error('Admin list users error:', err);
    res.status(500).json({ error: { message: 'Failed to fetch users', code: 'INTERNAL_ERROR' } });
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/users/:id — User detail with decrypted KYC data
// ---------------------------------------------------------------------------

router.get('/users/:id', adminOnly, async (req: Request, res: Response) => {
  try {
    const userId = req.params.id as string;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      res.status(404).json({ error: { message: 'User not found', code: 'NOT_FOUND' } });
      return;
    }

    // Fetch KYC data separately to get full typing
    const kycData = await prisma.kYCData.findUnique({
      where: { userId },
    });

    // Build response with decrypted PII for admin view
    let kycDetails: Record<string, unknown> | null = null;

    if (kycData) {
      kycDetails = {
        id: kycData.id,
        firstName: decrypt(kycData.encryptedFirstName),
        lastName: decrypt(kycData.encryptedLastName),
        dateOfBirth: decrypt(kycData.encryptedDOB),
        ssn: decrypt(kycData.encryptedSSN),
        addressLine1: decrypt(kycData.encryptedAddress1),
        addressLine2: kycData.encryptedAddress2 ? decrypt(kycData.encryptedAddress2) : null,
        city: decrypt(kycData.encryptedCity),
        state: decrypt(kycData.encryptedState),
        zipCode: decrypt(kycData.encryptedZipCode),
        country: decrypt(kycData.encryptedCountry),
        documentType: kycData.documentType,
        documentOrigName: kycData.documentOrigName,
        documentBackOrigName: kycData.documentBackOrigName,
        liveVideoOrigName: kycData.liveVideoOrigName,
        submittedAt: kycData.submittedAt.toISOString(),
        reviewedAt: kycData.reviewedAt?.toISOString() ?? null,
        reviewNotes: kycData.reviewNotes,
      };
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        walletAddress: user.walletAddress,
        kycStatus: user.kycStatus,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      kyc: kycDetails,
    });
  } catch (err) {
    console.error('Admin user detail error:', err);
    res.status(500).json({ error: { message: 'Failed to fetch user details', code: 'INTERNAL_ERROR' } });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/users/:id/role — Update user role (super_admin only)
// ---------------------------------------------------------------------------

const VALID_ROLES = ['user', 'admin', 'super_admin'] as const;

const updateRoleSchema = z.object({
  role: z.enum(VALID_ROLES),
});

// Accept both PUT and PATCH for compatibility with the frontend client.
router.put('/users/:id/role', superAdminOnly, updateUserRole);
router.patch('/users/:id/role', superAdminOnly, updateUserRole);

async function updateUserRole(req: Request, res: Response) {
  try {
    const { role } = updateRoleSchema.parse(req.body);
    const targetUserId = req.params.id as string;

    // Cannot demote yourself
    if (targetUserId === req.userId) {
      res.status(400).json({
        error: { message: 'You cannot change your own role', code: 'SELF_ROLE_CHANGE' },
      });
      return;
    }

    // Verify target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });

    if (!targetUser) {
      res.status(404).json({ error: { message: 'User not found', code: 'NOT_FOUND' } });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: { role },
      select: { id: true, email: true, role: true },
    });

    res.json({
      success: true,
      user: updated,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { message: err.errors[0].message, code: 'VALIDATION_ERROR' } });
      return;
    }
    console.error('Admin update role error:', err);
    res.status(500).json({ error: { message: 'Failed to update user role', code: 'INTERNAL_ERROR' } });
  }
}

// ---------------------------------------------------------------------------
// GET /api/admin/kyc — Paginated KYC submissions
// ---------------------------------------------------------------------------

const kycListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
});

// Accept both /kyc and /kyc/submissions for frontend compatibility.
router.get('/kyc', adminOnly, handleKycList);
router.get('/kyc/submissions', adminOnly, handleKycList);

async function handleKycList(req: Request, res: Response) {
  try {
    const params = kycListSchema.parse(req.query);

    // Filter users who have KYC data, optionally by status
    const where: Prisma.UserWhereInput = {
      kycData: { isNot: null },
    };

    if (params.status) {
      where.kycStatus = params.status;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          kycStatus: true,
          createdAt: true,
          kycData: {
            select: {
              id: true,
              documentType: true,
              submittedAt: true,
              reviewedAt: true,
              reviewNotes: true,
            },
          },
        },
        orderBy: { kycData: { submittedAt: 'desc' } },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.user.count({ where }),
    ]);

    const totalPages = Math.ceil(total / params.limit);

    res.json({
      submissions: users.map((u) => ({
        userId: u.id,
        email: u.email,
        kycStatus: u.kycStatus,
        userCreatedAt: u.createdAt.toISOString(),
        kycId: u.kycData?.id ?? null,
        documentType: u.kycData?.documentType ?? null,
        submittedAt: u.kycData?.submittedAt?.toISOString() ?? null,
        reviewedAt: u.kycData?.reviewedAt?.toISOString() ?? null,
        reviewNotes: u.kycData?.reviewNotes ?? null,
      })),
      total,
      page: params.page,
      limit: params.limit,
      totalPages,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { message: err.errors[0].message, code: 'VALIDATION_ERROR' } });
      return;
    }
    console.error('Admin list KYC error:', err);
    res.status(500).json({ error: { message: 'Failed to fetch KYC submissions', code: 'INTERNAL_ERROR' } });
  }
}

// ---------------------------------------------------------------------------
// PUT /api/admin/kyc/:userId/approve
// ---------------------------------------------------------------------------

router.put('/kyc/:userId/approve', adminOnly, async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string;
    await approveKYC(userId, req.body.notes);
    res.json({ success: true, message: 'KYC approved' });
  } catch (err) {
    console.error('Approve error:', err);
    res.status(500).json({ error: { message: 'Failed to approve KYC', code: 'INTERNAL_ERROR' } });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/admin/kyc/:userId/reject
// ---------------------------------------------------------------------------

router.put('/kyc/:userId/reject', adminOnly, async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string;
    const reason = req.body.reason || 'KYC verification failed';
    await rejectKYC(userId, reason);
    res.json({ success: true, message: 'KYC rejected' });
  } catch (err) {
    console.error('Reject error:', err);
    res.status(500).json({ error: { message: 'Failed to reject KYC', code: 'INTERNAL_ERROR' } });
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/kyc/action/:token — Read-only confirmation page
// ---------------------------------------------------------------------------

router.get('/kyc/action/:token', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const tokenCandidates = buildTokenLookupCandidates(token);

    const actionToken = await prisma.adminActionToken.findFirst({
      where: {
        OR: tokenCandidates.map((candidate) => ({
          token: candidate,
        })),
      },
    });

    if (!actionToken) {
      sendActionInfoPage(res, {
        status: 404,
        title: 'Invalid Link',
        message: 'This action link is invalid or has already been used.',
        accent: '#dc2626',
      });
      return;
    }

    if (actionToken.used) {
      sendActionInfoPage(res, {
        status: 400,
        title: 'Already Used',
        message: 'This action has already been processed.',
        accent: '#f59e0b',
      });
      return;
    }

    if (actionToken.expiresAt < new Date()) {
      sendActionInfoPage(res, {
        status: 400,
        title: 'Link Expired',
        message: 'This action link has expired. Please review the KYC submission from the admin panel.',
        accent: '#f59e0b',
      });
      return;
    }

    const action = parseApprovalAction(actionToken.action);
    if (!action) {
      sendActionInfoPage(res, {
        status: 400,
        title: 'Invalid Link',
        message: 'This action link is malformed and cannot be processed.',
        accent: '#dc2626',
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: actionToken.userId },
      select: {
        id: true,
        email: true,
        kycStatus: true,
      },
    });

    if (!user) {
      sendActionInfoPage(res, {
        status: 404,
        title: 'Applicant Not Found',
        message: 'This KYC applicant no longer exists. No action was applied.',
        accent: '#dc2626',
      });
      return;
    }

    if (user.kycStatus !== 'pending') {
      sendActionInfoPage(res, {
        title: 'KYC Already Reviewed',
        message: `This KYC submission is already ${user.kycStatus} and cannot be changed from this link.`,
        accent: '#4f46e5',
        details: [
          { label: 'Applicant Email', value: user.email },
          { label: 'Applicant ID', value: user.id },
          { label: 'Current Status', value: user.kycStatus },
        ],
      });
      return;
    }

    const confirmation = createConfirmationFormState({
      token,
      action,
      scope: 'kyc',
      expiresAt: actionToken.expiresAt,
    });

    sendActionConfirmationPage(res, {
      title: action === 'approve' ? 'Confirm KYC Approval' : 'Confirm KYC Rejection',
      message:
        'Review this pending KYC action below. Opening this page is safe; the request is only applied after explicit confirmation.',
      action,
      formAction: `/api/admin/kyc/action/${encodeURIComponent(token)}`,
      payload: confirmation.payload,
      signature: confirmation.signature,
      details: [
        { label: 'Applicant Email', value: user.email },
        { label: 'Applicant ID', value: user.id },
        { label: 'Current Status', value: user.kycStatus },
        { label: 'Requested Action', value: action === 'approve' ? 'Approve' : 'Reject' },
        { label: 'Action Link Expires', value: actionToken.expiresAt.toUTCString() },
      ],
    });
  } catch (err) {
    console.error('KYC action error:', err);
    sendActionInfoPage(res, {
      status: 500,
      title: 'Error',
      message: 'Something went wrong loading this action. Please try again or use the admin panel.',
      accent: '#dc2626',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/kyc/action/:token — Signed confirmation submit
// ---------------------------------------------------------------------------

router.post('/kyc/action/:token', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const actionToken = await prisma.adminActionToken.findUnique({
      where: { token },
    });

    if (!actionToken) {
      sendActionInfoPage(res, {
        status: 404,
        title: 'Invalid Link',
        message: 'This action link is invalid or has already been used.',
        accent: '#dc2626',
      });
      return;
    }

    if (actionToken.used) {
      sendActionInfoPage(res, {
        status: 400,
        title: 'Already Used',
        message: 'This action has already been processed.',
        accent: '#f59e0b',
      });
      return;
    }

    const action = parseApprovalAction(actionToken.action);
    if (!action) {
      sendActionInfoPage(res, {
        status: 400,
        title: 'Invalid Link',
        message: 'This action link is malformed and cannot be processed.',
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
      scope: 'kyc',
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

    if (actionToken.expiresAt < new Date()) {
      sendActionInfoPage(res, {
        status: 400,
        title: 'Link Expired',
        message: 'This action link has expired. Please review the KYC submission from the admin panel.',
        accent: '#f59e0b',
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: actionToken.userId },
      select: {
        id: true,
        email: true,
        kycStatus: true,
      },
    });

    if (!user) {
      sendActionInfoPage(res, {
        status: 404,
        title: 'Applicant Not Found',
        message: 'This KYC applicant no longer exists. No action was applied.',
        accent: '#dc2626',
      });
      return;
    }

    if (user.kycStatus !== 'pending') {
      await prisma.adminActionToken.updateMany({
        where: {
          userId: actionToken.userId,
          used: false,
        },
        data: { used: true },
      });

      sendActionInfoPage(res, {
        title: 'KYC Already Reviewed',
        message: `This KYC submission is already ${user.kycStatus}. No additional action was applied.`,
        accent: '#4f46e5',
        details: [
          { label: 'Applicant Email', value: user.email },
          { label: 'Applicant ID', value: user.id },
          { label: 'Current Status', value: user.kycStatus },
        ],
      });
      return;
    }

    if (action === 'approve') {
      await approveKYC(actionToken.userId, 'Approved via confirmation page.');
    } else {
      await rejectKYC(actionToken.userId, 'Rejected via confirmation page.');
    }

    await prisma.adminActionToken.updateMany({
      where: {
        userId: actionToken.userId,
        used: false,
      },
      data: { used: true },
    });

    sendActionInfoPage(res, {
      title: action === 'approve' ? 'KYC Approved' : 'KYC Rejected',
      message:
        action === 'approve'
          ? 'The user has been approved and can now access the platform.'
          : 'The user has been rejected. They will be notified to re-submit.',
      accent: action === 'approve' ? '#059669' : '#dc2626',
      details: [
        { label: 'Applicant Email', value: user.email },
        { label: 'Applicant ID', value: user.id },
        { label: 'Final Status', value: action === 'approve' ? 'approved' : 'rejected' },
      ],
    });
  } catch (err) {
    console.error('KYC action submit error:', err);
    sendActionInfoPage(res, {
      status: 500,
      title: 'Action Failed',
      message: 'Something went wrong processing this action. Please try again or use the admin panel.',
      accent: '#dc2626',
    });
  }
});

export default router;
