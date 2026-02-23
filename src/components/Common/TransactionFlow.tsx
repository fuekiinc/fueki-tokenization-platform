/**
 * TransactionFlow -- 3-phase transaction confirmation modal (WCAG 2.1 AA).
 *
 * Phase 1: REVIEW    -- Plain-language summary of the transaction details.
 * Phase 2: WALLET    -- Waiting for the user to confirm/reject in their wallet.
 * Phase 3: SUBMITTED -- Tracks the on-chain status until confirmed or failed.
 *
 * Accessibility:
 *   - Step indicator with aria-current="step"
 *   - Live region (aria-live) for status updates
 *   - Block explorer links with descriptive text (opens in new tab)
 *   - Focus management between phases
 *   - All animations respect prefers-reduced-motion
 *   - Minimum 44px touch targets on mobile
 *   - Fullscreen dialog on mobile, centered on desktop
 *   - Proper heading hierarchy and semantic HTML
 *
 * Usage:
 * ```tsx
 * const { showTransactionFlow, TransactionFlowModal } = useTransactionFlow();
 *
 * showTransactionFlow({
 *   type: 'mint',
 *   title: 'Mint 1,000 TSLA tokens',
 *   details: [
 *     { label: 'Token', value: 'TSLA' },
 *     { label: 'Amount', value: '1,000' },
 *   ],
 *   execute: () => contract.mint(amount),
 *   onSuccess: (receipt) => { ... },
 * });
 *
 * return <>{children}<TransactionFlowModal /></>;
 * ```
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { FC } from 'react';
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react';
import {
  X,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ArrowRight,
  AlertTriangle,
  Copy,
  Check,
  RefreshCw,
} from 'lucide-react';
import clsx from 'clsx';
import type { TransactionResponse, TransactionReceipt } from 'ethers';

import { SUPPORTED_NETWORKS } from '../../contracts/addresses.ts';
import { useWalletStore, getProvider } from '../../store/walletStore.ts';
import { addPendingTransaction } from '../../lib/transactionRecovery.ts';
import type { PendingTransaction } from '../../lib/transactionRecovery.ts';
import { parseContractError } from '../../lib/blockchain/contracts.ts';
import Spinner from './Spinner.tsx';
import OctopusLoader from './OctopusLoader.tsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Transaction types the flow supports. */
export type TransactionType =
  | 'mint'
  | 'burn'
  | 'transfer'
  | 'trade'
  | 'swap'
  | 'addLiquidity'
  | 'removeLiquidity'
  | 'approve';

export interface TransactionDetail {
  label: string;
  value: string;
}

export interface TransactionFlowConfig {
  /** The kind of transaction -- drives the icon and recovery mapping. */
  type: TransactionType;
  /** Human-readable title shown in the review phase header. */
  title: string;
  /** Line-item details rendered in the review phase. */
  details: TransactionDetail[];
  /** Execute the on-chain transaction; must return the tx response. */
  execute: () => Promise<TransactionResponse>;
  /** Called once the receipt comes back with status === 1. */
  onSuccess?: (receipt: TransactionReceipt) => void;
  /** Called when the transaction reverts or any error occurs. */
  onError?: (error: Error) => void;
}

/** Internal phase enum. */
type Phase = 'review' | 'wallet' | 'submitted';

/** On-chain status for Phase 3. */
type TxStatus = 'pending' | 'confirming' | 'confirmed' | 'failed';

/** Return value of the `useTransactionFlow` hook. */
export interface UseTransactionFlowReturn {
  showTransactionFlow: (config: TransactionFlowConfig) => void;
  TransactionFlowModal: FC;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How long to wait for the user to confirm in-wallet before showing a hint. */
const WALLET_TIMEOUT_MS = 30_000;

/** Polling interval for checking the receipt. */
const POLL_INTERVAL_MS = 3_000;

/** Phase labels for screen readers */
const PHASE_LABELS: Record<Phase, string> = {
  review: 'Review transaction details',
  wallet: 'Confirm in your wallet',
  submitted: 'Transaction status',
};

/**
 * Maps our broader TransactionType to the narrower type expected by
 * `addPendingTransaction`. Keeps the two type systems decoupled.
 */
function toRecoveryType(
  type: TransactionType,
): PendingTransaction['type'] {
  const map: Record<TransactionType, PendingTransaction['type']> = {
    mint: 'mint',
    burn: 'mint', // burns are minting-related ops
    transfer: 'transfer',
    trade: 'exchange',
    swap: 'swap',
    addLiquidity: 'liquidity',
    removeLiquidity: 'liquidity',
    approve: 'approve',
  };
  return map[type];
}

/** Human-readable label for the transaction type badge. */
const TYPE_LABELS: Record<TransactionType, string> = {
  mint: 'Mint',
  burn: 'Burn',
  transfer: 'Transfer',
  trade: 'Trade',
  swap: 'Swap',
  addLiquidity: 'Add Liquidity',
  removeLiquidity: 'Remove Liquidity',
  approve: 'Approve',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateHash(hash: string): string {
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

function getExplorerTxURL(
  hash: string,
  chainId: number | null,
): string | null {
  if (!chainId) return null;
  const network = SUPPORTED_NETWORKS[chainId];
  if (!network?.blockExplorer) return null;
  return `${network.blockExplorer}/tx/${hash}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Indeterminate progress ring used in the wallet-wait phase. */
function PulseRing({ className }: { className?: string }) {
  return (
    <div className={clsx('flex items-center justify-center', className)}>
      <OctopusLoader size="md" label="Awaiting wallet confirmation" />
    </div>
  );
}

/** Small copy-to-clipboard button next to the tx hash. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={clsx(
        'rounded-lg p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center',
        'text-gray-500 hover:text-white hover:bg-white/[0.08]',
        'transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60',
      )}
      aria-label={copied ? 'Transaction hash copied' : 'Copy transaction hash to clipboard'}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
    </button>
  );
}

/** Status badge that tracks on-chain confirmation. */
function StatusBadge({ status }: { status: TxStatus }) {
  const styles: Record<TxStatus, { bg: string; text: string; label: string }> =
    {
      pending: {
        bg: 'bg-amber-500/10',
        text: 'text-amber-400',
        label: 'Pending',
      },
      confirming: {
        bg: 'bg-indigo-500/10',
        text: 'text-indigo-400',
        label: 'Confirming',
      },
      confirmed: {
        bg: 'bg-emerald-500/10',
        text: 'text-emerald-400',
        label: 'Confirmed',
      },
      failed: {
        bg: 'bg-red-500/10',
        text: 'text-red-400',
        label: 'Failed',
      },
    };

  const s = styles[status];

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1',
        'text-xs font-semibold',
        s.bg,
        s.text,
      )}
      role="status"
      aria-label={`Transaction status: ${s.label}`}
    >
      {status === 'pending' || status === 'confirming' ? (
        <Spinner size="xs" label={s.label} />
      ) : status === 'confirmed' ? (
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {s.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Phase renderers
// ---------------------------------------------------------------------------

interface ReviewPhaseProps {
  config: TransactionFlowConfig;
  onConfirm: () => void;
  onCancel: () => void;
}

function ReviewPhase({ config, onConfirm, onCancel }: ReviewPhaseProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Auto-focus the confirm button when this phase renders
  useEffect(() => {
    requestAnimationFrame(() => {
      confirmRef.current?.focus();
    });
  }, []);

  return (
    <div className="space-y-6">
      {/* Transaction type badge */}
      <div className="flex items-center gap-3">
        <span
          className={clsx(
            'inline-flex items-center rounded-full px-3 py-1',
            'text-xs font-semibold',
            'bg-indigo-500/10 text-indigo-400',
          )}
        >
          {TYPE_LABELS[config.type]}
        </span>
      </div>

      {/* Detail rows */}
      <dl
        className={clsx(
          'rounded-2xl border border-white/[0.06]',
          'bg-white/[0.02] divide-y divide-white/[0.06]',
        )}
      >
        {config.details.map((detail) => (
          <div
            key={detail.label}
            className="flex items-center justify-between gap-4 px-5 py-3.5"
          >
            <dt className="text-sm text-gray-400">{detail.label}</dt>
            <dd className="text-sm font-medium text-white text-right break-all">
              {detail.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Disclaimer */}
      <p className="text-xs text-gray-500 leading-relaxed">
        Please review the transaction details carefully. Once confirmed, this
        action cannot be undone on the blockchain.
      </p>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <button
          type="button"
          onClick={onCancel}
          className={clsx(
            'w-full sm:flex-1 h-12 min-h-[44px] rounded-xl px-6',
            'text-sm font-semibold text-gray-300',
            'bg-white/[0.06] border border-white/[0.08]',
            'hover:bg-white/[0.10] hover:text-white',
            'transition-all duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60',
          )}
        >
          Cancel
        </button>
        <button
          ref={confirmRef}
          type="button"
          onClick={onConfirm}
          className={clsx(
            'w-full sm:flex-1 inline-flex items-center justify-center gap-2.5',
            'h-12 min-h-[44px] rounded-xl px-6',
            'text-sm font-semibold text-white',
            'bg-gradient-to-r from-indigo-500 to-violet-500',
            'shadow-[0_0_24px_-6px_rgba(99,102,241,0.45)]',
            'hover:shadow-[0_0_32px_-4px_rgba(99,102,241,0.6)] hover:brightness-110',
            'transition-all duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D0F14]',
          )}
        >
          Confirm
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

interface WalletPhaseProps {
  timedOut: boolean;
  onRetry: () => void;
}

function WalletPhase({ timedOut, onRetry }: WalletPhaseProps) {
  return (
    <div className="flex flex-col items-center py-6 space-y-6">
      <PulseRing />

      <div className="text-center space-y-2" aria-live="polite">
        <h3 className="text-lg font-semibold text-white">
          Waiting for Wallet Confirmation
        </h3>
        <p className="text-sm text-gray-400">
          Please confirm the transaction in your wallet extension.
        </p>
      </div>

      {timedOut && (
        <div
          className={clsx(
            'flex flex-col sm:flex-row items-center gap-3 rounded-xl px-5 py-3',
            'bg-amber-500/10 border border-amber-500/20',
          )}
          role="alert"
        >
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
          <p className="text-xs text-amber-300">
            Still waiting. Your wallet may need attention.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className={clsx(
              'inline-flex items-center gap-1.5 shrink-0',
              'rounded-lg px-3 py-1.5 min-h-[44px]',
              'text-xs font-semibold text-amber-300',
              'bg-amber-500/10 hover:bg-amber-500/20',
              'transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60',
            )}
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            Retry
          </button>
        </div>
      )}

      <p className="text-xs text-gray-500">
        Reject in your wallet to cancel this transaction.
      </p>
    </div>
  );
}

interface SubmittedPhaseProps {
  txHash: string;
  txStatus: TxStatus;
  chainId: number | null;
  onClose: () => void;
  onAnother: () => void;
}

function SubmittedPhase({
  txHash,
  txStatus,
  chainId,
  onClose,
  onAnother,
}: SubmittedPhaseProps) {
  const explorerUrl = getExplorerTxURL(txHash, chainId);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Auto-focus the primary action button when status resolves
  useEffect(() => {
    if (txStatus === 'confirmed' || txStatus === 'failed') {
      requestAnimationFrame(() => {
        closeRef.current?.focus();
      });
    }
  }, [txStatus]);

  return (
    <div className="space-y-6">
      {/* Status hero */}
      <div className="flex flex-col items-center py-4 space-y-4" aria-live="polite">
        {txStatus === 'confirmed' ? (
          <div
            className={clsx(
              'flex items-center justify-center',
              'h-20 w-20 rounded-full',
              'bg-emerald-500/10 border border-emerald-500/30',
            )}
          >
            <CheckCircle2 className="h-10 w-10 text-emerald-400" aria-hidden="true" />
          </div>
        ) : txStatus === 'failed' ? (
          <div
            className={clsx(
              'flex items-center justify-center',
              'h-20 w-20 rounded-full',
              'bg-red-500/10 border border-red-500/30',
            )}
          >
            <XCircle className="h-10 w-10 text-red-400" aria-hidden="true" />
          </div>
        ) : (
          <div
            className={clsx(
              'flex items-center justify-center',
              'h-20 w-20 rounded-full',
              'bg-indigo-500/10 border border-indigo-500/30',
            )}
          >
            <Spinner size="lg" label="Waiting for confirmation" />
          </div>
        )}

        <div className="text-center space-y-1">
          <h3 className="text-lg font-semibold text-white">
            {txStatus === 'confirmed'
              ? 'Transaction Confirmed'
              : txStatus === 'failed'
                ? 'Transaction Failed'
                : 'Transaction Submitted'}
          </h3>
          <StatusBadge status={txStatus} />
        </div>
      </div>

      {/* Transaction hash row */}
      <div
        className={clsx(
          'flex items-center justify-between gap-3',
          'rounded-xl px-5 py-3.5',
          'bg-white/[0.03] border border-white/[0.06]',
        )}
      >
        <div className="min-w-0">
          <p className="text-xs text-gray-500 mb-0.5">Transaction Hash</p>
          <p className="text-sm font-mono text-gray-300 truncate">
            {truncateHash(txHash)}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <CopyButton text={txHash} />
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={clsx(
                'rounded-lg p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center',
                'text-gray-500 hover:text-indigo-400 hover:bg-white/[0.08]',
                'transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60',
              )}
              aria-label={`View transaction ${truncateHash(txHash)} on block explorer (opens in new tab)`}
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>

      {/* CTA buttons */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <button
          type="button"
          onClick={onAnother}
          className={clsx(
            'w-full sm:flex-1 h-11 min-h-[44px] rounded-xl px-6',
            'text-sm font-semibold text-gray-300',
            'bg-white/[0.06] border border-white/[0.08]',
            'hover:bg-white/[0.10] hover:text-white',
            'transition-all duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60',
          )}
        >
          Make Another
        </button>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className={clsx(
            'w-full sm:flex-1 h-11 min-h-[44px] rounded-xl px-6',
            'text-sm font-semibold text-white',
            'bg-gradient-to-r from-indigo-500 to-violet-500',
            'shadow-[0_0_24px_-6px_rgba(99,102,241,0.45)]',
            'hover:shadow-[0_0_32px_-4px_rgba(99,102,241,0.6)] hover:brightness-110',
            'transition-all duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D0F14]',
          )}
        >
          {txStatus === 'confirmed' ? 'View in Portfolio' : 'Close'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hook: useTransactionFlow
// ---------------------------------------------------------------------------

export function useTransactionFlow(): UseTransactionFlowReturn {
  // -- State ----------------------------------------------------------------
  const [isOpen, setIsOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('review');
  const [config, setConfig] = useState<TransactionFlowConfig | null>(null);
  const [walletTimedOut, setWalletTimedOut] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<TxStatus>('pending');
  const [error, setError] = useState<string | null>(null);

  // -- Refs for cleanup -----------------------------------------------------
  const walletTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef(false);

  // -- Wallet chain ID for explorer links -----------------------------------
  const chainId = useWalletStore((s) => s.wallet.chainId);

  // -- Cleanup helper -------------------------------------------------------
  const cleanup = useCallback(() => {
    abortRef.current = true;
    if (walletTimeoutRef.current) {
      clearTimeout(walletTimeoutRef.current);
      walletTimeoutRef.current = null;
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup]);

  // -- Reset all state to initial -------------------------------------------
  const reset = useCallback(() => {
    cleanup();
    setPhase('review');
    setConfig(null);
    setWalletTimedOut(false);
    setTxHash(null);
    setTxStatus('pending');
    setError(null);
    abortRef.current = false;
  }, [cleanup]);

  // -- Start polling for receipt --------------------------------------------
  const startPolling = useCallback(
    (hash: string, flowConfig: TransactionFlowConfig) => {
      // Clear any existing interval
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }

      const provider = getProvider();
      if (!provider) return;

      // Move to "confirming" after a brief delay
      const confirmTimer = setTimeout(() => {
        if (!abortRef.current) {
          setTxStatus('confirming');
        }
      }, POLL_INTERVAL_MS);

      pollIntervalRef.current = setInterval(() => {
        if (abortRef.current) {
          clearInterval(pollIntervalRef.current!);
          clearTimeout(confirmTimer);
          return;
        }

        void provider
          .getTransactionReceipt(hash)
          .then((receipt) => {
            if (!receipt || abortRef.current) return;

            clearInterval(pollIntervalRef.current!);
            clearTimeout(confirmTimer);
            pollIntervalRef.current = null;

            if (receipt.status === 1) {
              setTxStatus('confirmed');
              flowConfig.onSuccess?.(receipt);
            } else {
              setTxStatus('failed');
              flowConfig.onError?.(
                new Error('Transaction reverted on-chain'),
              );
            }
          })
          .catch(() => {
            // Network hiccup -- keep polling
          });
      }, POLL_INTERVAL_MS);
    },
    [],
  );

  // -- Execute the transaction (Phase 2 -> Phase 3) -------------------------
  const executeTransaction = useCallback(
    (flowConfig: TransactionFlowConfig) => {
      setPhase('wallet');
      setWalletTimedOut(false);
      setError(null);
      abortRef.current = false;

      // Wallet timeout detection
      walletTimeoutRef.current = setTimeout(() => {
        if (!abortRef.current) {
          setWalletTimedOut(true);
        }
      }, WALLET_TIMEOUT_MS);

      void flowConfig
        .execute()
        .then((txResponse) => {
          if (abortRef.current) return;

          // Clear the wallet timeout
          if (walletTimeoutRef.current) {
            clearTimeout(walletTimeoutRef.current);
            walletTimeoutRef.current = null;
          }

          const hash = txResponse.hash;
          setTxHash(hash);
          setTxStatus('pending');
          setPhase('submitted');

          // Register with transaction recovery
          addPendingTransaction({
            hash,
            type: toRecoveryType(flowConfig.type),
            description: flowConfig.title,
            timestamp: Date.now(),
            chainId: chainId ?? 1,
          });

          // Start polling for receipt
          startPolling(hash, flowConfig);
        })
        .catch((err: unknown) => {
          if (abortRef.current) return;

          // Clear the wallet timeout
          if (walletTimeoutRef.current) {
            clearTimeout(walletTimeoutRef.current);
            walletTimeoutRef.current = null;
          }

          const rawMessage = err instanceof Error ? err.message : String(err);
          const message = parseContractError(err);

          // User rejected -- go back to review
          const isUserRejection =
            /user rejected|ACTION_REJECTED|user denied/i.test(rawMessage);

          if (isUserRejection) {
            setPhase('review');
            return;
          }

          setError(message);
          setPhase('review');
          flowConfig.onError?.(
            err instanceof Error ? err : new Error(message),
          );
        });
    },
    [chainId, startPolling],
  );

  // -- Public API: open the flow --------------------------------------------
  const showTransactionFlow = useCallback(
    (newConfig: TransactionFlowConfig) => {
      reset();
      setConfig(newConfig);
      setIsOpen(true);
    },
    [reset],
  );

  // -- Close handler --------------------------------------------------------
  const handleClose = useCallback(() => {
    // Don't allow closing during wallet phase (user should reject in wallet)
    if (phase === 'wallet') return;
    cleanup();
    setIsOpen(false);
  }, [phase, cleanup]);

  // -- "Make Another" handler -----------------------------------------------
  const handleAnother = useCallback(() => {
    cleanup();
    setIsOpen(false);
  }, [cleanup]);

  // -- Retry handler (wallet timeout) ---------------------------------------
  const handleRetry = useCallback(() => {
    if (!config) return;
    executeTransaction(config);
  }, [config, executeTransaction]);

  // -- Confirm handler (Phase 1 -> Phase 2) ---------------------------------
  const handleConfirm = useCallback(() => {
    if (!config) return;
    executeTransaction(config);
  }, [config, executeTransaction]);

  // -- Modal component ------------------------------------------------------
  const TransactionFlowModal: FC = useCallback(() => {
    if (!config) return null;

    const phases: Phase[] = ['review', 'wallet', 'submitted'];
    const currentPhaseIndex = phases.indexOf(phase);

    return (
      <Dialog
        open={isOpen}
        onClose={handleClose}
        className="relative z-50"
      >
        {/* Backdrop */}
        <DialogBackdrop
          transition
          className={clsx(
            'fixed inset-0 bg-black/60 backdrop-blur-sm',
            'transition-opacity duration-300 ease-out motion-reduce:transition-none',
            'data-[closed]:opacity-0',
          )}
        />

        {/* Centering container -- fullscreen on mobile, centered on desktop */}
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-end sm:items-center justify-center p-0 sm:p-6">
            {/* Panel */}
            <DialogPanel
              transition
              className={clsx(
                'relative w-full sm:max-w-lg overflow-hidden',
                // Fullscreen bottom sheet on mobile, centered card on desktop
                'rounded-t-2xl sm:rounded-2xl',
                // Glass morphism
                'bg-[#0D0F14]/95 backdrop-blur-xl',
                'border border-white/[0.08]',
                // Depth shadow
                'shadow-[0_25px_60px_-12px_rgba(0,0,0,0.5)]',
                // Transition
                'transition duration-300 ease-out motion-reduce:transition-none',
                'data-[closed]:scale-95 data-[closed]:opacity-0 data-[closed]:translate-y-2',
              )}
            >
              {/* Gradient top border */}
              <div
                className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500"
                aria-hidden="true"
              />

              {/* Header */}
              <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-6 sm:px-10 pt-6 sm:pt-10 pb-6">
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-lg sm:text-xl font-semibold text-white leading-tight">
                    {phase === 'review'
                      ? config.title
                      : phase === 'wallet'
                        ? 'Confirm in Wallet'
                        : 'Transaction Status'}
                  </DialogTitle>

                  {/* Phase indicators with aria-current */}
                  <nav aria-label="Transaction progress" className="mt-4">
                    <ol className="flex items-center gap-2">
                      {phases.map((p, i) => (
                        <li key={p} className="flex items-center gap-2">
                          {i > 0 && (
                            <div
                              className={clsx(
                                'h-px w-4 sm:w-6',
                                currentPhaseIndex >= i
                                  ? 'bg-indigo-500'
                                  : 'bg-white/[0.08]',
                              )}
                              aria-hidden="true"
                            />
                          )}
                          <div
                            className={clsx(
                              'flex items-center justify-center',
                              'h-6 w-6 rounded-full text-xs font-semibold',
                              p === phase
                                ? 'bg-indigo-500 text-white'
                                : currentPhaseIndex > i
                                  ? 'bg-indigo-500/20 text-indigo-400'
                                  : 'bg-white/[0.06] text-gray-500',
                            )}
                            aria-current={p === phase ? 'step' : undefined}
                            aria-label={`Step ${i + 1}: ${PHASE_LABELS[p]}${p === phase ? ' (current)' : ''}`}
                          >
                            {i + 1}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </nav>
                </div>

                {/* Close button -- hidden during wallet phase */}
                {phase !== 'wallet' && (
                  <button
                    type="button"
                    onClick={handleClose}
                    aria-label="Close dialog"
                    className={clsx(
                      'absolute top-4 right-4 sm:top-8 sm:right-8 shrink-0 rounded-xl p-2 min-h-[44px] min-w-[44px] flex items-center justify-center',
                      'text-gray-500 transition-all duration-200',
                      'hover:bg-white/[0.06] hover:text-white',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D0F14]',
                    )}
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                )}
              </div>

              {/* Body */}
              <div className="px-6 sm:px-10 py-6 sm:py-10">
                {/* Error banner */}
                {error && phase === 'review' && (
                  <div
                    className={clsx(
                      'flex items-start gap-3 rounded-xl px-4 py-3 mb-6',
                      'bg-red-500/10 border border-red-500/20',
                    )}
                    role="alert"
                  >
                    <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
                    <p className="text-xs text-red-300 leading-relaxed">
                      {error}
                    </p>
                  </div>
                )}

                {/* Phase content */}
                {phase === 'review' && (
                  <ReviewPhase
                    config={config}
                    onConfirm={handleConfirm}
                    onCancel={handleClose}
                  />
                )}

                {phase === 'wallet' && (
                  <WalletPhase
                    timedOut={walletTimedOut}
                    onRetry={handleRetry}
                  />
                )}

                {phase === 'submitted' && txHash && (
                  <SubmittedPhase
                    txHash={txHash}
                    txStatus={txStatus}
                    chainId={chainId}
                    onClose={handleClose}
                    onAnother={handleAnother}
                  />
                )}
              </div>
            </DialogPanel>
          </div>
        </div>
      </Dialog>
    );
  }, [
    isOpen,
    phase,
    config,
    walletTimedOut,
    txHash,
    txStatus,
    chainId,
    error,
    handleClose,
    handleConfirm,
    handleRetry,
    handleAnother,
  ]);

  return { showTransactionFlow, TransactionFlowModal };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function phaseIndex(phase: Phase): number {
  const order: Phase[] = ['review', 'wallet', 'submitted'];
  return order.indexOf(phase);
}

// Preserve export for any external consumers
void phaseIndex;
