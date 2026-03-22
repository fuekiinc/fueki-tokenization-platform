import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, getRouteHandlers, invokeHandler } from '../helpers/routeHarness';

const mocks = vi.hoisted(() => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    kYCData: {
      findUnique: vi.fn(),
    },
  },
  decrypt: vi.fn(),
  readEncryptedDocument: vi.fn(),
  approveKYC: vi.fn(),
  rejectKYC: vi.fn(),
  buildTokenLookupCandidates: vi.fn((token: string) => [token]),
}));

vi.mock('../../src/middleware/rbac', () => ({
  requireRole:
    () =>
    (req: Record<string, unknown>, _res: Record<string, unknown>, next: (err?: unknown) => void) => {
      req.userId = 'admin-user-id';
      next();
    },
}));

vi.mock('../../src/prisma', () => ({
  prisma: mocks.prisma,
}));

vi.mock('../../src/services/encryption', () => ({
  decrypt: mocks.decrypt,
}));

vi.mock('../../src/services/storage', () => ({
  readEncryptedDocument: mocks.readEncryptedDocument,
}));

vi.mock('../../src/services/kyc', () => ({
  approveKYC: mocks.approveKYC,
  rejectKYC: mocks.rejectKYC,
}));

vi.mock('../../src/services/tokenHash', () => ({
  buildTokenLookupCandidates: mocks.buildTokenLookupCandidates,
}));

import adminRoutes from '../../src/routes/admin';

const [, userDetailHandler] = getRouteHandlers(adminRoutes, 'get', '/users/:id');
const [, userDocumentHandler] = getRouteHandlers(
  adminRoutes,
  'get',
  '/users/:id/kyc-documents/:documentKind',
);

describe('GET /api/admin/users/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'target-user-id',
      email: 'kyc.user@example.com',
      role: 'user',
      walletAddress: '0x1234',
      kycStatus: 'pending',
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-02T00:00:00.000Z'),
    });

    mocks.prisma.kYCData.findUnique.mockResolvedValue({
      id: 'kyc-data-id',
      userId: 'target-user-id',
      encryptedFirstName: 'first-name-cipher',
      encryptedLastName: 'last-name-cipher',
      encryptedDOB: 'dob-cipher',
      encryptedSSN: 'ssn-cipher',
      encryptedAddress1: 'address1-cipher',
      encryptedAddress2: null,
      encryptedCity: 'city-cipher',
      encryptedState: 'state-cipher',
      encryptedZipCode: 'zip-cipher',
      encryptedCountry: 'country-cipher',
      documentType: 'passport',
      documentOrigName: 'passport.pdf',
      documentBackOrigName: null,
      liveVideoOrigName: 'selfie.mov',
      submittedAt: new Date('2026-03-03T00:00:00.000Z'),
      reviewedAt: null,
      reviewNotes: null,
    });

    mocks.decrypt.mockImplementation((value: string) => {
      switch (value) {
        case 'first-name-cipher':
          return 'Avery';
        case 'last-name-cipher':
          return 'Stone';
        case 'dob-cipher':
          return '1990-01-01';
        case 'ssn-cipher':
          return '123456789';
        case 'address1-cipher':
          return '123 Main St';
        case 'city-cipher':
          return 'Phoenix';
        case 'state-cipher':
          return 'AZ';
        case 'zip-cipher':
          return '85001';
        case 'country-cipher':
          return 'USA';
        default:
          throw new Error(`Unexpected encrypted value: ${value}`);
      }
    });

    mocks.readEncryptedDocument.mockResolvedValue(Buffer.from('%PDF-1.7'));
  });

  it('returns masked PII for valid KYC records', async () => {
    const req = createMockReq({
      params: { id: 'target-user-id' },
      userId: 'admin-user-id',
    });
    const res = createMockRes();

    await invokeHandler(userDetailHandler, req, res);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).kyc.ssn).toBe('***-**-6789');
    expect((res.body as any).kyc.firstName).toBe('Avery');
    expect((res.body as any).kyc.documentOrigName).toBe('passport.pdf');
  });

  it('returns degraded KYC details instead of 500 when one field cannot be decrypted', async () => {
    mocks.decrypt.mockImplementation((value: string) => {
      if (value === 'first-name-cipher') {
        throw new Error('Unsupported state or unable to authenticate data');
      }

      if (value === 'ssn-cipher') {
        return '123456789';
      }

      switch (value) {
        case 'last-name-cipher':
          return 'Stone';
        case 'dob-cipher':
          return '1990-01-01';
        case 'address1-cipher':
          return '123 Main St';
        case 'city-cipher':
          return 'Phoenix';
        case 'state-cipher':
          return 'AZ';
        case 'zip-cipher':
          return '85001';
        case 'country-cipher':
          return 'USA';
        default:
          throw new Error(`Unexpected encrypted value: ${value}`);
      }
    });

    const req = createMockReq({
      params: { id: 'target-user-id' },
      userId: 'admin-user-id',
    });
    const res = createMockRes();

    await invokeHandler(userDetailHandler, req, res);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).kyc.firstName).toBe('Unavailable');
    expect((res.body as any).kyc.lastName).toBe('Stone');
    expect((res.body as any).kyc.ssn).toBe('***-**-6789');
  });

  it('streams the requested KYC front document for admins', async () => {
    const req = createMockReq({
      params: { id: '89f3e687-9787-4c6c-8e39-d39db9b5eda2', documentKind: 'front' },
      userId: 'admin-user-id',
    });
    const res = createMockRes();

    mocks.prisma.kYCData.findUnique.mockResolvedValueOnce({
      id: 'kyc-data-id',
      documentPath: 'gs://bucket/kyc-documents/89f3e687-9787-4c6c-8e39-d39db9b5eda2/front.enc',
      documentOrigName: 'passport.pdf',
      documentMimeType: 'application/pdf',
      documentBackPath: null,
      documentBackOrigName: null,
      documentBackMimeType: null,
      liveVideoPath: null,
      liveVideoOrigName: null,
      liveVideoMimeType: null,
    });

    await invokeHandler(userDocumentHandler, req, res);

    expect(mocks.readEncryptedDocument).toHaveBeenCalledWith(
      'gs://bucket/kyc-documents/89f3e687-9787-4c6c-8e39-d39db9b5eda2/front.enc',
      '89f3e687-9787-4c6c-8e39-d39db9b5eda2',
    );
    expect(res.statusCode).toBe(200);
    expect(res.sentType).toBe('send');
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe('inline; filename="passport.pdf"');
    expect(res.body).toEqual(Buffer.from('%PDF-1.7'));
  });

  it('returns 404 when the requested KYC document does not exist', async () => {
    const req = createMockReq({
      params: { id: '89f3e687-9787-4c6c-8e39-d39db9b5eda2', documentKind: 'back' },
      userId: 'admin-user-id',
    });
    const res = createMockRes();

    mocks.prisma.kYCData.findUnique.mockResolvedValueOnce({
      id: 'kyc-data-id',
      documentPath: 'gs://bucket/kyc-documents/89f3e687-9787-4c6c-8e39-d39db9b5eda2/front.enc',
      documentOrigName: 'passport.pdf',
      documentMimeType: 'application/pdf',
      documentBackPath: null,
      documentBackOrigName: null,
      documentBackMimeType: null,
      liveVideoPath: null,
      liveVideoOrigName: null,
      liveVideoMimeType: null,
    });

    await invokeHandler(userDocumentHandler, req, res);

    expect(res.statusCode).toBe(404);
    expect((res.body as any).error.code).toBe('NOT_FOUND');
    expect(mocks.readEncryptedDocument).not.toHaveBeenCalled();
  });
});
