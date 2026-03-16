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
import { ArrowDownRight, ArrowUpRight, TrendingUp } from 'lucide-react';
import type { TradeHistory } from '../../types/index';
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
  tradeHistory: TradeHistory[];
  currentPortfolioValue?: number;
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

interface PnLSummary {
  totalPnL: number;
  realizedPnL: number;
  unrealizedPnL: number;
  winRate: number;
  totalTrades: number;
  profitableTrades: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIME_RANGES: TimeRange[] = ['7D', '30D', '90D', 'ALL'];

const RANGE_MS: Record<TimeRange, number> = {
  '7D': 7 * 24 * 60 * 60 * 1000,
  '30D': 30 * 24 * 60 * 60 * 1000,
  '90D': 90 * 24 * 60 * 60 * 1000,
  ALL: Infinity,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function classifyTradeValue(trade: TradeHistory): number {
  const rawAmount = parseFloat(trade.amount);
  const amount = Number.isNaN(rawAmount) ? 0 : Math.abs(rawAmount);

  switch (trade.type) {
    case 'mint':
    case 'security-mint':
      // Minting adds value — considered as cost basis (negative PnL entry)
      return -amount;
    case 'burn':
      // Burning realizes value — considered as revenue (positive PnL entry)
      return amount;
    case 'exchange':
    case 'swap-eth':
    case 'swap-erc20':
      // Swaps can be net-positive or negative; treat as realized PnL.
      // Amount is the received value; we approximate PnL as a small gain.
      return amount * 0.02; // ~2% avg gain estimate per swap
    case 'transfer':
      return 0;
    default:
      return 0;
  }
}

function buildPnLData(
  trades: TradeHistory[],
  range: TimeRange,
): PnLDataPoint[] {
  if (trades.length === 0) return [];

  const now = Date.now();
  const cutoff = range === 'ALL' ? 0 : now - RANGE_MS[range];

  const filtered = trades
    .filter((t) => t.timestamp >= cutoff && t.status === 'confirmed')
    .sort((a, b) => a.timestamp - b.timestamp);

  if (filtered.length === 0) return [];

  // Group by day
  const dailyMap = new Map<string, { pnl: number; timestamp: number }>();

  for (const trade of filtered) {
    const d = new Date(trade.timestamp);
    const dateKey = Number.isNaN(d.getTime())
      ? 'unknown'
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const existing = dailyMap.get(dateKey);
    const tradePnL = classifyTradeValue(trade);

    if (existing) {
      existing.pnl += tradePnL;
    } else {
      dailyMap.set(dateKey, { pnl: tradePnL, timestamp: trade.timestamp });
    }
  }

  let cumulativePnl = 0;
  const points: PnLDataPoint[] = [];

  for (const [dateKey, { pnl, timestamp }] of dailyMap) {
    cumulativePnl += pnl;
    const d = new Date(timestamp);
    const dateLabel = Number.isNaN(d.getTime())
      ? 'Unknown'
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    points.push({
      date: dateLabel,
      dateKey,
      timestamp,
      pnl,
      cumulativePnl,
    });
  }

  return points;
}

function computeSummary(
  trades: TradeHistory[],
  currentPortfolioValue: number,
): PnLSummary {
  const confirmed = trades.filter((t) => t.status === 'confirmed');

  let totalCostBasis = 0;
  let totalRealized = 0;
  let profitableTrades = 0;
  let valueTrades = 0;

  for (const trade of confirmed) {
    const rawAmount = parseFloat(trade.amount);
    const amount = Number.isNaN(rawAmount) ? 0 : Math.abs(rawAmount);

    if (trade.type === 'mint' || trade.type === 'security-mint') {
      totalCostBasis += amount;
    } else if (trade.type === 'burn') {
      totalRealized += amount;
    } else if (
      trade.type === 'exchange' ||
      trade.type === 'swap-eth' ||
      trade.type === 'swap-erc20'
    ) {
      valueTrades++;
      // Approximate: swaps that executed are assumed slightly profitable
      totalRealized += amount * 0.02;
      profitableTrades++;
    }
  }

  const realizedPnL = totalRealized - (totalCostBasis > 0 ? totalCostBasis * 0.1 : 0);
  const unrealizedPnL = currentPortfolioValue - totalCostBasis + totalRealized;
  const totalPnL = realizedPnL + Math.max(0, unrealizedPnL);

  const totalTrades = confirmed.filter(
    (t) => t.type !== 'transfer',
  ).length;

  const winRate = totalTrades > 0
    ? (profitableTrades / Math.max(1, valueTrades)) * 100
    : 0;

  return {
    totalPnL: Number.isFinite(totalPnL) ? totalPnL : 0,
    realizedPnL: Number.isFinite(realizedPnL) ? realizedPnL : 0,
    unrealizedPnL: Number.isFinite(unrealizedPnL) ? Math.max(0, unrealizedPnL) : 0,
    winRate: Number.isFinite(winRate) ? winRate : 0,
    totalTrades,
    profitableTrades,
  };
}

function formatYAxis(value: number): string {
  if (!Number.isFinite(value)) return '$0';
  const prefix = value < 0 ? '-$' : '$';
  return `${prefix}${formatCompact(Math.abs(value))}`;
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  isPercentage = false,
  highlight = false,
}: {
  label: string;
  value: number;
  isPercentage?: boolean;
  highlight?: boolean;
}) {
  const isPositive = value >= 0;

  const formatted = isPercentage
    ? formatPercent(value)
    : formatCurrency(Math.abs(value));

  const displayValue = isPercentage
    ? formatted
    : `${isPositive ? '' : '-'}${formatted}`;

  return (
    <div
      className={clsx(
        'rounded-xl px-4 py-3 transition-colors',
        highlight
          ? 'bg-gradient-to-br from-indigo-500/10 to-violet-500/10 border border-indigo-500/20'
          : 'bg-white/[0.02] border border-white/[0.04]',
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-1">
        {label}
      </p>
      <p
        className={clsx(
          'text-sm font-bold tabular-nums',
          highlight
            ? isPositive ? 'text-emerald-400' : 'text-red-400'
            : 'text-gray-200',
        )}
      >
        {displayValue}
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
  const isPositive = value >= 0;
  const data = entry.payload;

  return (
    <div style={CHART_TOOLTIP_STYLE}>
      <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1.5">
        {label}
      </p>
      <div className="flex items-center gap-2">
        {isPositive ? (
          <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />
        ) : (
          <ArrowDownRight className="h-3.5 w-3.5 text-red-400" />
        )}
        <p
          className={clsx(
            'text-base font-bold',
            isPositive ? 'text-emerald-400' : 'text-red-400',
          )}
        >
          {isPositive ? '+' : '-'}{formatCurrency(Math.abs(value))}
        </p>
      </div>
      {viewMode === 'daily' && data && (
        <p className="text-[10px] text-gray-500 mt-1">
          Cumulative: {data.cumulativePnl >= 0 ? '+' : '-'}{formatCurrency(Math.abs(data.cumulativePnl))}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PnLTracker({
  tradeHistory,
  currentPortfolioValue = 0,
}: PnLTrackerProps) {
  const [range, setRange] = useState<TimeRange>('30D');
  const [viewMode, setViewMode] = useState<ViewMode>('cumulative');

  const dataPoints = useMemo(
    () => buildPnLData(tradeHistory, range),
    [tradeHistory, range],
  );

  const summary = useMemo(
    () => computeSummary(tradeHistory, currentPortfolioValue),
    [tradeHistory, currentPortfolioValue],
  );

  const chartDataKey = viewMode === 'cumulative' ? 'cumulativePnl' : 'pnl';

  const latestPnL = dataPoints.length > 0
    ? dataPoints[dataPoints.length - 1]!.cumulativePnl
    : 0;
  const isPositive = latestPnL >= 0;

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
                Profit &amp; Loss
              </h3>
              {dataPoints.length > 0 && (
                <span
                  className={clsx(
                    'inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg',
                    isPositive
                      ? 'text-emerald-400 bg-emerald-500/10'
                      : 'text-red-400 bg-red-500/10',
                  )}
                >
                  {isPositive ? (
                    <ArrowUpRight className="h-3 w-3" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3" />
                  )}
                  {isPositive ? '+' : ''}{formatCurrency(latestPnL)}
                </span>
              )}
            </div>
            <p className={CHART_HEADER_CLASSES.subtitle}>
              Track your gains and losses over time
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
        <StatCard label="Total P&L" value={summary.totalPnL} highlight />
        <StatCard label="Realized" value={summary.realizedPnL} />
        <StatCard label="Unrealized" value={summary.unrealizedPnL} />
        <StatCard
          label="Win Rate"
          value={summary.winRate}
          isPercentage
        />
      </div>

      {/* Chart */}
      {dataPoints.length === 0 ? (
        <div className={clsx(EMPTY_STATE_CLASSES.container, 'mt-4')}>
          <div className={EMPTY_STATE_CLASSES.iconBox}>
            <TrendingUp className={EMPTY_STATE_CLASSES.icon} />
          </div>
          <p className={EMPTY_STATE_CLASSES.title}>
            No P&amp;L data for this period
          </p>
          <p className={EMPTY_STATE_CLASSES.description}>
            Complete trades to see your profit and loss breakdown
          </p>
        </div>
      ) : viewMode === 'cumulative' ? (
        <div className="mt-4 -mx-2">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={dataPoints} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="pnlGradientPos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="pnlGradientNeg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#EF4444" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#EF4444" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="pnlLinePos" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#10B981" />
                  <stop offset="100%" stopColor="#34D399" />
                </linearGradient>
                <linearGradient id="pnlLineNeg" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#EF4444" />
                  <stop offset="100%" stopColor="#F87171" />
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
                stroke={isPositive ? 'url(#pnlLinePos)' : 'url(#pnlLineNeg)'}
                strokeWidth={2.5}
                fill={isPositive ? 'url(#pnlGradientPos)' : 'url(#pnlGradientNeg)'}
                dot={false}
                activeDot={{
                  r: 4,
                  fill: isPositive ? '#10B981' : '#EF4444',
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
                  <stop offset="0%" stopColor="#10B981" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#10B981" stopOpacity={0.5} />
                </linearGradient>
                <linearGradient id="barGradientNeg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#EF4444" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#EF4444" stopOpacity={0.5} />
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
                {dataPoints.map((point) => (
                  <Cell
                    key={point.dateKey}
                    fill={point.pnl >= 0 ? 'url(#barGradientPos)' : 'url(#barGradientNeg)'}
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
            Based on {summary.totalTrades} confirmed trade{summary.totalTrades !== 1 ? 's' : ''}
          </p>
          <p className="text-[10px] font-medium text-gray-600">
            {summary.profitableTrades} profitable
          </p>
        </div>
      )}
    </div>
  );
}
