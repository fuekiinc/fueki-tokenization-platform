/**
 * usePriceHistory hook tests.
 *
 * Verifies deterministic seed generation fallback and conversion of recent
 * on-chain pair trades to OHLCV candles.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePriceHistory } from '../../../src/hooks/usePriceHistory';
import type { PairTradePoint } from '../../../src/lib/blockchain/marketData';

const apiClientGetMock = vi.fn();
const fetchPairTradePointsMock = vi.fn<(chainId: number, tokenSell: string, tokenBuy: string) => Promise<PairTradePoint[]>>();

vi.mock('../../../src/lib/api/client', () => ({
  default: {
    get: (...args: unknown[]) => apiClientGetMock(...args),
  },
}));

vi.mock('../../../src/lib/blockchain/marketData', () => ({
  fetchPairTradePoints: (...args: [number, string, string]) => fetchPairTradePointsMock(...args),
}));

vi.mock('../../../src/store/walletStore', () => ({
  useWalletStore: (selector: (state: { wallet: { chainId: number | null } }) => unknown) =>
    selector({ wallet: { chainId: 421614 } }),
}));

describe('usePriceHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClientGetMock.mockResolvedValue({ data: { candles: [], source: 'rpc' } });
    fetchPairTradePointsMock.mockResolvedValue([]);
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

  it('prefers backend candle data when enough history is available', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    apiClientGetMock.mockResolvedValue({
      data: {
        candles: [
          { time: nowSeconds - 120, open: 1, high: 1.2, low: 0.95, close: 1.1, volume: 10 },
          { time: nowSeconds - 60, open: 1.1, high: 1.3, low: 1.05, close: 1.25, volume: 12 },
        ],
        source: 'cache',
      },
    });

    const { result } = renderHook(() =>
      usePriceHistory('0xTokenA', '0xTokenB', '1m'),
    );

    await waitFor(() => {
      expect(result.current.isRealData).toBe(true);
      expect(result.current.data.length).toBeGreaterThanOrEqual(2);
    });

    expect(fetchPairTradePointsMock).not.toHaveBeenCalled();
    expect(result.current.data.at(-1)?.close).toBe(1.25);
  });

  it('falls back to direct RPC trades when backend candles are unavailable', async () => {
    const nowMs = Date.now();
    apiClientGetMock.mockRejectedValue(new Error('backend unavailable'));
    fetchPairTradePointsMock.mockResolvedValue([
      { id: 'ms1', timestampMs: nowMs - 120_000, price: 120.5, volume: 4, source: 'amm' },
      { id: 'ms2', timestampMs: nowMs - 60_000, price: 125.25, volume: 5, source: 'orderbook' },
    ]);

    const { result } = renderHook(() =>
      usePriceHistory('0xTokenA', '0xTokenB', '1m'),
    );

    await waitFor(() => {
      expect(result.current.isRealData).toBe(true);
      expect(result.current.data.length).toBeGreaterThanOrEqual(2);
    });

    expect(fetchPairTradePointsMock).toHaveBeenCalledWith(421614, '0xTokenA', '0xTokenB');
    for (const candle of result.current.data) {
      expect(candle.time).toBeLessThan(10_000_000_000);
    }
  });

  it('falls back to deterministic seed data when backend and RPC data are insufficient', async () => {
    apiClientGetMock.mockResolvedValue({
      data: {
        candles: [
          { time: Math.floor(Date.now() / 1000), open: 1, high: 1.1, low: 0.9, close: 1.05, volume: 3 },
        ],
        source: 'rpc',
      },
    });
    fetchPairTradePointsMock.mockResolvedValue([
      { id: 'bad1', timestampMs: Date.now(), price: Number.NaN, volume: 10, source: 'amm' },
      { id: 'bad2', timestampMs: Date.now() - 10_000, price: -12, volume: 8, source: 'orderbook' },
    ]);

    const { result } = renderHook(() =>
      usePriceHistory('0xTokenA', '0xTokenB', '5m'),
    );

    await waitFor(() => {
      expect(result.current.isRealData).toBe(false);
      expect(result.current.data.length).toBe(100);
    });
  });
});
