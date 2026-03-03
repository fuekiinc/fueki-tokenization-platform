import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import clsx from 'clsx';
import { BarChart3, TrendingUp } from 'lucide-react';
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

interface ValueChartProps {
  tradeHistory: TradeHistory[];
}

type TimeRange = '7D' | '30D' | '90D' | 'ALL';

interface DataPoint {
  date: string;
  timestamp: number;
  value: number;
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

function buildDataPoints(
  trades: TradeHistory[],
  range: TimeRange,
): DataPoint[] {
  if (trades.length === 0) return [];

  const now = Date.now();
  const cutoff = range === 'ALL' ? 0 : now - RANGE_MS[range];

  // Filter trades within the selected range
  const filtered = trades
    .filter((t) => t.timestamp >= cutoff && t.status === 'confirmed')
    .sort((a, b) => a.timestamp - b.timestamp);

  if (filtered.length === 0) return [];

  // Accumulate a running total from trade amounts.
  // Mints/transfers-in add value; burns subtract.
  let runningValue = 0;
  const points: DataPoint[] = [];

  for (const trade of filtered) {
    const rawAmount = parseFloat(trade.amount);
    const amount = Number.isNaN(rawAmount) ? 0 : Math.abs(rawAmount);

    if (trade.type === 'mint' || trade.type === 'exchange' || trade.type === 'swap-eth' || trade.type === 'swap-erc20') {
      runningValue += amount;
    } else if (trade.type === 'burn') {
      runningValue = Math.max(0, runningValue - amount);
    }
    // transfer keeps the same total (zero-sum within wallet)

    const d = new Date(trade.timestamp);
    const dateLabel = Number.isNaN(d.getTime())
      ? 'Unknown'
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    points.push({
      date: dateLabel,
      timestamp: trade.timestamp,
      value: runningValue,
    });
  }

  return points;
}

function formatYAxis(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return `$${formatCompact(value)}`;
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  if (entry == null || !Number.isFinite(entry.value)) return null;

  return (
    <div style={CHART_TOOLTIP_STYLE}>
      <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1.5">
        {label}
      </p>
      <p className="text-base font-bold gradient-text">
        {formatCurrency(entry.value)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom active dot
// ---------------------------------------------------------------------------

function ActiveDot(props: Record<string, unknown>) {
  const { cx, cy } = props as { cx: number; cy: number };
  return (
    <g>
      <circle cx={cx} cy={cy} r={6} fill="rgba(99, 102, 241, 0.2)" />
      <circle cx={cx} cy={cy} r={3.5} fill="#6366F1" stroke="#0D0F14" strokeWidth={1.5} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ValueChart({ tradeHistory }: ValueChartProps) {
  const [range, setRange] = useState<TimeRange>('30D');

  const dataPoints = useMemo(
    () => buildDataPoints(tradeHistory, range),
    [tradeHistory, range],
  );

  // Calculate change for the period
  const periodChange = useMemo(() => {
    if (dataPoints.length < 2) return null;
    const first = dataPoints[0]!.value;
    const last = dataPoints[dataPoints.length - 1]!.value;
    if (first === 0) return null;
    return ((last - first) / first) * 100;
  }, [dataPoints]);

  return (
    <div className={clsx(CARD_CLASSES.base, CARD_CLASSES.wrapper, CARD_CLASSES.shadow, 'p-8 sm:p-11')}>
      {/* Subtle gradient accent at top */}
      <div className={CARD_CLASSES.gradientAccent} />

      {/* Header */}
      <div className={CHART_HEADER_CLASSES.container}>
        <div className={CHART_HEADER_CLASSES.left}>
          <div className={CHART_HEADER_CLASSES.icon}>
            <BarChart3 className={CHART_HEADER_CLASSES.iconSvg} />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h3 className={CHART_HEADER_CLASSES.title}>
                Portfolio Value
              </h3>
              {periodChange !== null && (
                <span
                  className={clsx(
                    'text-[11px] font-semibold px-2.5 py-1 rounded-lg',
                    periodChange >= 0
                      ? 'text-emerald-400 bg-emerald-500/10'
                      : 'text-red-400 bg-red-500/10',
                  )}
                >
                  {periodChange >= 0 ? '+' : ''}
                  {formatPercent(periodChange)}
                </span>
              )}
            </div>
            <p className={CHART_HEADER_CLASSES.subtitle}>
              Cumulative value over time
            </p>
          </div>
        </div>

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
      </div>

      {dataPoints.length === 0 ? (
        <div className={EMPTY_STATE_CLASSES.container}>
          <div className={EMPTY_STATE_CLASSES.iconBox}>
            <TrendingUp className={EMPTY_STATE_CLASSES.icon} />
          </div>
          <p className={EMPTY_STATE_CLASSES.title}>
            No value data for this period
          </p>
          <p className={EMPTY_STATE_CLASSES.description}>
            Confirmed transactions will appear here as your portfolio grows
          </p>
        </div>
      ) : (
        <div className="mt-2 -mx-2">
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={dataPoints} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="valueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366F1" stopOpacity={0.25} />
                <stop offset="50%" stopColor="#6366F1" stopOpacity={0.08} />
                <stop offset="100%" stopColor="#6366F1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#6366F1" />
                <stop offset="50%" stopColor="#8B5CF6" />
                <stop offset="100%" stopColor="#A78BFA" />
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
              content={<CustomTooltip />}
              cursor={CHART_AXIS.cursor}
              wrapperStyle={{ outline: 'none' }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="url(#lineGradient)"
              strokeWidth={2.5}
              fill="url(#valueGradient)"
              dot={false}
              activeDot={<ActiveDot />}
            />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
