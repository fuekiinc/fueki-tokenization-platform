/**
 * usePriceHistory hook tests.
 *
 * Verifies deterministic seed generation fallback and conversion of confirmed
 * trade history to OHLCV candles.
 */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { usePriceHistory } from '../../../src/hooks/usePriceHistory';
import { useTradeStore } from '../../../src/store/tradeStore';
import type { TradeHistory } from '../../../src/types';

function buildTrade(overrides: Partial<TradeHistory>): TradeHistory {
  return {
    id: 'trade-id',
    type: 'exchange',
    asset: '0xTokenA',
    assetSymbol: 'TOKA',
    amount: '100',
    txHash: '0xtxhash',
    timestamp: Math.floor(Date.now() / 1000),
    from: '0xfrom',
    to: '0xto',
    status: 'confirmed',
    ...overrides,
  };
}

describe('usePriceHistory', () => {
  beforeEach(() => {
    localStorage.clear();
    useTradeStore.setState({
      tradeHistory: [],
      isLoadingTrades: false,
      tradesError: null,
      slippageBps: 50,
      pendingTransactions: [],
    });
  });

  it('returns deterministic seeded candles when no trade data exists', () => {
    const { result: first } = renderHook(() =>
      usePriceHistory('0xTokenA', '0xTokenB', '15m'),
    );
    const { result: second } = renderHook(() =>
      usePriceHistory('0xTokenA', '0xTokenB', '15m'),
    );

    expect(first.current.isRealData).toBe(false);
    expect(first.current.data.length).toBe(100);
    expect(second.current.data.length).toBe(100);

    const firstSnapshot = first.current.data.slice(0, 5).map((d) => ({
      open: d.open,
      close: d.close,
      low: d.low,
      high: d.high,
    }));
    const secondSnapshot = second.current.data.slice(0, 5).map((d) => ({
      open: d.open,
      close: d.close,
      low: d.low,
      high: d.high,
    }));
    expect(firstSnapshot).toEqual(secondSnapshot);
  });

  it('returns real candles when confirmed exchange trades are available', () => {
    const now = Math.floor(Date.now() / 1000);
    useTradeStore.setState({
      tradeHistory: [
        buildTrade({ id: 't1', amount: '100', timestamp: now - 180 }),
        buildTrade({ id: 't2', amount: '130', timestamp: now - 120 }),
        buildTrade({ id: 't3', amount: '90', timestamp: now - 60 }),
      ],
    });

    const { result } = renderHook(() =>
      usePriceHistory('0xTokenA', '0xTokenB', '1m'),
    );

    expect(result.current.isRealData).toBe(true);
    expect(result.current.data.length).toBeGreaterThanOrEqual(2);

    const lastCandle = result.current.data[result.current.data.length - 1];
    expect(lastCandle.high).toBeGreaterThanOrEqual(lastCandle.low);
    expect(lastCandle.volume).toBeGreaterThan(0);
  });
});
