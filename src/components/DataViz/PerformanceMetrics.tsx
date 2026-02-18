import { useMemo } from 'react';
import clsx from 'clsx';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { WrappedAsset, TradeHistory } from '../../types/index.ts';
import {
  calculatePortfolioSummary,
  formatPnLCurrency,
  formatPnLPercent,
} from '../../lib/portfolioMetrics.ts';
import type { PortfolioSummary } from '../../lib/portfolioMetrics.ts';
import { formatCurrency } from '../../lib/formatters';
import { CARD_CLASSES, GRID_CLASSES } from '../../lib/designTokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PerformanceMetricsProps {
  assets: WrappedAsset[];
  trades: TradeHistory[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type PnLDirection = 'positive' | 'negative' | 'neutral';

function getPnLDirection(value: number): PnLDirection {
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'neutral';
}

function PnLIcon({
  direction,
  className,
}: {
  direction: PnLDirection;
  className?: string;
}) {
  if (direction === 'positive') {
    return <TrendingUp className={clsx('h-4.5 w-4.5', className)} aria-hidden="true" />;
  }
  if (direction === 'negative') {
    return <TrendingDown className={clsx('h-4.5 w-4.5', className)} aria-hidden="true" />;
  }
  return <Minus className={clsx('h-4.5 w-4.5', className)} aria-hidden="true" />;
}

function pnlTextClass(direction: PnLDirection): string {
  if (direction === 'positive') return 'text-emerald-400 dark:text-emerald-400';
  if (direction === 'negative') return 'text-red-400 dark:text-red-400';
  return 'text-[var(--text-muted,theme(colors.gray.500))]';
}

function pnlIconBgClass(direction: PnLDirection): string {
  if (direction === 'positive') return 'from-emerald-500/20 to-teal-500/20';
  if (direction === 'negative') return 'from-red-500/20 to-rose-500/20';
  return 'from-gray-500/20 to-gray-500/20';
}

// ---------------------------------------------------------------------------
// Summary Card sub-component
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  primaryValue,
  secondaryValue,
  direction,
  ariaLabel,
}: {
  label: string;
  primaryValue: string;
  secondaryValue?: string;
  direction: PnLDirection;
  ariaLabel: string;
}) {
  return (
    <div
      className={clsx(
        CARD_CLASSES.base,
        CARD_CLASSES.wrapper,
        CARD_CLASSES.padding,
        CARD_CLASSES.hover,
      )}
      role="group"
      aria-label={ariaLabel}
    >
      <div className={CARD_CLASSES.gradientAccent} />

      <div className="flex items-center gap-3">
        <div
          className={clsx(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            'bg-gradient-to-br ring-1 ring-white/[0.06]',
            pnlIconBgClass(direction),
          )}
        >
          <PnLIcon direction={direction} className={pnlTextClass(direction)} />
        </div>
        <p className="truncate text-xs font-medium uppercase tracking-wider text-gray-500">
          {label}
        </p>
      </div>

      <p className={clsx('mt-6 text-3xl font-bold tracking-tight', pnlTextClass(direction))}>
        {primaryValue}
      </p>

      {secondaryValue && (
        <p className={clsx('mt-2 text-sm font-medium', pnlTextClass(direction))}>
          {secondaryValue}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function PerformanceMetrics({
  assets,
  trades,
}: PerformanceMetricsProps) {
  const summary: PortfolioSummary = useMemo(
    () => calculatePortfolioSummary(assets, trades),
    [assets, trades],
  );

  const hasTradeData = trades.length > 0 && summary.assetsWithCostData > 0;

  // P&L directions
  const pnlDir = getPnLDirection(summary.totalPnL);
  const pctDir = getPnLDirection(summary.totalPercentageChange);
  const bestDir = summary.bestPerformer
    ? getPnLDirection(summary.bestPerformer.percentageChange)
    : 'neutral';
  const worstDir = summary.worstPerformer
    ? getPnLDirection(summary.worstPerformer.percentageChange)
    : 'neutral';

  return (
    <div
      className={GRID_CLASSES.stats}
      role="group"
      aria-label="Portfolio performance metrics"
    >
      {/* Total P&L */}
      <SummaryCard
        label="Total P&L"
        primaryValue={
          hasTradeData ? formatPnLCurrency(summary.totalPnL) : '--'
        }
        direction={hasTradeData ? pnlDir : 'neutral'}
        ariaLabel={
          hasTradeData
            ? `Total P&L: ${formatPnLCurrency(summary.totalPnL)}`
            : 'Total P&L: No trade data'
        }
      />

      {/* Total Return % */}
      <SummaryCard
        label="Total Return"
        primaryValue={
          hasTradeData ? formatPnLPercent(summary.totalPercentageChange) : '--'
        }
        direction={hasTradeData ? pctDir : 'neutral'}
        ariaLabel={
          hasTradeData
            ? `Total Return: ${formatPnLPercent(summary.totalPercentageChange)}`
            : 'Total Return: No trade data'
        }
      />

      {/* Best Performer */}
      <SummaryCard
        label="Best Performer"
        primaryValue={
          summary.bestPerformer ? summary.bestPerformer.symbol : '--'
        }
        secondaryValue={
          summary.bestPerformer && hasTradeData
            ? formatPnLPercent(summary.bestPerformer.percentageChange)
            : summary.bestPerformer
              ? formatCurrency(summary.bestPerformer.currentValue)
              : undefined
        }
        direction={hasTradeData ? bestDir : 'neutral'}
        ariaLabel={
          summary.bestPerformer
            ? `Best Performer: ${summary.bestPerformer.symbol}`
            : 'Best Performer: No data'
        }
      />

      {/* Worst Performer */}
      <SummaryCard
        label="Worst Performer"
        primaryValue={
          summary.worstPerformer ? summary.worstPerformer.symbol : '--'
        }
        secondaryValue={
          summary.worstPerformer && hasTradeData
            ? formatPnLPercent(summary.worstPerformer.percentageChange)
            : summary.worstPerformer
              ? formatCurrency(summary.worstPerformer.currentValue)
              : undefined
        }
        direction={hasTradeData ? worstDir : 'neutral'}
        ariaLabel={
          summary.worstPerformer
            ? `Worst Performer: ${summary.worstPerformer.symbol}`
            : 'Worst Performer: No data'
        }
      />
    </div>
  );
}
