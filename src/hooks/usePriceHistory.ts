import { useMemo } from 'react';
import { useTradeStore } from '../store/tradeStore';
import type { TradeHistory } from '../types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CandlestickDataPoint {
  time: number; // Unix timestamp in seconds (UTCTimestamp)
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

// ---------------------------------------------------------------------------
// Deterministic seed-based price generator
//
// When there is insufficient trade data we produce a reproducible series
// seeded by the two token addresses. The same pair always yields the same
// chart regardless of when the component mounts.
// ---------------------------------------------------------------------------

/** Simple deterministic 32-bit hash (djb2 variant). */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // (hash << 5) + hash + char
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0; // ensure unsigned
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
 * The series starts at the beginning of the current day (UTC) minus enough
 * intervals to fill the requested count, and produces `count` candles.
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
  // Align the end time to the current interval boundary
  const endTime = Math.floor(now / intervalSec) * intervalSec;
  const startTime = endTime - (count - 1) * intervalSec;

  // Derive a starting price from the seed (between 0.5 and 500)
  const basePrice = 0.5 + rand() * 499.5;
  // Volatility factor: 1-5% per candle
  const volatility = 0.01 + rand() * 0.04;

  const data: CandlestickDataPoint[] = [];
  let prevClose = basePrice;

  for (let i = 0; i < count; i++) {
    const time = startTime + i * intervalSec;

    // Random walk for this candle
    const change = (rand() - 0.5) * 2 * volatility * prevClose;
    const open = prevClose;
    const close = open + change;

    // Wick extensions
    const wickUp = rand() * volatility * 0.5 * prevClose;
    const wickDown = rand() * volatility * 0.5 * prevClose;
    const high = Math.max(open, close) + wickUp;
    const low = Math.min(open, close) - wickDown;

    // Volume: a seed-derived base volume with some variance
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

// ---------------------------------------------------------------------------
// Group actual trades into OHLCV candles
// ---------------------------------------------------------------------------

function tradesToCandles(
  trades: TradeHistory[],
  tokenSell: string,
  tokenBuy: string,
  interval: TimeInterval,
): CandlestickDataPoint[] {
  // Filter trades relevant to this pair (exchange type, matching asset addresses)
  const relevantTrades = trades.filter((t) => {
    if (t.status !== 'confirmed') return false;
    // Match trades where `from` or `to` match the pair tokens and type is exchange/swap
    const isExchangeType =
      t.type === 'exchange' || t.type === 'swap-eth' || t.type === 'swap-erc20';
    if (!isExchangeType) return false;

    // The asset field contains the token address; match if it is one of the pair tokens
    const assetLower = t.asset.toLowerCase();
    const sellLower = tokenSell.toLowerCase();
    const buyLower = tokenBuy.toLowerCase();
    return assetLower === sellLower || assetLower === buyLower;
  });

  if (relevantTrades.length === 0) return [];

  const intervalSec = INTERVAL_SECONDS[interval];

  // Sort by timestamp ascending
  const sorted = [...relevantTrades].sort((a, b) => a.timestamp - b.timestamp);

  // Group by interval bucket
  const buckets = new Map<
    number,
    { prices: number[]; volumes: number[] }
  >();

  for (const trade of sorted) {
    const price = parseFloat(trade.amount);
    if (isNaN(price) || price <= 0) continue;

    const bucket = Math.floor(trade.timestamp / intervalSec) * intervalSec;
    let entry = buckets.get(bucket);
    if (!entry) {
      entry = { prices: [], volumes: [] };
      buckets.set(bucket, entry);
    }
    entry.prices.push(price);
    entry.volumes.push(price); // Use price as proxy for volume when no separate volume field
  }

  // Convert buckets to candle data
  const candles: CandlestickDataPoint[] = [];
  const sortedBuckets = Array.from(buckets.entries()).sort(
    ([a], [b]) => a - b,
  );

  for (const [time, { prices, volumes }] of sortedBuckets) {
    candles.push({
      time,
      open: prices[0],
      high: Math.max(...prices),
      low: Math.min(...prices),
      close: prices[prices.length - 1],
      volume: volumes.reduce((sum, v) => sum + v, 0),
    });
  }

  return candles;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const DEFAULT_CANDLE_COUNT = 100;

export function usePriceHistory(
  tokenSell: string,
  tokenBuy: string,
  interval: TimeInterval,
): PriceHistoryResult {
  const tradeHistory = useTradeStore((s) => s.tradeHistory);
  const isLoadingTrades = useTradeStore((s) => s.isLoadingTrades);

  const data = useMemo(() => {
    if (!tokenSell || !tokenBuy) return [];

    // Attempt to derive candles from real trade history
    const realCandles = tradesToCandles(tradeHistory, tokenSell, tokenBuy, interval);

    if (realCandles.length >= 2) {
      return realCandles;
    }

    // Insufficient real data -- generate a deterministic seed series
    return generateSeedSeries(tokenSell, tokenBuy, interval, DEFAULT_CANDLE_COUNT);
  }, [tradeHistory, tokenSell, tokenBuy, interval]);

  return { data, isLoading: isLoadingTrades };
}
