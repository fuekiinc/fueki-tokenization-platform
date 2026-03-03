// ---------------------------------------------------------------------------
// Portfolio Performance Metrics
//
// Pure utility functions for calculating cost basis, P&L, and portfolio-wide
// performance summaries.  All functions are deterministic and side-effect free.
// ---------------------------------------------------------------------------

import type { WrappedAsset, TradeHistory } from '../types/index.ts';
import { parseTokenAmount } from './tokenAmounts.ts';

// ---------------------------------------------------------------------------
// Exported interfaces
// ---------------------------------------------------------------------------

export interface AssetPerformance {
  address: string;
  symbol: string;
  currentBalance: number;
  /** currentBalance * currentPrice (approximated via originalValue / totalSupply) */
  currentValue: number;
  /** Total amount spent acquiring this asset (average cost method) */
  costBasis: number;
  /** Profit from positions that have been sold / burned */
  realizedPnL: number;
  /** currentValue - remaining cost basis for held positions */
  unrealizedPnL: number;
  /** realized + unrealized */
  totalPnL: number;
  /** ((currentValue - costBasis) / costBasis) * 100 -- NaN when costBasis is 0 */
  percentageChange: number;
  /** costBasis / totalBought -- average price paid per token unit */
  averageBuyPrice: number;
  /** Whether cost basis data is available (trades exist for this asset) */
  hasCostData: boolean;
}

export interface AssetAllocation {
  address: string;
  symbol: string;
  name: string;
  /** Absolute dollar value of the position */
  value: number;
  /** Percentage of total portfolio value (0-100) */
  percentage: number;
}

export interface PortfolioSummary {
  totalValue: number;
  totalCostBasis: number;
  totalPnL: number;
  totalPercentageChange: number;
  bestPerformer: AssetPerformance | null;
  worstPerformer: AssetPerformance | null;
  /** Number of assets that have trade data for meaningful P&L */
  assetsWithCostData: number;
  /** Asset allocation percentages, sorted by value descending */
  allocations: AssetAllocation[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a per-token price from the on-chain asset metadata.
 *
 * For wrapped assets the "price" is approximated as:
 *   originalValue / totalSupply
 *
 * This gives us the value per token at the time the asset was tokenised.
 */
function deriveTokenPrice(asset: WrappedAsset): number {
  const totalSupply = parseTokenAmount(asset.totalSupply || '0');
  const originalValue = parseTokenAmount(asset.originalValue || '0');
  if (totalSupply <= 0) return 0;
  return originalValue / totalSupply;
}

/**
 * Identify trades that represent token acquisitions (buys) for a given asset.
 * A "buy" is a mint or an inbound transfer / exchange where the user received
 * the asset.
 */
function isBuyTrade(trade: TradeHistory, assetAddress: string): boolean {
  if (trade.status !== 'confirmed') return false;
  // Match on contract address (stored in `from` or `to`), asset name, or symbol.
  // TradeHistory.asset may be a human-readable name (from MintForm) or an address,
  // so check all fields that could contain the contract address.
  const addr = assetAddress.toLowerCase();
  const matchesAsset =
    trade.asset.toLowerCase() === addr ||
    (trade.from && trade.from.toLowerCase() === addr) ||
    (trade.to && trade.to.toLowerCase() === addr);
  if (!matchesAsset) return false;
  return trade.type === 'mint' || trade.type === 'security-mint';
}

/**
 * Identify trades that represent token disposals (sells / burns).
 */
function isSellTrade(trade: TradeHistory, assetAddress: string): boolean {
  if (trade.status !== 'confirmed') return false;
  const addr = assetAddress.toLowerCase();
  const matchesAsset =
    trade.asset.toLowerCase() === addr ||
    (trade.from && trade.from.toLowerCase() === addr) ||
    (trade.to && trade.to.toLowerCase() === addr);
  if (!matchesAsset) return false;
  return trade.type === 'burn' || trade.type === 'transfer';
}

// ---------------------------------------------------------------------------
// Cost Basis
// ---------------------------------------------------------------------------

/**
 * Calculate the cost basis for an asset using the **average cost method**.
 *
 * Steps:
 * 1. Sum up total tokens acquired (buys/mints) and total cost.
 * 2. For each sell/burn, reduce the cost basis proportionally:
 *    cost_removed = (sold_amount / total_bought) * total_cost
 * 3. Return the remaining cost basis.
 */
export function calculateCostBasis(
  trades: TradeHistory[],
  assetAddress: string,
): number {
  const relevantTrades = trades
    .filter(
      (t) =>
        t.asset.toLowerCase() === assetAddress.toLowerCase() &&
        t.status === 'confirmed',
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  let totalBought = 0;
  let totalCost = 0;
  let totalSold = 0;

  // First pass: sum up buys to determine total cost and average price
  for (const trade of relevantTrades) {
    if (isBuyTrade(trade, assetAddress)) {
      const amount = parseFloat(trade.amount || '0');
      // For mints the "cost" is the original value proportional to minted amount
      // Since we don't have a price field, we use 0 cost for mints (tokens
      // created at zero cost) -- this matches tokenisation semantics where the
      // underlying value is the document, not a purchase price.
      totalBought += amount;
    }
  }

  // Without buys we cannot compute cost basis
  if (totalBought <= 0) return 0;

  // Average cost per token: for tokenised assets, cost basis starts at 0
  // because tokens are minted (created), not purchased.  The "value" of
  // each token is derived from the underlying document.
  //
  // However, if the user has exchange trades, those represent actual
  // purchases with a cost.
  for (const trade of relevantTrades) {
    if (trade.type === 'exchange' || trade.type === 'swap-eth' || trade.type === 'swap-erc20') {
      if (trade.asset.toLowerCase() === assetAddress.toLowerCase()) {
        const amount = parseFloat(trade.amount || '0');
        totalBought += amount;
        // For exchange/swap trades, we approximate cost as the amount
        // (since we lack a price field, the amount itself is used as
        // a proxy -- the counterparty value is not tracked here).
        totalCost += amount;
      }
    }
  }

  if (totalBought <= 0) return 0;

  // Second pass: reduce cost basis for sells
  for (const trade of relevantTrades) {
    if (isSellTrade(trade, assetAddress)) {
      const amount = parseFloat(trade.amount || '0');
      totalSold += amount;
    }
  }

  const remainingRatio = Math.max(0, 1 - totalSold / totalBought);
  return totalCost * remainingRatio;
}

// ---------------------------------------------------------------------------
// Single-asset performance
// ---------------------------------------------------------------------------

export function calculateAssetPerformance(
  asset: WrappedAsset,
  trades: TradeHistory[],
): AssetPerformance {
  const address = asset.address;
  const symbol = asset.symbol;
  const currentBalance = parseTokenAmount(asset.balance || '0');
  const tokenPrice = deriveTokenPrice(asset);
  const currentValue = currentBalance * tokenPrice;

  // Filter confirmed trades for this asset
  const assetTrades = trades.filter(
    (t) =>
      t.asset.toLowerCase() === address.toLowerCase() &&
      t.status === 'confirmed',
  );

  const hasCostData = assetTrades.length > 0;

  // Calculate buy totals
  let totalBought = 0;
  let totalCost = 0;

  for (const trade of assetTrades) {
    if (isBuyTrade(trade, address)) {
      totalBought += parseFloat(trade.amount || '0');
    }
    if (
      trade.type === 'exchange' ||
      trade.type === 'swap-eth' ||
      trade.type === 'swap-erc20'
    ) {
      const amount = parseFloat(trade.amount || '0');
      totalBought += amount;
      totalCost += amount;
    }
  }

  // Calculate sell totals
  let totalSold = 0;
  for (const trade of assetTrades) {
    if (isSellTrade(trade, address)) {
      totalSold += parseFloat(trade.amount || '0');
    }
  }

  const avgCost = totalBought > 0 ? totalCost / totalBought : 0;
  const costBasis = totalBought > 0 ? totalCost * Math.max(0, 1 - totalSold / totalBought) : 0;

  // Realised P&L: proceeds from sells minus the average cost of sold tokens
  const realizedPnL = totalSold * tokenPrice - totalSold * avgCost;

  // Unrealised P&L: current value minus remaining cost basis
  const unrealizedPnL = currentValue - costBasis;

  const totalPnL = realizedPnL + unrealizedPnL;

  // Percentage change relative to cost basis
  const totalCostForPercentage = costBasis + totalSold * avgCost;
  const percentageChange =
    totalCostForPercentage > 0
      ? ((totalPnL) / totalCostForPercentage) * 100
      : 0;

  const averageBuyPrice = totalBought > 0 ? totalCost / totalBought : 0;

  return {
    address,
    symbol,
    currentBalance,
    currentValue,
    costBasis,
    realizedPnL,
    unrealizedPnL,
    totalPnL,
    percentageChange,
    averageBuyPrice,
    hasCostData,
  };
}

// ---------------------------------------------------------------------------
// Asset allocation
// ---------------------------------------------------------------------------

/**
 * Calculate the allocation percentages for each asset in the portfolio.
 *
 * @returns Array of allocations sorted by value descending.
 */
export function calculateAssetAllocations(
  assets: WrappedAsset[],
): AssetAllocation[] {
  const withValues = assets.map((asset) => {
    const balance = parseTokenAmount(asset.balance || '0');
    const price = deriveTokenPrice(asset);
    return {
      address: asset.address,
      symbol: asset.symbol,
      name: asset.name,
      value: balance * price,
    };
  });

  const totalValue = withValues.reduce((sum, a) => sum + a.value, 0);

  return withValues
    .map((a) => ({
      ...a,
      percentage: totalValue > 0 ? (a.value / totalValue) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

// ---------------------------------------------------------------------------
// Portfolio-wide summary
// ---------------------------------------------------------------------------

export function calculatePortfolioSummary(
  assets: WrappedAsset[],
  trades: TradeHistory[],
): PortfolioSummary {
  if (assets.length === 0) {
    return {
      totalValue: 0,
      totalCostBasis: 0,
      totalPnL: 0,
      totalPercentageChange: 0,
      bestPerformer: null,
      worstPerformer: null,
      assetsWithCostData: 0,
      allocations: [],
    };
  }

  const performances = assets.map((asset) =>
    calculateAssetPerformance(asset, trades),
  );

  const totalValue = performances.reduce((sum, p) => sum + p.currentValue, 0);
  const totalCostBasis = performances.reduce((sum, p) => sum + p.costBasis, 0);
  const totalPnL = performances.reduce((sum, p) => sum + p.totalPnL, 0);
  const totalPercentageChange =
    totalCostBasis > 0 ? ((totalValue - totalCostBasis) / totalCostBasis) * 100 : 0;

  const withCostData = performances.filter((p) => p.hasCostData);
  const assetsWithCostData = withCostData.length;

  // Best / worst performer by percentage change (only among assets with data)
  let bestPerformer: AssetPerformance | null = null;
  let worstPerformer: AssetPerformance | null = null;

  if (withCostData.length > 0) {
    bestPerformer = withCostData.reduce((best, current) =>
      current.percentageChange > best.percentageChange ? current : best,
    );
    worstPerformer = withCostData.reduce((worst, current) =>
      current.percentageChange < worst.percentageChange ? current : worst,
    );
  }

  // If no trade data at all, use current value as basis for best/worst
  if (!bestPerformer && performances.length > 0) {
    bestPerformer = performances.reduce((best, current) =>
      current.currentValue > best.currentValue ? current : best,
    );
  }
  if (!worstPerformer && performances.length > 0) {
    worstPerformer = performances.reduce((worst, current) =>
      current.currentValue < worst.currentValue ? current : worst,
    );
  }

  // Asset allocations
  const allocations = calculateAssetAllocations(assets);

  return {
    totalValue,
    totalCostBasis,
    totalPnL,
    totalPercentageChange,
    bestPerformer,
    worstPerformer,
    assetsWithCostData,
    allocations,
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers (re-usable across components)
// ---------------------------------------------------------------------------

/**
 * Format a number as a currency string with dollar sign.
 * e.g. 1234.567 -> "$1,234.57"
 */
export function formatPnLCurrency(value: number): string {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (value > 0) return `+$${formatted}`;
  if (value < 0) return `-$${formatted}`;
  return `$${formatted}`;
}

/**
 * Format a number as a percentage string.
 * e.g. 12.345 -> "+12.35%"
 */
export function formatPnLPercent(value: number): string {
  const formatted = Math.abs(value).toFixed(2);
  if (value > 0) return `+${formatted}%`;
  if (value < 0) return `-${formatted}%`;
  return `${formatted}%`;
}
