import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TradingViewChart from '../../../src/components/Exchange/TradingViewChart';

const setCandleDataMock = vi.fn();
const setVolumeDataMock = vi.fn();
const setIndicatorDataMock = vi.fn();
const createPriceLineMock = vi.fn();
const fitContentMock = vi.fn();
const applyOptionsMock = vi.fn();
const subscribeCrosshairMoveMock = vi.fn();
const subscribeVisibleLogicalRangeChangeMock = vi.fn();
const removeMock = vi.fn();
const createChartMock = vi.fn();
const usePriceHistoryMock = vi.fn();

vi.mock('../../../src/hooks/useTheme', () => ({
  useTheme: () => ({ isDark: true }),
}));

vi.mock('../../../src/store/walletStore', () => ({
  useWalletStore: (selector: (state: { wallet: { chainId: number | null } }) => unknown) =>
    selector({ wallet: { chainId: 421614 } }),
}));

vi.mock('../../../src/hooks/usePriceHistory', () => ({
  usePriceHistory: (...args: unknown[]) => usePriceHistoryMock(...args),
}));

vi.mock('lightweight-charts', () => ({
  CandlestickSeries: 'CandlestickSeries',
  HistogramSeries: 'HistogramSeries',
  LineSeries: 'LineSeries',
  ColorType: { Solid: 'solid' },
  CrosshairMode: { Normal: 0 },
  LineStyle: { Dashed: 1 },
  createChart: (...args: unknown[]) => createChartMock(...args),
}));

describe('TradingViewChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createChartMock.mockReturnValue({
      addSeries: (seriesType: string) => {
        if (seriesType === 'CandlestickSeries') {
          return {
            setData: setCandleDataMock,
            coordinateToPrice: vi.fn((coordinate: number) => 100 - coordinate / 10),
            priceToCoordinate: vi.fn((price: number) => 1000 - price),
          };
        }

        if (seriesType === 'HistogramSeries') {
          return {
            setData: setVolumeDataMock,
            createPriceLine: createPriceLineMock,
          };
        }

        return {
          setData: setIndicatorDataMock,
          createPriceLine: createPriceLineMock,
          applyOptions: applyOptionsMock,
        };
      },
      priceScale: () => ({ applyOptions: applyOptionsMock }),
      applyOptions: applyOptionsMock,
      timeScale: () => ({
        fitContent: fitContentMock,
        subscribeVisibleLogicalRangeChange: subscribeVisibleLogicalRangeChangeMock,
        unsubscribeVisibleLogicalRangeChange: vi.fn(),
        setVisibleLogicalRange: vi.fn(),
        timeToCoordinate: vi.fn((time: number) => time),
        coordinateToTime: vi.fn((value: number) => value),
      }),
      subscribeCrosshairMove: subscribeCrosshairMoveMock,
      unsubscribeCrosshairMove: vi.fn(),
      remove: removeMock,
    });
  });

  it('renders empty state when pair is missing', () => {
    usePriceHistoryMock.mockReturnValue({ data: [], isLoading: false, source: 'none' });

    render(<TradingViewChart tokenSell="" tokenBuy="" />);

    expect(screen.getByText(/Select a trading pair to view the chart/i)).toBeInTheDocument();
    expect(createChartMock).not.toHaveBeenCalled();
  });

  it('renders guidance instead of creating a chart for same-token pairs', () => {
    usePriceHistoryMock.mockReturnValue({ data: [], isLoading: false, source: 'none' });

    render(<TradingViewChart tokenSell="0xTokenA" tokenBuy="0xTokenA" />);

    expect(
      screen.getByText(/Select two different tokens to view the chart/i),
    ).toBeInTheDocument();
    expect(createChartMock).not.toHaveBeenCalled();
  });

  it('creates chart panes, indicator toggles, and pushes candle data when pair is selected', async () => {
    usePriceHistoryMock.mockReturnValue({
      isLoading: false,
      source: 'backend',
      data: [
        {
          time: 1_700_000_000,
          open: 1,
          high: 1.1,
          low: 0.95,
          close: 1.05,
          volume: 123,
        },
        {
          time: 1_700_003_600,
          open: 1.05,
          high: 1.2,
          low: 1,
          close: 1.15,
          volume: 200,
        },
      ],
    });

    render(<TradingViewChart tokenSell="0xTokenA" tokenBuy="0xTokenB" />);

    await waitFor(() => {
      expect(createChartMock).toHaveBeenCalled();
      expect(setCandleDataMock).toHaveBeenCalled();
      expect(setVolumeDataMock).toHaveBeenCalled();
      expect(fitContentMock).toHaveBeenCalled();
    });

    expect(screen.getByText(/Backend candles/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1W/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bollinger/i })).toBeInTheDocument();
    expect(screen.getByText(/RSI \(14\)/i)).toBeInTheDocument();
    expect(screen.getByText(/MACD \(12, 26, 9\)/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Bollinger/i }));
    expect(screen.getByRole('button', { name: /Bollinger/i })).toBeInTheDocument();
  });
});
