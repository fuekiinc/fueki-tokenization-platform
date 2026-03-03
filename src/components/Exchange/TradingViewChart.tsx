/**
 * TradingViewChart -- professional candlestick chart using lightweight-charts v5.
 *
 * Displays OHLCV data for a selected token pair with time-interval selection,
 * volume histogram overlay, responsive resize handling, and dark/light theme
 * support.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
} from 'lightweight-charts';
import type {
  CandlestickData,
  ChartOptions,
  DeepPartial,
  HistogramData,
  IChartApi,
  ISeriesApi,
  Time,
} from 'lightweight-charts';
import { useTheme } from '../../hooks/useTheme';
import { usePriceHistory } from '../../hooks/usePriceHistory';
import type { TimeInterval } from '../../hooks/usePriceHistory';
import { BarChart3, Loader2 } from 'lucide-react';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TradingViewChartProps {
  tokenSell: string;
  tokenBuy: string;
  height?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIME_INTERVALS: { value: TimeInterval; label: string }[] = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: '1D' },
];

// Candle colours
const UP_COLOR = '#10B981';
const DOWN_COLOR = '#EF4444';

// ---------------------------------------------------------------------------
// Theme helpers
// ---------------------------------------------------------------------------

function getDarkChartOptions(): DeepPartial<ChartOptions> {
  return {
    layout: {
      background: { type: ColorType.Solid, color: 'transparent' },
      textColor: '#9CA3AF',
      fontFamily:
        "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
    grid: {
      vertLines: { color: 'rgba(255,255,255,0.04)' },
      horzLines: { color: 'rgba(255,255,255,0.04)' },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        color: 'rgba(255,255,255,0.15)',
        labelBackgroundColor: '#374151',
      },
      horzLine: {
        color: 'rgba(255,255,255,0.15)',
        labelBackgroundColor: '#374151',
      },
    },
    rightPriceScale: {
      borderColor: 'rgba(255,255,255,0.06)',
    },
    timeScale: {
      borderColor: 'rgba(255,255,255,0.06)',
      timeVisible: true,
      secondsVisible: false,
    },
  };
}

function getLightChartOptions(): DeepPartial<ChartOptions> {
  return {
    layout: {
      background: { type: ColorType.Solid, color: 'transparent' },
      textColor: '#6B7280',
      fontFamily:
        "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
    grid: {
      vertLines: { color: 'rgba(0,0,0,0.06)' },
      horzLines: { color: 'rgba(0,0,0,0.06)' },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        color: 'rgba(0,0,0,0.2)',
        labelBackgroundColor: '#E5E7EB',
      },
      horzLine: {
        color: 'rgba(0,0,0,0.2)',
        labelBackgroundColor: '#E5E7EB',
      },
    },
    rightPriceScale: {
      borderColor: 'rgba(0,0,0,0.08)',
    },
    timeScale: {
      borderColor: 'rgba(0,0,0,0.08)',
      timeVisible: true,
      secondsVisible: false,
    },
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TradingViewChart({
  tokenSell,
  tokenBuy,
  height = 400,
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  const { isDark } = useTheme();
  const [interval, setInterval] = useState<TimeInterval>('1h');
  const { data, isLoading } = usePriceHistory(tokenSell, tokenBuy, interval);

  // -------------------------------------------------------------------
  // Create chart instance (once per mount)
  // -------------------------------------------------------------------

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const themeOpts = isDark ? getDarkChartOptions() : getLightChartOptions();

    const chart = createChart(container, {
      ...themeOpts,
      autoSize: true,
      height,
    });

    // Add candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: UP_COLOR,
      downColor: DOWN_COLOR,
      borderUpColor: UP_COLOR,
      borderDownColor: DOWN_COLOR,
      wickUpColor: UP_COLOR,
      wickDownColor: DOWN_COLOR,
    });

    // Add volume histogram series on a separate price scale
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    // Configure the volume price scale (overlay at bottom, 20% height)
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
      // drawTicks not supported in this version
      borderVisible: false,
      visible: false,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
    // Re-create chart when height changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  // -------------------------------------------------------------------
  // Update theme when it changes
  // -------------------------------------------------------------------

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const themeOpts = isDark ? getDarkChartOptions() : getLightChartOptions();
    chart.applyOptions(themeOpts);
  }, [isDark]);

  // -------------------------------------------------------------------
  // Push data into the chart whenever it changes
  // -------------------------------------------------------------------

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const chart = chartRef.current;
    if (!candleSeries || !volumeSeries || !chart) return;

    if (data.length === 0) {
      candleSeries.setData([]);
      volumeSeries.setData([]);
      return;
    }

    // Map hook data to lightweight-charts types
    const candleData: CandlestickData<Time>[] = data.map((d) => ({
      time: d.time as unknown as Time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    const volumeData: HistogramData<Time>[] = data.map((d) => ({
      time: d.time as unknown as Time,
      value: d.volume,
      color: d.close >= d.open
        ? 'rgba(16, 185, 129, 0.25)' // up -- emerald semi-transparent
        : 'rgba(239, 68, 68, 0.25)',  // down -- red semi-transparent
    }));

    candleSeries.setData(candleData);
    volumeSeries.setData(volumeData);

    // Fit the visible range to show all data
    chart.timeScale().fitContent();
  }, [data]);

  // -------------------------------------------------------------------
  // Interval selector handler
  // -------------------------------------------------------------------

  const handleIntervalChange = useCallback((newInterval: TimeInterval) => {
    setInterval(newInterval);
  }, []);

  // -------------------------------------------------------------------
  // Render: empty state (no tokens selected)
  // -------------------------------------------------------------------

  if (!tokenSell || !tokenBuy) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-2xl bg-[var(--bg-secondary,#0D0F14)]/80 backdrop-blur-xl border border-[var(--border-primary,rgba(255,255,255,0.06))]"
        style={{ height }}
      >
        <BarChart3 className="h-8 w-8 text-gray-600 mb-3" />
        <p className="text-sm text-gray-500">
          Select a trading pair to view the chart
        </p>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  return (
    <div className="relative">
      {/* Time interval selector */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1">
        {TIME_INTERVALS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => handleIntervalChange(value)}
            className={clsx(
              'px-2.5 py-1 text-[11px] font-medium rounded-md transition-all duration-150',
              'focus:outline-none focus:ring-1 focus:ring-indigo-500/50',
              interval === value
                ? 'bg-indigo-500/20 text-indigo-400 ring-1 ring-indigo-500/30'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 backdrop-blur-sm rounded-2xl">
          <div className="flex items-center gap-2.5 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading chart data...</span>
          </div>
        </div>
      )}

      {/* Empty data overlay (only shown when not loading and data is empty) */}
      {!isLoading && data.length === 0 && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center"
        >
          <BarChart3 className="h-8 w-8 text-gray-600 mb-3" />
          <p className="text-sm text-gray-500">No trading data yet</p>
          <p className="text-xs text-gray-600 mt-1">
            Place some orders to see price history
          </p>
        </div>
      )}

      {/* Chart container */}
      <div
        ref={containerRef}
        style={{ height }}
        className="w-full"
      />
    </div>
  );
}
