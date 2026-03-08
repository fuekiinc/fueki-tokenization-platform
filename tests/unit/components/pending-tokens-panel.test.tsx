/**
 * PendingTokensPanel behavior tests.
 *
 * Verifies action gating for approved/minted requests across networks so users
 * cannot mint already-consumed approvals and can switch chains when required.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PendingTokensPanel from '../../../src/components/Mint/PendingTokensPanel';
import type { MintApprovalRequestItem } from '../../../src/types/mintApproval';

const switchNetworkMock = vi.fn();
const listMintApprovalRequestsMock = vi.fn();

vi.mock('../../../src/hooks/useWallet', () => ({
  useWallet: () => ({
    isConnected: true,
    chainId: 1,
    switchNetwork: switchNetworkMock,
  }),
}));

vi.mock('../../../src/lib/api/mintRequests', () => ({
  listMintApprovalRequests: (...args: unknown[]) => listMintApprovalRequestsMock(...args),
}));

function request(overrides: Partial<MintApprovalRequestItem>): MintApprovalRequestItem {
  return {
    id: 'req-default',
    tokenName: 'Default Token',
    tokenSymbol: 'DFT',
    mintAmount: '1000',
    recipient: '0x0000000000000000000000000000000000000001',
    documentHash: '0x' + '11'.repeat(32),
    documentType: 'JSON',
    originalValue: '1000',
    currency: 'USD',
    chainId: 1,
    status: 'pending',
    submittedAt: new Date().toISOString(),
    reviewedAt: null,
    reviewNotes: null,
    txHash: null,
    ...overrides,
  };
}

describe('PendingTokensPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMintApprovalRequestsMock.mockResolvedValue({
      requests: [
        request({
          id: 'approved-mainnet',
          tokenName: 'Mainnet Approved',
          tokenSymbol: 'MNA',
          status: 'approved',
          chainId: 1,
        }),
        request({
          id: 'approved-arb',
          tokenName: 'Arbitrum Approved',
          tokenSymbol: 'ARB',
          status: 'approved',
          chainId: 42161,
        }),
        request({
          id: 'already-minted',
          tokenName: 'Already Minted',
          tokenSymbol: 'MNT',
          status: 'minted',
          chainId: 1,
          txHash: '0x' + '22'.repeat(32),
        }),
      ],
    });
  });

  it('shows the correct action per request status and network', async () => {
    const onSelectRequest = vi.fn();
    const user = userEvent.setup();

    render(<PendingTokensPanel onSelectRequest={onSelectRequest} />);

    await waitFor(() => {
      expect(listMintApprovalRequestsMock).toHaveBeenCalledTimes(1);
    });

    const approvedMainnetCard = screen
      .getByText('Mainnet Approved')
      .closest('article') as HTMLElement;
    const approvedArbCard = screen
      .getByText('Arbitrum Approved')
      .closest('article') as HTMLElement;
    const mintedCard = screen
      .getByText('Already Minted')
      .closest('article') as HTMLElement;

    expect(within(approvedMainnetCard).getByRole('button', { name: /Mint Approved Token/i })).toBeInTheDocument();
    expect(within(approvedArbCard).getByRole('button', { name: /Switch to Arbitrum One/i })).toBeInTheDocument();
    expect(within(mintedCard).getByRole('button', { name: /Use Details for New Request/i })).toBeInTheDocument();
    expect(within(mintedCard).queryByRole('button', { name: /Mint Approved Token/i })).not.toBeInTheDocument();

    await user.click(within(approvedMainnetCard).getByRole('button', { name: /Mint Approved Token/i }));
    expect(onSelectRequest).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'approved-mainnet', status: 'approved' }),
    );

    await user.click(within(approvedArbCard).getByRole('button', { name: /Switch to Arbitrum One/i }));
    expect(switchNetworkMock).toHaveBeenCalledWith(42161);
  });
});
