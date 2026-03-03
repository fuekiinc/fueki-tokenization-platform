/**
 * useTransactionRecovery
 *
 * React hook that checks the on-chain status of pending transactions
 * stored in localStorage whenever the wallet connects. Returns
 * categorized results so the UI can show recovery banners.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import logger from '../lib/logger';
import { getProvider, useWalletStore } from '../store/walletStore.ts';
import {
  checkPendingTransactions,
  clearPendingTransactions,
  getPendingTransactions,
} from '../lib/transactionRecovery.ts';
import type { CheckResult, PendingTransaction } from '../lib/transactionRecovery.ts';

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface TransactionRecoveryState {
  /** Number of transactions that are still unresolved on-chain. */
  pendingCount: number;
  /** Transactions that confirmed since the user was away. */
  confirmedTxs: PendingTransaction[];
  /** Transactions that reverted on-chain. */
  failedTxs: PendingTransaction[];
  /** Whether the hook is currently querying receipts. */
  isChecking: boolean;
  /** Dismiss all recovery notifications and clear persisted state. */
  dismissAll: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTransactionRecovery(): TransactionRecoveryState {
  const isConnected = useWalletStore((s) => s.wallet.isConnected);

  const [confirmedTxs, setConfirmedTxs] = useState<PendingTransaction[]>([]);
  const [failedTxs, setFailedTxs] = useState<PendingTransaction[]>([]);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isChecking, setIsChecking] = useState<boolean>(false);

  // Guard against running the check more than once per connection session.
  const hasCheckedRef = useRef(false);

  // Reset the guard when the wallet disconnects so a reconnect re-triggers.
  useEffect(() => {
    if (!isConnected) {
      hasCheckedRef.current = false;
    }
  }, [isConnected]);

  useEffect(() => {
    if (!isConnected) return;
    if (hasCheckedRef.current) return;

    const provider = getProvider();
    if (!provider) return;

    // Only run if there are pending transactions worth checking.
    const pending = getPendingTransactions();
    if (pending.length === 0) return;

    hasCheckedRef.current = true;
    let cancelled = false;

    const run = async () => {
      setIsChecking(true);
      try {
        const result: CheckResult = await checkPendingTransactions(provider);
        if (cancelled) return;
        setConfirmedTxs(result.confirmed);
        setFailedTxs(result.failed);
        setPendingCount(result.stillPending.length);
      } catch (err) {
        // Network errors during receipt fetch are non-fatal; the user can
        // try again on the next session. Log for debugging.
        logger.error('[useTransactionRecovery] check failed:', err);
      } finally {
        if (!cancelled) {
          setIsChecking(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [isConnected]);

  const dismissAll = useCallback(() => {
    setConfirmedTxs([]);
    setFailedTxs([]);
    setPendingCount(0);
    clearPendingTransactions();
  }, []);

  return {
    pendingCount,
    confirmedTxs,
    failedTxs,
    isChecking,
    dismissAll,
  };
}
