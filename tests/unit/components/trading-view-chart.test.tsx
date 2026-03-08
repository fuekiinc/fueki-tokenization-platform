/**
 * TradingViewChart integration tests.
 *
 * Verifies empty-pair fallback UI and chart data population into lightweight-
 * charts series to guard against blank chart regressions.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TradingViewChart from '../../../src/components/Exchange/TradingViewChart';

const setCandleDataMock = vi.fn();
const setVolumeDataMock = vi.fn();
const fitContentMock = vi.fn();
const applyOptionsMock = vi.fn();
const removeMock = vi.fn();
const createChartMock = vi.fn();
const usePriceHistoryMock = vi.fn();

vi.mock('../../../src/hooks/useTheme', () => ({
  useTheme: () => ({ isDark: true }),
}));

vi.mock('../../../src/hooks/usePriceHistory', () => ({
  usePriceHistory: (...args: unknown[]) => usePriceHistoryMock(...args),
}));

vi.mock('lightweight-charts', () => ({
  CandlestickSeries: 'CandlestickSeries',
  HistogramSeries: 'HistogramSeries',
  ColorType: { Solid: 'solid' },
  CrosshairMode: { Normal: 0 },
  createChart: (...args: unknown[]) => createChartMock(...args),
}));

describe('TradingViewChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createChartMock.mockReturnValue({
      addSeries: (seriesType: string) => {
        if (seriesType === 'CandlestickSeries') {
          return { setData: setCandleDataMock };
        }
        return { setData: setVolumeDataMock };
      },
      priceScale: () => ({ applyOptions: applyOptionsMock }),
      applyOptions: applyOptionsMock,
      timeScale: () => ({ fitContent: fitContentMock }),
      remove: removeMock,
    });
  });

  it('renders empty state when pair is missing', () => {
    usePriceHistoryMock.mockReturnValue({ data: [], isLoading: false });

    render(<TradingViewChart tokenSell="" tokenBuy="" />);

    expect(screen.getByText(/Select a trading pair to view the chart/i)).toBeInTheDocument();
    expect(createChartMock).not.toHaveBeenCalled();
  });

  it('creates chart and pushes candle/volume data when pair is selected', async () => {
    usePriceHistoryMock.mockReturnValue({
      isLoading: false,
      data: [
        {
          time: 1_700_000_000,
          open: 1,
          high: 1.1,
          low: 0.95,
          close: 1.05,
          volume: 123,
        },
      ],
    });

    render(<TradingViewChart tokenSell="0xTokenA" tokenBuy="0xTokenB" />);

    await waitFor(() => {
      expect(createChartMock).toHaveBeenCalledTimes(1);
      expect(setCandleDataMock).toHaveBeenCalledTimes(1);
      expect(setVolumeDataMock).toHaveBeenCalledTimes(1);
      expect(fitContentMock).toHaveBeenCalledTimes(1);
    });

    const candleArg = setCandleDataMock.mock.calls[0]?.[0] as Array<{ open: number; close: number }>;
    expect(candleArg).toHaveLength(1);
    expect(candleArg[0]).toEqual(expect.objectContaining({ open: 1, close: 1.05 }));
  });
});
