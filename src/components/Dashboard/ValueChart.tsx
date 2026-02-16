import { useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import clsx from 'clsx';
import { TrendingUp, BarChart3 } from 'lucide-react';
import type { TradeHistory } from '../../types/index';
import { formatCurrency } from '../../lib/utils/helpers';
import { formatCompact, formatPercent } from '../../lib/formatters';

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
    <div
      style={{
        background: 'rgba(13, 15, 20, 0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 14,
        padding: '14px 18px',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
      }}
    >
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
    <div className="relative bg-[#0D0F14]/80 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-8 sm:p-11 overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
      {/* Subtle gradient accent at top */}
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/[0.08]">
            <BarChart3 className="h-[18px] w-[18px] text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-[15px] font-semibold text-white tracking-tight">
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
            <p className="text-xs text-gray-500 mt-1">
              Cumulative value over time
            </p>
          </div>
        </div>

        {/* Time range pills */}
        <div className="flex gap-1 p-1.5 rounded-xl bg-white/[0.04] border border-white/[0.04]">
          {TIME_RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={clsx(
                'relative rounded-lg px-4 py-2 text-[11px] font-semibold transition-all duration-200',
                r === range
                  ? 'text-white'
                  : 'text-gray-500 hover:text-gray-300',
              )}
            >
              {r === range && (
                <div className="absolute inset-0 rounded-lg bg-indigo-500/20 border border-indigo-500/30" />
              )}
              <span className="relative z-10">{r}</span>
            </button>
          ))}
        </div>
      </div>

      {dataPoints.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl mb-5 bg-indigo-500/[0.06] border border-indigo-500/10">
            <TrendingUp className="h-7 w-7 text-gray-600" />
          </div>
          <p className="text-sm font-medium text-gray-400">
            No value data for this period
          </p>
          <p className="text-xs text-gray-600 mt-2 max-w-[240px] leading-relaxed">
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
              strokeDasharray="3 3"
              stroke="rgba(255, 255, 255, 0.03)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fill: '#6B7280', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(255, 255, 255, 0.05)' }}
              tickLine={false}
              dy={10}
              tickMargin={4}
            />
            <YAxis
              tickFormatter={formatYAxis}
              tick={{ fill: '#6B7280', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={58}
              dx={-6}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{
                stroke: 'rgba(99, 102, 241, 0.3)',
                strokeWidth: 1,
                strokeDasharray: '4 4',
              }}
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
