import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import clsx from 'clsx';
import { TrendingUp } from 'lucide-react';
import type { WrappedAsset } from '../../types/index';
import { formatCurrency, formatCompact } from '../../lib/formatters';
import ChartSkeleton from '../DataViz/ChartSkeleton';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PortfolioValueChartProps {
  assets: WrappedAsset[];
  isLoading?: boolean;
}

interface ChartPoint {
  label: string;
  value: number;
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
  const value = payload[0]?.value ?? 0;

  return (
    <div
      role="tooltip"
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
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-sm font-semibold text-white">
        {formatCurrency(value)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PortfolioValueChart({
  assets,
  isLoading = false,
}: PortfolioValueChartProps) {
  // Build a simple chart from the current asset values.
  // In a production scenario this would use historical data from an API.
  // For now we display each asset as a data point showing cumulative value.
  const chartData = useMemo<ChartPoint[]>(() => {
    if (assets.length === 0) return [];

    let cumulative = 0;
    return assets
      .filter((a) => parseFloat(a.originalValue || '0') > 0)
      .map((asset) => {
        const value = parseFloat(asset.originalValue || '0');
        cumulative += Number.isNaN(value) ? 0 : value;
        return {
          label: asset.symbol || asset.name.substring(0, 6),
          value: cumulative,
        };
      });
  }, [assets]);

  const totalValue = chartData.length > 0
    ? chartData[chartData.length - 1].value
    : 0;

  if (isLoading) {
    return <ChartSkeleton variant="line" height={340} />;
  }

  return (
    <div
      aria-label={`Portfolio value chart showing total value of ${formatCurrency(totalValue)} across ${assets.length} assets`}
      className={clsx(
        'relative overflow-hidden rounded-2xl',
        'bg-[#0D0F14]/80 backdrop-blur-xl',
        'border border-white/[0.06]',
        'p-7 sm:p-9',
      )}
    >
      {/* Top gradient accent */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/[0.08]">
            <TrendingUp className="h-[18px] w-[18px] text-indigo-400" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-white tracking-tight">
              Portfolio Value
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Cumulative asset value
            </p>
          </div>
        </div>
        {totalValue > 0 && (
          <span className="text-lg font-bold text-white tabular-nums">
            {formatCurrency(totalValue)}
          </span>
        )}
      </div>

      {/* Screen-reader summary */}
      <div className="sr-only">
        Portfolio total value: {formatCurrency(totalValue)}
        , comprised of {assets.length} asset{assets.length !== 1 ? 's' : ''}.
      </div>

      {chartData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl mb-5 bg-indigo-500/[0.06] border border-indigo-500/10">
            <TrendingUp className="h-7 w-7 text-gray-600" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium text-gray-400">
            No value data available
          </p>
          <p className="text-xs text-gray-600 mt-2 max-w-[220px] leading-relaxed">
            Mint assets to see your portfolio value chart
          </p>
        </div>
      ) : (
        <div aria-hidden="true">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#818CF8" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#818CF8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.04)"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fill: '#64748B', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#64748B', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) =>
                  `$${formatCompact(v)}`
                }
                width={60}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#818CF8"
                strokeWidth={2}
                fill="url(#portfolioGradient)"
                dot={false}
                activeDot={{
                  r: 5,
                  fill: '#818CF8',
                  stroke: '#0D0F14',
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
