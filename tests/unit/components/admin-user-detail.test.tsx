import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminUserDetail from '../../../src/components/Admin/AdminUserDetail';

const apiMocks = vi.hoisted(() => ({
  approveKYC: vi.fn(),
  getUserDetail: vi.fn(),
  getUserKycDocument: vi.fn(),
  rejectKYC: vi.fn(),
  updateUserAccess: vi.fn(),
  updateUserRole: vi.fn(),
}));

vi.mock('../../../src/lib/api/admin', () => ({
  approveKYC: (...args: unknown[]) => apiMocks.approveKYC(...args),
  getUserDetail: (...args: unknown[]) => apiMocks.getUserDetail(...args),
  getUserKycDocument: (...args: unknown[]) => apiMocks.getUserKycDocument(...args),
  rejectKYC: (...args: unknown[]) => apiMocks.rejectKYC(...args),
  updateUserAccess: (...args: unknown[]) => apiMocks.updateUserAccess(...args),
  updateUserRole: (...args: unknown[]) => apiMocks.updateUserRole(...args),
}));

describe('AdminUserDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    apiMocks.getUserDetail.mockResolvedValue({
      id: 'user-1',
      email: 'kyc.user@example.com',
      role: 'user',
      accessRevokedAt: null,
      accessRevocationReason: null,
      walletAddress: '0x1234',
      kycStatus: 'pending',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z',
      kycData: {
        firstName: 'Avery',
        lastName: 'Stone',
        dateOfBirth: '1990-01-01',
        ssn: '***-**-6789',
        addressLine1: '123 Main St',
        addressLine2: 'Suite 200',
        city: 'Phoenix',
        state: 'AZ',
        zipCode: '85001',
        country: 'US',
        documentType: 'drivers_license',
        documentOrigName: 'front.png',
        documentBackOrigName: 'back.png',
        liveVideoOrigName: 'selfie.mov',
        submittedAt: '2026-03-03T00:00:00.000Z',
        reviewedAt: null,
        reviewNotes: null,
      },
    });

    apiMocks.getUserKycDocument.mockResolvedValue(new Blob(['front-doc']));
    vi.stubGlobal('open', vi.fn(() => ({ closed: false })));
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:kyc-document'),
      revokeObjectURL: vi.fn(),
    });
  });

  it('renders masked SSN and KYC document actions', async () => {
    render(<AdminUserDetail userId="user-1" onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('***-**-6789')).toBeInTheDocument();
    });

    expect(screen.getByText('front.png')).toBeInTheDocument();
    expect(screen.getByText('back.png')).toBeInTheDocument();
    expect(screen.getByText('selfie.mov')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Preview' })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: 'Download' })).toHaveLength(3);
  });

  it('fetches and previews a requested KYC document', async () => {
    render(<AdminUserDetail userId="user-1" onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('front.png')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Preview' })[0]);

    await waitFor(() => {
      expect(apiMocks.getUserKycDocument).toHaveBeenCalledWith('user-1', 'front');
    });

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(window.open).toHaveBeenCalledWith(
      'blob:kyc-document',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('submits a revoke access action from the admin detail panel', async () => {
    render(<AdminUserDetail userId="user-1" onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Platform access change reason')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Platform access change reason'), {
      target: { value: 'Compliance hold' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Revoke Access' }));

    await waitFor(() => {
      expect(apiMocks.updateUserAccess).toHaveBeenCalledWith(
        'user-1',
        true,
        'Compliance hold',
      );
    });
  });
});
