import { Link } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowUpRight,
  Flame,
  Send,
  Repeat,
  ExternalLink,
  Activity,
  ArrowRight,
  Clock,
} from 'lucide-react';
import type { TradeHistory } from '../../types/index';
import { formatAddress } from '../../lib/utils/helpers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActivityFeedProps {
  trades: TradeHistory[];
  maxItems?: number;
}

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
};

const FALLBACK_CONFIG: TypeConfigEntry = {
  label: 'Unknown',
  color: 'text-gray-400',
  bgColor: 'bg-gray-500/10',
  borderColor: 'border-gray-500/20',
  Icon: Activity,
};

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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

export default function ActivityFeed({ trades, maxItems = 8 }: ActivityFeedProps) {
  const items = [...trades]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, maxItems);

  return (
    <div className="relative bg-[#0D0F14]/80 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-8 sm:p-10 overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
      {/* Subtle gradient accent at top */}
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/[0.08]">
            <Activity className="h-[18px] w-[18px] text-indigo-400" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-white tracking-tight">
              Recent Activity
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Latest transactions
            </p>
          </div>
        </div>
        {items.length > 0 && (
          <span className="text-xs text-gray-600 tabular-nums font-medium bg-white/[0.03] px-3 py-1.5 rounded-lg">
            {items.length} recent
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl mb-5 bg-indigo-500/[0.06] border border-indigo-500/10">
            <Clock className="h-7 w-7 text-gray-600" />
          </div>
          <p className="text-sm font-medium text-gray-400">
            No recent activity
          </p>
          <p className="text-xs text-gray-600 mt-2 max-w-[220px] leading-relaxed">
            Your transactions will appear here once you start trading
          </p>
        </div>
      ) : (
        <div>
          {/* Feed items */}
          <ul>
            {items.map((trade, index) => {
              const config = getConfig(trade.type);
              const { Icon } = config;
              const isLast = index === items.length - 1;

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
                  <div className="flex items-center gap-4 shrink-0">
                    {trade.status && <StatusBadge status={trade.status} />}

                    <span className="text-xs text-gray-500 tabular-nums min-w-[52px] text-right">
                      {timeAgo(trade.timestamp)}
                    </span>

                    <div className="w-7 flex justify-center">
                      {trade.txHash ? (
                        <a
                          href={`https://etherscan.io/tx/${trade.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-600 transition-all hover:text-indigo-400 hover:bg-indigo-500/10"
                          title="View on Etherscan"
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
          <div className="mt-6 pt-5 flex justify-center border-t border-white/[0.04]">
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
