import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, getRouteHandlers, invokeHandler } from '../helpers/routeHarness';

const mocks = vi.hoisted(() => ({
  saveEncryptedDocument: vi.fn<() => Promise<string>>(),
  uploadFields: vi.fn(),
}));

vi.mock('../../src/middleware/auth', () => ({
  authenticate: (req: Record<string, unknown>, _res: Record<string, unknown>, next: (err?: unknown) => void) => {
    req.userId = 'test-user-id';
    next();
  },
}));

vi.mock('../../src/middleware/upload', () => ({
  documentUpload: {
    fields: mocks.uploadFields,
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

const uploadRouteHandlers = getRouteHandlers(kycRoutes, 'post', '/upload-document');
const uploadMiddleware = uploadRouteHandlers[1];
const uploadDocumentHandler = uploadRouteHandlers[2];

function createFile(options: {
  buffer?: Buffer;
  contentType: string;
  fieldname: string;
  filename: string;
}) {
  return {
    buffer: options.buffer ?? Buffer.from(`${options.fieldname}-bytes`),
    fieldname: options.fieldname,
    mimetype: options.contentType,
    originalname: options.filename,
    size: (options.buffer ?? Buffer.from(`${options.fieldname}-bytes`)).length,
  };
}

describe('POST /api/kyc/upload-document', () => {
  beforeEach(() => {
    mocks.saveEncryptedDocument.mockReset();
    mocks.uploadFields.mockReset().mockReturnValue(
      (_req: Record<string, unknown>, _res: Record<string, unknown>, cb: (err?: unknown) => void) => cb(),
    );
  });

  it('uploads front/back/video and accepts video mime parameters', async () => {
    mocks.saveEncryptedDocument
      .mockResolvedValueOnce('front-document-id')
      .mockResolvedValueOnce('back-document-id')
      .mockResolvedValueOnce('live-video-id');

    const req = createMockReq({
      body: { documentType: 'drivers_license' },
      files: {
        documentFront: [createFile({
          fieldname: 'documentFront',
          filename: 'front.jpg',
          contentType: 'image/jpeg',
        })],
        documentBack: [createFile({
          fieldname: 'documentBack',
          filename: 'back.png',
          contentType: 'image/png',
        })],
        liveVideo: [createFile({
          fieldname: 'liveVideo',
          filename: 'live.webm',
          contentType: 'video/webm;codecs=vp9',
        })],
      },
      userId: 'test-user-id',
    });
    const res = createMockRes();

    await invokeHandler(uploadDocumentHandler, req, res);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).documentFront.documentId).toBe('front-document-id');
    expect((res.body as any).documentBack.documentId).toBe('back-document-id');
    expect((res.body as any).liveVideo.documentId).toBe('live-video-id');
    expect(mocks.saveEncryptedDocument).toHaveBeenCalledTimes(3);
  });

  it('returns 400 when document type is invalid', async () => {
    const req = createMockReq({
      body: { documentType: 'student_id' },
      files: {
        documentFront: [createFile({
          fieldname: 'documentFront',
          filename: 'front.jpg',
          contentType: 'image/jpeg',
        })],
        liveVideo: [createFile({
          fieldname: 'liveVideo',
          filename: 'live.webm',
          contentType: 'video/webm',
        })],
      },
      userId: 'test-user-id',
    });
    const res = createMockRes();

    await invokeHandler(uploadDocumentHandler, req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as any).error.code).toBe('INVALID_TYPE');
  });

  it('returns upload-specific 400 errors for multer file-filter failures', async () => {
    const req = createMockReq({
      __uploadControl: { error: 'filter' as const },
    });
    const res = createMockRes();

    await invokeHandler(uploadMiddleware, req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as any).error.code).toBe('UPLOAD_ERROR');
    expect((res.body as any).error.message).toContain('Only JPG, PNG, PDF, MP4, MOV, and WEBM files are allowed');
  });

  it('rejects semantically invalid live video file types', async () => {
    const req = createMockReq({
      body: { documentType: 'passport' },
      files: {
        documentFront: [createFile({
          fieldname: 'documentFront',
          filename: 'front.jpg',
          contentType: 'image/jpeg',
        })],
        liveVideo: [createFile({
          fieldname: 'liveVideo',
          filename: 'live.pdf',
          contentType: 'application/pdf',
        })],
      },
      userId: 'test-user-id',
    });
    const res = createMockRes();

    await invokeHandler(uploadDocumentHandler, req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as any).error.code).toBe('INVALID_LIVE_VIDEO_FORMAT');
  });

  it('returns a specific error when a KYC file exceeds the configured upload size', async () => {
    const req = createMockReq({
      __uploadControl: { error: 'limit' as const },
    });
    const res = createMockRes();

    await invokeHandler(uploadMiddleware, req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as any).error.code).toBe('UPLOAD_FILE_TOO_LARGE');
    expect((res.body as any).error.message).toContain('20 MB');
  });
});
