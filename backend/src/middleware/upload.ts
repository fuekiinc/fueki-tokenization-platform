import multer from 'multer';
import { config } from '../config';

const BASE_UPLOAD_CONFIG = {
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.upload.maxSize,
  },
} as const;

export const documentUpload = multer({
  ...BASE_UPLOAD_CONFIG,
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, and PDF files are allowed'));
    }
  },
});

export const mintApprovalUpload = multer({
  ...BASE_UPLOAD_CONFIG,
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
