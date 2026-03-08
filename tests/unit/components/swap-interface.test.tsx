/**
 * SwapInterface component tests.
 *
 * Verifies pool loading, quote refresh flow, and high-impact warning rendering.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import SwapInterface from '../../../src/components/OrbitalAMM/SwapInterface';

vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
    loading: vi.fn(),
  },
}));

function buildService() {
  return {
    getAllPools: vi.fn().mockResolvedValue(['0x0000000000000000000000000000000000000A01']),
    getPoolInfo: vi.fn().mockResolvedValue({
      address: '0x0000000000000000000000000000000000000A01',
      name: 'USDC / DAI Orbital',
      symbol: 'ORB-LP',
      tokens: [
        '0x0000000000000000000000000000000000000B01',
        '0x0000000000000000000000000000000000000B02',
      ],
      reserves: [1_000_000n * 10n ** 18n, 1_000_000n * 10n ** 18n],
      concentration: 4,
      swapFeeBps: 30n,
      totalSupply: 10_000n * 10n ** 18n,
      invariant: 1n,
    }),
    getTokenInfo: vi
      .fn()
      .mockImplementation(async (addr: string) =>
        addr.endsWith('1') ? { symbol: 'USDC' } : { symbol: 'DAI' },
      ),
    getTokenBalance: vi.fn().mockResolvedValue(10_000n * 10n ** 18n),
    getSpotPrice: vi.fn().mockResolvedValue(1n * 10n ** 18n),
    getPoolAmountOut: vi.fn().mockResolvedValue({
      amountOut: 4n * 10n ** 18n,
      feeAmount: 3n * 10n ** 16n,
    }),
    getRouterAddress: vi.fn().mockReturnValue('0x0000000000000000000000000000000000000F01'),
    getTokenAllowance: vi.fn().mockResolvedValue(1_000_000n * 10n ** 18n),
    approveRouter: vi.fn().mockResolvedValue({ hash: '0xapprove' }),
    swap: vi.fn().mockResolvedValue({ hash: '0xswap' }),
    waitForTransaction: vi.fn().mockResolvedValue({ status: 1 }),
  };
}

describe('SwapInterface', () => {
  it('loads pools and renders swap details after amount input', async () => {
    const service = buildService();

    render(
      <MemoryRouter>
        <SwapInterface
          contractService={service as never}
          userAddress="0x00000000000000000000000000000000000000A1"
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(service.getAllPools).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: /choose a pool/i }));
    fireEvent.click(screen.getByRole('button', { name: /USDC \/ DAI Orbital/i }));

    const amountInput = screen.getByPlaceholderText('0.0');
    fireEvent.change(amountInput, { target: { value: '10' } });

    await waitFor(() => {
      expect(service.getPoolAmountOut).toHaveBeenCalled();
      expect(screen.getAllByText(/Price Impact/i).length).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: /Review High-Impact Swap/i })).toBeInTheDocument();
    });

    expect(screen.getByText(/Very high price impact/i)).toBeInTheDocument();
  });

  it('allows confirming a high-impact swap after review', async () => {
    const service = buildService();

    render(
      <MemoryRouter>
        <SwapInterface
          contractService={service as never}
          userAddress="0x00000000000000000000000000000000000000A1"
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(service.getAllPools).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: /choose a pool/i }));
    fireEvent.click(screen.getByRole('button', { name: /USDC \/ DAI Orbital/i }));

    fireEvent.change(screen.getByPlaceholderText('0.0'), {
      target: { value: '10' },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Review High-Impact Swap/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Review High-Impact Swap/i }));

    await waitFor(() => {
      expect(screen.getByText(/Swap Review/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Confirm Swap/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Confirm Swap/i }));

    await waitFor(() => {
      expect(service.swap).toHaveBeenCalledTimes(1);
      expect(service.waitForTransaction).toHaveBeenCalled();
    });
  });
});
