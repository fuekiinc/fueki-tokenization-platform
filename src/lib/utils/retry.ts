/**
 * Generic async retry utility with exponential back-off and jitter.
 *
 * Used by pages that rely on on-chain reads (exchange, security tokens, etc.)
 * to survive transient RPC failures without immediately showing error states.
 *
 * Back-off formula: min(maxDelayMs, baseDelayMs * 2^(attempt-1)) + jitter
 * This prevents thundering-herd issues when many components retry simultaneously.
 */

import logger from '../logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 5 */
  maxAttempts?: number;
  /** Base delay between retries in ms. Default: 800 */
  baseDelayMs?: number;
  /** Maximum delay cap in ms. Default: 15000 */
  maxDelayMs?: number;
  /** Optional label for log messages. */
  label?: string;
  /** Optional predicate to decide whether an error is retryable. Defaults to true. */
  isRetryable?: (err: unknown) => boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Add ±25% random jitter to a delay to prevent thundering herd. */
function jitter(delayMs: number): number {
  const variance = delayMs * 0.25;
  return delayMs + (Math.random() * variance * 2 - variance);
}

/** Detect rate-limit errors that benefit from longer back-off. */
function isRateLimitError(err: unknown): boolean {
  const message =
    err instanceof Error ? err.message : String(err);
  return /429|too many requests|rate.?limit/i.test(message);
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Execute an async function with automatic retry on failure.
 *
 * Uses exponential back-off with jitter:
 *   attempt 1 → ~800ms, attempt 2 → ~1600ms, attempt 3 → ~3200ms, ...
 *
 * Rate-limit errors (HTTP 429 / "too many requests") automatically double
 * the computed delay to give the endpoint more breathing room.
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
    maxAttempts = 5,
    baseDelayMs = 800,
    maxDelayMs = 15_000,
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

      // Exponential back-off: baseDelayMs * 2^(attempt-1), capped at maxDelayMs
      let delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));

      // Rate-limit errors get extra breathing room
      if (isRateLimitError(err)) {
        delay = Math.min(maxDelayMs, delay * 2);
      }

      delay = jitter(delay);

      logger.warn(
        `[${label}] Attempt ${attempt}/${maxAttempts} failed, retrying in ${Math.round(delay)}ms`,
        err,
      );
      await sleep(delay);
    }
  }

  throw lastError;
}
