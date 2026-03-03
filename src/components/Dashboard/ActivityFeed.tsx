import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Clock,
  ExternalLink,
  Flame,
  Repeat,
  Send,
  ShieldCheck,
} from 'lucide-react';
import type { TradeHistory } from '../../types/index';
import { formatAddress } from '../../lib/utils/helpers';
import { getNetworkMetadata } from '../../contracts/addresses';
import {
  CARD_CLASSES,
  CHART_HEADER_CLASSES,
  EMPTY_STATE_CLASSES,
  FILTER_PILL_CLASSES,
} from '../../lib/designTokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActivityFeedProps {
  trades: TradeHistory[];
  maxItems?: number;
  /** Wallet chain ID -- used to resolve the correct block explorer URL. */
  chainId?: number | null;
}

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

type ActivityFilter = 'all' | 'mints' | 'trades' | 'swaps' | 'transfers';

interface FilterDef {
  key: ActivityFilter;
  label: string;
}

const FILTERS: FilterDef[] = [
  { key: 'all', label: 'All' },
  { key: 'mints', label: 'Mints' },
  { key: 'trades', label: 'Trades' },
  { key: 'swaps', label: 'Swaps' },
  { key: 'transfers', label: 'Transfers' },
];

const FILTER_TYPES: Record<ActivityFilter, TradeHistory['type'][] | null> = {
  all: null,
  mints: ['mint', 'security-mint'],
  trades: ['exchange'],
  swaps: ['swap-eth', 'swap-erc20'],
  transfers: ['transfer', 'burn'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TypeConfigEntry = {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  Icon: React.ElementType;
};

const TYPE_CONFIG: Record<TradeHistory['type'], TypeConfigEntry> = {
  mint: {
    label: 'Mint',
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10',
    borderColor: 'border-indigo-500/20',
    Icon: ArrowUpRight,
  },
  burn: {
    label: 'Burn',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/20',
    Icon: Flame,
  },
  transfer: {
    label: 'Transfer',
    color: 'text-violet-400',
    bgColor: 'bg-violet-500/10',
    borderColor: 'border-violet-500/20',
    Icon: Send,
  },
  exchange: {
    label: 'Exchange',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/20',
    Icon: Repeat,
  },
  'security-mint': {
    label: 'Security Mint',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/20',
    Icon: ShieldCheck,
  },
  'swap-eth': {
    label: 'Swap ETH',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500/20',
    Icon: Repeat,
  },
  'swap-erc20': {
    label: 'Swap ERC-20',
    color: 'text-teal-400',
    bgColor: 'bg-teal-500/10',
    borderColor: 'border-teal-500/20',
    Icon: Repeat,
  },
};

const FALLBACK_CONFIG: TypeConfigEntry = {
  label: 'Unknown',
  color: 'text-gray-400',
  bgColor: 'bg-gray-500/10',
  borderColor: 'border-gray-500/20',
  Icon: Activity,
};

/**
 * Returns a human-readable relative timestamp.
 * Examples: "just now", "2 min ago", "1 hour ago", "3 days ago"
 */
function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds} sec ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return '1 month ago';
  return `${months} months ago`;
}

function getConfig(type: TradeHistory['type']): TypeConfigEntry {
  return TYPE_CONFIG[type] ?? FALLBACK_CONFIG;
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: TradeHistory['status'] }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider',
        status === 'confirmed' && 'bg-emerald-500/10 text-emerald-400',
        status === 'pending' && 'bg-amber-500/10 text-amber-400',
        status === 'failed' && 'bg-red-500/10 text-red-400',
      )}
    >
      <span
        className={clsx(
          'h-1.5 w-1.5 rounded-full',
          status === 'confirmed' && 'bg-emerald-400',
          status === 'pending' && 'bg-amber-400 animate-pulse',
          status === 'failed' && 'bg-red-400',
        )}
      />
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ActivityFeed({ trades, maxItems = 10, chainId }: ActivityFeedProps) {
  const [activeFilter, setActiveFilter] = useState<ActivityFilter>('all');

  const explorerUrl =
    (chainId ? getNetworkMetadata(chainId)?.blockExplorer : null) ||
    'https://etherscan.io';

  const filteredItems = useMemo(() => {
    const allowedTypes = FILTER_TYPES[activeFilter];
    const filtered = allowedTypes
      ? trades.filter((t) => allowedTypes.includes(t.type))
      : trades;

    return [...filtered]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, maxItems);
  }, [trades, activeFilter, maxItems]);

  // Compute counts per filter for the badges
  const filterCounts = useMemo(() => {
    const counts: Record<ActivityFilter, number> = {
      all: trades.length,
      mints: 0,
      trades: 0,
      swaps: 0,
      transfers: 0,
    };
    for (const t of trades) {
      if (t.type === 'mint' || t.type === 'security-mint') counts.mints++;
      else if (t.type === 'exchange') counts.trades++;
      else if (t.type === 'swap-eth' || t.type === 'swap-erc20') counts.swaps++;
      else if (t.type === 'transfer' || t.type === 'burn') counts.transfers++;
    }
    return counts;
  }, [trades]);

  return (
    <div className={clsx(CARD_CLASSES.base, CARD_CLASSES.wrapper, CARD_CLASSES.shadow, 'p-6 sm:p-8')}>
      {/* Subtle gradient accent at top */}
      <div className={CARD_CLASSES.gradientAccent} />

      {/* Header */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className={CHART_HEADER_CLASSES.icon}>
            <Activity className={CHART_HEADER_CLASSES.iconSvg} />
          </div>
          <div>
            <h3 className={CHART_HEADER_CLASSES.title}>
              Recent Activity
            </h3>
            <p className={clsx(CHART_HEADER_CLASSES.subtitle, 'mt-0.5')}>
              Latest transactions across all types
            </p>
          </div>
        </div>

        {/* Filter pills */}
        <div className={clsx(FILTER_PILL_CLASSES.container, 'overflow-x-auto')}>
          {FILTERS.map((filter) => {
            const count = filterCounts[filter.key];
            const isActive = activeFilter === filter.key;
            return (
              <button
                key={filter.key}
                onClick={() => setActiveFilter(filter.key)}
                className={clsx(
                  FILTER_PILL_CLASSES.pill,
                  'flex items-center gap-1.5',
                  isActive
                    ? FILTER_PILL_CLASSES.active
                    : FILTER_PILL_CLASSES.inactive,
                )}
              >
                {isActive && (
                  <div className={FILTER_PILL_CLASSES.activeHighlight} />
                )}
                <span className="relative z-10">{filter.label}</span>
                {count > 0 && (
                  <span
                    className={clsx(
                      'relative z-10 text-[9px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1',
                      isActive
                        ? 'bg-indigo-500/30 text-indigo-300'
                        : 'bg-white/[0.06] text-gray-500',
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className={EMPTY_STATE_CLASSES.container}>
          <div className={clsx(EMPTY_STATE_CLASSES.iconBox, 'h-14 w-14 mb-4')}>
            <Clock className="h-6 w-6 text-gray-600" />
          </div>
          <p className={EMPTY_STATE_CLASSES.title}>
            {activeFilter === 'all'
              ? 'No recent activity'
              : `No ${FILTERS.find((f) => f.key === activeFilter)?.label.toLowerCase() ?? ''} found`}
          </p>
          <p className={clsx(EMPTY_STATE_CLASSES.description, 'max-w-[220px]')}>
            {activeFilter === 'all'
              ? 'Your transactions will appear here once you start trading'
              : 'Try selecting a different filter to see more activity'}
          </p>
        </div>
      ) : (
        <div>
          {/* Feed items */}
          <ul>
            {filteredItems.map((trade, index) => {
              const config = getConfig(trade.type);
              const { Icon } = config;
              const isLast = index === filteredItems.length - 1;

              return (
                <li
                  key={trade.id}
                  className={clsx(
                    'flex items-center gap-4 py-4 transition-all duration-150',
                    'hover:bg-white/[0.02] -mx-3 px-3 rounded-xl',
                    !isLast && 'border-b border-white/[0.04]',
                  )}
                >
                  {/* Type icon */}
                  <div
                    className={clsx(
                      'flex h-10 w-10 items-center justify-center rounded-xl shrink-0 border',
                      config.bgColor,
                      config.borderColor,
                    )}
                  >
                    <Icon className={clsx('h-4 w-4', config.color)} />
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-medium text-white truncate">
                        {trade.amount ?? '0'} {trade.assetSymbol ?? ''}
                      </span>
                      <span
                        className={clsx(
                          'text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md border',
                          config.bgColor,
                          config.color,
                          config.borderColor,
                        )}
                      >
                        {config.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      {/* Addresses */}
                      {trade.from && (
                        <span className="text-gray-400 text-xs font-mono">
                          {formatAddress(trade.from)}
                        </span>
                      )}
                      {trade.from && trade.to && (
                        <ArrowRight className="h-3 w-3 text-gray-600 shrink-0" />
                      )}
                      {trade.to && (
                        <span className="text-gray-400 text-xs font-mono">
                          {formatAddress(trade.to)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right side: status + time + link */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="hidden sm:block">
                      {trade.status && <StatusBadge status={trade.status} />}
                    </div>

                    <span className="text-xs text-gray-500 tabular-nums min-w-[64px] text-right hidden sm:block">
                      {timeAgo(trade.timestamp)}
                    </span>

                    <div className="w-7 flex justify-center">
                      {trade.txHash ? (
                        <a
                          href={`${explorerUrl}/tx/${trade.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-600 transition-all hover:text-indigo-400 hover:bg-indigo-500/10"
                          title={`View on explorer: ${trade.txHash.slice(0, 10)}...`}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <span className="h-7 w-7" />
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* View All link */}
          <div className="mt-4 pt-4 flex justify-center border-t border-white/[0.04]">
            <Link
              to="/portfolio"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 transition-colors hover:text-indigo-300 group"
            >
              View All Transactions
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
