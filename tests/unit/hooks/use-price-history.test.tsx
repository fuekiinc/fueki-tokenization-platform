import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePriceHistory } from '../../../src/hooks/usePriceHistory';
import type { PairTradePoint } from '../../../src/lib/blockchain/marketData';
import { createQueryClientWrapper } from '../testQueryClient';

const apiClientGetMock = vi.fn();
const fetchPairTradePointsMock = vi.fn<
  (chainId: number, tokenSell: string, tokenBuy: string) => Promise<PairTradePoint[]>
>();

vi.mock('../../../src/lib/api/client', () => ({
  default: {
    get: (...args: unknown[]) => apiClientGetMock(...args),
  },
}));

vi.mock('../../../src/lib/blockchain/marketData', () => ({
  fetchPairTradePoints: (...args: [number, string, string]) =>
    fetchPairTradePointsMock(...args),
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

  it('returns an empty state instead of synthetic candles when no real market data exists', async () => {
    const tokenSell = '0xTokenA15m';
    const tokenBuy = '0xTokenB15m';
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() =>
      usePriceHistory(tokenSell, tokenBuy, '15m'),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isRealData).toBe(false);
    expect(result.current.data).toEqual([]);
    expect(result.current.source).toBe('none');
  });

  it('prefers backend candle data when enough history is available', async () => {
    const tokenSell = '0xTokenA1mBackend';
    const tokenBuy = '0xTokenB1mBackend';
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

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() =>
      usePriceHistory(tokenSell, tokenBuy, '1m'),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isRealData).toBe(true);
      expect(result.current.data.length).toBeGreaterThanOrEqual(2);
    });

    expect(fetchPairTradePointsMock).not.toHaveBeenCalled();
    expect(result.current.source).toBe('backend');
    expect(result.current.data.at(-1)?.close).toBe(1.25);
  });

  it('aggregates backend daily candles into weekly candles for 1W charts', async () => {
    const tokenSell = '0xTokenA1w';
    const tokenBuy = '0xTokenB1w';
    // Use a fixed base timestamp aligned to a weekly bucket boundary so the
    // three daily candles always land in the same week regardless of when the
    // test is executed.  604_800 = seconds per week.
    const weekBucketStart = 604_800 * 2900; // a deterministic week boundary
    apiClientGetMock.mockResolvedValue({
      data: {
        candles: [
          { time: weekBucketStart + 86_400 * 0, open: 1, high: 1.1, low: 0.9, close: 1.05, volume: 10 },
          { time: weekBucketStart + 86_400 * 1, open: 1.05, high: 1.2, low: 1.0, close: 1.18, volume: 11 },
          { time: weekBucketStart + 86_400 * 2, open: 1.18, high: 1.25, low: 1.1, close: 1.22, volume: 13 },
        ],
        source: 'cache',
      },
    });

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() =>
      usePriceHistory(tokenSell, tokenBuy, '1w'),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(apiClientGetMock).toHaveBeenCalledWith(
      '/api/market-data/candles',
      expect.objectContaining({
        params: expect.objectContaining({ interval: '1d' }),
      }),
    );
    expect(result.current.data.length).toBe(1);
    expect(result.current.data[0]).toEqual(
      expect.objectContaining({
        open: 1,
        high: 1.25,
        low: 0.9,
        close: 1.22,
        volume: 34,
      }),
    );
  });

  it('falls back to direct RPC trades when backend candles are unavailable', async () => {
    const tokenSell = '0xTokenA1mRpc';
    const tokenBuy = '0xTokenB1mRpc';
    const nowMs = Date.now();
    apiClientGetMock.mockRejectedValue(new Error('backend unavailable'));
    fetchPairTradePointsMock.mockResolvedValue([
      { id: 'ms1', timestampMs: nowMs - 120_000, price: 120.5, volume: 4, source: 'amm' },
      { id: 'ms2', timestampMs: nowMs - 60_000, price: 125.25, volume: 5, source: 'orderbook' },
    ]);

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() =>
      usePriceHistory(tokenSell, tokenBuy, '1m'),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isRealData).toBe(true);
      expect(result.current.data.length).toBeGreaterThanOrEqual(2);
    });

    expect(fetchPairTradePointsMock).toHaveBeenCalledWith(421614, tokenSell, tokenBuy);
    expect(result.current.source).toBe('rpc');
  });

  it('skips candle loading for same-token pairs', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() =>
      usePriceHistory('0xTokenA', '0xTokenA', '1h'),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isRealData).toBe(false);
    expect(result.current.data).toEqual([]);
    expect(apiClientGetMock).not.toHaveBeenCalled();
    expect(fetchPairTradePointsMock).not.toHaveBeenCalled();
  });
});
