import {
  Activity,
  BarChart3,
  DollarSign,
  Package,
} from 'lucide-react';
import type { ExchangeOrder, TradeHistory, WrappedAsset } from '../../types';
import { formatCurrency, parseTokenAmount } from '../../lib/utils/helpers';
import { TOOLTIPS } from '../../lib/tooltipContent';
import { GRID_CLASSES } from '../../lib/designTokens';
import PortfolioSummaryCard from './PortfolioSummaryCard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AssetGridProps {
  wrappedAssets: WrappedAsset[];
  userOrders: ExchangeOrder[];
  tradeHistory: TradeHistory[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AssetGrid({
  wrappedAssets,
  userOrders,
  tradeHistory,
}: AssetGridProps) {
  const totalAssets = wrappedAssets.length;

  const totalValueLocked = wrappedAssets.reduce((sum, asset) => {
    return sum + parseTokenAmount(asset.originalValue || '0');
  }, 0);

  const activeOrders = userOrders.filter((o) => !o.cancelled).length;
  const totalTrades = tradeHistory.length;

  return (
    <div className={GRID_CLASSES.stats}>
      <PortfolioSummaryCard
        title="Total Assets"
        value={String(totalAssets)}
        icon={Package}
        gradientFrom="#3B82F6"
        gradientTo="#6366F1"
        tooltip={TOOLTIPS.totalAssets}
      />
      <PortfolioSummaryCard
        title="Total Value Locked"
        value={formatCurrency(totalValueLocked)}
        icon={DollarSign}
        gradientFrom="#10B981"
        gradientTo="#06B6D4"
        tooltip={TOOLTIPS.tvl}
      />
      <PortfolioSummaryCard
        title="Active Orders"
        value={String(activeOrders)}
        icon={BarChart3}
        gradientFrom="#8B5CF6"
        gradientTo="#A855F7"
        tooltip={TOOLTIPS.orderBook}
      />
      <PortfolioSummaryCard
        title="Total Trades"
        value={String(totalTrades)}
        icon={Activity}
        gradientFrom="#F59E0B"
        gradientTo="#EF4444"
      />
    </div>
  );
}
