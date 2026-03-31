import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Activity,
  BarChart3,
  Loader2,
  RefreshCw,
} from 'lucide-react';
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
  MouseEventParams,
  Time,
} from 'lightweight-charts';
import { useTheme } from '../../hooks/useTheme';
import { useWalletStore } from '../../store/walletStore';
import { queryKeys } from '../../lib/queryClient';
import {
  fetchOrbitalPoolChartSnapshot,
  type OrbitalChartInterval,
} from '../../lib/blockchain/orbitalMarketData';
import { formatCompact, formatPercent, formatPrice, formatRelativeDate } from '../../lib/formatters';
import { getRealtimePollIntervalMs } from '../../lib/chart/dataFeed';

interface PoolChartToken {
  address: string;
  symbol: string;
  index: number;
  decimals?: number;
}

interface PoolTradingChartProps {
  poolAddress: string;
  poolName: string;
  concentration: number;
  swapFeeBps: number;
  tokenIn: PoolChartToken | null;
  tokenOut: PoolChartToken | null;
}

interface LegendState {
  timeLabel: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const UP_COLOR = '#10B981';
const DOWN_COLOR = '#EF4444';

const TIME_INTERVALS: Array<{ value: OrbitalChartInterval; label: string }> = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: '1D' },
];

function getChartOptions(isDark: boolean): DeepPartial<ChartOptions> {
  return isDark
    ? {
        layout: {
          background: { type: ColorType.Solid, color: '#0D0F14' },
          textColor: '#9CA3AF',
          fontFamily: "'Sora', 'Inter', sans-serif",
        },
        grid: {
          vertLines: { color: 'rgba(255,255,255,0.04)' },
          horzLines: { color: 'rgba(255,255,255,0.04)' },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
        },
        rightPriceScale: {
          borderColor: 'rgba(255,255,255,0.08)',
        },
        timeScale: {
          borderColor: 'rgba(255,255,255,0.08)',
          timeVisible: true,
          secondsVisible: false,
        },
      }
    : {
        layout: {
          background: { type: ColorType.Solid, color: '#FFFFFF' },
          textColor: '#4B5563',
          fontFamily: "'Sora', 'Inter', sans-serif",
        },
        grid: {
          vertLines: { color: 'rgba(15,23,42,0.06)' },
          horzLines: { color: 'rgba(15,23,42,0.06)' },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
        },
        rightPriceScale: {
          borderColor: 'rgba(15,23,42,0.08)',
        },
        timeScale: {
          borderColor: 'rgba(15,23,42,0.08)',
          timeVisible: true,
          secondsVisible: false,
        },
      };
}

function formatLegendTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSwapFeeBps(bps: number): string {
  return formatPercent(bps / 100);
}

function StatCard({
  label,
  value,
  accentClassName,
}: {
  label: string;
  value: string;
  accentClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3">
      <p className="mb-1 text-[10px] uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <p className={clsx('text-sm font-semibold text-gray-100', accentClassName)}>
        {value}
      </p>
    </div>
  );
}

export default function PoolTradingChart({
  poolAddress,
  poolName,
  concentration,
  swapFeeBps,
  tokenIn,
  tokenOut,
}: PoolTradingChartProps) {
  const { isDark } = useTheme();
  const chainId = useWalletStore((state) => state.wallet.chainId);
  const [interval, setInterval] = useState<OrbitalChartInterval>('15m');
  const [legend, setLegend] = useState<LegendState | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  const hasDistinctPair =
    tokenIn !== null &&
    tokenOut !== null &&
    tokenIn.index !== tokenOut.index;

  const chartQuery = useQuery({
    queryKey: queryKeys.orbitalPoolHistory(
      poolAddress,
      tokenIn?.index ?? null,
      tokenOut?.index ?? null,
      chainId,
      interval,
    ),
    enabled: Boolean(chainId) && Boolean(poolAddress) && hasDistinctPair,
    refetchInterval: getRealtimePollIntervalMs(interval),
    queryFn: async () => {
      if (!chainId || !tokenIn || !tokenOut) {
        throw new Error('Select a pool pair to load the chart.');
      }

      return fetchOrbitalPoolChartSnapshot({
        chainId,
        poolAddress,
        tokenInIndex: tokenIn.index,
        tokenOutIndex: tokenOut.index,
        tokenInDecimals: tokenIn.decimals ?? 18,
        tokenOutDecimals: tokenOut.decimals ?? 18,
        interval,
      });
    },
  });

  const candleData = useMemo<Array<CandlestickData<Time>>>(() => {
    return (chartQuery.data?.candles ?? []).map((candle) => ({
      time: candle.time as Time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));
  }, [chartQuery.data?.candles]);

  const volumeData = useMemo<Array<HistogramData<Time>>>(() => {
    return (chartQuery.data?.candles ?? []).map((candle) => ({
      time: candle.time as Time,
      value: candle.volume,
      color:
        candle.close >= candle.open
          ? 'rgba(16, 185, 129, 0.55)'
          : 'rgba(239, 68, 68, 0.55)',
    }));
  }, [chartQuery.data?.candles]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const chart = createChart(container, {
      ...getChartOptions(isDark),
      width: Math.max(container.clientWidth, 320),
      height: 320,
      handleScale: {
        axisDoubleClickReset: true,
        mouseWheel: true,
        pinch: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: UP_COLOR,
      downColor: DOWN_COLOR,
      borderUpColor: UP_COLOR,
      borderDownColor: DOWN_COLOR,
      wickUpColor: UP_COLOR,
      wickDownColor: DOWN_COLOR,
      priceLineVisible: true,
      lastValueVisible: true,
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.76, bottom: 0 },
      visible: false,
      borderVisible: false,
    });

    candleSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.08, bottom: 0.28 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const resizeObserver = new ResizeObserver(() => {
      chart.applyOptions({
        width: Math.max(container.clientWidth, 320),
      });
      chart.timeScale().fitContent();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [isDark]);

  useEffect(() => {
    setLegend(null);
    candleSeriesRef.current?.setData(candleData);
    volumeSeriesRef.current?.setData(volumeData);
    if (candleData.length > 0) {
      chartRef.current?.timeScale().fitContent();
    }
  }, [candleData, volumeData]);

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    if (!chart || !candleSeries) {
      return undefined;
    }

    const handleCrosshairMove = (param: MouseEventParams<Time>) => {
      if (!param.time) {
        setLegend(null);
        return;
      }

      const candle = param.seriesData.get(candleSeries) as CandlestickData<Time> | undefined;
      if (!candle) {
        setLegend(null);
        return;
      }

      const histogram = volumeSeriesRef.current
        ? (param.seriesData.get(volumeSeriesRef.current) as HistogramData<Time> | undefined)
        : undefined;
      const timestamp = typeof param.time === 'number' ? param.time : null;

      setLegend({
        timeLabel: formatLegendTime(timestamp ?? 0),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: histogram?.value ?? 0,
      });
    };

    chart.subscribeCrosshairMove(handleCrosshairMove);
    return () => {
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
    };
  }, [candleData]);

  const summary = chartQuery.data?.summary ?? null;
  const range24h = summary && summary.low24h !== null && summary.high24h !== null
    ? `${formatPrice(summary.low24h)} - ${formatPrice(summary.high24h)}`
    : '--';
  const sourceLabel =
    chartQuery.data?.source === 'swaps'
      ? 'Swap candles'
      : chartQuery.data?.source === 'spot'
        ? 'Spot fallback'
        : 'Awaiting activity';

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0D0F14]/80 p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20">
              <BarChart3 className="h-4 w-4 text-emerald-400" />
            </span>
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-gray-100">
                Pool Trading View
              </h4>
              <p className="text-[11px] text-gray-500">
                {tokenIn && tokenOut
                  ? `${poolName} • 1 ${tokenIn.symbol} = ${tokenOut.symbol}`
                  : 'Select two different pool tokens to inspect price action'}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-white/[0.04] px-2.5 py-1 text-[10px] text-gray-400 ring-1 ring-white/[0.06]">
              {sourceLabel}
            </span>
            <span className="rounded-lg bg-indigo-500/10 px-2.5 py-1 text-[10px] text-indigo-300 ring-1 ring-indigo-500/20">
              {concentration}x concentration
            </span>
            <span className="rounded-lg bg-cyan-500/10 px-2.5 py-1 text-[10px] text-cyan-300 ring-1 ring-cyan-500/20">
              {formatSwapFeeBps(swapFeeBps)} fee
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">
            {TIME_INTERVALS.map((entry) => (
              <button
                key={entry.value}
                type="button"
                onClick={() => setInterval(entry.value)}
                className={clsx(
                  'rounded-lg px-2.5 py-1.5 text-[10px] font-medium transition-all',
                  interval === entry.value
                    ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/20'
                    : 'text-gray-500 hover:bg-white/[0.04] hover:text-gray-300',
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              void chartQuery.refetch();
            }}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.02] text-gray-400 transition-all hover:border-white/[0.12] hover:text-white"
            title="Refresh chart"
          >
            {chartQuery.isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {!hasDistinctPair ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.06] bg-white/[0.02] px-6 text-center">
          <Activity className="mb-3 h-6 w-6 text-gray-600" />
          <p className="text-sm text-gray-400">Select two different pool tokens to chart this market</p>
          <p className="mt-1 text-xs text-gray-600">
            The chart follows the exact pair selected in the Orbital swap form.
          </p>
        </div>
      ) : chartQuery.isLoading ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-white/[0.05] bg-white/[0.02]">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-400/70" />
          <p className="mt-3 text-sm text-gray-400">Loading pool activity...</p>
        </div>
      ) : chartQuery.isError ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-red-500/20 bg-red-500/5 px-6 text-center">
          <p className="text-sm font-medium text-red-400">Unable to load pool chart</p>
          <p className="mt-1 text-xs text-red-300/80">
            {chartQuery.error instanceof Error ? chartQuery.error.message : 'Please retry in a moment.'}
          </p>
        </div>
      ) : (chartQuery.data?.candles.length ?? 0) === 0 ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.06] bg-white/[0.02] px-6 text-center">
          <Activity className="mb-3 h-6 w-6 text-gray-600" />
          <p className="text-sm text-gray-400">No recent price activity for this pair yet</p>
          <p className="mt-1 text-xs text-gray-600">
            Once swaps begin flowing through this pool pair, the chart will populate automatically.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <StatCard
              label="Last Price"
              value={
                summary !== null && summary.latestPrice !== null
                  ? `${formatPrice(summary.latestPrice)} ${tokenOut?.symbol ?? ''}`.trim()
                  : '--'
              }
              accentClassName="text-emerald-300"
            />
            <StatCard
              label="24h Change"
              value={
                summary !== null && summary.change24h !== null
                  ? `${summary.change24h >= 0 ? '+' : ''}${formatPercent(summary.change24h)}`
                  : '--'
              }
              accentClassName={
                summary !== null && summary.change24h !== null
                  ? summary.change24h >= 0
                    ? 'text-emerald-300'
                    : 'text-red-300'
                  : undefined
              }
            />
            <StatCard
              label={`24h Volume${tokenIn ? ` (${tokenIn.symbol})` : ''}`}
              value={summary ? formatCompact(summary.volume24h) : '--'}
            />
            <StatCard
              label="24h Range"
              value={range24h}
            />
          </div>

          <div className="overflow-hidden rounded-xl border border-white/[0.05] bg-[#090B0F]">
            {legend && (
              <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.05] px-4 py-3 text-[11px] text-gray-400">
                <span>{legend.timeLabel}</span>
                <span>O {formatPrice(legend.open)}</span>
                <span>H {formatPrice(legend.high)}</span>
                <span>L {formatPrice(legend.low)}</span>
                <span>C {formatPrice(legend.close)}</span>
                <span>V {formatCompact(legend.volume)}</span>
              </div>
            )}
            <div ref={containerRef} className="w-full" />
          </div>

          <div className="mt-3 flex flex-col gap-1 text-[11px] text-gray-500 sm:flex-row sm:items-center sm:justify-between">
            <p>
              {chartQuery.data?.usedSpotFallback
                ? 'No recent swaps were found for this pair, so the chart is showing the current pool spot price.'
                : 'Candles are built from recent Orbital pool swap events for the selected pair.'}
            </p>
            <p>
              {summary
                ? `${summary.swaps24h} swap${summary.swaps24h === 1 ? '' : 's'} in the last 24h${summary.lastUpdatedMs ? ` • updated ${formatRelativeDate(summary.lastUpdatedMs)}` : ''}`
                : ''}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
