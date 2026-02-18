/**
 * Transaction toast helpers.
 *
 * Provides a consistent UX for blockchain transaction status toasts:
 *   - "Submitting..." with a clickable block explorer link (persists until confirmed)
 *   - "Confirmed!" on success (auto-dismisses after 5s)
 *   - "Failed" on error (auto-dismisses after 8s)
 *
 * Uses react-hot-toast with per-transaction IDs so each toast can be
 * replaced in-place as the transaction lifecycle progresses.
 */

import toast from 'react-hot-toast';
import { createElement } from 'react';
import { getNetworkMetadata } from '../../contracts/addresses';

// ---------------------------------------------------------------------------
// Internal helper: build the explorer URL for a transaction hash.
// ---------------------------------------------------------------------------

function getExplorerTxUrl(txHash: string, chainId: number): string | null {
  const meta = getNetworkMetadata(chainId);
  if (!meta?.blockExplorer) return null;
  return `${meta.blockExplorer}/tx/${txHash}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Show a persistent "loading" toast when a transaction has been submitted.
 *
 * The toast includes:
 *   - A user-friendly message (e.g. "Creating order...")
 *   - A clickable link to the block explorer for the current chain
 *   - Infinite duration -- it stays visible until replaced by
 *     txConfirmedToast or txFailedToast
 *
 * @returns The toast ID (always `tx-${txHash}`).
 */
export function txSubmittedToast(
  txHash: string,
  chainId: number,
  message = 'Transaction submitted',
): string {
  const explorerLink = getExplorerTxUrl(txHash, chainId);
  const toastId = `tx-${txHash}`;

  toast.loading(
    () =>
      createElement(
        'div',
        { className: 'flex flex-col gap-1' },
        createElement(
          'span',
          { className: 'text-sm font-medium' },
          message,
        ),
        explorerLink
          ? createElement(
              'a',
              {
                href: explorerLink,
                target: '_blank',
                rel: 'noopener noreferrer',
                className:
                  'text-xs text-indigo-400 hover:text-indigo-300 underline',
                onClick: (e: React.MouseEvent) => e.stopPropagation(),
              },
              'View on explorer \u2192',
            )
          : null,
      ),
    { duration: Infinity, id: toastId },
  );

  return toastId;
}

/**
 * Replace a pending transaction toast with a success toast.
 * Auto-dismisses after 5 seconds.
 */
export function txConfirmedToast(
  txHash: string,
  message = 'Transaction confirmed',
): void {
  toast.success(message, { id: `tx-${txHash}`, duration: 5000 });
}

/**
 * Replace a pending transaction toast with an error toast.
 * Auto-dismisses after 8 seconds.
 */
export function txFailedToast(
  txHash: string,
  message = 'Transaction failed',
): void {
  toast.error(message, { id: `tx-${txHash}`, duration: 8000 });
}
