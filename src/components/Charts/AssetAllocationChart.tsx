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
import { formatCurrency, formatPercent } from '../../lib/formatters';
import { parseTokenAmount } from '../../lib/utils/helpers.ts';
import {
  CARD_CLASSES,
  CHART_HEADER_CLASSES,
  CHART_TOOLTIP_STYLE,
  CHART_COLORS,
  EMPTY_STATE_CLASSES,
} from '../../lib/designTokens';
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
    <div role="tooltip" style={CHART_TOOLTIP_STYLE}>
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
          {formatCurrency(data.value)}
        </span>
        <span className="text-xs font-medium text-indigo-400">
          {formatPercent(data.percentage)}
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
        Total portfolio value: {formatCurrency(total)}
      </p>
      {data.map((d) => (
        <div key={d.symbol} role="listitem">
          {d.name} ({d.symbol}): {formatCurrency(d.value)}
          , {formatPercent(d.percentage)} of portfolio
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

    const total = assets.reduce(
      (sum, a) => sum + parseTokenAmount(a.originalValue || '0'),
      0,
    );

    if (total === 0) return [];

    return assets
      .map((asset) => {
        const safeValue = parseTokenAmount(asset.originalValue || '0');
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
      aria-label={`Asset allocation chart showing distribution of ${chartData.length} assets totalling ${formatCurrency(totalValue)}`}
      className={clsx(
        CARD_CLASSES.base,
        CARD_CLASSES.wrapper,
        CARD_CLASSES.padding,
      )}
    >
      {/* Top gradient accent */}
      <div className={CARD_CLASSES.gradientAccent} />

      {/* Header */}
      <div className={CHART_HEADER_CLASSES.container}>
        <div className={CHART_HEADER_CLASSES.left}>
          <div className={CHART_HEADER_CLASSES.icon}>
            <PieChartIcon className={CHART_HEADER_CLASSES.iconSvg} aria-hidden="true" />
          </div>
          <div>
            <h3 className={CHART_HEADER_CLASSES.title}>
              Asset Allocation
            </h3>
            <p className={CHART_HEADER_CLASSES.subtitle}>
              Distribution by value
            </p>
          </div>
        </div>
        {chartData.length > 0 && (
          <span className={CHART_HEADER_CLASSES.counter}>
            {chartData.length} asset{chartData.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Screen-reader summary */}
      <ChartDataSummary data={chartData} />

      {chartData.length === 0 ? (
        <div className={EMPTY_STATE_CLASSES.container}>
          <div className={EMPTY_STATE_CLASSES.iconBox}>
            <PieChartIcon className={EMPTY_STATE_CLASSES.icon} aria-hidden="true" />
          </div>
          <p className={EMPTY_STATE_CLASSES.title}>
            No assets to display
          </p>
          <p className={EMPTY_STATE_CLASSES.description}>
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
                {formatCurrency(totalValue)}
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
                      {formatPercent(entry.percentage)}
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
