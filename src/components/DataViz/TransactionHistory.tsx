import clsx from 'clsx';
import {
  ArrowUpRight,
  ArrowDownLeft,
  Flame,
  Repeat,
  Clock,
  ExternalLink,
  ArrowRight,
} from 'lucide-react';
import type { TradeHistory } from '../../types/index';
import { formatAddress, formatDate } from '../../lib/utils/helpers';
import {
  CARD_CLASSES,
  CHART_HEADER_CLASSES,
} from '../../lib/designTokens';
import ChartSkeleton from './ChartSkeleton';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TransactionHistoryProps {
  trades: TradeHistory[];
  isLoading?: boolean;
  /** Block explorer base URL, e.g. "https://sepolia.etherscan.io" */
  explorerBaseUrl?: string;
  /** Callback when user wants to navigate to mint */
  onMintNew?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTypeIcon(type: TradeHistory['type']) {
  switch (type) {
    case 'mint':
    case 'security-mint':
      return <ArrowDownLeft className="h-4 w-4" aria-hidden="true" />;
    case 'transfer':
      return <ArrowUpRight className="h-4 w-4" aria-hidden="true" />;
    case 'burn':
      return <Flame className="h-4 w-4" aria-hidden="true" />;
    case 'exchange':
    case 'swap-eth':
    case 'swap-erc20':
      return <Repeat className="h-4 w-4" aria-hidden="true" />;
    default:
      return <Clock className="h-4 w-4" aria-hidden="true" />;
  }
}

function getTypeColor(type: TradeHistory['type']): string {
  switch (type) {
    case 'mint':
    case 'security-mint':
      return 'bg-emerald-500/15 text-emerald-400';
    case 'transfer':
      return 'bg-indigo-500/15 text-indigo-400';
    case 'burn':
      return 'bg-red-500/15 text-red-400';
    case 'exchange':
    case 'swap-eth':
    case 'swap-erc20':
      return 'bg-cyan-500/15 text-cyan-400';
    default:
      return 'bg-gray-500/15 text-gray-400';
  }
}

function getTypeLabel(type: TradeHistory['type']): string {
  switch (type) {
    case 'mint':
      return 'Mint';
    case 'security-mint':
      return 'Security Mint';
    case 'transfer':
      return 'Transfer';
    case 'burn':
      return 'Burn';
    case 'exchange':
      return 'Exchange';
    case 'swap-eth':
      return 'Swap (ETH)';
    case 'swap-erc20':
      return 'Swap (ERC-20)';
    default:
      return 'Transaction';
  }
}

function getStatusClasses(status: TradeHistory['status']): string {
  switch (status) {
    case 'confirmed':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'pending':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'failed':
      return 'bg-red-500/10 text-red-400 border-red-500/20';
    default:
      return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TransactionHistory({
  trades,
  isLoading = false,
  explorerBaseUrl,
  onMintNew,
}: TransactionHistoryProps) {
  if (isLoading) {
    return <ChartSkeleton variant="table" rows={4} />;
  }

  if (trades.length === 0) {
    return (
      <div
        role="status"
        className={clsx(
          'flex flex-col items-center justify-center text-center',
          'rounded-2xl px-8 sm:px-12 py-16 sm:py-20',
          'bg-[#0D0F14]/60 backdrop-blur-xl',
          'border border-dashed border-white/[0.08]',
        )}
      >
        <div className="relative mb-8">
          <div
            aria-hidden="true"
            className="absolute -inset-4 rounded-full bg-gradient-to-br from-indigo-500/10 to-violet-500/10 blur-xl"
          />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/20 to-violet-500/20 ring-1 ring-white/[0.08] text-indigo-400">
            <Clock className="h-8 w-8" />
          </div>
        </div>
        <h3 className="mb-3 text-lg sm:text-xl font-semibold text-white">
          No transactions yet
        </h3>
        <p className="max-w-md text-sm sm:text-base leading-relaxed text-gray-400">
          Your transaction history will appear here once you mint, transfer, or
          exchange tokens.
        </p>
        {onMintNew && (
          <div className="mt-8">
            <button
              type="button"
              onClick={onMintNew}
              className={clsx(
                'inline-flex items-center gap-2 rounded-xl px-6 py-3',
                'bg-gradient-to-r from-indigo-500 to-violet-500',
                'text-sm font-semibold text-white',
                'shadow-lg shadow-indigo-500/25',
                'transition-all duration-200 hover:shadow-xl hover:shadow-indigo-500/30',
                'focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06070A]',
              )}
            >
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              Mint Your First Asset
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={clsx(
        CARD_CLASSES.base,
        CARD_CLASSES.wrapper,
      )}
    >
      {/* Top gradient accent */}
      <div className={CARD_CLASSES.gradientAccent} />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 sm:px-7 sm:py-5 md:px-9 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className={clsx(CHART_HEADER_CLASSES.icon, 'h-9 w-9 rounded-lg')}>
            <Clock className="h-4 w-4 text-indigo-400" aria-hidden="true" />
          </div>
          <h3 className={CHART_HEADER_CLASSES.title}>
            Transaction History
          </h3>
        </div>
        <span className={CHART_HEADER_CLASSES.counter}>
          {trades.length} transaction{trades.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Transaction list */}
      <div role="list" aria-label="Transaction history">
        {trades.map((trade) => (
          <div
            key={trade.id}
            role="listitem"
            className="flex items-center gap-3 sm:gap-4 px-4 py-4 sm:px-7 sm:py-5 md:px-9 border-b border-white/[0.04] last:border-b-0 transition-colors hover:bg-white/[0.02]"
          >
            {/* Type icon */}
            <div
              className={clsx(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                getTypeColor(trade.type),
              )}
            >
              {getTypeIcon(trade.type)}
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5">
                <span className="text-sm font-semibold text-white">
                  {getTypeLabel(trade.type)}
                </span>
                <span
                  className={clsx(
                    'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                    getStatusClasses(trade.status),
                  )}
                >
                  {trade.status}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-xs text-gray-500">
                <span className="tabular-nums">
                  {trade.amount} {trade.assetSymbol}
                </span>
                {trade.from && trade.to && (
                  <>
                    <ArrowRight className="h-3 w-3 text-gray-600 shrink-0" aria-hidden="true" />
                    <span className="font-mono truncate">
                      {formatAddress(trade.to)}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Timestamp + explorer link */}
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs text-gray-600 tabular-nums hidden sm:block">
                {formatDate(trade.timestamp)}
              </span>
              {explorerBaseUrl && trade.txHash && (
                <a
                  href={`${explorerBaseUrl}/tx/${trade.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`View transaction ${formatAddress(trade.txHash)} on block explorer`}
                  className={clsx(
                    'inline-flex items-center justify-center rounded-lg p-2',
                    'text-gray-500 transition-colors hover:text-indigo-400',
                    'focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0D0F14]',
                  )}
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
