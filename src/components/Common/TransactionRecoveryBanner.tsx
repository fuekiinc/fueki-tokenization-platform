/**
 * TransactionRecoveryBanner
 *
 * A fixed-position toast-like banner that appears when the user reconnects
 * and pending transactions have resolved (confirmed or failed). It
 * auto-dismisses after 10 seconds and provides links to view each
 * transaction on the appropriate block explorer.
 */

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, X, ExternalLink } from 'lucide-react';
import clsx from 'clsx';
import { useTransactionRecovery } from '../../hooks/useTransactionRecovery.ts';
import { SUPPORTED_NETWORKS } from '../../contracts/addresses.ts';
import type { PendingTransaction } from '../../lib/transactionRecovery.ts';

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

// ---------------------------------------------------------------------------
// Auto-dismiss duration (ms)
// ---------------------------------------------------------------------------

const AUTO_DISMISS_MS = 10_000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TransactionRecoveryBanner() {
  const { confirmedTxs, failedTxs, isChecking, dismissAll } =
    useTransactionRecovery();

  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasResults = confirmedTxs.length > 0 || failedTxs.length > 0;

  // Show the banner when results arrive, start auto-dismiss timer.
  useEffect(() => {
    if (!hasResults) {
      setVisible(false);
      return;
    }

    setVisible(true);

    timerRef.current = setTimeout(() => {
      setVisible(false);
      dismissAll();
    }, AUTO_DISMISS_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [hasResults, dismissAll]);

  const handleDismiss = () => {
    setVisible(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    dismissAll();
  };

  // Nothing to show.
  if (!visible || (!hasResults && !isChecking)) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={clsx(
        'fixed top-4 right-4 z-50 w-full max-w-md',
        'rounded-2xl border border-white/[0.08]',
        'bg-[#0D0F14]/95 backdrop-blur-xl',
        'shadow-[0_8px_40px_-8px_rgba(0,0,0,0.5)]',
        'p-5 space-y-3',
        'animate-in slide-in-from-right',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-white">
          Transaction Recovery
        </h4>
        <button
          type="button"
          onClick={handleDismiss}
          className={clsx(
            'rounded-lg p-1.5',
            'text-gray-500 hover:text-white hover:bg-white/[0.08]',
            'transition-colors duration-150',
          )}
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Confirmed transactions */}
      {confirmedTxs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-medium">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              {confirmedTxs.length} transaction{confirmedTxs.length !== 1 ? 's' : ''} confirmed since you were away
            </span>
          </div>
          <ul className="space-y-1.5 pl-6">
            {confirmedTxs.map((tx) => {
              const url = getExplorerTxURL(tx);
              return (
                <li
                  key={tx.hash}
                  className="flex items-center gap-2 text-xs text-gray-400"
                >
                  <span className="truncate flex-1" title={tx.description}>
                    {tx.description || truncateHash(tx.hash)}
                  </span>
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-indigo-400 hover:text-indigo-300 transition-colors"
                      aria-label={`View transaction ${truncateHash(tx.hash)} on explorer`}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Failed transactions */}
      {failedTxs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-red-400 text-xs font-medium">
            <XCircle className="h-4 w-4 shrink-0" />
            <span>
              {failedTxs.length} transaction{failedTxs.length !== 1 ? 's' : ''} failed
            </span>
          </div>
          <ul className="space-y-1.5 pl-6">
            {failedTxs.map((tx) => {
              const url = getExplorerTxURL(tx);
              return (
                <li
                  key={tx.hash}
                  className="flex items-center gap-2 text-xs text-gray-400"
                >
                  <span className="truncate flex-1" title={tx.description}>
                    {tx.description || truncateHash(tx.hash)}
                  </span>
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-red-400 hover:text-red-300 transition-colors"
                      aria-label={`View failed transaction ${truncateHash(tx.hash)} on explorer`}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Progress bar for auto-dismiss */}
      <div className="h-0.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full bg-indigo-500/60 rounded-full"
          style={{
            animation: `shrink-bar ${AUTO_DISMISS_MS}ms linear forwards`,
          }}
        />
      </div>

      {/* Inline keyframe -- avoids needing a global CSS file addition */}
      <style>{`
        @keyframes shrink-bar {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
    </div>
  );
}
