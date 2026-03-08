import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { TradeHistory, WrappedAsset } from '../../src/types';
import {
  calculateAssetAllocations,
  calculateAssetPerformance,
  calculateCostBasis,
  calculatePortfolioSummary,
  formatPnLCurrency,
  formatPnLPercent,
} from '../../src/lib/portfolioMetrics';

function assertClose(actual: number, expected: number, tolerance = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

const WAD = 10n ** 18n;
const toWei = (value: number): string => (BigInt(value) * WAD).toString();

const ASSET_A: WrappedAsset = {
  address: '0x1111111111111111111111111111111111111111',
  name: 'Asset A',
  symbol: 'ASA',
  totalSupply: toWei(200),
  balance: toWei(96),
  documentHash: '0xhash-a',
  documentType: 'invoice',
  originalValue: toWei(1000),
};

const ASSET_B: WrappedAsset = {
  address: '0x2222222222222222222222222222222222222222',
  name: 'Asset B',
  symbol: 'ASB',
  totalSupply: toWei(10),
  balance: toWei(2),
  documentHash: '0xhash-b',
  documentType: 'statement',
  originalValue: toWei(100),
};

const TRADES_A: TradeHistory[] = [
  {
    id: 't1',
    type: 'mint',
    asset: ASSET_A.address,
    assetSymbol: ASSET_A.symbol,
    amount: '100',
    txHash: '0xaaa1',
    timestamp: 1,
    from: '0x0',
    to: '0xmaker',
    status: 'confirmed',
  },
  {
    id: 't2',
    type: 'exchange',
    asset: ASSET_A.address,
    assetSymbol: ASSET_A.symbol,
    amount: '20',
    txHash: '0xaaa2',
    timestamp: 2,
    from: '0xmaker',
    to: '0xtaker',
    status: 'confirmed',
  },
  {
    id: 't3',
    type: 'transfer',
    asset: ASSET_A.address,
    assetSymbol: ASSET_A.symbol,
    amount: '24',
    txHash: '0xaaa3',
    timestamp: 3,
    from: '0xmaker',
    to: '0xtaker',
    status: 'confirmed',
  },
];

test('calculateCostBasis applies average-cost accounting with proportional sell reduction', () => {
  const costBasis = calculateCostBasis(TRADES_A, ASSET_A.address);
  assertClose(costBasis, 16);
});

test('calculateAssetPerformance returns realized/unrealized pnl and cost data flags', () => {
  const performance = calculateAssetPerformance(ASSET_A, TRADES_A);

  assert.equal(performance.address, ASSET_A.address);
  assert.equal(performance.symbol, ASSET_A.symbol);
  assertClose(performance.currentValue, 480);
  assertClose(performance.costBasis, 16);
  assertClose(performance.realizedPnL, 116);
  assertClose(performance.unrealizedPnL, 464);
  assertClose(performance.totalPnL, 580);
  assertClose(performance.averageBuyPrice, 1 / 6);
  assertClose(performance.percentageChange, 2900);
  assert.equal(performance.hasCostData, true);
});

test('calculatePortfolioSummary aggregates allocations and selects performers from assets with trade data', () => {
  const summary = calculatePortfolioSummary([ASSET_A, ASSET_B], TRADES_A);

  assertClose(summary.totalValue, 500);
  assertClose(summary.totalCostBasis, 16);
  assertClose(summary.totalPnL, 600);
  assertClose(summary.totalPercentageChange, 3025);
  assert.equal(summary.assetsWithCostData, 1);
  assert.equal(summary.bestPerformer?.symbol, 'ASA');
  assert.equal(summary.worstPerformer?.symbol, 'ASA');

  assert.equal(summary.allocations.length, 2);
  assert.equal(summary.allocations[0].symbol, 'ASA');
  assertClose(summary.allocations[0].percentage, 96);
  assert.equal(summary.allocations[1].symbol, 'ASB');
  assertClose(summary.allocations[1].percentage, 4);
});

test('calculateAssetAllocations handles zero-value portfolios gracefully', () => {
  const zeroValueAsset: WrappedAsset = {
    ...ASSET_A,
    address: '0x3333333333333333333333333333333333333333',
    symbol: 'ZERO',
    balance: '0',
    originalValue: '0',
    totalSupply: '0',
  };

  const allocations = calculateAssetAllocations([zeroValueAsset]);
  assert.equal(allocations.length, 1);
  assert.equal(allocations[0].percentage, 0);
});

test('calculatePortfolioSummary returns zeroed defaults for an empty portfolio', () => {
  const summary = calculatePortfolioSummary([], []);

  assert.deepEqual(summary, {
    totalValue: 0,
    totalCostBasis: 0,
    totalPnL: 0,
    totalPercentageChange: 0,
    bestPerformer: null,
    worstPerformer: null,
    assetsWithCostData: 0,
    allocations: [],
  });
});

test('pnl formatter helpers render signed currency and percentage strings', () => {
  assert.equal(formatPnLCurrency(12.345), '+$12.35');
  assert.equal(formatPnLCurrency(-12.345), '-$12.35');
  assert.equal(formatPnLCurrency(0), '$0.00');

  assert.equal(formatPnLPercent(12.345), '+12.35%');
  assert.equal(formatPnLPercent(-12.345), '-12.35%');
  assert.equal(formatPnLPercent(0), '0.00%');
});
