import type { ChartCandle } from './dataFeed';

export interface IndicatorPoint {
  time: number;
  value: number;
}

export interface MacdPoint {
  time: number;
  macd: number;
  signal: number;
  histogram: number;
}

export interface BollingerBandPoint {
  time: number;
  upper: number;
  middle: number;
  lower: number;
}

function round(value: number, digits = 6): number {
  return Number(value.toFixed(digits));
}

export function computeSma(
  candles: ChartCandle[],
  period: number,
): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  let rollingSum = 0;

  for (let index = 0; index < candles.length; index += 1) {
    rollingSum += candles[index].close;

    if (index >= period) {
      rollingSum -= candles[index - period].close;
    }

    if (index >= period - 1) {
      result.push({
        time: candles[index].time,
        value: round(rollingSum / period),
      });
    }
  }

  return result;
}

export function computeBollingerBands(
  candles: ChartCandle[],
  period = 20,
  standardDeviations = 2,
): BollingerBandPoint[] {
  const result: BollingerBandPoint[] = [];

  for (let index = period - 1; index < candles.length; index += 1) {
    const window = candles.slice(index - period + 1, index + 1);
    const mean = window.reduce((total, candle) => total + candle.close, 0) / period;
    const variance = window.reduce(
      (total, candle) => total + ((candle.close - mean) ** 2),
      0,
    ) / period;
    const deviation = Math.sqrt(variance) * standardDeviations;

    result.push({
      time: candles[index].time,
      upper: round(mean + deviation),
      middle: round(mean),
      lower: round(mean - deviation),
    });
  }

  return result;
}

export function computeRsi(
  candles: ChartCandle[],
  period = 14,
): IndicatorPoint[] {
  if (candles.length <= period) {
    return [];
  }

  const result: IndicatorPoint[] = [];
  let gains = 0;
  let losses = 0;

  for (let index = 1; index <= period; index += 1) {
    const delta = candles[index].close - candles[index - 1].close;
    if (delta >= 0) {
      gains += delta;
    } else {
      losses += Math.abs(delta);
    }
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;

  const firstValue = averageLoss === 0
    ? 100
    : 100 - (100 / (1 + (averageGain / averageLoss)));
  result.push({
    time: candles[period].time,
    value: round(firstValue, 2),
  });

  for (let index = period + 1; index < candles.length; index += 1) {
    const delta = candles[index].close - candles[index - 1].close;
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? Math.abs(delta) : 0;

    averageGain = ((averageGain * (period - 1)) + gain) / period;
    averageLoss = ((averageLoss * (period - 1)) + loss) / period;

    const rsi = averageLoss === 0
      ? 100
      : 100 - (100 / (1 + (averageGain / averageLoss)));

    result.push({
      time: candles[index].time,
      value: round(rsi, 2),
    });
  }

  return result;
}

function computeEmaSeries(values: number[], period: number): Array<number | null> {
  if (values.length < period) {
    return Array.from({ length: values.length }, () => null);
  }

  const multiplier = 2 / (period + 1);
  const result: Array<number | null> = Array.from({ length: values.length }, () => null);
  let previousEma = values.slice(0, period).reduce((total, value) => total + value, 0) / period;
  result[period - 1] = previousEma;

  for (let index = period; index < values.length; index += 1) {
    previousEma = ((values[index] - previousEma) * multiplier) + previousEma;
    result[index] = previousEma;
  }

  return result;
}

export function computeMacd(
  candles: ChartCandle[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MacdPoint[] {
  const closes = candles.map((candle) => candle.close);
  const fastEma = computeEmaSeries(closes, fastPeriod);
  const slowEma = computeEmaSeries(closes, slowPeriod);

  const macdValues = closes.map((_, index) => {
    const fast = fastEma[index];
    const slow = slowEma[index];
    if (fast == null || slow == null) {
      return null;
    }
    return fast - slow;
  });

  const signalInput = macdValues.map((value) => value ?? 0);
  const signalValues = computeEmaSeries(signalInput, signalPeriod);

  const result: MacdPoint[] = [];

  for (let index = 0; index < candles.length; index += 1) {
    const macd = macdValues[index];
    const signal = signalValues[index];
    if (macd == null || signal == null) {
      continue;
    }

    result.push({
      time: candles[index].time,
      macd: round(macd),
      signal: round(signal),
      histogram: round(macd - signal),
    });
  }

  return result;
}
