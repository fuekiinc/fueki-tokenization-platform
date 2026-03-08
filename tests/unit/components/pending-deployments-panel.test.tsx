/**
 * PendingDeploymentsPanel behavior tests.
 *
 * Verifies approved deployment requests expose the right action by network and
 * non-approved requests only expose the review action.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PendingDeploymentsPanel from '../../../src/components/SecurityToken/PendingDeploymentsPanel';
import type { SecurityTokenApprovalRequestItem } from '../../../src/types/securityTokenApproval';

const switchNetworkMock = vi.fn();
const listSecurityTokenApprovalRequestsMock = vi.fn();

vi.mock('../../../src/hooks/useWallet', () => ({
  useWallet: () => ({
    isConnected: true,
    chainId: 1,
    switchNetwork: switchNetworkMock,
  }),
}));

vi.mock('../../../src/lib/api/securityTokenRequests', () => ({
  listSecurityTokenApprovalRequests: (...args: unknown[]) =>
    listSecurityTokenApprovalRequestsMock(...args),
}));

function request(
  overrides: Partial<SecurityTokenApprovalRequestItem>,
): SecurityTokenApprovalRequestItem {
  return {
    id: 'req-default',
    tokenName: 'Default Security Token',
    tokenSymbol: 'DST',
    decimals: 18,
    totalSupply: '1000000',
    maxTotalSupply: '2000000',
    lockupSeconds: 0,
    transferRestrictionsEnabled: true,
    documentHash: '0x' + '33'.repeat(32),
    chainId: 1,
    status: 'pending',
    submittedAt: new Date().toISOString(),
    reviewedAt: null,
    reviewNotes: null,
    txHash: null,
    ...overrides,
  };
}

describe('PendingDeploymentsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listSecurityTokenApprovalRequestsMock.mockResolvedValue({
      requests: [
        request({
          id: 'approved-mainnet',
          tokenName: 'Mainnet Deploy',
          status: 'approved',
          chainId: 1,
        }),
        request({
          id: 'approved-arb',
          tokenName: 'Arbitrum Deploy',
          status: 'approved',
          chainId: 42161,
        }),
        request({
          id: 'pending-review',
          tokenName: 'Pending Review',
          status: 'pending',
        }),
      ],
    });
  });

  it('renders deployment actions by status/network and triggers callbacks', async () => {
    const onSelectRequest = vi.fn();
    const user = userEvent.setup();

    render(<PendingDeploymentsPanel onSelectRequest={onSelectRequest} />);

    await waitFor(() => {
      expect(listSecurityTokenApprovalRequestsMock).toHaveBeenCalledTimes(1);
    });

    const mainnetCard = screen.getByText('Mainnet Deploy').closest('article') as HTMLElement;
    const arbCard = screen.getByText('Arbitrum Deploy').closest('article') as HTMLElement;
    const pendingCard = screen.getByText('Pending Review').closest('article') as HTMLElement;

    expect(within(mainnetCard).getByRole('button', { name: /Deploy Approved Token/i })).toBeInTheDocument();
    expect(within(arbCard).getByRole('button', { name: /Switch to Arbitrum One/i })).toBeInTheDocument();
    expect(within(pendingCard).getByRole('button', { name: /Use in Review/i })).toBeInTheDocument();
    expect(within(pendingCard).queryByRole('button', { name: /Deploy Approved Token/i })).not.toBeInTheDocument();

    await user.click(within(mainnetCard).getByRole('button', { name: /Deploy Approved Token/i }));
    expect(onSelectRequest).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'approved-mainnet', status: 'approved' }),
    );

    await user.click(within(arbCard).getByRole('button', { name: /Switch to Arbitrum One/i }));
    expect(switchNetworkMock).toHaveBeenCalledWith(42161);
  });
});
