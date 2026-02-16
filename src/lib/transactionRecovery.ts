/**
 * Pending Transaction Recovery
 *
 * Persists pending transaction hashes to localStorage and checks their
 * on-chain status when the user reconnects. Transactions older than 24 hours
 * are automatically pruned on every read.
 */

import type { BrowserProvider, TransactionReceipt } from 'ethers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PendingTransaction {
  hash: string;
  type: 'mint' | 'transfer' | 'approve' | 'exchange' | 'liquidity' | 'swap';
  description: string;
  timestamp: number;
  chainId: number;
}

export interface CheckResult {
  confirmed: PendingTransaction[];
  failed: PendingTransaction[];
  stillPending: PendingTransaction[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'fueki-pending-transactions';

/** Pending transactions older than 24 hours are considered stale. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

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
  } catch {
    return [];
  }
}

function writeStorage(txs: PendingTransaction[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(txs));
  } catch {
    // localStorage may be full or disabled; silently ignore.
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
// Public API
// ---------------------------------------------------------------------------

/**
 * Persist a new pending transaction to localStorage.
 * Duplicates (same hash) are silently ignored.
 */
export function addPendingTransaction(tx: PendingTransaction): void {
  const current = pruneStale(readStorage());
  if (current.some((existing) => existing.hash === tx.hash)) return;
  writeStorage([...current, tx]);
}

/**
 * Remove a specific transaction by its hash.
 */
export function removePendingTransaction(hash: string): void {
  const current = readStorage();
  writeStorage(current.filter((tx) => tx.hash !== hash));
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
}

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
        .catch((): [PendingTransaction, TransactionReceipt | null] => [tx, null]),
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

  return { confirmed, failed, stillPending };
}
