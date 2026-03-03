import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import toast from 'react-hot-toast';
import { Check, Copy, Package, PieChart as PieChartIcon } from 'lucide-react';
import clsx from 'clsx';
import type { WrappedAsset } from '../../types/index';
import {
  copyToClipboard,
  formatAddress,
  parseTokenAmount,
} from '../../lib/utils/helpers';
import { formatCurrency, formatPercent } from '../../lib/formatters';
import {
  CARD_CLASSES,
  CHART_HEADER_CLASSES,
  CHART_TOOLTIP_STYLE,
  EMPTY_STATE_CLASSES,
  CHART_COLORS as TOKEN_CHART_COLORS,
} from '../../lib/designTokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PortfolioChartProps {
  assets: WrappedAsset[];
}

interface ChartDatum {
  name: string;
  symbol: string;
  address: string;
  value: number;
  percentage: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHART_COLORS = TOKEN_CHART_COLORS;

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
    <div style={CHART_TOOLTIP_STYLE}>
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
          {formatPercent(data.percentage ?? 0)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Center label (total value displayed inside the donut)
// ---------------------------------------------------------------------------

function CenterLabel({ total }: { total: number }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none leading-tight px-4">
      <span className="text-[11px] font-medium tracking-widest uppercase text-gray-500 leading-tight">
        Total Value
      </span>
      <span className="max-w-full truncate text-xl font-bold mt-1 leading-tight gradient-text sm:text-2xl">
        {formatCurrency(total)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom legend
// ---------------------------------------------------------------------------

function CopyAddressButton({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => { clearTimeout(timerRef.current); };
  }, []);

  const handleCopy = () => {
    void copyToClipboard(address).then(() => {
      setCopied(true);
      toast.success('Contract address copied!');
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-mono transition-all duration-200',
        copied
          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
          : 'bg-white/[0.03] text-gray-500 border border-white/[0.06] hover:bg-white/[0.06] hover:text-gray-300 hover:border-white/[0.12]',
      )}
      title={address}
    >
      {copied ? (
        <>
          <Check className="h-2.5 w-2.5" />
          Copied
        </>
      ) : (
        <>
          {formatAddress(address)}
          <Copy className="h-2.5 w-2.5" />
        </>
      )}
    </button>
  );
}

function CustomLegend({
  data,
}: {
  data: ChartDatum[];
}) {
  if (data.length === 0) return null;

  return (
    <div className="mt-10 pt-6 border-t border-white/[0.04]">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 px-2">
        {data.map((entry, index) => (
          <div
            key={entry.symbol}
            className="flex items-center gap-3 py-3 group cursor-default border-b border-white/[0.04] last:border-b-0"
          >
            <span
              className="h-3 w-3 rounded-full shrink-0 ring-2 ring-offset-1"
              style={{
                backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                ['--tw-ring-color' as string]: `${CHART_COLORS[index % CHART_COLORS.length]}33`,
                ['--tw-ring-offset-color' as string]: 'transparent',
              }}
            />
            <div className="flex flex-1 flex-col gap-1.5 min-w-0">
              <div className="flex items-center justify-between min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-medium text-gray-300 truncate group-hover:text-white transition-colors">
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
              <CopyAddressButton address={entry.address} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PortfolioChart({ assets }: PortfolioChartProps) {
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
          address: asset.address,
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

  return (
    <div className={clsx(CARD_CLASSES.base, CARD_CLASSES.wrapper, CARD_CLASSES.shadow, 'p-8 sm:p-11')}>
      {/* Subtle gradient accent at top */}
      <div className={CARD_CLASSES.gradientAccent} />

      {/* Header */}
      <div className={CHART_HEADER_CLASSES.container}>
        <div className={CHART_HEADER_CLASSES.left}>
          <div className={CHART_HEADER_CLASSES.icon}>
            <PieChartIcon className={CHART_HEADER_CLASSES.iconSvg} />
          </div>
          <div>
            <h3 className={CHART_HEADER_CLASSES.title}>
              Portfolio Allocation
            </h3>
            <p className={CHART_HEADER_CLASSES.subtitle}>
              Asset distribution by value
            </p>
          </div>
        </div>
        {chartData.length > 0 && (
          <span className={CHART_HEADER_CLASSES.counter}>
            {chartData.length} asset{chartData.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {chartData.length === 0 ? (
        <div className={EMPTY_STATE_CLASSES.container}>
          <div className={EMPTY_STATE_CLASSES.iconBox}>
            <Package className={EMPTY_STATE_CLASSES.icon} />
          </div>
          <p className={EMPTY_STATE_CLASSES.title}>
            No assets to display
          </p>
          <p className={EMPTY_STATE_CLASSES.description}>
            Tokenize your first asset to see your portfolio allocation
          </p>
        </div>
      ) : (
        <>
          <div className="relative mt-2">
            <CenterLabel total={totalValue} />
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <defs>
                  {CHART_COLORS.map((color, i) => (
                    <linearGradient
                      key={`grad-${i}`}
                      id={`pieGrad-${i}`}
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
                      key={`cell-${index}`}
                      fill={`url(#pieGrad-${index % CHART_COLORS.length})`}
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
          <CustomLegend data={chartData} />
        </>
      )}
    </div>
  );
}
