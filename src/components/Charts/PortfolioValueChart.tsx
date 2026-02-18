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
import {
  CARD_CLASSES,
  CHART_HEADER_CLASSES,
  CHART_TOOLTIP_STYLE,
  CHART_AXIS,
  EMPTY_STATE_CLASSES,
} from '../../lib/designTokens';
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
    <div role="tooltip" style={CHART_TOOLTIP_STYLE}>
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
            <TrendingUp className={CHART_HEADER_CLASSES.iconSvg} aria-hidden="true" />
          </div>
          <div>
            <h3 className={CHART_HEADER_CLASSES.title}>
              Portfolio Value
            </h3>
            <p className={CHART_HEADER_CLASSES.subtitle}>
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
        <div className={EMPTY_STATE_CLASSES.container}>
          <div className={EMPTY_STATE_CLASSES.iconBox}>
            <TrendingUp className={EMPTY_STATE_CLASSES.icon} aria-hidden="true" />
          </div>
          <p className={EMPTY_STATE_CLASSES.title}>
            No value data available
          </p>
          <p className={EMPTY_STATE_CLASSES.description}>
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
                strokeDasharray={CHART_AXIS.grid.strokeDasharray}
                stroke={CHART_AXIS.grid.stroke}
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={CHART_AXIS.tick}
                axisLine={CHART_AXIS.axisLine}
                tickLine={false}
              />
              <YAxis
                tick={CHART_AXIS.tick}
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
