import type { TradeHistory, WrappedAsset } from '../types/index.ts';
import { parseTokenAmount } from './tokenAmounts.ts';

export type DashboardTimeRange = '7D' | '30D' | '90D' | 'ALL';

export interface PortfolioValuePoint {
  date: string;
  dateKey: string;
  timestamp: number;
  value: number;
  dailyChange: number;
  cumulativeChange: number;
}

export interface PortfolioValueSeries {
  startValue: number;
  endValue: number;
  points: PortfolioValuePoint[];
}

const RANGE_MS: Record<DashboardTimeRange, number> = {
  '7D': 7 * 24 * 60 * 60 * 1000,
  '30D': 30 * 24 * 60 * 60 * 1000,
  '90D': 90 * 24 * 60 * 60 * 1000,
  ALL: Infinity,
};

function normalizeAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.toLowerCase();
}

function deriveTokenPrice(asset: WrappedAsset): number {
  const totalSupply = parseTokenAmount(asset.totalSupply || '0');
  if (totalSupply <= 0) return 0;
  return parseTokenAmount(asset.originalValue || '0') / totalSupply;
}

function parseDisplayAmount(amount: string): number {
  const parsed = Number.parseFloat((amount ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
}

function resolveTradeAsset(
  trade: TradeHistory,
  assetsByAddress: Map<string, WrappedAsset>,
): WrappedAsset | null {
  const candidates = [
    normalizeAddress(trade.assetAddress),
    normalizeAddress(trade.asset),
    normalizeAddress(trade.from),
    normalizeAddress(trade.to),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const asset = assetsByAddress.get(candidate);
    if (asset) {
      return asset;
    }
  }

  return null;
}

export function calculateCurrentPortfolioValue(assets: WrappedAsset[]): number {
  return assets.reduce((sum, asset) => {
    const balance = parseTokenAmount(asset.balance || '0');
    return sum + balance * deriveTokenPrice(asset);
  }, 0);
}

export function estimateTradeValueDelta(
  trade: TradeHistory,
  assets: WrappedAsset[],
  walletAddress?: string | null,
): number {
  const assetsByAddress = new Map(
    assets.map((asset) => [asset.address.toLowerCase(), asset] as const),
  );
  const asset = resolveTradeAsset(trade, assetsByAddress);
  if (!asset) {
    return 0;
  }

  const amount = parseDisplayAmount(trade.amount || '0');
  const valueDelta = amount * deriveTokenPrice(asset);
  const normalizedWallet = normalizeAddress(walletAddress);
  const normalizedFrom = normalizeAddress(trade.from);
  const normalizedTo = normalizeAddress(trade.to);

  switch (trade.type) {
    case 'mint':
    case 'security-mint':
      return valueDelta;
    case 'burn':
      return -valueDelta;
    case 'transfer':
      if (normalizedWallet && normalizedFrom === normalizedWallet) {
        return -valueDelta;
      }
      if (normalizedWallet && normalizedTo === normalizedWallet) {
        return valueDelta;
      }
      return 0;
    case 'exchange':
    case 'swap-eth':
    case 'swap-erc20':
      // Order creation and swaps generally reshuffle value between assets.
      // Without trusted pricing for both legs, treat them as neutral.
      return 0;
    default:
      return 0;
  }
}

export function calculatePortfolioChangePercent(
  trades: TradeHistory[],
  assets: WrappedAsset[],
  currentPortfolioValue: number,
  walletAddress: string | null | undefined,
  rangeMs: number,
): number | null {
  if (currentPortfolioValue <= 0) return null;

  const cutoff = Date.now() - rangeMs;
  const relevantTrades = trades.filter(
    (trade) => trade.status === 'confirmed' && trade.timestamp >= cutoff,
  );

  if (relevantTrades.length === 0) {
    return null;
  }

  const periodDelta = relevantTrades.reduce(
    (sum, trade) => sum + estimateTradeValueDelta(trade, assets, walletAddress),
    0,
  );
  const previousValue = currentPortfolioValue - periodDelta;

  if (!Number.isFinite(previousValue) || previousValue <= 0) {
    return null;
  }

  const rawChange = (periodDelta / previousValue) * 100;
  if (!Number.isFinite(rawChange)) {
    return null;
  }

  return rawChange;
}

export function buildPortfolioValueSeries(params: {
  trades: TradeHistory[];
  assets: WrappedAsset[];
  currentPortfolioValue: number;
  walletAddress?: string | null;
  range: DashboardTimeRange;
}): PortfolioValueSeries {
  const {
    trades,
    assets,
    currentPortfolioValue,
    walletAddress = null,
    range,
  } = params;

  const now = Date.now();
  const cutoff = range === 'ALL' ? 0 : now - RANGE_MS[range];
  const relevantTrades = trades
    .filter((trade) => trade.status === 'confirmed' && trade.timestamp >= cutoff)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (relevantTrades.length === 0) {
    return {
      startValue: currentPortfolioValue,
      endValue: currentPortfolioValue,
      points: [],
    };
  }

  const startValue = relevantTrades.reduce((sum, trade) => {
    return sum - estimateTradeValueDelta(trade, assets, walletAddress);
  }, currentPortfolioValue);

  const dailyChanges = new Map<string, { timestamp: number; delta: number }>();
  for (const trade of relevantTrades) {
    const day = new Date(trade.timestamp);
    const dateKey = Number.isNaN(day.getTime())
      ? 'unknown'
      : `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    const delta = estimateTradeValueDelta(trade, assets, walletAddress);
    const existing = dailyChanges.get(dateKey);
    if (existing) {
      existing.delta += delta;
      existing.timestamp = Math.min(existing.timestamp, trade.timestamp);
    } else {
      dailyChanges.set(dateKey, {
        timestamp: trade.timestamp,
        delta,
      });
    }
  }

  let runningValue = startValue;
  const points = Array.from(dailyChanges.entries())
    .sort(([, left], [, right]) => left.timestamp - right.timestamp)
    .map(([dateKey, entry]) => {
      runningValue = Math.max(0, runningValue + entry.delta);
      const labelDate = new Date(entry.timestamp);
      return {
        date: Number.isNaN(labelDate.getTime())
          ? 'Unknown'
          : labelDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        dateKey,
        timestamp: entry.timestamp,
        value: runningValue,
        dailyChange: entry.delta,
        cumulativeChange: runningValue - startValue,
      };
    });

  return {
    startValue,
    endValue: currentPortfolioValue,
    points,
  };
}
