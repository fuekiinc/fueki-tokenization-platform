import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import kycRoutes from '../../src/routes/kyc';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/kyc', kycRoutes);
  app.use((_err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
  });
  return app;
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

    const app = createApp();
    const response = await request(app)
      .post('/api/kyc/upload-document')
      .field('documentType', 'drivers_license')
      .attach('documentFront', Buffer.from('front-image-bytes'), {
        filename: 'front.jpg',
        contentType: 'image/jpeg',
      })
      .attach('documentBack', Buffer.from('back-image-bytes'), {
        filename: 'back.png',
        contentType: 'image/png',
      })
      .attach('liveVideo', Buffer.from('live-video-bytes'), {
        filename: 'live.webm',
        contentType: 'video/webm;codecs=vp9',
      });

    expect(response.status).toBe(200);
    expect(response.body.documentFront.documentId).toBe('front-document-id');
    expect(response.body.documentBack.documentId).toBe('back-document-id');
    expect(response.body.liveVideo.documentId).toBe('live-video-id');
    expect(mocks.saveEncryptedDocument).toHaveBeenCalledTimes(3);
  });

  it('returns 400 when document type is invalid', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/api/kyc/upload-document')
      .field('documentType', 'student_id')
      .attach('documentFront', Buffer.from('front-image-bytes'), {
        filename: 'front.jpg',
        contentType: 'image/jpeg',
      })
      .attach('liveVideo', Buffer.from('live-video-bytes'), {
        filename: 'live.webm',
        contentType: 'video/webm',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_TYPE');
  });

  it('returns upload-specific 400 errors for multer file-filter failures', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/api/kyc/upload-document')
      .field('documentType', 'passport')
      .attach('documentFront', Buffer.from('not-an-image'), {
        filename: 'front.txt',
        contentType: 'text/plain',
      })
      .attach('liveVideo', Buffer.from('live-video-bytes'), {
        filename: 'live.webm',
        contentType: 'video/webm',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('UPLOAD_ERROR');
    expect(response.body.error.message).toContain('Only JPG, PNG, PDF, MP4, MOV, and WEBM files are allowed');
  });

  it('rejects semantically invalid live video file types', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/api/kyc/upload-document')
      .field('documentType', 'passport')
      .attach('documentFront', Buffer.from('front-image-bytes'), {
        filename: 'front.jpg',
        contentType: 'image/jpeg',
      })
      .attach('liveVideo', Buffer.from('pdf-bytes'), {
        filename: 'live.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_LIVE_VIDEO_FORMAT');
  });
});
