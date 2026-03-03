import { ethers } from 'ethers';
import { useWalletStore } from '../../store/walletStore';
import logger from '../logger';
import { findHealthyEndpoint, isRetryableRpcError } from '../rpc/endpoints';

const log = logger.child('tx-execution');

const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_CONFIRMATION_TIMEOUT_MS = 180_000;

interface WaitableTransaction {
  hash: string;
  wait: (confirmations?: number) => Promise<ethers.TransactionReceipt | null>;
}

export interface SendRetryOptions {
  label?: string;
  maxAttempts?: number;
  onRetry?: (attempt: number, error: unknown) => Promise<void> | void;
}

export interface WaitReceiptOptions {
  chainId?: number | null;
  confirmations?: number;
  timeoutMs?: number;
  label?: string;
}

function isUserRejection(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string | number })?.code;
  return (
    code === 4001 ||
    code === 'ACTION_REJECTED' ||
    /user (rejected|denied)|ACTION_REJECTED/i.test(message)
  );
}

function getRetryDelayMs(error: unknown, attempt: number): number {
  const message = error instanceof Error ? error.message : String(error);
  const isRateLimit = /429|too many requests|rate.?limit/i.test(message);
  if (isRateLimit) {
    // 3s, 6s, 12s... capped to avoid excessive waits.
    return Math.min(12_000, 3_000 * Math.pow(2, attempt - 1));
  }
  return 1_500 * attempt;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Submit a wallet transaction with retry on transient RPC transport failures.
 *
 * Retries are intentionally conservative (max 3 attempts) to avoid duplicate
 * wallet prompts while still recovering from short-lived provider outages.
 */
export async function sendTransactionWithRetry<
  T extends ethers.TransactionResponse | ethers.ContractTransactionResponse,
>(
  send: () => Promise<T>,
  options: SendRetryOptions = {},
): Promise<T> {
  const {
    label = 'wallet-write',
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    onRetry,
  } = options;

  let lastRetryableError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await send();
    } catch (error) {
      if (isUserRejection(error)) {
        throw new Error('Transaction was rejected in your wallet.');
      }

      if (!isRetryableRpcError(error)) {
        throw error;
      }

      lastRetryableError = error;
      if (attempt >= maxAttempts) {
        break;
      }

      const delayMs = getRetryDelayMs(error, attempt);
      log.warn(
        `[${label}] wallet/RPC transport failure ` +
          `(attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms`,
        error,
      );

      await sleep(delayMs);
      if (onRetry) {
        await onRetry(attempt, error);
      }
    }
  }

  if (lastRetryableError) {
    throw lastRetryableError;
  }

  throw new Error('Transaction failed before submission.');
}

/**
 * Wait for transaction confirmation with RPC fallback.
 *
 * Primary path uses the wallet provider via `tx.wait()`. If that fails due to
 * transient RPC/network errors, fallback waits via a healthy direct RPC.
 */
export async function waitForTransactionReceipt(
  tx: WaitableTransaction,
  options: WaitReceiptOptions = {},
): Promise<ethers.TransactionReceipt> {
  const {
    confirmations = 1,
    timeoutMs = DEFAULT_CONFIRMATION_TIMEOUT_MS,
    label = 'tx-confirmation',
  } = options;

  const resolvedChainId =
    options.chainId ?? useWalletStore.getState().wallet.chainId ?? null;

  let primaryError: unknown = null;

  try {
    const receipt = await tx.wait(confirmations);
    if (receipt) return receipt;
    primaryError = new Error('Transaction receipt is null from wallet provider.');
  } catch (error) {
    if (!isRetryableRpcError(error)) {
      throw error;
    }
    primaryError = error;
    log.warn(`[${label}] wallet confirmation failed, trying fallback RPC`, error);
  }

  if (!resolvedChainId) {
    throw primaryError ?? new Error('Unable to confirm transaction: chain ID is unavailable.');
  }

  const healthyEndpoint = await findHealthyEndpoint(resolvedChainId, 4_000);
  if (!healthyEndpoint) {
    throw primaryError ?? new Error('Unable to confirm transaction: no healthy RPC endpoint available.');
  }

  const provider = new ethers.JsonRpcProvider(healthyEndpoint, resolvedChainId);
  try {
    const receipt = await provider.waitForTransaction(tx.hash, confirmations, timeoutMs);
    if (!receipt) {
      throw new Error(
        'Transaction confirmation timed out. The transaction may still be pending.',
      );
    }
    return receipt;
  } finally {
    provider.destroy();
  }
}
