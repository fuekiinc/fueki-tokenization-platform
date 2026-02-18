import clsx from 'clsx';
import {
  Wallet,
  Package,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import type { WrappedAsset, ExchangeOrder, TradeHistory } from '../../types';
import { formatCurrency } from '../../lib/utils/helpers';
import { formatPercent } from '../../lib/formatters';
import { CARD_CLASSES, GRID_CLASSES } from '../../lib/designTokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StatsGridProps {
  wrappedAssets: WrappedAsset[];
  userOrders: ExchangeOrder[];
  tradeHistory: TradeHistory[];
}

interface StatCardProps {
  label: string;
  value: string;
  change?: { value: number; period: string };
  icon: React.ReactNode;
  accentColor: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Calculate the 24h portfolio change by comparing the sum of trade amounts
 * in the last 24 hours to the total value locked.
 */
function compute24hChange(
  tradeHistory: TradeHistory[],
  totalValue: number,
): { value: number; period: string } | undefined {
  if (totalValue === 0 || tradeHistory.length === 0) return undefined;

  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  let netChange = 0;

  for (const trade of tradeHistory) {
    if (trade.timestamp < oneDayAgo) continue;
    if (trade.status !== 'confirmed') continue;

    const rawAmount = parseFloat(trade.amount);
    const amount = Number.isNaN(rawAmount) ? 0 : Math.abs(rawAmount);

    if (
      trade.type === 'mint' ||
      trade.type === 'security-mint' ||
      trade.type === 'exchange' ||
      trade.type === 'swap-eth' ||
      trade.type === 'swap-erc20'
    ) {
      netChange += amount;
    } else if (trade.type === 'burn') {
      netChange -= amount;
    }
  }

  if (netChange === 0) return undefined;

  // Express as percentage of total value
  const previousValue = totalValue - netChange;
  if (previousValue <= 0) return undefined;

  const pctChange = (netChange / previousValue) * 100;
  return { value: pctChange, period: 'vs 24h ago' };
}

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

function StatCard({ label, value, change, icon, accentColor }: StatCardProps) {
  return (
    <div
      className={clsx(
        CARD_CLASSES.base,
        CARD_CLASSES.wrapper,
        CARD_CLASSES.hover,
        'p-6 group',
      )}
    >
      {/* Gradient accent line at top */}
      <div
        className="absolute inset-x-0 top-0 h-[1px]"
        style={{
          background: `linear-gradient(to right, transparent, ${accentColor}66, transparent)`,
        }}
      />

      {/* Hover glow */}
      <div
        className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-0 transition-opacity duration-500 group-hover:opacity-100 blur-3xl"
        style={{
          background: `radial-gradient(circle, ${accentColor}18, transparent 70%)`,
        }}
      />

      <div className="relative flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          {label}
        </span>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: `${accentColor}15` }}
        >
          {icon}
        </div>
      </div>

      <div className="relative text-2xl font-bold text-white tabular-nums">
        {value}
      </div>

      {change && (
        <div className="relative mt-2 flex items-center gap-1.5">
          <div
            className={clsx(
              'flex items-center gap-0.5 text-xs font-semibold',
              change.value >= 0 ? 'text-emerald-400' : 'text-red-400',
            )}
          >
            {change.value >= 0 ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            {change.value >= 0 ? '+' : ''}
            {formatPercent(Math.abs(change.value))}
          </div>
          <span className="text-[10px] text-gray-600">{change.period}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatsGrid
// ---------------------------------------------------------------------------

export default function StatsGrid({
  wrappedAssets,
  userOrders,
  tradeHistory,
}: StatsGridProps) {
  const totalAssets = wrappedAssets.length;

  const totalValueLocked = wrappedAssets.reduce((sum, asset) => {
    const v = parseFloat(asset.originalValue || '0');
    return sum + (Number.isNaN(v) ? 0 : v);
  }, 0);

  const totalTrades = tradeHistory.length;
  const activeOrders = userOrders.filter((o) => !o.cancelled).length;

  const portfolioChange = compute24hChange(tradeHistory, totalValueLocked);

  return (
    <div className={GRID_CLASSES.stats}>
      <StatCard
        label="Portfolio Value"
        value={formatCurrency(totalValueLocked)}
        change={portfolioChange}
        icon={<Wallet className="h-4 w-4 text-indigo-400" />}
        accentColor="#6366F1"
      />
      <StatCard
        label="Total Assets"
        value={String(totalAssets)}
        icon={<Package className="h-4 w-4 text-violet-400" />}
        accentColor="#8B5CF6"
      />
      <StatCard
        label="Total Trades"
        value={String(totalTrades)}
        icon={<ArrowLeftRight className="h-4 w-4 text-emerald-400" />}
        accentColor="#10B981"
      />
      <StatCard
        label="Active Orders"
        value={String(activeOrders)}
        icon={
          activeOrders > 0 ? (
            <TrendingUp className="h-4 w-4 text-amber-400" />
          ) : (
            <TrendingDown className="h-4 w-4 text-amber-400" />
          )
        }
        accentColor="#F59E0B"
      />
    </div>
  );
}
