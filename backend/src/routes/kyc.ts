import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { documentUpload } from '../middleware/upload';
import { submitKYC, getKYCStatus, saveEncryptedDocument } from '../services/kyc';

const router = Router();

const VALID_DOC_TYPES = ['drivers_license', 'passport', 'national_id'] as const;

const kycSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.string().min(1),
  ssn: z.string().regex(/^\d{3}-?\d{2}-?\d{4}$/),
  addressLine1: z.string().min(1),
  addressLine2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  zipCode: z.string().min(1),
  country: z.string().min(1),
  documentType: z.enum(VALID_DOC_TYPES),
});

// POST /api/kyc/submit
router.post('/submit', authenticate, async (req, res) => {
  try {
    const data = kycSchema.parse(req.body);

    await submitKYC({
      userId: req.userId!,
      ...data,
      documentPath: req.body.documentPath || '',
      documentOrigName: req.body.documentOrigName || '',
    });

    res.json({
      success: true,
      kycStatus: 'pending',
      message: 'Your KYC application has been submitted for review.',
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { message: err.errors[0].message, code: 'VALIDATION_ERROR' } });
      return;
    }
    console.error('KYC submit error:', err);
    res.status(500).json({ error: { message: 'Failed to submit KYC', code: 'INTERNAL_ERROR' } });
  }
});

// POST /api/kyc/upload-document
// Accept file on field "document" or "file" (older frontends may use "file")
router.post(
  '/upload-document',
  authenticate,
  documentUpload.fields([
    { name: 'document', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const files = req.files as { [field: string]: Express.Multer.File[] } | undefined;
      const file = files?.document?.[0] ?? files?.file?.[0];

      if (!file) {
        res.status(400).json({ error: { message: 'No file uploaded', code: 'NO_FILE' } });
        return;
      }

      const documentType = req.body.documentType;
      if (!documentType || !VALID_DOC_TYPES.includes(documentType)) {
        res.status(400).json({ error: { message: 'Invalid document type', code: 'INVALID_TYPE' } });
        return;
      }

      const filePath = await saveEncryptedDocument(file, req.userId!);

      res.json({
        documentId: filePath,
        fileName: file.originalname,
        uploadedAt: new Date().toISOString(),
      });
    } catch (err) {
      if (err instanceof multer.MulterError) {
        console.error('Multer error:', err);
        res.status(400).json({ error: { message: `Upload failed: ${err.message}`, code: 'UPLOAD_ERROR' } });
        return;
      }
      console.error('Upload error:', err);
      res.status(500).json({ error: { message: 'Failed to upload document', code: 'INTERNAL_ERROR' } });
    }
  },
);

// GET /api/kyc/status
router.get('/status', authenticate, async (req, res) => {
  try {
    const status = await getKYCStatus(req.userId!);
    res.json(status);
  } catch (err) {
    console.error('KYC status error:', err);
    res.status(500).json({ error: { message: 'Failed to get KYC status', code: 'INTERNAL_ERROR' } });
  }
});

export default router;
