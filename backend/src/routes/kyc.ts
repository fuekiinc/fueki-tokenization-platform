import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { documentUpload } from '../middleware/upload';
import { getKYCStatus, saveEncryptedDocument, submitKYC } from '../services/kyc';

const router = Router();

const VALID_DOC_TYPES = ['drivers_license', 'passport', 'national_id'] as const;
const VALID_SUBSCRIPTION_PLANS = [
  'monthly',
  'annual',
  'full_service',
  'contract_deployment_monthly',
  'contract_deployment_annual',
  'contract_deployment_white_glove',
] as const;

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png']);
const VIDEO_MIME_TYPES = new Set(['video/webm', 'video/mp4', 'video/quicktime']);

function normalizeMimeType(rawMimeType: string): string {
  return rawMimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

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
  documentPath: z.string().min(1),
  documentOrigName: z.string().min(1),
  documentMimeType: z.string().min(1).optional(),
  documentBackPath: z.string().min(1).optional(),
  documentBackOrigName: z.string().min(1).optional(),
  documentBackMimeType: z.string().min(1).optional(),
  liveVideoPath: z.string().min(1),
  liveVideoOrigName: z.string().min(1),
  liveVideoMimeType: z.string().min(1).optional(),
  subscriptionPlan: z.enum(VALID_SUBSCRIPTION_PLANS),
}).superRefine((data, ctx) => {
  if (data.documentType === 'drivers_license') {
    if (!data.documentBackPath) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['documentBackPath'],
        message: 'Driver license back photo is required',
      });
    }
    if (!data.documentBackOrigName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['documentBackOrigName'],
        message: 'Driver license back filename is required',
      });
    }
  }
});

// POST /api/kyc/submit
router.post('/submit', authenticate, async (req, res) => {
  try {
    const data = kycSchema.parse(req.body);

    await submitKYC({
      userId: req.userId!,
      ...data,
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
// Accept files on fields:
// - documentFront (required)
// - documentBack (required for drivers_license)
// - liveVideo (required)
// Backward compatibility:
// - document or file can still be used as documentFront.
router.post(
  '/upload-document',
  authenticate,
  (req, res, next) => {
    documentUpload.fields([
      { name: 'documentFront', maxCount: 1 },
      { name: 'documentBack', maxCount: 1 },
      { name: 'liveVideo', maxCount: 1 },
      { name: 'document', maxCount: 1 },
      { name: 'file', maxCount: 1 },
    ])(req, res, (err) => {
      if (!err) {
        next();
        return;
      }

      if (err instanceof multer.MulterError) {
        res.status(400).json({
          error: {
            message: `Upload failed: ${err.message}`,
            code: 'UPLOAD_ERROR',
          },
        });
        return;
      }

      if (err instanceof Error) {
        res.status(400).json({
          error: {
            message: err.message,
            code: 'UPLOAD_ERROR',
          },
        });
        return;
      }

      next(err);
    });
  },
  async (req, res) => {
    try {
      const files = req.files as { [field: string]: Express.Multer.File[] } | undefined;
      const documentFront = files?.documentFront?.[0] ?? files?.document?.[0] ?? files?.file?.[0];
      const documentBack = files?.documentBack?.[0];
      const liveVideo = files?.liveVideo?.[0];

      const parsedDocumentType = z.enum(VALID_DOC_TYPES).safeParse(req.body.documentType);
      if (!parsedDocumentType.success) {
        res.status(400).json({ error: { message: 'Invalid document type', code: 'INVALID_TYPE' } });
        return;
      }
      const documentType = parsedDocumentType.data;

      if (!documentFront) {
        res.status(400).json({ error: { message: 'Missing document front image', code: 'MISSING_DOCUMENT_FRONT' } });
        return;
      }
      if (!IMAGE_MIME_TYPES.has(normalizeMimeType(documentFront.mimetype))) {
        res.status(400).json({ error: { message: 'Document front must be a JPG or PNG image', code: 'INVALID_DOCUMENT_FRONT_FORMAT' } });
        return;
      }

      if (documentType === 'drivers_license' && !documentBack) {
        res.status(400).json({ error: { message: 'Missing driver license back image', code: 'MISSING_DOCUMENT_BACK' } });
        return;
      }
      if (documentBack && !IMAGE_MIME_TYPES.has(normalizeMimeType(documentBack.mimetype))) {
        res.status(400).json({ error: { message: 'Document back must be a JPG or PNG image', code: 'INVALID_DOCUMENT_BACK_FORMAT' } });
        return;
      }

      if (!liveVideo) {
        res.status(400).json({ error: { message: 'Missing live scan video', code: 'MISSING_LIVE_VIDEO' } });
        return;
      }
      if (!VIDEO_MIME_TYPES.has(normalizeMimeType(liveVideo.mimetype))) {
        res.status(400).json({ error: { message: 'Live scan must be a WEBM, MP4, or MOV video', code: 'INVALID_LIVE_VIDEO_FORMAT' } });
        return;
      }

      const [documentFrontPath, documentBackPath, liveVideoPath] = await Promise.all([
        saveEncryptedDocument(documentFront, req.userId!),
        documentBack ? saveEncryptedDocument(documentBack, req.userId!) : Promise.resolve<string | null>(null),
        saveEncryptedDocument(liveVideo, req.userId!),
      ]);

      const uploadedAt = new Date().toISOString();

      res.json({
        documentFront: {
          documentId: documentFrontPath,
          fileName: documentFront.originalname,
          mimeType: documentFront.mimetype,
          uploadedAt,
        },
        documentBack: documentBackPath && documentBack
          ? {
            documentId: documentBackPath,
            fileName: documentBack.originalname,
            mimeType: documentBack.mimetype,
            uploadedAt,
          }
          : undefined,
        liveVideo: {
          documentId: liveVideoPath,
          fileName: liveVideo.originalname,
          mimeType: liveVideo.mimetype,
          uploadedAt,
        },
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
