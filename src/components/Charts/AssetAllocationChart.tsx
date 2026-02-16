import { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import clsx from 'clsx';
import { PieChart as PieChartIcon } from 'lucide-react';
import type { WrappedAsset } from '../../types/index';
import ChartSkeleton from '../DataViz/ChartSkeleton';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AssetAllocationChartProps {
  assets: WrappedAsset[];
  isLoading?: boolean;
}

interface ChartDatum {
  name: string;
  symbol: string;
  value: number;
  percentage: number;
}

// ---------------------------------------------------------------------------
// Constants -- WCAG-compliant chart colors on dark backgrounds
// ---------------------------------------------------------------------------

const CHART_COLORS = [
  '#818CF8', // Indigo 400  -- contrast 5.8:1 on #06070A
  '#A78BFA', // Violet 400  -- contrast 6.2:1 on #06070A
  '#34D399', // Emerald 400 -- contrast 8.6:1 on #06070A
  '#FBBF24', // Amber 400   -- contrast 11.5:1 on #06070A
  '#F87171', // Red 400     -- contrast 5.0:1 on #06070A
  '#22D3EE', // Cyan 400    -- contrast 10.1:1 on #06070A
  '#F472B6', // Pink 400    -- contrast 5.7:1 on #06070A
  '#60A5FA', // Blue 400    -- contrast 6.1:1 on #06070A
];

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartDatum }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

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
      <div className="flex items-center gap-2.5 mb-2">
        <span className="text-sm font-semibold text-white tracking-tight">
          {data.name}
        </span>
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-indigo-500/15 text-[#A78BFA]">
          {data.symbol}
        </span>
      </div>
      <div className="flex items-baseline gap-3">
        <span className="text-sm text-gray-300">
          ${data.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span className="text-xs font-medium text-indigo-400">
          {data.percentage.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screen-reader data summary
// ---------------------------------------------------------------------------

function ChartDataSummary({ data }: { data: ChartDatum[] }) {
  if (data.length === 0) return null;
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="sr-only" role="list" aria-label="Asset allocation breakdown">
      <p>
        Total portfolio value: $
        {total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
      {data.map((d) => (
        <div key={d.symbol} role="listitem">
          {d.name} ({d.symbol}): ${d.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          , {d.percentage.toFixed(1)}% of portfolio
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AssetAllocationChart({
  assets,
  isLoading = false,
}: AssetAllocationChartProps) {
  const chartData = useMemo<ChartDatum[]>(() => {
    if (assets.length === 0) return [];

    const total = assets.reduce((sum, a) => {
      const v = parseFloat(a.originalValue || '0');
      return sum + (Number.isNaN(v) ? 0 : v);
    }, 0);

    if (total === 0) return [];

    return assets
      .map((asset) => {
        const value = parseFloat(asset.originalValue || '0');
        const safeValue = Number.isNaN(value) ? 0 : value;
        return {
          name: asset.name ?? 'Unknown',
          symbol: asset.symbol ?? '???',
          value: safeValue,
          percentage: (safeValue / total) * 100,
        };
      })
      .filter((d) => d.value > 0);
  }, [assets]);

  const totalValue = useMemo(
    () => chartData.reduce((sum, d) => sum + d.value, 0),
    [chartData],
  );

  if (isLoading) {
    return <ChartSkeleton variant="pie" height={380} />;
  }

  return (
    <div
      aria-label={`Asset allocation chart showing distribution of ${chartData.length} assets totalling $${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
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
            <PieChartIcon className="h-[18px] w-[18px] text-indigo-400" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-white tracking-tight">
              Asset Allocation
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Distribution by value
            </p>
          </div>
        </div>
        {chartData.length > 0 && (
          <span className="text-xs text-gray-600 tabular-nums font-medium bg-white/[0.03] px-3 py-1.5 rounded-lg">
            {chartData.length} asset{chartData.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Screen-reader summary */}
      <ChartDataSummary data={chartData} />

      {chartData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl mb-5 bg-indigo-500/[0.06] border border-indigo-500/10">
            <PieChartIcon className="h-7 w-7 text-gray-600" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium text-gray-400">
            No assets to display
          </p>
          <p className="text-xs text-gray-600 mt-2 max-w-[220px] leading-relaxed">
            Mint your first asset to see allocation data
          </p>
        </div>
      ) : (
        <>
          {/* Donut chart */}
          <div className="relative mt-2" aria-hidden="true">
            {/* Center label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none leading-tight px-4">
              <span className="text-[11px] font-medium tracking-widest uppercase text-gray-500 leading-tight">
                Total Value
              </span>
              <span className="max-w-full truncate text-xl font-bold mt-1 leading-tight gradient-text sm:text-2xl">
                ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <defs>
                  {CHART_COLORS.map((color, i) => (
                    <linearGradient
                      key={`alloc-grad-${i}`}
                      id={`allocGrad-${i}`}
                      x1="0"
                      y1="0"
                      x2="1"
                      y2="1"
                    >
                      <stop offset="0%" stopColor={color} stopOpacity={1} />
                      <stop offset="100%" stopColor={color} stopOpacity={0.7} />
                    </linearGradient>
                  ))}
                </defs>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius="60%"
                  outerRadius="85%"
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                  stroke="none"
                  cornerRadius={4}
                >
                  {chartData.map((_, index) => (
                    <Cell
                      key={`alloc-cell-${index}`}
                      fill={`url(#allocGrad-${index % CHART_COLORS.length})`}
                      style={{
                        filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))',
                      }}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={<CustomTooltip />}
                  wrapperStyle={{ outline: 'none' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="mt-8 pt-6 border-t border-white/[0.04]">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 px-2">
              {chartData.map((entry, index) => (
                <div
                  key={entry.symbol}
                  className="flex items-center gap-3 py-3 border-b border-white/[0.04] last:border-b-0"
                >
                  <span
                    className="h-3 w-3 rounded-full shrink-0 ring-2 ring-offset-1"
                    aria-hidden="true"
                    style={{
                      backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                      ['--tw-ring-color' as string]: `${CHART_COLORS[index % CHART_COLORS.length]}33`,
                      ['--tw-ring-offset-color' as string]: 'transparent',
                    }}
                  />
                  <div className="flex flex-1 items-center justify-between min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-medium text-gray-300 truncate">
                        {entry.name}
                      </span>
                      <span className="text-[10px] text-gray-600">
                        {entry.symbol}
                      </span>
                    </div>
                    <span className="text-[11px] tabular-nums font-medium text-gray-400 shrink-0 ml-3">
                      {entry.percentage.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
