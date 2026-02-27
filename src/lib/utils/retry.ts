/**
 * Generic async retry utility with linear back-off.
 *
 * Used by pages that rely on on-chain reads (exchange, security tokens, etc.)
 * to survive transient RPC failures without immediately showing error states.
 */

import logger from '../logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3 */
  maxAttempts?: number;
  /** Base delay between retries in ms. Multiplied by attempt number. Default: 1000 */
  baseDelayMs?: number;
  /** Optional label for log messages. */
  label?: string;
  /** Optional predicate to decide whether an error is retryable. Defaults to true. */
  isRetryable?: (err: unknown) => boolean;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Execute an async function with automatic retry on failure.
 *
 * @param fn - The async function to execute.
 * @param options - Retry configuration.
 * @returns The result of `fn()` on the first successful attempt.
 * @throws The last error if all attempts fail.
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1_000,
    label = 'retryAsync',
    isRetryable = () => true,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt >= maxAttempts || !isRetryable(err)) {
        break;
      }

      const delay = baseDelayMs * attempt;
      logger.warn(
        `[${label}] Attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms`,
        err,
      );
      await sleep(delay);
    }
  }

  throw lastError;
}
