/**
 * PendingTransactions
 *
 * Navbar dropdown component that displays a real-time list of pending
 * blockchain transactions. Shows a pulsing amber badge when transactions
 * are pending, and auto-refreshes every 10 seconds to check if they have
 * confirmed or failed on-chain.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  ArrowUpDown,
  CheckCircle2,
  Coins,
  Droplets,
  ExternalLink,
  Loader2,
  Send,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import clsx from 'clsx';
import {
  checkPendingTransactions,
  getPendingTransactions,
} from '../../lib/transactionRecovery';
import type { PendingTransaction } from '../../lib/transactionRecovery';
import { getProvider, useWalletStore } from '../../store/walletStore';
import { SUPPORTED_NETWORKS } from '../../contracts/addresses';
import logger from '../../lib/logger';
import { subscribeToRpcRefetch } from '../../lib/rpc/refetchEvents';
import { queryKeys } from '../../lib/queryClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ResolvedStatus = 'confirmed' | 'failed';

interface ResolvedTransaction extends PendingTransaction {
  resolvedStatus: ResolvedStatus;
  resolvedAt: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How long a resolved TX stays visible before being removed (ms). */
const RESOLVED_DISPLAY_MS = 4_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getExplorerTxURL(tx: PendingTransaction): string | null {
  const network = SUPPORTED_NETWORKS[tx.chainId];
  if (!network?.blockExplorer) return null;
  return `${network.blockExplorer}/tx/${tx.hash}`;
}

function truncateHash(hash: string): string {
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Return the appropriate icon component for a transaction type. */
function TxTypeIcon({ type }: { type: PendingTransaction['type'] }) {
  const iconClass = 'h-4 w-4 shrink-0';

  switch (type) {
    case 'mint':
      return <Coins className={clsx(iconClass, 'text-amber-400')} />;
    case 'swap':
      return <ArrowRightLeft className={clsx(iconClass, 'text-indigo-400')} />;
    case 'transfer':
      return <Send className={clsx(iconClass, 'text-blue-400')} />;
    case 'liquidity':
      return <Droplets className={clsx(iconClass, 'text-cyan-400')} />;
    case 'approve':
      return <ShieldCheck className={clsx(iconClass, 'text-emerald-400')} />;
    case 'exchange':
      return <ArrowUpDown className={clsx(iconClass, 'text-purple-400')} />;
    default:
      return <ArrowRightLeft className={clsx(iconClass, 'text-gray-400')} />;
  }
}

// ---------------------------------------------------------------------------
// Hook: useClickOutside (mirrors Navbar pattern)
// ---------------------------------------------------------------------------

function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  handler: () => void,
) {
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        handler();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [ref, handler]);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PendingTransactions() {
  const wallet = useWalletStore((s) => s.wallet);
  const { isConnected, address, chainId } = wallet;

  const [isOpen, setIsOpen] = useState(false);
  const [pendingTxs, setPendingTxs] = useState<PendingTransaction[]>([]);
  const [resolvedTxs, setResolvedTxs] = useState<ResolvedTransaction[]>([]);
  /** Consecutive check failures -- displayed as a warning in the dropdown. */
  const [checkErrorCount, setCheckErrorCount] = useState(0);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const resolvedTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  // ---- Close on outside click ----
  const close = useCallback(() => setIsOpen(false), []);
  useClickOutside(dropdownRef, close);

  // ---- Close on Escape key ----
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // ---- Read pending TXs from localStorage ----
  const refreshFromStorage = useCallback(() => {
    const txs = getPendingTransactions();
    setPendingTxs(txs);
  }, []);

  const pendingStatusQuery = useQuery({
    queryKey: queryKeys.pendingTxs(address, chainId),
    enabled: isConnected && isOpen && pendingTxs.length > 0,
    refetchInterval: 5_000,
    queryFn: async () => {
      const provider = getProvider();
      const currentPending = getPendingTransactions();

      if (!provider || currentPending.length === 0) {
        return {
          confirmed: [] as PendingTransaction[],
          failed: [] as PendingTransaction[],
          stillPending: currentPending,
        };
      }

      return checkPendingTransactions(provider);
    },
  });

  const {
    data: pendingStatusData,
    error: pendingStatusError,
    errorUpdatedAt: pendingStatusErrorUpdatedAt,
    isFetching: isChecking,
    refetch: refetchPendingStatuses,
  } = pendingStatusQuery;

  // ---- Polling lifecycle --------------------------------------------------
  useEffect(() => {
    if (!isConnected) {
      setPendingTxs([]);
      setResolvedTxs([]);
      return;
    }

    refreshFromStorage();
  }, [isConnected, refreshFromStorage]);

  // Keep the badge list in sync even while the dropdown is closed.
  useEffect(() => {
    if (!isConnected) {
      return () => {};
    }

    const unsubscribeRefetch = subscribeToRpcRefetch(['pending-transactions'], () => {
      refreshFromStorage();
      if (isOpen && getPendingTransactions().length > 0) {
        void refetchPendingStatuses();
      }
    });

    return () => {
      unsubscribeRefetch();
    };
  }, [isConnected, isOpen, refreshFromStorage, refetchPendingStatuses]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    refreshFromStorage();
  }, [isOpen, refreshFromStorage]);

  useEffect(() => {
    if (!pendingStatusData) {
      return;
    }

    setCheckErrorCount(0);
    setPendingTxs(pendingStatusData.stillPending);

    const now = Date.now();
    const newResolved: ResolvedTransaction[] = [];

    for (const tx of pendingStatusData.confirmed) {
      newResolved.push({
        ...tx,
        resolvedStatus: 'confirmed',
        resolvedAt: now,
      });
    }

    for (const tx of pendingStatusData.failed) {
      newResolved.push({
        ...tx,
        resolvedStatus: 'failed',
        resolvedAt: now,
      });
    }

    if (newResolved.length === 0) {
      return;
    }

    setResolvedTxs((prev) => [...newResolved, ...prev]);

    for (const tx of newResolved) {
      const timer = setTimeout(() => {
        setResolvedTxs((prev) => prev.filter((r) => r.hash !== tx.hash));
        resolvedTimersRef.current.delete(tx.hash);
      }, RESOLVED_DISPLAY_MS);
      resolvedTimersRef.current.set(tx.hash, timer);
    }
  }, [pendingStatusData]);

  useEffect(() => {
    if (!pendingStatusError) {
      return;
    }

    logger.error('[PendingTransactions] status check failed:', pendingStatusError);
    setCheckErrorCount((prev) => prev + 1);
  }, [pendingStatusError, pendingStatusErrorUpdatedAt]);

  // ---- Clean up resolved timers on unmount ----
  useEffect(() => {
    const timers = resolvedTimersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  // ---- Also listen for storage events (cross-tab sync) ----
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key === 'fueki-pending-transactions') {
        refreshFromStorage();
      }
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [refreshFromStorage]);

  // ---- Computed ----
  const pendingCount = pendingTxs.length;
  const hasAnyItems = pendingCount > 0 || resolvedTxs.length > 0;

  // Group resolved: confirmed first, then failed.
  const sortedResolved = useMemo(
    () =>
      [...resolvedTxs].sort((a, b) => {
        if (a.resolvedStatus === b.resolvedStatus) return b.resolvedAt - a.resolvedAt;
        return a.resolvedStatus === 'confirmed' ? -1 : 1;
      }),
    [resolvedTxs],
  );

  // Don't render anything if wallet is not connected.
  if (!isConnected) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* ---- Trigger button ---- */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={clsx(
          'relative flex items-center justify-center rounded-xl border p-2.5',
          'transition-all duration-200',
          'border-white/[0.06] bg-white/[0.03]',
          'hover:border-white/[0.1] hover:bg-white/[0.06]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50',
        )}
        aria-label={
          pendingCount > 0
            ? `${pendingCount} pending transaction${pendingCount !== 1 ? 's' : ''}`
            : 'No pending transactions'
        }
        aria-expanded={isOpen}
      >
        {/* Icon */}
        {pendingCount > 0 ? (
          <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
        ) : (
          <ArrowRightLeft className="h-4 w-4 text-gray-500" />
        )}

        {/* Badge with count */}
        {pendingCount > 0 && (
          <span
            className={clsx(
              'absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center',
              'rounded-full bg-amber-500 px-1 text-[10px] font-bold text-black',
              'ring-2 ring-[#06070A]',
            )}
          >
            {pendingCount > 99 ? '99+' : pendingCount}
            {/* Pulsing ring */}
            <span
              className="absolute inset-0 rounded-full bg-amber-500"
              style={{ animation: 'pulseDot 2s ease-in-out infinite' }}
            />
          </span>
        )}
      </button>

      {/* ---- Dropdown ---- */}
      {isOpen && (
        <div
          className={clsx(
            'absolute right-0 z-50 mt-2 w-80 origin-top-right rounded-2xl shadow-2xl',
            'border border-white/[0.06] bg-[#0D0F14]/95 backdrop-blur-xl',
            'animate-scale-in',
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.04] px-4 py-3">
            <h3 className="text-sm font-semibold text-white">
              Transactions
            </h3>
            {isChecking && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500" />
            )}
          </div>

          {/* Network error warning (shown after 2+ consecutive failures) */}
          {checkErrorCount >= 2 && (
            <div className="mx-3 mt-2 flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              <svg className="h-4 w-4 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <span className="text-xs text-amber-400">
                Unable to check transaction status. Network may be unavailable.
              </span>
            </div>
          )}

          {/* List */}
          <div className="max-h-[320px] overflow-y-auto scrollbar-thin">
            {!hasAnyItems ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center px-4 py-8">
                <ArrowRightLeft className="mb-2 h-8 w-8 text-gray-600" />
                <p className="text-sm text-gray-500">No pending transactions</p>
              </div>
            ) : (
              <div className="p-1.5">
                {/* Pending transactions */}
                {pendingTxs.length > 0 && (
                  <div>
                    <p className="mb-1 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                      Pending
                    </p>
                    {pendingTxs.map((tx) => (
                      <PendingTxRow key={tx.hash} tx={tx} />
                    ))}
                  </div>
                )}

                {/* Recently resolved transactions */}
                {sortedResolved.length > 0 && (
                  <div className={pendingTxs.length > 0 ? 'mt-1' : ''}>
                    <p className="mb-1 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                      Recent
                    </p>
                    {sortedResolved.map((tx) => (
                      <ResolvedTxRow key={tx.hash} tx={tx} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transaction row components
// ---------------------------------------------------------------------------

function PendingTxRow({ tx }: { tx: PendingTransaction }) {
  const explorerUrl = getExplorerTxURL(tx);

  return (
    <div
      className={clsx(
        'flex items-center gap-3 rounded-xl px-3 py-2.5',
        'transition-colors duration-150',
        'hover:bg-white/[0.04]',
      )}
    >
      {/* Type icon */}
      <TxTypeIcon type={tx.type} />

      {/* Description + hash */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-200" title={tx.description}>
          {tx.description || truncateHash(tx.hash)}
        </p>
        <p className="text-xs text-gray-500">{timeAgo(tx.timestamp)}</p>
      </div>

      {/* Spinner */}
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-400" />

      {/* Explorer link */}
      {explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={clsx(
            'shrink-0 rounded-lg p-1.5',
            'text-gray-500 transition-colors duration-150',
            'hover:bg-white/[0.06] hover:text-white',
          )}
          title="View on explorer"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

function ResolvedTxRow({ tx }: { tx: ResolvedTransaction }) {
  const explorerUrl = getExplorerTxURL(tx);
  const isConfirmed = tx.resolvedStatus === 'confirmed';

  return (
    <div
      className={clsx(
        'flex items-center gap-3 rounded-xl px-3 py-2.5',
        'transition-all duration-300',
        'hover:bg-white/[0.04]',
        // Fade-in animation for newly resolved items.
        'animate-fade-in',
      )}
    >
      {/* Type icon */}
      <TxTypeIcon type={tx.type} />

      {/* Description + status */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-200" title={tx.description}>
          {tx.description || truncateHash(tx.hash)}
        </p>
        <p
          className={clsx(
            'text-xs font-medium',
            isConfirmed ? 'text-emerald-400' : 'text-red-400',
          )}
        >
          {isConfirmed ? 'Confirmed' : 'Failed'}
        </p>
      </div>

      {/* Status icon */}
      {isConfirmed ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
      ) : (
        <XCircle className="h-4 w-4 shrink-0 text-red-400" />
      )}

      {/* Explorer link */}
      {explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={clsx(
            'shrink-0 rounded-lg p-1.5',
            'text-gray-500 transition-colors duration-150',
            'hover:bg-white/[0.06] hover:text-white',
          )}
          title="View on explorer"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}
