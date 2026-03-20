import { ethers } from 'ethers';
import { AssetBackedExchangeABI } from '../../contracts/abis/AssetBackedExchange';
import { LiquidityPoolAMMABI } from '../../contracts/abis/LiquidityPoolAMM';
import { getNetworkConfig } from '../../contracts/addresses';
import { getCached, makeChainCacheKey, setCache, TTL_BALANCE } from './rpcCache';
import { getReadOnlyProvider } from './contracts';
import { queryRecentLogsBestEffort } from './logQuery';

const PAIR_TRADE_CACHE_TTL_MS = TTL_BALANCE;
const AMM_LOOKBACK_BLOCKS = 250_000;
const ORDERBOOK_LOOKBACK_BLOCKS = 250_000;
const MAX_TRADE_EVENTS = 200;

export interface PairTradePoint {
  id: string;
  timestampMs: number;
  price: number;
  volume: number;
  source: 'amm' | 'orderbook';
}

interface OrderPairDetails {
  tokenSell: string;
  tokenBuy: string;
}

function normalizeAddress(value: string): string {
  return value.toLowerCase();
}

function isSamePair(
  tokenA: string,
  tokenB: string,
  selectedSell: string,
  selectedBuy: string,
): boolean {
  const leftA = normalizeAddress(tokenA);
  const leftB = normalizeAddress(tokenB);
  const rightA = normalizeAddress(selectedSell);
  const rightB = normalizeAddress(selectedBuy);

  return (
    (leftA === rightA && leftB === rightB) ||
    (leftA === rightB && leftB === rightA)
  );
}

function toDisplayAmount(raw: bigint): number | null {
  const value = Number(ethers.formatUnits(raw, 18));
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
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
    // Fall through to the current wall clock time.
  }

  return Date.now();
}

function extractOrderPairDetails(rawOrder: unknown): OrderPairDetails | null {
  if (!rawOrder || typeof rawOrder !== 'object') {
    return null;
  }

  const candidate = rawOrder as {
    tokenSell?: unknown;
    tokenBuy?: unknown;
    2?: unknown;
    3?: unknown;
  };

  const tokenSell =
    typeof candidate.tokenSell === 'string'
      ? candidate.tokenSell
      : typeof candidate[2] === 'string'
        ? candidate[2]
        : null;
  const tokenBuy =
    typeof candidate.tokenBuy === 'string'
      ? candidate.tokenBuy
      : typeof candidate[3] === 'string'
        ? candidate[3]
        : null;

  if (!tokenSell || !tokenBuy) {
    return null;
  }

  return { tokenSell, tokenBuy };
}

async function fetchAmmPairTrades(
  chainId: number,
  ammAddress: string,
  tokenSell: string,
  tokenBuy: string,
  blockTimestampCache: Map<number, number>,
): Promise<PairTradePoint[]> {
  const provider = getReadOnlyProvider(chainId);
  const amm = new ethers.Contract(ammAddress, LiquidityPoolAMMABI, provider);

  const events = await queryRecentLogsBestEffort(
    provider,
    (fromBlock, toBlock) =>
      amm.queryFilter(amm.filters.Swap(), fromBlock, toBlock),
    {
      chainId,
      label: 'amm Swap',
      maxLookbackBlocks: AMM_LOOKBACK_BLOCKS,
      initialChunkSize: 50_000,
      maxRequests: 10,
      maxEvents: MAX_TRADE_EVENTS,
    },
  );

  const samples: PairTradePoint[] = [];

  for (const event of events) {
    const log = event as ethers.EventLog;
    const eventTokenIn = String(log.args[2] ?? '');
    const eventTokenOut = String(log.args[3] ?? '');

    if (!isSamePair(eventTokenIn, eventTokenOut, tokenSell, tokenBuy)) {
      continue;
    }

    const amountInRaw = log.args[4] as bigint;
    const amountOutRaw = log.args[5] as bigint;
    const amountIn = toDisplayAmount(amountInRaw);
    const amountOut = toDisplayAmount(amountOutRaw);
    if (amountIn === null || amountOut === null) {
      continue;
    }

    let price: number;
    let volume: number;
    if (
      normalizeAddress(eventTokenIn) === normalizeAddress(tokenSell) &&
      normalizeAddress(eventTokenOut) === normalizeAddress(tokenBuy)
    ) {
      price = amountIn / amountOut;
      volume = amountIn;
    } else {
      price = amountOut / amountIn;
      volume = amountOut;
    }

    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(volume) || volume <= 0) {
      continue;
    }

    samples.push({
      id: `amm:${log.transactionHash}:${log.index}`,
      timestampMs: await resolveBlockTimestampMs(provider, log.blockNumber, blockTimestampCache),
      price,
      volume,
      source: 'amm',
    });
  }

  return samples;
}

async function fetchOrderbookPairTrades(
  chainId: number,
  exchangeAddress: string,
  tokenSell: string,
  tokenBuy: string,
  blockTimestampCache: Map<number, number>,
): Promise<PairTradePoint[]> {
  const provider = getReadOnlyProvider(chainId);
  const exchange = new ethers.Contract(exchangeAddress, AssetBackedExchangeABI, provider);

  const events = await queryRecentLogsBestEffort(
    provider,
    (fromBlock, toBlock) =>
      exchange.queryFilter(exchange.filters.OrderFilled(), fromBlock, toBlock),
    {
      chainId,
      label: 'exchange OrderFilled',
      maxLookbackBlocks: ORDERBOOK_LOOKBACK_BLOCKS,
      initialChunkSize: 50_000,
      maxRequests: 10,
      maxEvents: MAX_TRADE_EVENTS,
    },
  );

  const uniqueOrderIds = Array.from(
    new Set(
      events.map((event) => ((event as ethers.EventLog).args[0] as bigint).toString()),
    ),
  );

  const orderDetails = new Map<string, OrderPairDetails | null>();
  await Promise.all(
    uniqueOrderIds.map(async (orderId) => {
      try {
        const order = await exchange.getOrder(BigInt(orderId));
        orderDetails.set(orderId, extractOrderPairDetails(order));
      } catch {
        orderDetails.set(orderId, null);
      }
    }),
  );

  const samples: PairTradePoint[] = [];

  for (const event of events) {
    const log = event as ethers.EventLog;
    const orderId = (log.args[0] as bigint).toString();
    const details = orderDetails.get(orderId);
    if (!details || !isSamePair(details.tokenSell, details.tokenBuy, tokenSell, tokenBuy)) {
      continue;
    }

    const fillAmountSell = toDisplayAmount(log.args[2] as bigint);
    const fillAmountBuy = toDisplayAmount(log.args[3] as bigint);
    if (fillAmountSell === null || fillAmountBuy === null) {
      continue;
    }

    let price: number;
    let volume: number;
    if (
      normalizeAddress(details.tokenSell) === normalizeAddress(tokenSell) &&
      normalizeAddress(details.tokenBuy) === normalizeAddress(tokenBuy)
    ) {
      price = fillAmountSell / fillAmountBuy;
      volume = fillAmountSell;
    } else {
      price = fillAmountBuy / fillAmountSell;
      volume = fillAmountBuy;
    }

    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(volume) || volume <= 0) {
      continue;
    }

    samples.push({
      id: `orderbook:${log.transactionHash}:${log.index}`,
      timestampMs: await resolveBlockTimestampMs(provider, log.blockNumber, blockTimestampCache),
      price,
      volume,
      source: 'orderbook',
    });
  }

  return samples;
}

export async function fetchPairTradePoints(
  chainId: number,
  tokenSell: string,
  tokenBuy: string,
): Promise<PairTradePoint[]> {
  const cacheKey = makeChainCacheKey(
    chainId,
    `market:${normalizeAddress(tokenSell)}:${normalizeAddress(tokenBuy)}:pair-trades`,
  );
  const cached = getCached<PairTradePoint[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const network = getNetworkConfig(chainId);
  if (!network) {
    return [];
  }

  const blockTimestampCache = new Map<number, number>();
  const sources = await Promise.allSettled([
    network.ammAddress
      ? fetchAmmPairTrades(
          chainId,
          network.ammAddress,
          tokenSell,
          tokenBuy,
          blockTimestampCache,
        )
      : Promise.resolve([]),
    network.assetBackedExchangeAddress
      ? fetchOrderbookPairTrades(
          chainId,
          network.assetBackedExchangeAddress,
          tokenSell,
          tokenBuy,
          blockTimestampCache,
        )
      : Promise.resolve([]),
  ]);

  const merged = sources
    .filter((result): result is PromiseFulfilledResult<PairTradePoint[]> => result.status === 'fulfilled')
    .flatMap((result) => result.value)
    .sort((left, right) => left.timestampMs - right.timestampMs);

  setCache(cacheKey, merged, PAIR_TRADE_CACHE_TTL_MS);
  return merged;
}
