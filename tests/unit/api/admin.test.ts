import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getMock, putMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
}));

vi.mock('../../../src/lib/api/client', () => ({
  default: {
    get: getMock,
    put: putMock,
  },
}));

import {
  getKYCSubmissions,
  getUserDetail,
  getUserKycDocument,
  getUsers,
  updateUserAccess,
} from '../../../src/lib/api/admin';

describe('admin API adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes backend user detail payloads into the frontend UserDetail shape', async () => {
    getMock.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'mark@fueki-tech.com',
          role: 'super_admin',
          accessRevokedAt: null,
          accessRevocationReason: null,
          kycStatus: 'approved',
          walletAddress: null,
          walletConnectionCount: 2,
          walletConnections: [
            {
              walletAddress: '0x1111',
              firstConnectedAt: '2026-03-10T00:00:00.000Z',
              lastConnectedAt: '2026-03-18T00:00:00.000Z',
              connectionCount: 2,
              isCurrent: false,
            },
            {
              walletAddress: '0x2222',
              firstConnectedAt: '2026-03-19T00:00:00.000Z',
              lastConnectedAt: '2026-03-20T00:00:00.000Z',
              connectionCount: 1,
              isCurrent: true,
            },
          ],
          createdAt: '2026-03-18T00:00:00.000Z',
          updatedAt: '2026-03-18T01:00:00.000Z',
        },
        kyc: {
          firstName: 'Mark',
          lastName: 'Fueki',
          dateOfBirth: '1990-01-01',
          ssn: '***-**-6789',
          addressLine1: '123 Main St',
          addressLine2: 'Suite 100',
          city: 'Phoenix',
          state: 'AZ',
          zipCode: '85001',
          country: 'US',
          documentType: 'drivers_license',
          documentOrigName: 'front.png',
          documentBackOrigName: 'back.png',
          liveVideoOrigName: 'selfie.mov',
          submittedAt: '2026-03-18T00:30:00.000Z',
          reviewedAt: null,
          reviewNotes: null,
        },
      },
    });

    const result = await getUserDetail('user-1');

    expect(getMock).toHaveBeenCalledWith('/api/admin/users/user-1');
    expect(result).toMatchObject({
      id: 'user-1',
      email: 'mark@fueki-tech.com',
      role: 'super_admin',
      accessRevokedAt: null,
      walletConnectionCount: 2,
      walletConnections: [
        expect.objectContaining({
          walletAddress: '0x1111',
          connectionCount: 2,
          isCurrent: false,
        }),
        expect.objectContaining({
          walletAddress: '0x2222',
          connectionCount: 1,
          isCurrent: true,
        }),
      ],
      kycData: expect.objectContaining({
        ssn: '***-**-6789',
        documentType: 'drivers_license',
        documentOrigName: 'front.png',
        liveVideoOrigName: 'selfie.mov',
      }),
    });
  });

  it('requests admin KYC documents as blobs', async () => {
    const blob = new Blob(['kyc-doc']);
    getMock.mockResolvedValue({ data: blob });

    const result = await getUserKycDocument('user-1', 'front');

    expect(getMock).toHaveBeenCalledWith(
      '/api/admin/users/user-1/kyc-documents/front',
      { responseType: 'blob' },
    );
    expect(result).toBe(blob);
  });

  it('normalizes backend KYC submissions into the queue user list shape', async () => {
    getMock.mockResolvedValue({
      data: {
        submissions: [
          {
            userId: 'user-1',
            email: 'mark@fueki-tech.com',
            kycStatus: 'pending',
            userCreatedAt: '2026-03-01T00:00:00.000Z',
            submittedAt: '2026-03-18T00:30:00.000Z',
            reviewedAt: null,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    });

    const result = await getKYCSubmissions({ page: 1, status: 'pending' });

    expect(getMock).toHaveBeenCalledWith('/api/admin/kyc/submissions', {
      params: { page: 1, status: 'pending' },
    });
    expect(result).toEqual({
      users: [
        {
          id: 'user-1',
          email: 'mark@fueki-tech.com',
          role: 'user',
          accessRevokedAt: null,
          accessRevocationReason: null,
          kycStatus: 'pending',
          walletAddress: null,
          walletConnectionCount: 0,
          walletConnections: [],
          createdAt: '2026-03-18T00:30:00.000Z',
          updatedAt: '2026-03-18T00:30:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
  });

  it('falls back safely when the backend omits the submissions array', async () => {
    getMock.mockResolvedValue({
      data: {
        total: 0,
        page: 2,
        limit: 50,
        totalPages: 0,
      },
    });

    const result = await getKYCSubmissions({ page: 2, status: 'pending' });

    expect(result).toEqual({
      users: [],
      total: 0,
      page: 2,
      limit: 50,
      totalPages: 0,
    });
  });

  it('drops malformed user rows when the admin users payload is incomplete', async () => {
    getMock.mockResolvedValue({
      data: {
        users: [
          {
            id: 'user-1',
            email: 'mark@fueki-tech.com',
            role: 'admin',
            accessRevokedAt: '2026-03-18T02:00:00.000Z',
            accessRevocationReason: 'Compliance review',
            kycStatus: 'approved',
            walletAddress: null,
            walletConnectionCount: 3,
            walletConnections: [],
            createdAt: '2026-03-18T00:00:00.000Z',
            updatedAt: '2026-03-18T01:00:00.000Z',
          },
          {
            id: 'user-2',
            email: 'broken@fueki-tech.com',
          },
          null,
        ],
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    });

    const result = await getUsers({ page: 1, limit: 20 });

    expect(result).toEqual({
      users: [
        {
          id: 'user-1',
          email: 'mark@fueki-tech.com',
          role: 'admin',
          accessRevokedAt: '2026-03-18T02:00:00.000Z',
          accessRevocationReason: 'Compliance review',
          kycStatus: 'approved',
          walletAddress: null,
          walletConnectionCount: 3,
          walletConnections: [],
          createdAt: '2026-03-18T00:00:00.000Z',
          updatedAt: '2026-03-18T01:00:00.000Z',
        },
      ],
      total: 2,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
  });

  it('sends platform access updates through the admin endpoint', async () => {
    putMock.mockResolvedValue({ data: { success: true } });

    await updateUserAccess('user-1', true, 'Compliance hold');

    expect(putMock).toHaveBeenCalledWith('/api/admin/users/user-1/access', {
      revoked: true,
      reason: 'Compliance hold',
    });
  });
});
