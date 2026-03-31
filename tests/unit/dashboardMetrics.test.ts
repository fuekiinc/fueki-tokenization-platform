import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import type { TradeHistory, WrappedAsset } from '../../src/types';
import {
  buildPortfolioValueSeries,
  calculateCurrentPortfolioValue,
  calculatePortfolioChangePercent,
  estimateTradeValueDelta,
} from '../../src/lib/dashboardMetrics';

const WAD = 10n ** 18n;
const toWei = (value: number): string => (BigInt(value) * WAD).toString();

const WALLET = '0x1111111111111111111111111111111111111111';
const COUNTERPARTY = '0x2222222222222222222222222222222222222222';

const ASSET: WrappedAsset = {
  address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  name: 'Asset A',
  symbol: 'ASA',
  totalSupply: toWei(100),
  balance: toWei(60),
  documentHash: '0xhash',
  documentType: 'invoice',
  originalValue: toWei(1000),
};

function buildTrade(partial: Partial<TradeHistory>): TradeHistory {
  return {
    id: 'trade',
    type: 'mint',
    asset: ASSET.name,
    assetAddress: ASSET.address,
    assetSymbol: ASSET.symbol,
    amount: '1',
    txHash: '0xhash',
    timestamp: Date.now(),
    from: '0x0000000000000000000000000000000000000000',
    to: WALLET,
    status: 'confirmed',
    ...partial,
  };
}

describe('dashboardMetrics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-29T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calculates the current holdings-based portfolio value', () => {
    assert.equal(calculateCurrentPortfolioValue([ASSET]), 600);
  });

  it('estimates trade value deltas from assetAddress-aware trades', () => {
    const mintDelta = estimateTradeValueDelta(
      buildTrade({ type: 'mint', amount: '5' }),
      [ASSET],
      WALLET,
    );
    const burnDelta = estimateTradeValueDelta(
      buildTrade({
        type: 'burn',
        amount: '2',
        from: WALLET,
        to: '0x0000000000000000000000000000000000000000',
      }),
      [ASSET],
      WALLET,
    );
    const transferDelta = estimateTradeValueDelta(
      buildTrade({
        type: 'transfer',
        amount: '3',
        from: WALLET,
        to: COUNTERPARTY,
      }),
      [ASSET],
      WALLET,
    );
    const exchangeDelta = estimateTradeValueDelta(
      buildTrade({
        type: 'exchange',
        amount: '9',
        from: ASSET.address,
        to: COUNTERPARTY,
      }),
      [ASSET],
      WALLET,
    );

    assert.equal(mintDelta, 50);
    assert.equal(burnDelta, -20);
    assert.equal(transferDelta, -30);
    assert.equal(exchangeDelta, 0);
  });

  it('reconstructs a stable portfolio value series from the current holdings snapshot', () => {
    const trades: TradeHistory[] = [
      buildTrade({
        id: 'mint',
        type: 'mint',
        amount: '20',
        timestamp: new Date('2026-03-27T08:00:00Z').getTime(),
      }),
      buildTrade({
        id: 'burn',
        type: 'burn',
        amount: '5',
        timestamp: new Date('2026-03-28T09:00:00Z').getTime(),
        from: WALLET,
        to: '0x0000000000000000000000000000000000000000',
      }),
      buildTrade({
        id: 'transfer',
        type: 'transfer',
        amount: '3',
        timestamp: new Date('2026-03-29T10:00:00Z').getTime(),
        from: WALLET,
        to: COUNTERPARTY,
      }),
    ];

    const series = buildPortfolioValueSeries({
      trades,
      assets: [ASSET],
      currentPortfolioValue: 600,
      walletAddress: WALLET,
      range: '7D',
    });

    assert.equal(series.startValue, 480);
    assert.equal(series.endValue, 600);
    assert.deepEqual(
      series.points.map((point) => ({
        dateKey: point.dateKey,
        value: point.value,
        dailyChange: point.dailyChange,
        cumulativeChange: point.cumulativeChange,
      })),
      [
        {
          dateKey: '2026-03-27',
          value: 680,
          dailyChange: 200,
          cumulativeChange: 200,
        },
        {
          dateKey: '2026-03-28',
          value: 630,
          dailyChange: -50,
          cumulativeChange: 150,
        },
        {
          dateKey: '2026-03-29',
          value: 600,
          dailyChange: -30,
          cumulativeChange: 120,
        },
      ],
    );
  });

  it('computes bounded recent percentage change from wallet-scoped deltas', () => {
    const trades: TradeHistory[] = [
      buildTrade({
        id: 'recent-burn',
        type: 'burn',
        amount: '5',
        timestamp: new Date('2026-03-29T06:00:00Z').getTime(),
        from: WALLET,
        to: '0x0000000000000000000000000000000000000000',
      }),
      buildTrade({
        id: 'recent-transfer',
        type: 'transfer',
        amount: '3',
        timestamp: new Date('2026-03-29T09:00:00Z').getTime(),
        from: WALLET,
        to: COUNTERPARTY,
      }),
    ];

    const change = calculatePortfolioChangePercent(
      trades,
      [ASSET],
      600,
      WALLET,
      24 * 60 * 60 * 1000,
    );

    assert.ok(change !== null);
    assert.equal(Number(change?.toFixed(4)), Number(((-80 / 680) * 100).toFixed(4)));
  });
});
