/**
 * Transaction Toast Lifecycle
 *
 * Provides a clean API for managing blockchain transaction status toasts:
 *
 *   txToast.pending(txHash, chainId, message)  - persistent spinner + explorer link
 *   txToast.success(txHash, chainId, message)  - replaces pending, auto-dismisses
 *   txToast.error(txHash, error, context)       - replaces pending with classified error
 *   txToast.dismiss(txHash)                      - manually dismiss a toast
 *
 * Each toast is keyed by transaction hash so status changes replace the
 * existing toast in-place, preventing toast pile-up.
 */

import toast from 'react-hot-toast';
import { createElement } from 'react';
import { getNetworkMetadata } from '../../contracts/addresses';
import { classifyError } from '../errorUtils';
import type { ClassifiedError } from '../errorUtils';
import logger from '../logger';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive the toast ID from a transaction hash. */
function toastId(txHash: string): string {
  return `tx-${txHash}`;
}

/** Build the block explorer URL for a given hash + chain. */
function getExplorerTxUrl(txHash: string, chainId: number): string | null {
  const meta = getNetworkMetadata(chainId);
  if (!meta?.blockExplorer) return null;
  return `${meta.blockExplorer}/tx/${txHash}`;
}

/** Truncate a hash for display: 0x1234...abcd */
function truncateHash(hash: string): string {
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

// ---------------------------------------------------------------------------
// Toast content builders (using createElement for react-hot-toast renderers)
// ---------------------------------------------------------------------------

function pendingContent(message: string, explorerUrl: string | null) {
  return () =>
    createElement(
      'div',
      { className: 'flex flex-col gap-1' },
      createElement(
        'span',
        { className: 'text-sm font-medium' },
        message,
      ),
      explorerUrl
        ? createElement(
            'a',
            {
              href: explorerUrl,
              target: '_blank',
              rel: 'noopener noreferrer',
              className:
                'text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2',
              onClick: (e: React.MouseEvent) => e.stopPropagation(),
            },
            'View on explorer \u2192',
          )
        : null,
    );
}

function successContent(
  message: string,
  txHash: string,
  explorerUrl: string | null,
) {
  return () =>
    createElement(
      'div',
      { className: 'flex flex-col gap-1' },
      createElement(
        'span',
        { className: 'text-sm font-medium' },
        message,
      ),
      explorerUrl
        ? createElement(
            'a',
            {
              href: explorerUrl,
              target: '_blank',
              rel: 'noopener noreferrer',
              className:
                'text-xs text-emerald-400 hover:text-emerald-300 underline underline-offset-2',
              onClick: (e: React.MouseEvent) => e.stopPropagation(),
            },
            `${truncateHash(txHash)} \u2192`,
          )
        : null,
    );
}

function errorContent(message: string, action: string) {
  return () =>
    createElement(
      'div',
      { className: 'flex flex-col gap-1' },
      createElement(
        'span',
        { className: 'text-sm font-medium' },
        message,
      ),
      createElement(
        'span',
        { className: 'text-xs text-gray-400' },
        action,
      ),
    );
}

// ---------------------------------------------------------------------------
// Public API -- namespace object for ergonomic usage
// ---------------------------------------------------------------------------

export const txToast = {
  /**
   * Show a persistent loading toast for a submitted transaction.
   * Stays visible until replaced by `success` or `error`.
   *
   * @returns The toast ID.
   */
  pending(
    txHash: string,
    chainId: number,
    message = 'Transaction submitted',
  ): string {
    const explorerUrl = getExplorerTxUrl(txHash, chainId);
    const id = toastId(txHash);

    logger.info(`[txToast] pending: ${message} (${truncateHash(txHash)})`);

    toast.loading(pendingContent(message, explorerUrl), {
      id,
      duration: Infinity,
    });

    return id;
  },

  /**
   * Replace a pending toast with a success toast.
   * Auto-dismisses after 5 seconds.
   */
  success(
    txHash: string,
    chainId: number,
    message = 'Transaction confirmed',
  ): void {
    const explorerUrl = getExplorerTxUrl(txHash, chainId);
    const id = toastId(txHash);

    logger.info(`[txToast] success: ${message} (${truncateHash(txHash)})`);

    toast.success(successContent(message, txHash, explorerUrl), {
      id,
      duration: 5_000,
    });
  },

  /**
   * Replace a pending toast with a classified error toast.
   * Auto-dismisses after 8 seconds.
   *
   * If no txHash is available (e.g. the transaction was never submitted),
   * pass an empty string and the toast will use a random ID.
   */
  error(
    txHash: string,
    error: unknown,
    context?: string,
  ): void {
    const classified: ClassifiedError = classifyError(error);
    const title = context
      ? `${context}: ${classified.message}`
      : classified.message;

    const id = txHash ? toastId(txHash) : undefined;

    logger.error(
      `[txToast] error: ${title}`,
      classified.originalError,
    );

    // User rejections are informational, not errors.
    if (classified.severity === 'info') {
      toast(title, { id, icon: '\u2139\uFE0F', duration: 3_000 });
      return;
    }

    toast.error(errorContent(title, classified.suggestedAction), {
      id,
      duration: classified.severity === 'critical' ? 12_000 : 8_000,
    });
  },

  /**
   * Manually dismiss a transaction toast.
   */
  dismiss(txHash: string): void {
    toast.dismiss(toastId(txHash));
  },
};

// ---------------------------------------------------------------------------
// Legacy named exports for backward compatibility
// ---------------------------------------------------------------------------

/** @deprecated Use `txToast.pending` instead. */
export function txSubmittedToast(
  txHash: string,
  chainId: number,
  message = 'Transaction submitted',
): string {
  return txToast.pending(txHash, chainId, message);
}

/** @deprecated Use `txToast.success` instead. */
export function txConfirmedToast(
  txHash: string,
  message = 'Transaction confirmed',
): void {
  // Legacy callers don't pass chainId; use 0 which yields no explorer link.
  txToast.success(txHash, 0, message);
}

/** @deprecated Use `txToast.error` instead. */
export function txFailedToast(
  txHash: string,
  message = 'Transaction failed',
): void {
  toast.error(message, { id: `tx-${txHash}`, duration: 5_000 });
}
