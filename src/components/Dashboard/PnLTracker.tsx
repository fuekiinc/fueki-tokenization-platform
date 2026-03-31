import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import clsx from 'clsx';
import { ArrowUpRight, Sparkles, TrendingUp } from 'lucide-react';
import type { TradeHistory, WrappedAsset } from '../../types/index';
import { buildPortfolioValueSeries } from '../../lib/dashboardMetrics';
import { calculatePortfolioSummary } from '../../lib/portfolioMetrics';
import { formatCurrency } from '../../lib/utils/helpers';
import { formatCompact, formatPercent } from '../../lib/formatters';
import {
  CARD_CLASSES,
  CHART_AXIS,
  CHART_HEADER_CLASSES,
  CHART_TOOLTIP_STYLE,
  EMPTY_STATE_CLASSES,
  FILTER_PILL_CLASSES,
} from '../../lib/designTokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PnLTrackerProps {
  assets: WrappedAsset[];
  tradeHistory: TradeHistory[];
  currentPortfolioValue?: number;
  walletAddress?: string | null;
}

type TimeRange = '7D' | '30D' | '90D' | 'ALL';
type ViewMode = 'cumulative' | 'daily';

interface PnLDataPoint {
  date: string;
  dateKey: string;
  timestamp: number;
  pnl: number;
  cumulativePnl: number;
}

interface PerformanceSummary {
  portfolioValue: number;
  rangeChange: number;
  totalPnL: number | null;
  roi: number | null;
  totalTrades: number;
  assetsWithCostData: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIME_RANGES: TimeRange[] = ['7D', '30D', '90D', 'ALL'];

function formatYAxis(value: number): string {
  if (!Number.isFinite(value)) return '$0';
  return `$${formatCompact(Math.abs(value))}`;
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  isPercentage = false,
  highlight = false,
  signed = false,
}: {
  label: string;
  value: number | null;
  isPercentage?: boolean;
  highlight?: boolean;
  signed?: boolean;
}) {
  const formatted =
    value === null
      ? '--'
      : isPercentage
        ? formatPercent(value)
        : signed
          ? `${value >= 0 ? '+' : '-'}${formatCurrency(Math.abs(value))}`
          : formatCurrency(Math.abs(value));

  return (
    <div
      className={clsx(
        'rounded-xl px-4 py-3 transition-colors',
        highlight
          ? 'bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20'
          : 'bg-white/[0.02] border border-white/[0.04]',
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-1">
        {label}
      </p>
      <p
        className={clsx(
          'text-sm font-bold tabular-nums',
          highlight ? 'text-emerald-400' : 'text-gray-200',
        )}
      >
        {formatted}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

interface PnLTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string; payload: PnLDataPoint }>;
  label?: string;
  viewMode: ViewMode;
}

function PnLTooltip({ active, payload, label, viewMode }: PnLTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  if (!entry || !Number.isFinite(entry.value)) return null;

  const value = entry.value;
  const data = entry.payload;
  const positive = value >= 0;

  return (
    <div style={CHART_TOOLTIP_STYLE}>
      <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1.5">
        {label}
      </p>
      <div className="flex items-center gap-2">
        <ArrowUpRight className={clsx('h-3.5 w-3.5', positive ? 'text-emerald-400' : 'text-red-400 rotate-90')} />
        <p className={clsx('text-base font-bold', positive ? 'text-emerald-400' : 'text-red-400')}>
          {positive ? '+' : '-'}
          {formatCurrency(Math.abs(value))}
        </p>
      </div>
      {viewMode === 'daily' && data && (
        <p className="text-[10px] text-gray-500 mt-1">
          Range change: {data.cumulativePnl >= 0 ? '+' : '-'}
          {formatCurrency(Math.abs(data.cumulativePnl))}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PnLTracker({
  assets,
  tradeHistory,
  currentPortfolioValue = 0,
  walletAddress = null,
}: PnLTrackerProps) {
  const [range, setRange] = useState<TimeRange>('30D');
  const [viewMode, setViewMode] = useState<ViewMode>('cumulative');

  const valueSeries = useMemo(() => {
    return buildPortfolioValueSeries({
      trades: tradeHistory,
      assets,
      currentPortfolioValue,
      walletAddress,
      range,
    });
  }, [assets, currentPortfolioValue, range, tradeHistory, walletAddress]);

  const dataPoints = useMemo<PnLDataPoint[]>(() => {
    return valueSeries.points.map((point) => ({
      date: point.date,
      dateKey: point.dateKey,
      timestamp: point.timestamp,
      pnl: point.dailyChange,
      cumulativePnl: point.cumulativeChange,
    }));
  }, [valueSeries.points]);

  const portfolioSummary = useMemo(
    () => calculatePortfolioSummary(assets, tradeHistory),
    [assets, tradeHistory],
  );

  const summary = useMemo<PerformanceSummary>(() => {
    const hasCostData = portfolioSummary.assetsWithCostData > 0;
    const confirmedTrades = tradeHistory.filter((trade) => trade.status === 'confirmed');
    return {
      portfolioValue: Number.isFinite(currentPortfolioValue) ? Math.max(0, currentPortfolioValue) : 0,
      rangeChange: dataPoints.length > 0 ? dataPoints[dataPoints.length - 1]!.cumulativePnl : 0,
      totalPnL: hasCostData ? portfolioSummary.totalPnL : null,
      roi: hasCostData ? portfolioSummary.totalPercentageChange : null,
      totalTrades: confirmedTrades.length,
      assetsWithCostData: portfolioSummary.assetsWithCostData,
    };
  }, [currentPortfolioValue, dataPoints, portfolioSummary, tradeHistory]);

  const chartDataKey = viewMode === 'cumulative' ? 'cumulativePnl' : 'pnl';

  const totalGrowth = dataPoints.length > 0
    ? dataPoints[dataPoints.length - 1]!.cumulativePnl
    : 0;
  const totalGrowthPositive = totalGrowth >= 0;

  return (
    <div className={clsx(CARD_CLASSES.base, CARD_CLASSES.wrapper, CARD_CLASSES.shadow, 'p-8 sm:p-11')}>
      {/* Gradient accent */}
      <div className={CARD_CLASSES.gradientAccent} />

      {/* Header */}
      <div className={CHART_HEADER_CLASSES.container}>
        <div className={CHART_HEADER_CLASSES.left}>
          <div className={CHART_HEADER_CLASSES.icon}>
            <TrendingUp className={CHART_HEADER_CLASSES.iconSvg} />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h3 className={CHART_HEADER_CLASSES.title}>
                Portfolio Performance
              </h3>
              {dataPoints.length > 0 && (
                <span
                  className={clsx(
                    'inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg',
                    totalGrowthPositive
                      ? 'text-emerald-400 bg-emerald-500/10'
                      : 'text-red-400 bg-red-500/10',
                  )}
                >
                  <ArrowUpRight className={clsx('h-3 w-3', !totalGrowthPositive && 'rotate-90')} />
                  {totalGrowthPositive ? '+' : '-'}
                  {formatCurrency(Math.abs(totalGrowth))}
                </span>
              )}
            </div>
            <p className={CHART_HEADER_CLASSES.subtitle}>
              Holdings-based value change and cost-basis performance
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col items-end gap-2">
          {/* Time range pills */}
          <div className={FILTER_PILL_CLASSES.containerWide}>
            {TIME_RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={clsx(
                  FILTER_PILL_CLASSES.pillWide,
                  r === range
                    ? FILTER_PILL_CLASSES.active
                    : FILTER_PILL_CLASSES.inactive,
                )}
              >
                {r === range && (
                  <div className={FILTER_PILL_CLASSES.activeHighlight} />
                )}
                <span className="relative z-10">{r}</span>
              </button>
            ))}
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-1 bg-white/[0.03] rounded-lg p-0.5 border border-white/[0.06]">
            <button
              onClick={() => setViewMode('cumulative')}
              className={clsx(
                'text-[10px] font-medium px-2.5 py-1 rounded-md transition-all',
                viewMode === 'cumulative'
                  ? 'bg-indigo-500/20 text-indigo-300 shadow-sm'
                  : 'text-gray-500 hover:text-gray-300',
              )}
            >
              Cumulative
            </button>
            <button
              onClick={() => setViewMode('daily')}
              className={clsx(
                'text-[10px] font-medium px-2.5 py-1 rounded-md transition-all',
                viewMode === 'daily'
                  ? 'bg-indigo-500/20 text-indigo-300 shadow-sm'
                  : 'text-gray-500 hover:text-gray-300',
              )}
            >
              Daily
            </button>
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-5">
        <StatCard label="Portfolio Value" value={summary.portfolioValue} highlight />
        <StatCard label="Range Change" value={summary.rangeChange} signed />
        <StatCard label="Lifetime P&L" value={summary.totalPnL} signed />
        <StatCard
          label="ROI"
          value={summary.roi}
          isPercentage
        />
      </div>

      {/* Chart */}
      {dataPoints.length === 0 ? (
        <div className={clsx(EMPTY_STATE_CLASSES.container, 'mt-4')}>
          <div className={EMPTY_STATE_CLASSES.iconBox}>
            <Sparkles className={EMPTY_STATE_CLASSES.icon} />
          </div>
          <p className={EMPTY_STATE_CLASSES.title}>
            No performance data for this period
          </p>
          <p className={EMPTY_STATE_CLASSES.description}>
            New confirmed activity will appear here as the dashboard refreshes
          </p>
        </div>
      ) : viewMode === 'cumulative' ? (
        <div className="mt-4 -mx-2">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={dataPoints} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="pnlGradientPos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
                  <stop offset="50%" stopColor="#10B981" stopOpacity={0.1} />
                  <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="pnlGradientNeg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F87171" stopOpacity={0.3} />
                  <stop offset="50%" stopColor="#F87171" stopOpacity={0.1} />
                  <stop offset="100%" stopColor="#F87171" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="pnlLinePos" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#10B981" />
                  <stop offset="50%" stopColor="#34D399" />
                  <stop offset="100%" stopColor="#6EE7B7" />
                </linearGradient>
                <linearGradient id="pnlLineNeg" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#F87171" />
                  <stop offset="50%" stopColor="#FB7185" />
                  <stop offset="100%" stopColor="#FDA4AF" />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray={CHART_AXIS.grid.strokeDasharray}
                stroke={CHART_AXIS.grid.stroke}
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={CHART_AXIS.tick}
                axisLine={CHART_AXIS.axisLine}
                tickLine={false}
                dy={10}
                tickMargin={4}
              />
              <YAxis
                tickFormatter={formatYAxis}
                tick={CHART_AXIS.tick}
                axisLine={false}
                tickLine={false}
                width={58}
                dx={-6}
              />
              <Tooltip
                content={<PnLTooltip viewMode={viewMode} />}
                cursor={CHART_AXIS.cursor}
                wrapperStyle={{ outline: 'none' }}
              />
              <Area
                type="monotone"
                dataKey={chartDataKey}
                stroke={totalGrowthPositive ? 'url(#pnlLinePos)' : 'url(#pnlLineNeg)'}
                strokeWidth={2.5}
                fill={totalGrowthPositive ? 'url(#pnlGradientPos)' : 'url(#pnlGradientNeg)'}
                dot={false}
                activeDot={{
                  r: 4,
                  fill: totalGrowthPositive ? '#10B981' : '#F87171',
                  stroke: '#0D0F14',
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-4 -mx-2">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={dataPoints} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="barGradientPos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34D399" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#10B981" stopOpacity={0.5} />
                </linearGradient>
                <linearGradient id="barGradientAlt" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6EE7B7" stopOpacity={0.8} />
                  <stop offset="100%" stopColor="#34D399" stopOpacity={0.4} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray={CHART_AXIS.grid.strokeDasharray}
                stroke={CHART_AXIS.grid.stroke}
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={CHART_AXIS.tick}
                axisLine={CHART_AXIS.axisLine}
                tickLine={false}
                dy={10}
                tickMargin={4}
              />
              <YAxis
                tickFormatter={formatYAxis}
                tick={CHART_AXIS.tick}
                axisLine={false}
                tickLine={false}
                width={58}
                dx={-6}
              />
              <Tooltip
                content={<PnLTooltip viewMode={viewMode} />}
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                wrapperStyle={{ outline: 'none' }}
              />
              <Bar
                dataKey={chartDataKey}
                radius={[4, 4, 0, 0]}
                maxBarSize={32}
              >
                {dataPoints.map((point, idx) => (
                  <Cell
                    key={point.dateKey}
                    fill={
                      point.pnl >= 0
                        ? (idx % 2 === 0 ? 'url(#barGradientPos)' : 'url(#barGradientAlt)')
                        : '#F87171'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Trade count footer */}
      {summary.totalTrades > 0 && (
        <div className="mt-4 pt-4 border-t border-white/[0.04] flex items-center justify-between">
          <p className="text-[11px] text-gray-500">
            {summary.totalTrades} completed transaction{summary.totalTrades !== 1 ? 's' : ''}
          </p>
          <p className="text-[10px] font-medium text-gray-500">
            {summary.assetsWithCostData > 0
              ? `${summary.assetsWithCostData} asset${summary.assetsWithCostData !== 1 ? 's' : ''} with cost basis`
              : 'Cost basis unavailable for current holdings'}
          </p>
        </div>
      )}
    </div>
  );
}
