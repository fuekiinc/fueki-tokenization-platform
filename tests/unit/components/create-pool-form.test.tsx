/**
 * CreatePoolForm component tests.
 *
 * Verifies indexed token loading, token selection, and wizard progression.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import CreatePoolForm from '../../../src/components/OrbitalAMM/CreatePoolForm';

vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
    loading: vi.fn(),
  },
}));

function buildService() {
  return {
    getTokenInfo: vi.fn().mockImplementation(async (address: string) => {
      if (address.toLowerCase().endsWith('1')) {
        return { symbol: 'USDC', name: 'USD Coin' };
      }
      return { symbol: 'DAI', name: 'Dai Stablecoin' };
    }),
    getTokenBalance: vi.fn().mockResolvedValue(1_000n * 10n ** 18n),
    approveRouter: vi.fn().mockResolvedValue({ hash: '0xapprove' }),
    createPoolAndAddLiquidity: vi.fn().mockResolvedValue({ hash: '0xcreate' }),
    getPool: vi.fn().mockResolvedValue('0x0000000000000000000000000000000000000C01'),
  };
}

describe('CreatePoolForm', () => {
  it('loads available tokens and advances wizard after valid token selection', async () => {
    const service = buildService();

    render(
      <MemoryRouter>
        <CreatePoolForm
          contractService={service as never}
          userAddress="0x00000000000000000000000000000000000000A1"
          tokenAddresses={[
            '0x0000000000000000000000000000000000000001',
            '0x0000000000000000000000000000000000000002',
          ]}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(service.getTokenInfo).toHaveBeenCalledTimes(2);
      expect(service.getTokenBalance).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole('button', { name: /Add Token/i }));
    fireEvent.click(screen.getByRole('button', { name: /USDC/i }));

    fireEvent.click(screen.getByRole('button', { name: /Add Token/i }));
    fireEvent.click(screen.getByRole('button', { name: /DAI/i }));

    expect(screen.getByText(/Pool Tokens \(2\/8\)/i)).toBeInTheDocument();

    const nextButton = screen.getByRole('button', { name: /Next: Configuration/i });
    expect(nextButton).toBeEnabled();

    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText(/Concentration Power/i)).toBeInTheDocument();
      expect(screen.getByText(/Fee Tier/i)).toBeInTheDocument();
    });
  });
});
