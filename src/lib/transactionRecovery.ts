/**
 * Pending Transaction Recovery
 *
 * Persists pending transaction hashes to localStorage and checks their
 * on-chain status when the user reconnects. Transactions older than 24 hours
 * are automatically pruned on every read.
 *
 * Recovery features:
 *   - Stuck transaction detection (nonce gaps, long-pending)
 *   - Failed transaction retry capability
 *   - Speed-up and cancel support via replacement transactions
 *   - Cross-tab synchronisation via StorageEvent
 */

import type { BrowserProvider, TransactionReceipt } from 'ethers';
import logger from './logger';
import { emitRpcRefetch } from './rpc/refetchEvents';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PendingTransaction {
  hash: string;
  type: 'mint' | 'transfer' | 'approve' | 'exchange' | 'liquidity' | 'swap';
  description: string;
  timestamp: number;
  chainId: number;
  /** The sender address, used for nonce-based operations. */
  from?: string;
  /** The nonce used by this transaction, if known. */
  nonce?: number;
  /** Number of retry attempts made for this transaction. */
  retryCount?: number;
}

export interface CheckResult {
  confirmed: PendingTransaction[];
  failed: PendingTransaction[];
  stillPending: PendingTransaction[];
}

/**
 * A transaction that has been pending longer than STUCK_THRESHOLD_MS
 * and may need user intervention (speed-up or cancel).
 */
export interface StuckTransaction extends PendingTransaction {
  /** How long the transaction has been pending, in milliseconds. */
  pendingDuration: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'fueki-pending-transactions';

/** Pending transactions older than 24 hours are considered stale. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Transactions pending longer than 5 minutes are flagged as potentially stuck. */
const STUCK_THRESHOLD_MS = 5 * 60 * 1000;

/** Maximum number of retry attempts before giving up. */
const MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readStorage(): PendingTransaction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as PendingTransaction[];
  } catch (err) {
    logger.error('[transactionRecovery] failed to read localStorage:', err);
    return [];
  }
}

function writeStorage(txs: PendingTransaction[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(txs));
  } catch (err) {
    // localStorage may be full or disabled; log for debugging.
    logger.error('[transactionRecovery] failed to write localStorage:', err);
  }
}

/**
 * Remove entries older than MAX_AGE_MS and return the pruned list.
 */
function pruneStale(txs: PendingTransaction[]): PendingTransaction[] {
  const cutoff = Date.now() - MAX_AGE_MS;
  return txs.filter((tx) => tx.timestamp >= cutoff);
}

// ---------------------------------------------------------------------------
// Public API -- CRUD
// ---------------------------------------------------------------------------

/**
 * Persist a new pending transaction to localStorage.
 * Duplicates (same hash) are silently ignored.
 */
export function addPendingTransaction(tx: PendingTransaction): void {
  const current = pruneStale(readStorage());
  if (current.some((existing) => existing.hash === tx.hash)) return;
  writeStorage([...current, tx]);
  emitRpcRefetch(['pending-transactions', 'balances']);
}

/**
 * Remove a specific transaction by its hash.
 */
export function removePendingTransaction(hash: string): void {
  const current = readStorage();
  writeStorage(current.filter((tx) => tx.hash !== hash));
  emitRpcRefetch(['pending-transactions', 'balances']);
}

/**
 * Return all non-stale pending transactions from localStorage.
 * Automatically prunes entries older than 24 hours.
 */
export function getPendingTransactions(): PendingTransaction[] {
  const all = readStorage();
  const fresh = pruneStale(all);
  // Persist the pruned list back so stale entries don't accumulate.
  if (fresh.length !== all.length) {
    writeStorage(fresh);
  }
  return fresh;
}

/**
 * Remove all pending transactions from localStorage.
 */
export function clearPendingTransactions(): void {
  writeStorage([]);
  emitRpcRefetch(['pending-transactions']);
}

// ---------------------------------------------------------------------------
// Public API -- Status checks
// ---------------------------------------------------------------------------

/**
 * Check on-chain status of every pending transaction.
 *
 * For each stored transaction:
 * - Receipt exists with status === 1  -> confirmed
 * - Receipt exists with status === 0  -> failed
 * - No receipt                        -> still pending
 *
 * After checking, the storage is updated: confirmed and failed entries are
 * removed so they won't be checked again on the next session.
 */
export async function checkPendingTransactions(
  provider: BrowserProvider,
): Promise<CheckResult> {
  const txs = getPendingTransactions();

  if (txs.length === 0) {
    return { confirmed: [], failed: [], stillPending: [] };
  }

  const confirmed: PendingTransaction[] = [];
  const failed: PendingTransaction[] = [];
  const stillPending: PendingTransaction[] = [];

  // Fetch all receipts in parallel for speed.
  const receiptPromises = txs.map<Promise<[PendingTransaction, TransactionReceipt | null]>>(
    (tx) =>
      provider
        .getTransactionReceipt(tx.hash)
        .then((receipt): [PendingTransaction, TransactionReceipt | null] => [tx, receipt])
        .catch((err): [PendingTransaction, TransactionReceipt | null] => {
          logger.error(`[transactionRecovery] receipt fetch failed for ${tx.hash}:`, err);
          return [tx, null];
        }),
  );

  const results = await Promise.all(receiptPromises);

  for (const [tx, receipt] of results) {
    if (receipt === null) {
      stillPending.push(tx);
    } else if (receipt.status === 1) {
      confirmed.push(tx);
    } else {
      // status === 0 or any other non-success value
      failed.push(tx);
    }
  }

  // Persist only the still-pending ones; confirmed/failed are done.
  writeStorage(stillPending);
  if (confirmed.length > 0 || failed.length > 0) {
    emitRpcRefetch(['pending-transactions', 'balances', 'orders', 'pool']);
  }

  return { confirmed, failed, stillPending };
}

// ---------------------------------------------------------------------------
// Public API -- Stuck transaction detection
// ---------------------------------------------------------------------------

/**
 * Return transactions that have been pending longer than STUCK_THRESHOLD_MS.
 * These may need user intervention (speed-up or cancel).
 */
export function getStuckTransactions(): StuckTransaction[] {
  const now = Date.now();
  return getPendingTransactions()
    .filter((tx) => now - tx.timestamp > STUCK_THRESHOLD_MS)
    .map((tx) => ({
      ...tx,
      pendingDuration: now - tx.timestamp,
    }));
}

// ---------------------------------------------------------------------------
// Public API -- Retry
// ---------------------------------------------------------------------------

/**
 * Increment the retry counter for a transaction. Returns false if the
 * transaction has exceeded MAX_RETRIES, indicating the caller should
 * not retry further.
 */
export function markRetry(hash: string): boolean {
  const txs = readStorage();
  const tx = txs.find((t) => t.hash === hash);
  if (!tx) return false;

  const retryCount = (tx.retryCount ?? 0) + 1;
  if (retryCount > MAX_RETRIES) {
    logger.warn(`[transactionRecovery] max retries (${MAX_RETRIES}) exceeded for ${hash}`);
    return false;
  }

  tx.retryCount = retryCount;
  writeStorage(txs);
  return true;
}

/**
 * Replace a failed/stuck transaction entry with a new one (e.g. after
 * the user submits a speed-up or cancel replacement). The old entry is
 * removed and the new one is added.
 */
export function replaceTransaction(
  oldHash: string,
  newTx: PendingTransaction,
): void {
  const current = readStorage().filter((tx) => tx.hash !== oldHash);
  if (!current.some((tx) => tx.hash === newTx.hash)) {
    current.push(newTx);
  }
  writeStorage(current);
  logger.info(
    `[transactionRecovery] replaced ${oldHash.slice(0, 10)}... with ${newTx.hash.slice(0, 10)}...`,
  );
  emitRpcRefetch(['pending-transactions', 'balances']);
}

// ---------------------------------------------------------------------------
// Public API -- Speed-up / Cancel helpers
// ---------------------------------------------------------------------------

/**
 * Build the parameters needed to speed up a stuck transaction.
 * The caller should use these to submit a replacement transaction
 * through the wallet with a higher gas price.
 *
 * Returns null if the transaction cannot be found or lacks a nonce.
 */
export function getSpeedUpParams(hash: string): {
  nonce: number;
  from: string;
} | null {
  const tx = getPendingTransactions().find((t) => t.hash === hash);
  if (!tx || tx.nonce === undefined || !tx.from) {
    logger.warn(`[transactionRecovery] cannot speed up ${hash}: missing nonce or from`);
    return null;
  }
  return { nonce: tx.nonce, from: tx.from };
}

/**
 * Build the parameters needed to cancel a stuck transaction.
 * Cancellation is done by sending a 0-value transaction to yourself
 * with the same nonce but higher gas price.
 *
 * Returns null if the transaction cannot be found or lacks a nonce.
 */
export function getCancelParams(hash: string): {
  nonce: number;
  from: string;
  to: string;
  value: bigint;
} | null {
  const tx = getPendingTransactions().find((t) => t.hash === hash);
  if (!tx || tx.nonce === undefined || !tx.from) {
    logger.warn(`[transactionRecovery] cannot cancel ${hash}: missing nonce or from`);
    return null;
  }
  return {
    nonce: tx.nonce,
    from: tx.from,
    to: tx.from, // Send to self
    value: 0n,
  };
}
