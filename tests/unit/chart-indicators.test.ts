import { describe, expect, it } from 'vitest';
import {
  computeBollingerBands,
  computeMacd,
  computeRsi,
  computeSma,
} from '../../src/lib/chart/indicators';
import type { ChartCandle } from '../../src/lib/chart/dataFeed';

function buildCandles(length: number): ChartCandle[] {
  return Array.from({ length }, (_, index) => ({
    time: 1_700_000_000 + (index * 60),
    open: 100 + index,
    high: 101 + index,
    low: 99 + index,
    close: 100 + index,
    volume: 10 + index,
  }));
}

describe('chart indicators', () => {
  it('computes SMA values aligned to the candle time window', () => {
    const candles = buildCandles(6);
    const sma = computeSma(candles, 3);

    expect(sma).toEqual([
      { time: candles[2].time, value: 101 },
      { time: candles[3].time, value: 102 },
      { time: candles[4].time, value: 103 },
      { time: candles[5].time, value: 104 },
    ]);
  });

  it('computes Bollinger Bands, RSI, and MACD for valid candle series', () => {
    const candles = buildCandles(40);

    const bands = computeBollingerBands(candles);
    const rsi = computeRsi(candles);
    const macd = computeMacd(candles);

    expect(bands.length).toBeGreaterThan(0);
    expect(bands[0]?.upper).toBeGreaterThan(bands[0]?.middle ?? 0);
    expect(bands[0]?.middle).toBeGreaterThan(bands[0]?.lower ?? 0);

    expect(rsi.length).toBeGreaterThan(0);
    expect(rsi.every((point) => point.value >= 0 && point.value <= 100)).toBe(true);

    expect(macd.length).toBeGreaterThan(0);
    expect(macd[macd.length - 1]).toEqual(
      expect.objectContaining({
        macd: expect.any(Number),
        signal: expect.any(Number),
        histogram: expect.any(Number),
      }),
    );
  });
});
