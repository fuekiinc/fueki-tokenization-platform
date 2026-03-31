import { ethers } from 'ethers';
import type { ChartCandle } from '../chart/dataFeed';
import { OrbitalPoolABI } from '../../contracts/abis/OrbitalPool';
import { dedupeRpcRequest } from '../rpc/requestDedup';
import { getCached, makeChainCacheKey, setCache, TTL_MARKET } from './rpcCache';
import { getReadOnlyProvider } from './contracts';
import { queryRecentLogsBestEffort } from './logQuery';

export type OrbitalChartInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';

export interface OrbitalPoolTradePoint {
  id: string;
  timestampMs: number;
  price: number;
  volume: number;
  tokenInIndex: number;
  tokenOutIndex: number;
}

export interface OrbitalPoolSpotPrice {
  price: number;
  timestampMs: number;
}

export interface OrbitalPoolChartSummary {
  latestPrice: number | null;
  change24h: number | null;
  volume24h: number;
  swaps24h: number;
  high24h: number | null;
  low24h: number | null;
  lastUpdatedMs: number | null;
}

export interface OrbitalPoolChartSnapshot {
  candles: ChartCandle[];
  summary: OrbitalPoolChartSummary;
  source: 'swaps' | 'spot' | 'none';
  usedSpotFallback: boolean;
}

interface FetchOrbitalPoolTradePointsParams {
  chainId: number;
  poolAddress: string;
  tokenInIndex: number;
  tokenOutIndex: number;
  tokenInDecimals?: number;
  tokenOutDecimals?: number;
}

interface FetchOrbitalPoolChartSnapshotParams extends FetchOrbitalPoolTradePointsParams {
  interval: OrbitalChartInterval;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ORBITAL_LOOKBACK_BLOCKS = 400_000;
const MAX_SWAP_EVENTS = 320;
const TIMESTAMP_SECONDS_UPPER_BOUND = 10_000_000_000;

const INTERVAL_SECONDS: Record<OrbitalChartInterval, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14_400,
  '1d': 86_400,
  '1w': 604_800,
};

function normalizeTimestampToSeconds(rawTimestamp: number): number | null {
  if (!Number.isFinite(rawTimestamp) || rawTimestamp <= 0) return null;

  let timestamp = Math.floor(rawTimestamp);
  for (let attempt = 0; attempt < 3 && timestamp > TIMESTAMP_SECONDS_UPPER_BOUND; attempt += 1) {
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

function sanitizeCandles(candles: ChartCandle[]): ChartCandle[] {
  const sorted = [...candles].sort((left, right) => left.time - right.time);
  const deduped: ChartCandle[] = [];

  for (const candle of sorted) {
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

  return deduped;
}

function toDisplayAmount(raw: bigint, decimals: number): number | null {
  const formatted = Number(ethers.formatUnits(raw, decimals));
  if (!Number.isFinite(formatted) || formatted <= 0) {
    return null;
  }
  return formatted;
}

async function resolveBlockTimestampMs(
  provider: ethers.Provider,
  blockNumber: number | null | undefined,
  cache: Map<number, number>,
): Promise<number> {
  if (!Number.isFinite(blockNumber)) {
    return Date.now();
  }

  const normalizedBlock = Number(blockNumber);
  const cached = cache.get(normalizedBlock);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const block = await provider.getBlock(normalizedBlock);
    if (block) {
      const timestampMs = block.timestamp * 1000;
      cache.set(normalizedBlock, timestampMs);
      return timestampMs;
    }
  } catch {
    // Fall through to current wall clock time.
  }

  return Date.now();
}

export function orbitalTradesToCandles(
  trades: OrbitalPoolTradePoint[],
  interval: OrbitalChartInterval,
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

export function buildSpotPriceFallbackCandles(
  spotPrice: number,
  timestampMs: number,
  interval: OrbitalChartInterval,
  count: number = 30,
): ChartCandle[] {
  if (!Number.isFinite(spotPrice) || spotPrice <= 0) {
    return [];
  }

  const intervalSeconds = INTERVAL_SECONDS[interval];
  const nowSeconds = Math.floor(timestampMs / 1000);
  const currentBucket = Math.floor(nowSeconds / intervalSeconds) * intervalSeconds;
  const candles: ChartCandle[] = [];

  for (let index = count - 1; index >= 0; index -= 1) {
    const time = currentBucket - index * intervalSeconds;
    candles.push({
      time,
      open: spotPrice,
      high: spotPrice,
      low: spotPrice,
      close: spotPrice,
      volume: 0,
    });
  }

  return sanitizeCandles(candles);
}

export function summarizeOrbitalPoolActivity(params: {
  trades: OrbitalPoolTradePoint[];
  latestPrice: number | null;
  referenceTimestampMs?: number;
}): OrbitalPoolChartSummary {
  const {
    trades,
    latestPrice,
    referenceTimestampMs,
  } = params;

  const effectiveReferenceTimestampMs = referenceTimestampMs ?? Date.now();
  const cutoff = effectiveReferenceTimestampMs - ONE_DAY_MS;
  const recentTrades = trades.filter((trade) => trade.timestampMs >= cutoff);
  const baselinePrice = recentTrades[0]?.price ?? null;
  const effectiveLatestPrice = latestPrice ?? recentTrades[recentTrades.length - 1]?.price ?? trades[trades.length - 1]?.price ?? null;
  const change24h =
    baselinePrice && effectiveLatestPrice
      ? ((effectiveLatestPrice - baselinePrice) / baselinePrice) * 100
      : null;

  return {
    latestPrice: effectiveLatestPrice,
    change24h:
      change24h !== null && Number.isFinite(change24h)
        ? change24h
        : null,
    volume24h: recentTrades.reduce((sum, trade) => sum + trade.volume, 0),
    swaps24h: recentTrades.length,
    high24h:
      recentTrades.length > 0
        ? Math.max(...recentTrades.map((trade) => trade.price))
        : null,
    low24h:
      recentTrades.length > 0
        ? Math.min(...recentTrades.map((trade) => trade.price))
        : null,
    lastUpdatedMs:
      referenceTimestampMs ?? trades[trades.length - 1]?.timestampMs ?? null,
  };
}

export async function fetchOrbitalPoolTradePoints(
  params: FetchOrbitalPoolTradePointsParams,
): Promise<OrbitalPoolTradePoint[]> {
  const {
    chainId,
    poolAddress,
    tokenInIndex,
    tokenOutIndex,
    tokenInDecimals = 18,
    tokenOutDecimals = 18,
  } = params;

  if (!poolAddress || tokenInIndex === tokenOutIndex) {
    return [];
  }

  const cacheKey = makeChainCacheKey(
    chainId,
    `orbital-market:${poolAddress.toLowerCase()}:${tokenInIndex}:${tokenOutIndex}:trades`,
  );
  const cached = getCached<OrbitalPoolTradePoint[]>(cacheKey);
  if (cached) {
    return cached;
  }

  return dedupeRpcRequest(cacheKey, async () => {
    const provider = getReadOnlyProvider(chainId);
    const events = await queryRecentLogsBestEffort(
      provider,
      (queryProvider, fromBlock, toBlock) => {
        const pool = new ethers.Contract(poolAddress, OrbitalPoolABI, queryProvider);
        return pool.queryFilter(pool.filters.Swap(), fromBlock, toBlock);
      },
      {
        chainId,
        label: 'orbital pool Swap',
        maxLookbackBlocks: ORBITAL_LOOKBACK_BLOCKS,
        initialChunkSize: 40_000,
        maxRequests: 10,
        maxEvents: MAX_SWAP_EVENTS,
      },
    );

    const blockTimestampCache = new Map<number, number>();
    const trades: OrbitalPoolTradePoint[] = [];

    for (const event of events) {
      const log = event as ethers.EventLog;
      const eventTokenInIndex = Number(log.args[1] ?? -1);
      const eventTokenOutIndex = Number(log.args[2] ?? -1);

      let price: number | null = null;
      let volume: number | null = null;

      if (eventTokenInIndex === tokenInIndex && eventTokenOutIndex === tokenOutIndex) {
        const amountIn = toDisplayAmount(log.args[3] as bigint, tokenInDecimals);
        const amountOut = toDisplayAmount(log.args[4] as bigint, tokenOutDecimals);
        if (amountIn !== null && amountOut !== null) {
          price = amountOut / amountIn;
          volume = amountIn;
        }
      } else if (eventTokenInIndex === tokenOutIndex && eventTokenOutIndex === tokenInIndex) {
        const amountIn = toDisplayAmount(log.args[3] as bigint, tokenOutDecimals);
        const amountOut = toDisplayAmount(log.args[4] as bigint, tokenInDecimals);
        if (amountIn !== null && amountOut !== null) {
          price = amountIn / amountOut;
          volume = amountOut;
        }
      }

      if (
        price === null ||
        volume === null ||
        !Number.isFinite(price) ||
        price <= 0 ||
        !Number.isFinite(volume) ||
        volume <= 0
      ) {
        continue;
      }

      trades.push({
        id: `orbital:${log.transactionHash}:${log.index}`,
        timestampMs: await resolveBlockTimestampMs(provider, log.blockNumber, blockTimestampCache),
        price,
        volume,
        tokenInIndex: eventTokenInIndex,
        tokenOutIndex: eventTokenOutIndex,
      });
    }

    trades.sort((left, right) => left.timestampMs - right.timestampMs);
    setCache(cacheKey, trades, TTL_MARKET);
    return trades;
  });
}

export async function fetchOrbitalPoolSpotPrice(
  params: FetchOrbitalPoolTradePointsParams,
): Promise<OrbitalPoolSpotPrice | null> {
  const {
    chainId,
    poolAddress,
    tokenInIndex,
    tokenOutIndex,
  } = params;

  if (!poolAddress || tokenInIndex === tokenOutIndex) {
    return null;
  }

  const cacheKey = makeChainCacheKey(
    chainId,
    `orbital-market:${poolAddress.toLowerCase()}:${tokenInIndex}:${tokenOutIndex}:spot`,
  );
  const cached = getCached<OrbitalPoolSpotPrice | null>(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const provider = getReadOnlyProvider(chainId);
    const pool = new ethers.Contract(poolAddress, OrbitalPoolABI, provider);
    const price = Number(
      ethers.formatUnits(
        BigInt(await pool.getSpotPrice(tokenInIndex, tokenOutIndex)),
        18,
      ),
    );

    if (!Number.isFinite(price) || price <= 0) {
      setCache(cacheKey, null, TTL_MARKET);
      return null;
    }

    const result = {
      price,
      timestampMs: Date.now(),
    } satisfies OrbitalPoolSpotPrice;
    setCache(cacheKey, result, TTL_MARKET);
    return result;
  } catch {
    setCache(cacheKey, null, TTL_MARKET);
    return null;
  }
}

export async function fetchOrbitalPoolChartSnapshot(
  params: FetchOrbitalPoolChartSnapshotParams,
): Promise<OrbitalPoolChartSnapshot> {
  const {
    chainId,
    poolAddress,
    tokenInIndex,
    tokenOutIndex,
    interval,
    tokenInDecimals = 18,
    tokenOutDecimals = 18,
  } = params;

  if (!poolAddress || tokenInIndex === tokenOutIndex) {
    return {
      candles: [],
      summary: summarizeOrbitalPoolActivity({ trades: [], latestPrice: null }),
      source: 'none',
      usedSpotFallback: false,
    };
  }

  const cacheKey = makeChainCacheKey(
    chainId,
    `orbital-market:${poolAddress.toLowerCase()}:${tokenInIndex}:${tokenOutIndex}:${interval}:snapshot`,
  );
  const cached = getCached<OrbitalPoolChartSnapshot>(cacheKey);
  if (cached) {
    return cached;
  }

  return dedupeRpcRequest(cacheKey, async () => {
    const [trades, spot] = await Promise.all([
      fetchOrbitalPoolTradePoints({
        chainId,
        poolAddress,
        tokenInIndex,
        tokenOutIndex,
        tokenInDecimals,
        tokenOutDecimals,
      }),
      fetchOrbitalPoolSpotPrice({
        chainId,
        poolAddress,
        tokenInIndex,
        tokenOutIndex,
      }),
    ]);

    let candles = orbitalTradesToCandles(trades, interval);
    let usedSpotFallback = false;

    if (candles.length === 0 && spot && spot.price > 0) {
      candles = buildSpotPriceFallbackCandles(spot.price, spot.timestampMs, interval);
      usedSpotFallback = true;
    }

    const summary = summarizeOrbitalPoolActivity({
      trades,
      latestPrice: spot?.price ?? candles[candles.length - 1]?.close ?? null,
      referenceTimestampMs: spot?.timestampMs,
    });

    const snapshot: OrbitalPoolChartSnapshot = {
      candles,
      summary,
      source: trades.length > 0 ? 'swaps' : spot ? 'spot' : 'none',
      usedSpotFallback,
    };

    setCache(cacheKey, snapshot, TTL_MARKET);
    return snapshot;
  });
}
