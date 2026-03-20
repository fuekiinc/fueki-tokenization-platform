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

import { getKYCSubmissions, getUserDetail } from '../../../src/lib/api/admin';

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
          kycStatus: 'approved',
          walletAddress: null,
          createdAt: '2026-03-18T00:00:00.000Z',
          updatedAt: '2026-03-18T01:00:00.000Z',
        },
        kyc: {
          firstName: 'Mark',
          lastName: 'Fueki',
          dateOfBirth: '1990-01-01',
          city: 'Phoenix',
          state: 'AZ',
          country: 'US',
          documentType: 'drivers_license',
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
      kycData: expect.objectContaining({
        documentType: 'drivers_license',
      }),
    });
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
          kycStatus: 'pending',
          walletAddress: null,
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
});
