/**
 * LiquidityPanel component tests.
 *
 * Verifies pool loading and rendering of add/remove liquidity controls.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import LiquidityPanel from '../../../src/components/OrbitalAMM/LiquidityPanel';

vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
    loading: vi.fn(),
  },
}));

function buildService() {
  return {
    getSigner: vi.fn().mockResolvedValue({
      provider: {
        getNetwork: vi.fn().mockResolvedValue({ chainId: 42161n }),
      },
    }),
    getAllPools: vi.fn().mockResolvedValue(['0x0000000000000000000000000000000000000D01']),
    getPoolInfo: vi.fn().mockResolvedValue({
      address: '0x0000000000000000000000000000000000000D01',
      name: 'USDC / DAI',
      symbol: 'ODLP',
      tokens: [
        '0x0000000000000000000000000000000000000E01',
        '0x0000000000000000000000000000000000000E02',
      ],
      reserves: [500_000n * 10n ** 18n, 500_000n * 10n ** 18n],
      totalSupply: 10_000n * 10n ** 18n,
      concentration: 4,
      swapFeeBps: 30n,
    }),
    getTokenInfo: vi
      .fn()
      .mockImplementation(async (addr: string) =>
        addr.endsWith('1') ? { symbol: 'USDC' } : { symbol: 'DAI' },
      ),
    getTokenBalance: vi.fn().mockResolvedValue(10_000n * 10n ** 18n),
    getLPBalance: vi.fn().mockResolvedValue(2_000n * 10n ** 18n),
  };
}

describe('LiquidityPanel', () => {
  it('renders liquidity controls for selected pool and supports tab switch', async () => {
    const service = buildService();

    render(
      <MemoryRouter>
        <LiquidityPanel
          contractService={service as never}
          userAddress="0x00000000000000000000000000000000000000A1"
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(service.getAllPools).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: /Choose a pool/i }));
    fireEvent.click(screen.getByRole('button', { name: /USDC \/ DAI/i }));

    await waitFor(() => {
      expect(screen.getByText(/Pool Composition/i)).toBeInTheDocument();
      expect(screen.getByText(/USDC Reserve/i)).toBeInTheDocument();
      expect(screen.getByText(/DAI Reserve/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Remove Liquidity/i }));

    await waitFor(() => {
      expect(screen.getByText(/LP Balance/i)).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /Remove Liquidity/i }).length).toBeGreaterThan(0);
    });
  });
});
