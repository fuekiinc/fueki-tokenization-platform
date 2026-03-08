/**
 * RecentActivity panel tests.
 *
 * Verifies empty and populated activity render states.
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import RecentActivity from '../../../src/components/Dashboard/RecentActivity';
import type { TradeHistory } from '../../../src/types';

function renderWithRouter(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('RecentActivity', () => {
  it('renders empty state when no trades exist', () => {
    renderWithRouter(<RecentActivity trades={[]} chainId={1} />);

    expect(screen.getByText(/No recent activity/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Your transactions will appear here once you start trading/i),
    ).toBeInTheDocument();
  });

  it('renders recent trade rows and status badges', () => {
    const trades: TradeHistory[] = [
      {
        id: 'trade-1',
        type: 'exchange',
        asset: '0xTokenA',
        assetSymbol: 'TOKA',
        amount: '100',
        txHash: '0xabc',
        timestamp: Date.now() - 1000,
        from: '0xfrom',
        to: '0xto',
        status: 'confirmed',
      },
    ];

    renderWithRouter(<RecentActivity trades={trades} chainId={1} />);

    expect(screen.getByText(/Exchange/i)).toBeInTheDocument();
    expect(screen.getByText(/confirmed/i)).toBeInTheDocument();
    expect(screen.getByText(/TOKA/i)).toBeInTheDocument();
  });
});
