import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { approveKYC, rejectKYC } from '../services/kyc';

const router = Router();

// Simple admin check - in production, use proper role-based access control
// For now, check against an admin email list
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

async function requireAdmin(req: any, res: any, next: any) {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user || !ADMIN_EMAILS.includes(user.email)) {
    res.status(403).json({ error: { message: 'Admin access required', code: 'FORBIDDEN' } });
    return;
  }
  next();
}

// PUT /api/admin/kyc/:userId/approve
router.put('/kyc/:userId/approve', authenticate, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.userId as string;
    await approveKYC(userId, req.body.notes);
    res.json({ success: true, message: 'KYC approved' });
  } catch (err) {
    console.error('Approve error:', err);
    res.status(500).json({ error: { message: 'Failed to approve KYC', code: 'INTERNAL_ERROR' } });
  }
});

// PUT /api/admin/kyc/:userId/reject
router.put('/kyc/:userId/reject', authenticate, requireAdmin, async (req, res) => {
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

export default router;
