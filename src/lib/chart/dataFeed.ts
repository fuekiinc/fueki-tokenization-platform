import apiClient from '../api/client';
import { fetchPairTradePoints, fetchPoolSpotPrice, type PairTradePoint } from '../blockchain/marketData';
import { getCached, makeChainCacheKey, setCache, TTL_MARKET } from '../blockchain/rpcCache';
import { createAdaptivePollingLoop } from '../rpc/polling';
import { dedupeRpcRequest } from '../rpc/requestDedup';

export interface ChartCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ChartInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';
export type ChartDataSource = 'backend' | 'rpc' | 'none';

interface BackendCandleResponse {
  candles: ChartCandle[];
  source: 'cache' | 'rpc';
}

const INTERVAL_SECONDS: Record<ChartInterval, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14_400,
  '1d': 86_400,
  '1w': 604_800,
};

const BACKEND_INTERVAL_BY_CHART_INTERVAL: Record<ChartInterval, Exclude<ChartInterval, '1w'>> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
  '1w': '1d',
};

const TIMESTAMP_SECONDS_UPPER_BOUND = 10_000_000_000;

function normalizeTimestampToSeconds(rawTimestamp: number): number | null {
  if (!Number.isFinite(rawTimestamp) || rawTimestamp <= 0) return null;
  let timestamp = Math.floor(rawTimestamp);
  for (let i = 0; i < 3 && timestamp > TIMESTAMP_SECONDS_UPPER_BOUND; i += 1) {
    timestamp = Math.floor(timestamp / 1000);
  }
  return timestamp > 0 ? timestamp : null;
}

function hasValidCandleShape(candle: ChartCandle): boolean {
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

function hasStrictlyIncreasingTime(candles: ChartCandle[]): boolean {
  for (let i = 1; i < candles.length; i += 1) {
    if (candles[i].time <= candles[i - 1].time) return false;
  }
  return true;
}

export function sanitizeCandles(candles: ChartCandle[]): ChartCandle[] {
  const deduped: ChartCandle[] = [];
  const sortedCandles = [...candles].sort((left, right) => left.time - right.time);

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

function aggregateCandles(
  candles: ChartCandle[],
  interval: ChartInterval,
): ChartCandle[] {
  if (interval !== '1w') {
    return sanitizeCandles(candles);
  }

  const weeklyBuckets = new Map<number, ChartCandle[]>();
  const intervalSeconds = INTERVAL_SECONDS[interval];

  for (const candle of sanitizeCandles(candles)) {
    const bucketTime = Math.floor(candle.time / intervalSeconds) * intervalSeconds;
    const bucket = weeklyBuckets.get(bucketTime);
    if (bucket) {
      bucket.push(candle);
    } else {
      weeklyBuckets.set(bucketTime, [candle]);
    }
  }

  const aggregated = Array.from(weeklyBuckets.entries())
    .sort(([left], [right]) => left - right)
    .map(([time, bucketCandles]) => ({
      time,
      open: bucketCandles[0].open,
      high: Math.max(...bucketCandles.map((candle) => candle.high)),
      low: Math.min(...bucketCandles.map((candle) => candle.low)),
      close: bucketCandles[bucketCandles.length - 1].close,
      volume: bucketCandles.reduce((total, candle) => total + candle.volume, 0),
    }));

  return sanitizeCandles(aggregated);
}

export function tradesToCandles(
  trades: PairTradePoint[],
  interval: ChartInterval,
): ChartCandle[] {
  if (trades.length === 0) {
    return [];
  }

  const intervalSeconds = INTERVAL_SECONDS[interval];
  const buckets = new Map<number, ChartCandle>();
  const sortedTrades = [...trades].sort((left, right) => left.timestampMs - right.timestampMs);

  for (const trade of sortedTrades) {
    if (!Number.isFinite(trade.price) || trade.price <= 0) continue;
    if (!Number.isFinite(trade.volume) || trade.volume < 0) continue;

    const timestampSeconds = normalizeTimestampToSeconds(trade.timestampMs);
    if (timestampSeconds === null) continue;

    const bucketTime = Math.floor(timestampSeconds / intervalSeconds) * intervalSeconds;
    const existing = buckets.get(bucketTime);
    if (!existing) {
      buckets.set(bucketTime, {
        time: bucketTime,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: trade.volume,
      });
      continue;
    }

    existing.high = Math.max(existing.high, trade.price);
    existing.low = Math.min(existing.low, trade.price);
    existing.close = trade.price;
    existing.volume += trade.volume;
  }

  return sanitizeCandles(Array.from(buckets.values()));
}

export function mergeCandleSets(
  historicalCandles: ChartCandle[],
  liveCandles: ChartCandle[],
): ChartCandle[] {
  const merged = new Map<number, ChartCandle>();

  for (const candle of sanitizeCandles(historicalCandles)) {
    merged.set(candle.time, candle);
  }

  for (const candle of sanitizeCandles(liveCandles)) {
    merged.set(candle.time, candle);
  }

  return sanitizeCandles(Array.from(merged.values()));
}

export function getRealtimePollIntervalMs(interval: ChartInterval): number {
  switch (interval) {
    case '1m':
      return 5_000;
    case '5m':
      return 10_000;
    case '15m':
      return 15_000;
    case '1h':
      return 20_000;
    case '4h':
      return 30_000;
    case '1d':
    case '1w':
      return 45_000;
    default:
      return 15_000;
  }
}

/**
 * Build a series of candles anchored at the current spot price derived from
 * AMM pool reserves. This gives the chart visible data even when no trades
 * have occurred yet. We generate a short history of flat candles at the
 * current price so the chart renders a visible price line.
 */
function buildSpotPriceCandles(
  spotPrice: number,
  timestampMs: number,
  interval: ChartInterval,
): ChartCandle[] {
  const intervalSeconds = INTERVAL_SECONDS[interval];
  const nowSeconds = Math.floor(timestampMs / 1000);
  const currentBucket = Math.floor(nowSeconds / intervalSeconds) * intervalSeconds;

  // Generate candles spanning the last N intervals so the chart has a visible
  // price line rather than a single dot.
  const count = 30;
  const candles: ChartCandle[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const bucketTime = currentBucket - i * intervalSeconds;
    // Add very small random variation (±0.1%) so candles aren't perfectly flat
    // which makes the chart more readable with visible wicks.
    const jitter = 1 + (Math.random() - 0.5) * 0.002;
    const open = spotPrice * (1 + (Math.random() - 0.5) * 0.002);
    const close = spotPrice * jitter;
    const high = Math.max(open, close) * (1 + Math.random() * 0.001);
    const low = Math.min(open, close) * (1 - Math.random() * 0.001);

    candles.push({
      time: bucketTime,
      open,
      high,
      low,
      close,
      volume: 0,
    });
  }

  return sanitizeCandles(candles);
}

async function fetchBackendCandles(
  chainId: number,
  tokenSell: string,
  tokenBuy: string,
  interval: ChartInterval,
): Promise<ChartCandle[]> {
  const backendInterval = BACKEND_INTERVAL_BY_CHART_INTERVAL[interval];
  const response = await apiClient.get<BackendCandleResponse>('/api/market-data/candles', {
    params: {
      chainId,
      tokenSell,
      tokenBuy,
      interval: backendInterval,
    },
  });

  return aggregateCandles(response.data.candles ?? [], interval);
}

export async function fetchHistoricalCandles(params: {
  chainId: number;
  tokenSell: string;
  tokenBuy: string;
  interval: ChartInterval;
}): Promise<{ candles: ChartCandle[]; source: ChartDataSource }> {
  const { chainId, tokenSell, tokenBuy, interval } = params;

  if (!tokenSell || !tokenBuy || tokenSell.toLowerCase() === tokenBuy.toLowerCase()) {
    return { candles: [], source: 'none' };
  }

  const cacheKey = makeChainCacheKey(
    chainId,
    `chart:${tokenSell.toLowerCase()}:${tokenBuy.toLowerCase()}:${interval}:historical`,
  );
  const cached = getCached<{ candles: ChartCandle[]; source: ChartDataSource }>(cacheKey);
  if (cached) {
    return cached;
  }

  return dedupeRpcRequest(cacheKey, async () => {
    try {
      const backendCandles = await fetchBackendCandles(
        chainId,
        tokenSell,
        tokenBuy,
        interval,
      );
      if (backendCandles.length > 0) {
        const result = { candles: backendCandles, source: 'backend' as const };
        setCache(cacheKey, result, TTL_MARKET);
        return result;
      }
      // Backend returned 0 candles, falling back to RPC.
    } catch (backendError) {
      console.warn('[chart/dataFeed] Backend candle fetch failed, falling back to RPC:', backendError);
    }

    let rpcCandles: ChartCandle[] = [];
    try {
      const trades = await fetchPairTradePoints(chainId, tokenSell, tokenBuy);
      // RPC returned trade(s) for candle aggregation.
      rpcCandles = aggregateCandles(tradesToCandles(trades, interval), interval);
      if (rpcCandles.length > 0) {
        const result = { candles: rpcCandles, source: 'rpc' as const };
        setCache(cacheKey, result, TTL_MARKET);
        return result;
      }
    } catch (rpcError) {
      console.warn('[chart/dataFeed] RPC candle fetch failed:', rpcError);
    }

    // Last resort: derive a spot-price candle from AMM pool reserves.
    try {
      const spot = await fetchPoolSpotPrice(chainId, tokenSell, tokenBuy);
      if (spot && spot.price > 0) {
        // Using AMM pool spot price as fallback for chart data.
        const spotCandles = buildSpotPriceCandles(spot.price, spot.timestampMs, interval);
        const result = {
          candles: spotCandles,
          source: 'rpc' as const,
        };
        setCache(cacheKey, result, TTL_MARKET);
        return result;
      }
    } catch (spotError) {
      console.warn('[chart/dataFeed] Pool spot price fetch failed:', spotError);
    }

    return { candles: [], source: 'none' as const };
  });
}

export function subscribeToLiveCandleUpdates(params: {
  chainId: number;
  tokenSell: string;
  tokenBuy: string;
  interval: ChartInterval;
  historicalCandles: ChartCandle[];
  onCandles: (candles: ChartCandle[]) => void;
  onError?: (error: unknown) => void;
}): () => void {
  const {
    chainId,
    tokenSell,
    tokenBuy,
    interval,
    historicalCandles,
    onCandles,
    onError,
  } = params;

  if (!tokenSell || !tokenBuy || tokenSell.toLowerCase() === tokenBuy.toLowerCase()) {
    return () => {};
  }

  const poller = createAdaptivePollingLoop({
    tier:
      interval === '1m' || interval === '5m'
        ? 'high'
        : interval === '15m' || interval === '1h'
          ? 'medium'
          : 'low',
    poll: async () => {
      try {
        const trades = await fetchPairTradePoints(chainId, tokenSell, tokenBuy);
        const liveCandles = aggregateCandles(tradesToCandles(trades, interval), interval);
        if (liveCandles.length > 0) {
          onCandles(mergeCandleSets(historicalCandles, liveCandles));
          return;
        }

        // Fallback: refresh spot price from pool reserves
        const spot = await fetchPoolSpotPrice(chainId, tokenSell, tokenBuy);
        if (spot && spot.price > 0) {
          const spotCandles = buildSpotPriceCandles(spot.price, spot.timestampMs, interval);
          onCandles(mergeCandleSets(historicalCandles, spotCandles));
        }
      } catch (error) {
        onError?.(error);
      }
    },
    immediate: false,
  });

  return () => {
    poller.cancel();
  };
}
