/**
 * Price history hook for chart rendering.
 *
 * Derives OHLCV candlestick data from recent on-chain pair trades. When
 * insufficient real trade data is available (fewer than 2 candles), a
 * deterministic seed-based series is generated so that charts always render
 * consistently for a given token pair.
 *
 * The seed series is reproducible: the same pair always yields the same
 * chart regardless of when or how often the component mounts.
 *
 * Output is formatted for direct consumption by lightweight-charts or
 * any other charting library that expects UTCTimestamp + OHLCV tuples.
 */
import { useEffect, useMemo, useState } from 'react';
import apiClient from '../lib/api/client';
import { fetchPairTradePoints, type PairTradePoint } from '../lib/blockchain/marketData';
import { useWalletStore } from '../store/walletStore';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CandlestickDataPoint {
  /** Unix timestamp in seconds (UTCTimestamp for lightweight-charts). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type TimeInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export interface PriceHistoryResult {
  data: CandlestickDataPoint[];
  isLoading: boolean;
  /** True when the data is derived from real trades, false when seed-generated. */
  isRealData: boolean;
}

interface BackendCandleResponse {
  candles: CandlestickDataPoint[];
  source: 'cache' | 'rpc';
}

// ---------------------------------------------------------------------------
// Interval durations (seconds)
// ---------------------------------------------------------------------------

const INTERVAL_SECONDS: Record<TimeInterval, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};

/** Values above this are unlikely to be Unix seconds and are normalized down. */
const TIMESTAMP_SECONDS_UPPER_BOUND = 10_000_000_000; // year 2286

// ---------------------------------------------------------------------------
// Deterministic seed-based price generator
// ---------------------------------------------------------------------------

/** Simple deterministic 32-bit hash (djb2 variant). */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

/**
 * Mulberry32 PRNG -- deterministic, fast, 32-bit state.
 * Returns a function that yields the next float in [0, 1).
 */
function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a deterministic candlestick series for a token pair.
 * The series ends at the current interval boundary and produces
 * `count` candles going backwards in time.
 */
function generateSeedSeries(
  tokenSell: string,
  tokenBuy: string,
  interval: TimeInterval,
  count: number,
): CandlestickDataPoint[] {
  const seed = hashString(tokenSell.toLowerCase() + ':' + tokenBuy.toLowerCase());
  const rand = mulberry32(seed);

  const intervalSec = INTERVAL_SECONDS[interval];
  const now = Math.floor(Date.now() / 1000);
  const endTime = Math.floor(now / intervalSec) * intervalSec;
  const startTime = endTime - (count - 1) * intervalSec;

  // Derive a starting price from the seed (between 0.5 and 500).
  const basePrice = 0.5 + rand() * 499.5;
  // Volatility factor: 1-5% per candle.
  const volatility = 0.01 + rand() * 0.04;

  const data: CandlestickDataPoint[] = [];
  let prevClose = basePrice;

  for (let i = 0; i < count; i++) {
    const time = startTime + i * intervalSec;

    const change = (rand() - 0.5) * 2 * volatility * prevClose;
    const open = prevClose;
    const close = open + change;

    const wickUp = rand() * volatility * 0.5 * prevClose;
    const wickDown = rand() * volatility * 0.5 * prevClose;
    const high = Math.max(open, close) + wickUp;
    const low = Math.min(open, close) - wickDown;

    const baseVolume = 100 + rand() * 9900;
    const volume = baseVolume * (0.5 + rand());

    data.push({
      time,
      open: parseFloat(open.toFixed(6)),
      high: parseFloat(high.toFixed(6)),
      low: parseFloat(Math.max(low, 0.000001).toFixed(6)),
      close: parseFloat(close.toFixed(6)),
      volume: parseFloat(volume.toFixed(2)),
    });

    prevClose = close;
  }

  return data;
}

function normalizeTimestampToSeconds(rawTimestamp: number): number | null {
  if (!Number.isFinite(rawTimestamp) || rawTimestamp <= 0) return null;
  let timestamp = Math.floor(rawTimestamp);
  // Handle ms/us/ns timestamp formats defensively.
  for (let i = 0; i < 3 && timestamp > TIMESTAMP_SECONDS_UPPER_BOUND; i++) {
    timestamp = Math.floor(timestamp / 1000);
  }
  return timestamp > 0 ? timestamp : null;
}

function hasValidCandleShape(candle: CandlestickDataPoint): boolean {
  if (!Number.isFinite(candle.time) || candle.time <= 0) return false;
  if (!Number.isFinite(candle.open) || candle.open <= 0) return false;
  if (!Number.isFinite(candle.high) || candle.high <= 0) return false;
  if (!Number.isFinite(candle.low) || candle.low <= 0) return false;
  if (!Number.isFinite(candle.close) || candle.close <= 0) return false;
  if (!Number.isFinite(candle.volume) || candle.volume < 0) return false;
  if (candle.low > candle.high) return false;
  if (candle.open < candle.low || candle.open > candle.high) return false;
  if (candle.close < candle.low || candle.close > candle.high) return false;
  return true;
}

function hasStrictlyIncreasingTime(candles: CandlestickDataPoint[]): boolean {
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].time <= candles[i - 1].time) return false;
  }
  return true;
}

function pairTradesToCandles(
  trades: PairTradePoint[],
  interval: TimeInterval,
): CandlestickDataPoint[] {
  if (trades.length === 0) return [];

  const intervalSec = INTERVAL_SECONDS[interval];

  // Sort by timestamp ascending.
  const sorted = [...trades].sort((a, b) => a.timestampMs - b.timestampMs);

  // Group by interval bucket.
  const buckets = new Map<number, { prices: number[]; volumes: number[] }>();

  for (const trade of sorted) {
    if (!Number.isFinite(trade.price) || trade.price <= 0) continue;
    if (!Number.isFinite(trade.volume) || trade.volume < 0) continue;

    const timestampSec = normalizeTimestampToSeconds(trade.timestampMs);
    if (timestampSec === null) continue;

    const bucket = Math.floor(timestampSec / intervalSec) * intervalSec;
    let entry = buckets.get(bucket);
    if (!entry) {
      entry = { prices: [], volumes: [] };
      buckets.set(bucket, entry);
    }
    entry.prices.push(trade.price);
    entry.volumes.push(trade.volume);
  }

  // Convert buckets to candle data.
  const candles: CandlestickDataPoint[] = [];
  const sortedBuckets = Array.from(buckets.entries()).sort(([a], [b]) => a - b);

  for (const [time, { prices, volumes }] of sortedBuckets) {
    const candle: CandlestickDataPoint = {
      time,
      open: prices[0],
      high: Math.max(...prices),
      low: Math.min(...prices),
      close: prices[prices.length - 1],
      volume: volumes.reduce((sum, v) => sum + v, 0),
    };

    if (hasValidCandleShape(candle)) {
      candles.push(candle);
    }
  }

  if (!hasStrictlyIncreasingTime(candles)) {
    return [];
  }

  return candles;
}

function sanitizeCandles(candles: CandlestickDataPoint[]): CandlestickDataPoint[] {
  const sortedCandles = [...candles].sort((a, b) => a.time - b.time);
  const deduped: CandlestickDataPoint[] = [];

  for (const candle of sortedCandles) {
    if (!hasValidCandleShape(candle)) {
      continue;
    }

    const previous = deduped[deduped.length - 1];
    if (previous?.time === candle.time) {
      deduped[deduped.length - 1] = candle;
      continue;
    }

    deduped.push(candle);
  }

  return hasStrictlyIncreasingTime(deduped) ? deduped : [];
}

async function fetchBackendCandles(
  chainId: number,
  tokenSell: string,
  tokenBuy: string,
  interval: TimeInterval,
): Promise<CandlestickDataPoint[]> {
  const response = await apiClient.get<BackendCandleResponse>('/api/market-data/candles', {
    params: { chainId, tokenSell, tokenBuy, interval },
  });

  return sanitizeCandles(response.data.candles ?? []);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const DEFAULT_CANDLE_COUNT = 100;
const MIN_REAL_CANDLE_COUNT = 2;

function getChartRefreshIntervalMs(interval: TimeInterval): number {
  switch (interval) {
    case '1m':
      return 15_000;
    case '5m':
      return 30_000;
    case '15m':
      return 45_000;
    default:
      return 60_000;
  }
}

/**
 * Derive candlestick chart data for a trading pair.
 *
 * @param tokenSell  Address of the sell-side token.
 * @param tokenBuy   Address of the buy-side token.
 * @param interval   Candle time interval.
 * @returns          Chart-ready OHLCV data, loading state, and data source flag.
 */
export function usePriceHistory(
  tokenSell: string,
  tokenBuy: string,
  interval: TimeInterval,
): PriceHistoryResult {
  const chainId = useWalletStore((s) => s.wallet.chainId);
  const [marketCandles, setMarketCandles] = useState<CandlestickDataPoint[]>([]);
  const [isLoadingMarketTrades, setIsLoadingMarketTrades] = useState(false);

  useEffect(() => {
    if (!tokenSell || !tokenBuy || !chainId) {
      setMarketCandles([]);
      setIsLoadingMarketTrades(false);
      return;
    }

    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      if (!cancelled) {
        setIsLoadingMarketTrades(true);
      }

      try {
        let backendCandles: CandlestickDataPoint[] = [];

        try {
          backendCandles = await fetchBackendCandles(chainId, tokenSell, tokenBuy, interval);
          if (!cancelled) {
            setMarketCandles(backendCandles);
          }
        } catch {
          backendCandles = [];
        }

        if (backendCandles.length >= MIN_REAL_CANDLE_COUNT) {
          return;
        }

        const trades = await fetchPairTradePoints(chainId, tokenSell, tokenBuy);
        const rpcCandles = pairTradesToCandles(trades, interval);

        if (!cancelled) {
          setMarketCandles(rpcCandles);
        }
      } catch {
        if (!cancelled) {
          setMarketCandles([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingMarketTrades(false);
          refreshTimer = setTimeout(load, getChartRefreshIntervalMs(interval));
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
    };
  }, [chainId, interval, tokenBuy, tokenSell]);

  const result = useMemo<{ data: CandlestickDataPoint[]; isRealData: boolean }>(() => {
    if (!tokenSell || !tokenBuy) return { data: [], isRealData: false };
    const realCandles = sanitizeCandles(marketCandles);

    if (realCandles.length >= MIN_REAL_CANDLE_COUNT) {
      return { data: realCandles, isRealData: true };
    }

    // Insufficient real data -- generate a deterministic seed series.
    return {
      data: generateSeedSeries(tokenSell, tokenBuy, interval, DEFAULT_CANDLE_COUNT),
      isRealData: false,
    };
  }, [interval, marketCandles, tokenBuy, tokenSell]);

  return {
    data: result.data,
    isLoading: isLoadingMarketTrades,
    isRealData: result.isRealData,
  };
}
