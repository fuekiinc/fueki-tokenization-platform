import multer from 'multer';
import { config } from '../config';

const DOCUMENT_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
  'video/webm',
  'video/mp4',
  'video/quicktime',
]);

function normalizeMimeType(rawMimeType: string): string {
  return rawMimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

const BASE_UPLOAD_CONFIG = {
  storage: multer.memoryStorage(),
} as const;

export const documentUpload = multer({
  ...BASE_UPLOAD_CONFIG,
  limits: {
    fileSize: config.upload.kycMaxSize,
    files: 5,
  },
  fileFilter: (_req, file, cb) => {
    const normalizedMimeType = normalizeMimeType(file.mimetype);

    if (DOCUMENT_ALLOWED_MIME_TYPES.has(normalizedMimeType)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, PDF, MP4, MOV, and WEBM files are allowed'));
    }
  },
});

export const mintApprovalUpload = multer({
  ...BASE_UPLOAD_CONFIG,
  limits: {
    fileSize: config.upload.maxSize,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/json',
      'text/json',
      'text/csv',
      'application/csv',
      'application/vnd.ms-excel',
      'text/xml',
      'application/xml',
      'application/pdf',
      'image/png',
      'image/jpeg',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          'Unsupported document file type. Allowed: JSON, CSV, XML, PDF, PNG, JPG.',
        ),
      );
    }
  },
});
