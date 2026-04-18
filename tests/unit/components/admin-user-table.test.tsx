import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminUserTable from '../../../src/components/Admin/AdminUserTable';

const apiMocks = vi.hoisted(() => ({
  getUsers: vi.fn(),
  updateUserRole: vi.fn(),
}));

vi.mock('../../../src/lib/api/admin', () => ({
  getUsers: (...args: unknown[]) => apiMocks.getUsers(...args),
  updateUserRole: (...args: unknown[]) => apiMocks.updateUserRole(...args),
}));

vi.mock('../../../src/components/Admin/AdminUserDetail', () => ({
  default: () => null,
}));

describe('AdminUserTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders an empty state instead of crashing when the user list is missing', async () => {
    apiMocks.getUsers.mockResolvedValue({
      total: 0,
      page: 1,
      limit: 15,
      totalPages: 0,
    });

    render(<AdminUserTable />);

    await waitFor(() => {
      expect(screen.getByText('No users found')).toBeInTheDocument();
    });
  });

  it('ignores malformed user rows instead of crashing the admin user table', async () => {
    apiMocks.getUsers.mockResolvedValue({
      users: [
        {
          id: 'user-1',
          email: 'mark@fueki-tech.com',
          role: 'admin',
          kycStatus: 'approved',
          walletAddress: null,
          walletConnectionCount: 0,
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
      total: 3,
      page: 1,
      limit: 15,
      totalPages: 1,
    });

    render(<AdminUserTable />);

    await waitFor(() => {
      expect(screen.getByText('mark@fueki-tech.com')).toBeInTheDocument();
    });

    expect(screen.queryByText('broken@fueki-tech.com')).not.toBeInTheDocument();
  });

  it('shows linked wallet counts in the wallet column', async () => {
    apiMocks.getUsers.mockResolvedValue({
      users: [
        {
          id: 'user-1',
          email: 'wallets@fueki-tech.com',
          role: 'user',
          kycStatus: 'approved',
          walletAddress: '0x1111111111111111111111111111111111111111',
          walletConnectionCount: 2,
          walletConnections: [],
          createdAt: '2026-03-18T00:00:00.000Z',
          updatedAt: '2026-03-18T01:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 15,
      totalPages: 1,
    });

    render(<AdminUserTable />);

    await waitFor(() => {
      expect(screen.getByText('wallets@fueki-tech.com')).toBeInTheDocument();
    });

    expect(screen.getByText('2 linked wallets')).toBeInTheDocument();
  });
});
