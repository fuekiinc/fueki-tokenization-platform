import { ethers } from 'ethers';
import { getRpcEndpoints, getSupportedChainId } from './rpcRegistry';

export type TimeInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export interface MarketCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TradePoint {
  timestampMs: number;
  price: number;
  volume: number;
}

interface CacheEntry {
  candles: MarketCandle[];
  createdAt: number;
}

interface MarketContracts {
  ammAddress: string | null;
  exchangeAddress: string | null;
}

const INTERVAL_SECONDS: Record<TimeInterval, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};

const CACHE_TTL_MS = 5 * 60_000;
const MAX_CACHE_ENTRIES = 200;
const LOOKBACK_BLOCKS = 1_000_000;
const MAX_EVENTS = 500;
const INITIAL_CHUNK_SIZE = 100_000;
const MIN_CHUNK_SIZE = 2_000;
const MAX_REQUESTS = 16;
const TIMESTAMP_SECONDS_UPPER_BOUND = 10_000_000_000;

const READ_PROVIDER_OPTIONS = Object.freeze({
  staticNetwork: true,
  batchMaxCount: 1,
  batchMaxSize: 32_000,
  batchStallTime: 0,
});

const ASSET_BACKED_EXCHANGE_ABI = [
  'event OrderFilled(uint256 indexed orderId, address indexed taker, uint256 fillAmountSell, uint256 fillAmountBuy)',
  'function getOrder(uint256 orderId) view returns (tuple(uint256 id, address maker, address tokenSell, address tokenBuy, uint256 amountSell, uint256 amountBuy, uint256 filledSell, uint256 filledBuy, bool cancelled))',
] as const;

const LIQUIDITY_POOL_AMM_ABI = [
  'event Swap(bytes32 indexed poolId, address indexed sender, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)',
] as const;

const DEFAULT_MARKET_CONTRACTS: Partial<Record<number, MarketContracts>> = {
  1: {
    exchangeAddress: '0xc722789416B8F22138f93C226Ab8a8497A3deCDa',
    ammAddress: '0x4b34D01CdBB82136A593D0a96434e69a1cFbDCF2',
  },
  137: {
    exchangeAddress: '0x099df34B1855C9D54eC232916970db13666b50be',
    ammAddress: null,
  },
  17000: {
    exchangeAddress: '0x6C9217850317e61544a3d5bFD3b3C6CA3ADE6660',
    ammAddress: null,
  },
  42161: {
    exchangeAddress: '0x099df34B1855C9D54eC232916970db13666b50be',
    ammAddress: '0xa9b60375A6433a6697F020F67Dd69851F861DFb8',
  },
  421614: {
    exchangeAddress: '0x099df34B1855C9D54eC232916970db13666b50be',
    ammAddress: '0xa9b60375A6433a6697F020F67Dd69851F861DFb8',
  },
  11155111: {
    exchangeAddress: '0xd639DBfeCE1e764E86eb38159C110C9E45718e9e',
    ammAddress: '0xe8a8CC751a57597637b459060082C4a968185989',
  },
  31337: {
    exchangeAddress: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
    ammAddress: null,
  },
};

const candleCache = new Map<string, CacheEntry>();

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

function makeCacheKey(
  chainId: number,
  tokenSell: string,
  tokenBuy: string,
  interval: TimeInterval,
): string {
  return `${chainId}:${normalizeAddress(tokenSell)}:${normalizeAddress(tokenBuy)}:${interval}`;
}

function getCachedCandles(cacheKey: string): MarketCandle[] | null {
  const entry = candleCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    candleCache.delete(cacheKey);
    return null;
  }
  return entry.candles;
}

function setCachedCandles(cacheKey: string, candles: MarketCandle[]): void {
  candleCache.set(cacheKey, { candles, createdAt: Date.now() });

  if (candleCache.size <= MAX_CACHE_ENTRIES) {
    return;
  }

  const oldestKey = candleCache.keys().next().value;
  if (oldestKey) {
    candleCache.delete(oldestKey);
  }
}

function getMarketContracts(chainId: number): MarketContracts {
  const defaults = DEFAULT_MARKET_CONTRACTS[chainId] ?? {
    exchangeAddress: null,
    ammAddress: null,
  };

  return {
    exchangeAddress:
      process.env[`ASSET_BACKED_EXCHANGE_${chainId}`] ??
      process.env[`VITE_ASSET_BACKED_EXCHANGE_${chainId}`] ??
      defaults.exchangeAddress ??
      null,
    ammAddress:
      process.env[`AMM_${chainId}`] ??
      process.env[`VITE_AMM_${chainId}`] ??
      defaults.ammAddress ??
      null,
  };
}

function normalizeTimestampToSeconds(rawTimestamp: number): number | null {
  if (!Number.isFinite(rawTimestamp) || rawTimestamp <= 0) return null;
  let timestamp = Math.floor(rawTimestamp);
  for (let i = 0; i < 3 && timestamp > TIMESTAMP_SECONDS_UPPER_BOUND; i++) {
    timestamp = Math.floor(timestamp / 1000);
  }
  return timestamp > 0 ? timestamp : null;
}

function toDisplayAmount(raw: bigint): number | null {
  const value = Number(ethers.formatUnits(raw, 18));
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

function isSamePair(
  tokenA: string,
  tokenB: string,
  tokenSell: string,
  tokenBuy: string,
): boolean {
  const leftA = normalizeAddress(tokenA);
  const leftB = normalizeAddress(tokenB);
  const rightA = normalizeAddress(tokenSell);
  const rightB = normalizeAddress(tokenBuy);

  return (
    (leftA === rightA && leftB === rightB) ||
    (leftA === rightB && leftB === rightA)
  );
}

function toCandles(trades: TradePoint[], interval: TimeInterval): MarketCandle[] {
  if (trades.length === 0) {
    return [];
  }

  const intervalSeconds = INTERVAL_SECONDS[interval];
  const buckets = new Map<number, { prices: number[]; volumes: number[] }>();

  for (const trade of trades) {
    if (!Number.isFinite(trade.price) || trade.price <= 0) continue;
    if (!Number.isFinite(trade.volume) || trade.volume <= 0) continue;

    const timestampSeconds = normalizeTimestampToSeconds(trade.timestampMs);
    if (timestampSeconds === null) continue;

    const bucket = Math.floor(timestampSeconds / intervalSeconds) * intervalSeconds;
    const entry = buckets.get(bucket) ?? { prices: [], volumes: [] };
    entry.prices.push(trade.price);
    entry.volumes.push(trade.volume);
    buckets.set(bucket, entry);
  }

  return Array.from(buckets.entries())
    .sort(([left], [right]) => left - right)
    .map(([time, { prices, volumes }]) => ({
      time,
      open: prices[0],
      high: Math.max(...prices),
      low: Math.min(...prices),
      close: prices[prices.length - 1],
      volume: volumes.reduce((sum, value) => sum + value, 0),
    }))
    .filter((candle) => (
      Number.isFinite(candle.open) &&
      Number.isFinite(candle.high) &&
      Number.isFinite(candle.low) &&
      Number.isFinite(candle.close) &&
      Number.isFinite(candle.volume) &&
      candle.low > 0 &&
      candle.low <= candle.high
    ));
}

function isPayloadTooLargeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /413|payload too large|request entity too large|content length exceeded/i.test(message);
}

async function queryRecentLogs(
  provider: ethers.Provider,
  runQuery: (fromBlock: number, toBlock: number) => Promise<Array<ethers.Log | ethers.EventLog>>,
): Promise<Array<ethers.Log | ethers.EventLog>> {
  const latestBlock = await provider.getBlockNumber();
  const earliestBlock = Math.max(0, latestBlock - LOOKBACK_BLOCKS + 1);
  let cursor = latestBlock;
  let chunkSize = INITIAL_CHUNK_SIZE;
  let requestCount = 0;
  const results: Array<ethers.Log | ethers.EventLog> = [];

  while (cursor >= earliestBlock && requestCount < MAX_REQUESTS && results.length < MAX_EVENTS) {
    const fromBlock = Math.max(earliestBlock, cursor - chunkSize + 1);
    requestCount += 1;

    try {
      const chunk = await runQuery(fromBlock, cursor);
      results.push(...chunk);
      cursor = fromBlock - 1;
      continue;
    } catch (error) {
      if (!isPayloadTooLargeError(error) || chunkSize <= MIN_CHUNK_SIZE) {
        throw error;
      }

      chunkSize = Math.max(MIN_CHUNK_SIZE, Math.floor(chunkSize / 2));
    }
  }

  return results
    .sort((left, right) => {
      const leftBlock = left.blockNumber ?? 0;
      const rightBlock = right.blockNumber ?? 0;
      if (leftBlock !== rightBlock) {
        return leftBlock - rightBlock;
      }
      return (left.index ?? 0) - (right.index ?? 0);
    })
    .slice(-MAX_EVENTS);
}

async function withChainProvider<T>(
  chainId: number,
  callback: (provider: ethers.JsonRpcProvider) => Promise<T>,
): Promise<T> {
  const supportedChainId = getSupportedChainId(chainId);
  if (supportedChainId === null) {
    throw new Error(`Unsupported chain: ${chainId}`);
  }

  const endpoints = getRpcEndpoints(supportedChainId);
  if (endpoints.length === 0) {
    throw new Error(`No RPC endpoints configured for chain ${chainId}`);
  }

  let lastError: unknown = null;

  for (const endpoint of endpoints) {
    const provider = new ethers.JsonRpcProvider(
      endpoint,
      supportedChainId,
      READ_PROVIDER_OPTIONS,
    );

    try {
      return await callback(provider);
    } catch (error) {
      lastError = error;
    } finally {
      provider.destroy();
    }
  }

  throw lastError ?? new Error(`Unable to query chain ${chainId}`);
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

  const block = await provider.getBlock(normalizedBlock);
  const timestampMs = block ? block.timestamp * 1000 : Date.now();
  cache.set(normalizedBlock, timestampMs);
  return timestampMs;
}

async function fetchAmmTrades(
  provider: ethers.JsonRpcProvider,
  ammAddress: string,
  tokenSell: string,
  tokenBuy: string,
  blockTimestampCache: Map<number, number>,
): Promise<TradePoint[]> {
  const amm = new ethers.Contract(ammAddress, LIQUIDITY_POOL_AMM_ABI, provider);
  const events = await queryRecentLogs(
    provider,
    (fromBlock, toBlock) => amm.queryFilter(amm.filters.Swap(), fromBlock, toBlock),
  );

  const trades: TradePoint[] = [];

  for (const event of events) {
    const log = event as ethers.EventLog;
    const eventTokenIn = String(log.args[2] ?? '');
    const eventTokenOut = String(log.args[3] ?? '');
    if (!isSamePair(eventTokenIn, eventTokenOut, tokenSell, tokenBuy)) {
      continue;
    }

    const amountIn = toDisplayAmount(log.args[4] as bigint);
    const amountOut = toDisplayAmount(log.args[5] as bigint);
    if (amountIn === null || amountOut === null) {
      continue;
    }

    if (
      normalizeAddress(eventTokenIn) === normalizeAddress(tokenSell) &&
      normalizeAddress(eventTokenOut) === normalizeAddress(tokenBuy)
    ) {
      trades.push({
        price: amountIn / amountOut,
        volume: amountIn,
        timestampMs: await resolveBlockTimestampMs(provider, log.blockNumber, blockTimestampCache),
      });
    } else {
      trades.push({
        price: amountOut / amountIn,
        volume: amountOut,
        timestampMs: await resolveBlockTimestampMs(provider, log.blockNumber, blockTimestampCache),
      });
    }
  }

  return trades;
}

async function fetchOrderbookTrades(
  provider: ethers.JsonRpcProvider,
  exchangeAddress: string,
  tokenSell: string,
  tokenBuy: string,
  blockTimestampCache: Map<number, number>,
): Promise<TradePoint[]> {
  const exchange = new ethers.Contract(exchangeAddress, ASSET_BACKED_EXCHANGE_ABI, provider);
  const events = await queryRecentLogs(
    provider,
    (fromBlock, toBlock) =>
      exchange.queryFilter(exchange.filters.OrderFilled(), fromBlock, toBlock),
  );

  const uniqueOrderIds = Array.from(
    new Set(events.map((event) => ((event as ethers.EventLog).args[0] as bigint).toString())),
  );
  const orderPairs = new Map<string, { tokenSell: string; tokenBuy: string } | null>();

  await Promise.all(
    uniqueOrderIds.map(async (orderId) => {
      try {
        const order = await exchange.getOrder(BigInt(orderId));
        orderPairs.set(orderId, {
          tokenSell: String(order.tokenSell ?? order[2]),
          tokenBuy: String(order.tokenBuy ?? order[3]),
        });
      } catch {
        orderPairs.set(orderId, null);
      }
    }),
  );

  const trades: TradePoint[] = [];

  for (const event of events) {
    const log = event as ethers.EventLog;
    const orderId = (log.args[0] as bigint).toString();
    const pair = orderPairs.get(orderId);
    if (!pair || !isSamePair(pair.tokenSell, pair.tokenBuy, tokenSell, tokenBuy)) {
      continue;
    }

    const fillAmountSell = toDisplayAmount(log.args[2] as bigint);
    const fillAmountBuy = toDisplayAmount(log.args[3] as bigint);
    if (fillAmountSell === null || fillAmountBuy === null) {
      continue;
    }

    if (
      normalizeAddress(pair.tokenSell) === normalizeAddress(tokenSell) &&
      normalizeAddress(pair.tokenBuy) === normalizeAddress(tokenBuy)
    ) {
      trades.push({
        price: fillAmountSell / fillAmountBuy,
        volume: fillAmountSell,
        timestampMs: await resolveBlockTimestampMs(provider, log.blockNumber, blockTimestampCache),
      });
    } else {
      trades.push({
        price: fillAmountBuy / fillAmountSell,
        volume: fillAmountBuy,
        timestampMs: await resolveBlockTimestampMs(provider, log.blockNumber, blockTimestampCache),
      });
    }
  }

  return trades;
}

export async function getPairCandles(
  chainId: number,
  tokenSell: string,
  tokenBuy: string,
  interval: TimeInterval,
): Promise<{ candles: MarketCandle[]; source: 'cache' | 'rpc' }> {
  const cacheKey = makeCacheKey(chainId, tokenSell, tokenBuy, interval);
  const cached = getCachedCandles(cacheKey);
  if (cached) {
    return { candles: cached, source: 'cache' };
  }

  const { ammAddress, exchangeAddress } = getMarketContracts(chainId);
  if (!ammAddress && !exchangeAddress) {
    return { candles: [], source: 'rpc' };
  }

  const candles = await withChainProvider(chainId, async (provider) => {
    const blockTimestampCache = new Map<number, number>();
    const tradeSets = await Promise.allSettled([
      ammAddress
        ? fetchAmmTrades(provider, ammAddress, tokenSell, tokenBuy, blockTimestampCache)
        : Promise.resolve([] as TradePoint[]),
      exchangeAddress
        ? fetchOrderbookTrades(
            provider,
            exchangeAddress,
            tokenSell,
            tokenBuy,
            blockTimestampCache,
          )
        : Promise.resolve([] as TradePoint[]),
    ]);

    const trades = tradeSets
      .filter((result): result is PromiseFulfilledResult<TradePoint[]> => result.status === 'fulfilled')
      .flatMap((result) => result.value)
      .sort((left, right) => left.timestampMs - right.timestampMs);

    return toCandles(trades, interval);
  });

  setCachedCandles(cacheKey, candles);
  return { candles, source: 'rpc' };
}
