import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminKYCQueue from '../../../src/components/Admin/AdminKYCQueue';

const apiMocks = vi.hoisted(() => ({
  getKYCSubmissions: vi.fn(),
  getUserDetail: vi.fn(),
  approveKYC: vi.fn(),
  rejectKYC: vi.fn(),
}));

vi.mock('../../../src/lib/api/admin', () => ({
  getKYCSubmissions: (...args: unknown[]) => apiMocks.getKYCSubmissions(...args),
  getUserDetail: (...args: unknown[]) => apiMocks.getUserDetail(...args),
  approveKYC: (...args: unknown[]) => apiMocks.approveKYC(...args),
  rejectKYC: (...args: unknown[]) => apiMocks.rejectKYC(...args),
}));

describe('AdminKYCQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders an empty state instead of crashing when the user list is missing', async () => {
    apiMocks.getKYCSubmissions.mockResolvedValue({
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });

    render(<AdminKYCQueue />);

    await waitFor(() => {
      expect(screen.getByText('No KYC submissions')).toBeInTheDocument();
    });
  });
});
