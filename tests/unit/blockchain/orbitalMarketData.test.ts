import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import {
  buildSpotPriceFallbackCandles,
  orbitalTradesToCandles,
  summarizeOrbitalPoolActivity,
} from '../../../src/lib/blockchain/orbitalMarketData';
import type { OrbitalPoolTradePoint } from '../../../src/lib/blockchain/orbitalMarketData';

function buildTrade(partial: Partial<OrbitalPoolTradePoint>): OrbitalPoolTradePoint {
  return {
    id: 'trade',
    timestampMs: new Date('2026-03-29T10:00:00Z').getTime(),
    price: 1,
    volume: 1,
    tokenInIndex: 0,
    tokenOutIndex: 1,
    ...partial,
  };
}

describe('orbitalMarketData', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-29T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aggregates orbital trades into OHLCV candles by interval', () => {
    const candles = orbitalTradesToCandles(
      [
        buildTrade({
          id: 'one',
          timestampMs: new Date('2026-03-29T10:01:00Z').getTime(),
          price: 10,
          volume: 100,
        }),
        buildTrade({
          id: 'two',
          timestampMs: new Date('2026-03-29T10:04:00Z').getTime(),
          price: 12,
          volume: 50,
        }),
        buildTrade({
          id: 'three',
          timestampMs: new Date('2026-03-29T10:08:00Z').getTime(),
          price: 9,
          volume: 30,
        }),
      ],
      '5m',
    );

    assert.deepEqual(candles, [
      {
        time: Math.floor(new Date('2026-03-29T10:01:00Z').getTime() / 1000 / 300) * 300,
        open: 10,
        high: 12,
        low: 10,
        close: 12,
        volume: 150,
      },
      {
        time: Math.floor(new Date('2026-03-29T10:08:00Z').getTime() / 1000 / 300) * 300,
        open: 9,
        high: 9,
        low: 9,
        close: 9,
        volume: 30,
      },
    ]);
  });

  it('builds a flat spot-price fallback series without fabricating movement', () => {
    const candles = buildSpotPriceFallbackCandles(
      2.5,
      new Date('2026-03-29T12:00:00Z').getTime(),
      '1h',
      3,
    );

    assert.equal(candles.length, 3);
    assert.deepEqual(
      candles.map((candle) => ({
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      })),
      [
        { open: 2.5, high: 2.5, low: 2.5, close: 2.5, volume: 0 },
        { open: 2.5, high: 2.5, low: 2.5, close: 2.5, volume: 0 },
        { open: 2.5, high: 2.5, low: 2.5, close: 2.5, volume: 0 },
      ],
    );
  });

  it('summarizes recent pool activity from trades and the latest price', () => {
    const summary = summarizeOrbitalPoolActivity({
      trades: [
        buildTrade({
          id: 'old',
          timestampMs: new Date('2026-03-28T11:00:00Z').getTime(),
          price: 8,
          volume: 10,
        }),
        buildTrade({
          id: 'recent-one',
          timestampMs: new Date('2026-03-29T02:00:00Z').getTime(),
          price: 10,
          volume: 40,
        }),
        buildTrade({
          id: 'recent-two',
          timestampMs: new Date('2026-03-29T09:00:00Z').getTime(),
          price: 12,
          volume: 25,
        }),
      ],
      latestPrice: 11,
      referenceTimestampMs: new Date('2026-03-29T12:00:00Z').getTime(),
    });

    assert.equal(summary.latestPrice, 11);
    assert.equal(Number(summary.change24h?.toFixed(2)), 10);
    assert.equal(summary.volume24h, 65);
    assert.equal(summary.swaps24h, 2);
    assert.equal(summary.high24h, 12);
    assert.equal(summary.low24h, 10);
    assert.equal(summary.lastUpdatedMs, new Date('2026-03-29T12:00:00Z').getTime());
  });
});
