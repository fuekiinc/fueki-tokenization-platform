import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchExpressRouter } from '../helpers/expressDispatch';

const mocks = vi.hoisted(() => ({
  saveEncryptedDocument: vi.fn<() => Promise<string>>(),
}));

vi.mock('../../src/middleware/auth', () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.userId = 'test-user-id';
    next();
  },
}));

vi.mock('../../src/services/kyc', () => ({
  submitKYC: vi.fn(),
  getKYCStatus: vi.fn(),
  saveEncryptedDocument: mocks.saveEncryptedDocument,
}));

vi.mock('../../src/middleware/upload', async () => {
  const multerModule = await vi.importActual<typeof import('multer')>('multer');
  const MulterError = (multerModule.default as typeof multerModule.default & {
    MulterError: new (code: string) => Error;
  }).MulterError;

  return {
    documentUpload: {
      fields:
        () =>
        (
          req: express.Request & {
            __uploadControl?: {
              error?: 'filter' | 'limit';
              files?: Record<string, Array<Record<string, unknown>>>;
            };
          },
          _res: express.Response,
          next: express.NextFunction,
        ) => {
          if (req.__uploadControl?.error === 'limit') {
            next(new MulterError('LIMIT_FILE_SIZE'));
            return;
          }

          if (req.__uploadControl?.error === 'filter') {
            next(new Error('Only JPG, PNG, PDF, MP4, MOV, and WEBM files are allowed'));
            return;
          }

          if (req.__uploadControl?.files) {
            req.files = req.__uploadControl.files as never;
          }

          next();
        },
    },
  };
});

import kycRoutes from '../../src/routes/kyc';

function makeFile(
  originalname: string,
  mimetype: string,
): {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
} {
  return {
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype,
    size: 16,
    buffer: Buffer.from(`${originalname}:${mimetype}`),
  };
}

describe('POST /api/kyc/upload-document', () => {
  beforeEach(() => {
    mocks.saveEncryptedDocument.mockReset();
  });

  it('uploads front/back/video and accepts video mime parameters', async () => {
    mocks.saveEncryptedDocument
      .mockResolvedValueOnce('front-document-id')
      .mockResolvedValueOnce('back-document-id')
      .mockResolvedValueOnce('live-video-id');

    const response = await dispatchExpressRouter(kycRoutes, {
      method: 'POST',
      url: '/upload-document',
      body: {
        documentType: 'drivers_license',
      },
      extras: {
        __uploadControl: {
          files: {
            documentFront: [makeFile('front.jpg', 'image/jpeg')],
            documentBack: [makeFile('back.png', 'image/png')],
            liveVideo: [makeFile('live.webm', 'video/webm;codecs=vp9')],
          },
        },
      },
    });

    expect(response.status).toBe(200);
    const body = response.body as {
      documentFront: { documentId: string };
      documentBack: { documentId: string };
      liveVideo: { documentId: string };
    };
    expect(body.documentFront.documentId).toBe('front-document-id');
    expect(body.documentBack.documentId).toBe('back-document-id');
    expect(body.liveVideo.documentId).toBe('live-video-id');
    expect(mocks.saveEncryptedDocument).toHaveBeenCalledTimes(3);
  });

  it('returns 400 when document type is invalid', async () => {
    const response = await dispatchExpressRouter(kycRoutes, {
      method: 'POST',
      url: '/upload-document',
      body: {
        documentType: 'student_id',
      },
      extras: {
        __uploadControl: {
          files: {
            documentFront: [makeFile('front.jpg', 'image/jpeg')],
            liveVideo: [makeFile('live.webm', 'video/webm')],
          },
        },
      },
    });

    expect(response.status).toBe(400);
    expect((response.body as { error: { code: string } }).error.code).toBe('INVALID_TYPE');
  });

  it('returns upload-specific 400 errors for multer file-filter failures', async () => {
    const response = await dispatchExpressRouter(kycRoutes, {
      method: 'POST',
      url: '/upload-document',
      body: {
        documentType: 'passport',
      },
      extras: {
        __uploadControl: {
          error: 'filter',
        },
      },
    });

    expect(response.status).toBe(400);
    const body = response.body as { error: { code: string; message: string } };
    expect(body.error.code).toBe('UPLOAD_ERROR');
    expect(body.error.message).toContain('Only JPG, PNG, PDF, MP4, MOV, and WEBM files are allowed');
  });

  it('rejects semantically invalid live video file types', async () => {
    const response = await dispatchExpressRouter(kycRoutes, {
      method: 'POST',
      url: '/upload-document',
      body: {
        documentType: 'passport',
      },
      extras: {
        __uploadControl: {
          files: {
            documentFront: [makeFile('front.jpg', 'image/jpeg')],
            liveVideo: [makeFile('live.pdf', 'application/pdf')],
          },
        },
      },
    });

    expect(response.status).toBe(400);
    expect((response.body as { error: { code: string } }).error.code).toBe('INVALID_LIVE_VIDEO_FORMAT');
  });

  it('returns a specific error when a KYC file exceeds the configured upload size', async () => {
    const response = await dispatchExpressRouter(kycRoutes, {
      method: 'POST',
      url: '/upload-document',
      body: {
        documentType: 'passport',
      },
      extras: {
        __uploadControl: {
          error: 'limit',
        },
      },
    });

    expect(response.status).toBe(400);
    const body = response.body as { error: { code: string; message: string } };
    expect(body.error.code).toBe('UPLOAD_FILE_TOO_LARGE');
    expect(body.error.message).toContain('20 MB');
  });
});
