/**
 * PendingTransactions
 *
 * Navbar dropdown component that displays a real-time list of pending
 * blockchain transactions. Shows a pulsing amber badge when transactions
 * are pending, and auto-refreshes every 10 seconds to check if they have
 * confirmed or failed on-chain.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Coins,
  ArrowRightLeft,
  Send,
  Droplets,
  ExternalLink,
  ShieldCheck,
  ArrowUpDown,
} from 'lucide-react';
import clsx from 'clsx';
import {
  getPendingTransactions,
  checkPendingTransactions,
} from '../../lib/transactionRecovery';
import type { PendingTransaction } from '../../lib/transactionRecovery';
import { useWalletStore, getProvider } from '../../store/walletStore';
import { SUPPORTED_NETWORKS } from '../../contracts/addresses';

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

/** How often we poll for on-chain status (ms). */
const POLL_INTERVAL_MS = 10_000;

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
  const isConnected = useWalletStore((s) => s.wallet.isConnected);

  const [isOpen, setIsOpen] = useState(false);
  const [pendingTxs, setPendingTxs] = useState<PendingTransaction[]>([]);
  const [resolvedTxs, setResolvedTxs] = useState<ResolvedTransaction[]>([]);
  const [isChecking, setIsChecking] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
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

  // ---- Check on-chain status ----
  const checkStatuses = useCallback(async () => {
    const provider = getProvider();
    if (!provider) return;

    const currentPending = getPendingTransactions();
    if (currentPending.length === 0) {
      setPendingTxs([]);
      return;
    }

    setIsChecking(true);
    try {
      const result = await checkPendingTransactions(provider);

      // Update pending list with what is still pending.
      setPendingTxs(result.stillPending);

      // Add newly confirmed TXs to the resolved list.
      const now = Date.now();
      const newResolved: ResolvedTransaction[] = [];

      for (const tx of result.confirmed) {
        newResolved.push({
          ...tx,
          resolvedStatus: 'confirmed',
          resolvedAt: now,
        });
      }

      for (const tx of result.failed) {
        newResolved.push({
          ...tx,
          resolvedStatus: 'failed',
          resolvedAt: now,
        });
      }

      if (newResolved.length > 0) {
        setResolvedTxs((prev) => [...newResolved, ...prev]);

        // Schedule removal of resolved TXs after a brief display period.
        for (const tx of newResolved) {
          const timer = setTimeout(() => {
            setResolvedTxs((prev) => prev.filter((r) => r.hash !== tx.hash));
            resolvedTimersRef.current.delete(tx.hash);
          }, RESOLVED_DISPLAY_MS);
          resolvedTimersRef.current.set(tx.hash, timer);
        }
      }
    } catch (err) {
      console.error('[PendingTransactions] status check failed:', err);
    } finally {
      setIsChecking(false);
    }
  }, []);

  // ---- Polling lifecycle ----
  useEffect(() => {
    if (!isConnected) {
      setPendingTxs([]);
      setResolvedTxs([]);
      return;
    }

    // Initial read.
    refreshFromStorage();

    // Immediately check statuses on mount.
    void checkStatuses();

    // Poll every POLL_INTERVAL_MS.
    pollTimerRef.current = setInterval(() => {
      refreshFromStorage();
      void checkStatuses();
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(pollTimerRef.current);
    };
  }, [isConnected, refreshFromStorage, checkStatuses]);

  // ---- Clean up resolved timers on unmount ----
  useEffect(() => {
    return () => {
      for (const timer of resolvedTimersRef.current.values()) {
        clearTimeout(timer);
      }
      resolvedTimersRef.current.clear();
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
