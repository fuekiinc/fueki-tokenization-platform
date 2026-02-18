/**
 * Error Classification System
 *
 * Comprehensive, production-grade error classification for the Fueki
 * tokenization platform. Every error that surfaces through the application
 * is normalised into a `ClassifiedError` which carries:
 *
 *   - A user-friendly message (safe to show in the UI)
 *   - A suggested action the user can take
 *   - A severity level (info | warning | error | critical)
 *   - A recovery strategy the UI can use to offer one-click fixes
 *   - The original raw error for structured logging
 *
 * Callers should use `classifyError(error)` to obtain a ClassifiedError
 * from any unknown thrown value, or `getErrorMessage(error)` for a quick
 * user-friendly string.
 */

import toast from 'react-hot-toast';
import logger from './logger';

// ---------------------------------------------------------------------------
// Severity & Recovery
// ---------------------------------------------------------------------------

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

export type RecoveryStrategy =
  | 'retry'           // The operation can be retried as-is
  | 'refresh'         // A page reload may fix the issue
  | 'reconnect'       // The user should reconnect their wallet
  | 'switch-network'  // The user should switch to a supported network
  | 'increase-gas'    // The user should increase gas or balance
  | 'contact-support' // Nothing the user can do alone
  | 'login'           // The user needs to re-authenticate
  | 'none';           // No automated recovery; informational only

// ---------------------------------------------------------------------------
// Error categories
// ---------------------------------------------------------------------------

export type ErrorCategory =
  | 'network'
  | 'wallet'
  | 'contract'
  | 'validation'
  | 'auth'
  | 'unknown';

// ---------------------------------------------------------------------------
// ClassifiedError
// ---------------------------------------------------------------------------

export interface ClassifiedError {
  /** Machine-readable category. */
  category: ErrorCategory;
  /** User-friendly summary suitable for display. */
  message: string;
  /** A short suggestion for the user. */
  suggestedAction: string;
  /** How severe this error is. */
  severity: ErrorSeverity;
  /** Recommended recovery strategy for the UI layer. */
  recovery: RecoveryStrategy;
  /** The raw error that was caught. */
  originalError: unknown;
}

// ---------------------------------------------------------------------------
// Internal pattern matchers
// ---------------------------------------------------------------------------

/** Match against stringified error messages (case-insensitive). */
function msgIncludes(error: unknown, ...needles: string[]): boolean {
  const msg = errorToString(error).toLowerCase();
  return needles.some((n) => msg.includes(n.toLowerCase()));
}

/** Extract a numeric code from an error object (ethers, MetaMask, etc.). */
function getErrorCode(error: unknown): string | number | undefined {
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    if ('code' in e) return e.code as string | number;
    if ('error' in e && typeof e.error === 'object' && e.error !== null) {
      const inner = e.error as Record<string, unknown>;
      if ('code' in inner) return inner.code as string | number;
    }
  }
  return undefined;
}

/** Try to read the revert reason from an ethers CALL_EXCEPTION. */
function getRevertReason(error: unknown): string | undefined {
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    if (typeof e.reason === 'string') return e.reason;
    if (
      typeof e.error === 'object' &&
      e.error !== null &&
      typeof (e.error as Record<string, unknown>).message === 'string'
    ) {
      return (e.error as Record<string, unknown>).message as string;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Classify: Network errors
// ---------------------------------------------------------------------------

function classifyNetworkError(error: unknown): ClassifiedError | null {
  const code = getErrorCode(error);

  // RPC rate-limiting
  if (code === 429 || msgIncludes(error, 'rate limit', '429', 'too many requests')) {
    return {
      category: 'network',
      message: 'Too many requests. The RPC provider is rate-limiting.',
      suggestedAction: 'Wait a moment and try again.',
      severity: 'warning',
      recovery: 'retry',
      originalError: error,
    };
  }

  // Timeout
  if (
    code === 'TIMEOUT' ||
    msgIncludes(error, 'timeout', 'timed out', 'ETIMEDOUT', 'ESOCKETTIMEDOUT')
  ) {
    return {
      category: 'network',
      message: 'Request timed out.',
      suggestedAction: 'Check your internet connection and try again.',
      severity: 'warning',
      recovery: 'retry',
      originalError: error,
    };
  }

  // Generic network / fetch failures
  if (
    code === 'NETWORK_ERROR' ||
    code === 'SERVER_ERROR' ||
    msgIncludes(
      error,
      'network error',
      'failed to fetch',
      'fetch failed',
      'net::ERR_',
      'ECONNREFUSED',
      'ENOTFOUND',
      'NetworkError',
      'ERR_INTERNET_DISCONNECTED',
    )
  ) {
    return {
      category: 'network',
      message: 'Network error. Unable to reach the server.',
      suggestedAction: 'Check your internet connection and try again.',
      severity: 'error',
      recovery: 'retry',
      originalError: error,
    };
  }

  // API 5xx
  if (
    msgIncludes(error, 'internal server error', '502', '503', '504', 'bad gateway')
  ) {
    return {
      category: 'network',
      message: 'The server is temporarily unavailable.',
      suggestedAction: 'Please try again in a few moments.',
      severity: 'error',
      recovery: 'retry',
      originalError: error,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Classify: Wallet errors
// ---------------------------------------------------------------------------

function classifyWalletError(error: unknown): ClassifiedError | null {
  const code = getErrorCode(error);

  // User rejected / cancelled the action in their wallet
  if (
    code === 4001 ||
    code === 'ACTION_REJECTED' ||
    msgIncludes(error, 'user rejected', 'user denied', 'user cancelled', 'user canceled')
  ) {
    return {
      category: 'wallet',
      message: 'Transaction was rejected in your wallet.',
      suggestedAction: 'You can try again when ready.',
      severity: 'info',
      recovery: 'none',
      originalError: error,
    };
  }

  // Wallet not connected / no provider
  if (
    code === 4100 ||
    msgIncludes(error, 'wallet not connected', 'no provider', 'not connected', 'ethereum is not defined')
  ) {
    return {
      category: 'wallet',
      message: 'Wallet is not connected.',
      suggestedAction: 'Please connect your wallet to continue.',
      severity: 'warning',
      recovery: 'reconnect',
      originalError: error,
    };
  }

  // Wrong chain / unsupported network
  if (
    code === 4902 ||
    code === 'UNSUPPORTED_OPERATION' ||
    msgIncludes(error, 'wrong network', 'chain mismatch', 'unsupported chain', 'unrecognized chain')
  ) {
    return {
      category: 'wallet',
      message: 'Connected to an unsupported network.',
      suggestedAction: 'Please switch to a supported network.',
      severity: 'warning',
      recovery: 'switch-network',
      originalError: error,
    };
  }

  // Pending wallet request (MetaMask already has an open prompt)
  if (code === -32002 || msgIncludes(error, 'already pending', 'request already')) {
    return {
      category: 'wallet',
      message: 'A wallet request is already pending.',
      suggestedAction: 'Check your wallet for a pending prompt.',
      severity: 'info',
      recovery: 'none',
      originalError: error,
    };
  }

  // Generic MetaMask / EIP-1193 RPC errors
  if (code === -32603 || code === -32000) {
    // Check for known sub-messages
    if (msgIncludes(error, 'insufficient funds', 'INSUFFICIENT_FUNDS')) {
      return {
        category: 'contract',
        message: 'Insufficient balance for this transaction.',
        suggestedAction: 'Add funds to your wallet or reduce the amount.',
        severity: 'error',
        recovery: 'increase-gas',
        originalError: error,
      };
    }
    if (msgIncludes(error, 'nonce', 'replacement')) {
      return {
        category: 'wallet',
        message: 'Transaction nonce conflict.',
        suggestedAction: 'Reset your wallet nonce or wait for pending transactions to clear.',
        severity: 'warning',
        recovery: 'retry',
        originalError: error,
      };
    }
    return {
      category: 'wallet',
      message: 'Wallet encountered an internal error.',
      suggestedAction: 'Try again or restart your wallet.',
      severity: 'error',
      recovery: 'retry',
      originalError: error,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Classify: Contract / on-chain errors
// ---------------------------------------------------------------------------

function classifyContractError(error: unknown): ClassifiedError | null {
  const code = getErrorCode(error);
  const reason = getRevertReason(error);

  // Explicit revert with reason
  if (code === 'CALL_EXCEPTION' && reason) {
    return {
      category: 'contract',
      message: `Transaction reverted: ${reason}`,
      suggestedAction: 'Review the transaction parameters and try again.',
      severity: 'error',
      recovery: 'retry',
      originalError: error,
    };
  }

  // Generic revert without reason
  if (code === 'CALL_EXCEPTION' || msgIncludes(error, 'execution reverted', 'revert')) {
    return {
      category: 'contract',
      message: 'Transaction reverted by the smart contract.',
      suggestedAction: 'Check input values and contract requirements.',
      severity: 'error',
      recovery: 'retry',
      originalError: error,
    };
  }

  // Out of gas
  if (
    msgIncludes(error, 'out of gas', 'gas required exceeds', 'UNPREDICTABLE_GAS_LIMIT')
  ) {
    return {
      category: 'contract',
      message: 'Transaction requires more gas than estimated.',
      suggestedAction: 'Increase gas limit or simplify the transaction.',
      severity: 'error',
      recovery: 'increase-gas',
      originalError: error,
    };
  }

  // Insufficient funds (can also appear as a contract-level error)
  if (
    code === 'INSUFFICIENT_FUNDS' ||
    msgIncludes(error, 'insufficient funds', 'INSUFFICIENT_FUNDS', 'insufficient balance')
  ) {
    return {
      category: 'contract',
      message: 'Insufficient balance for this transaction.',
      suggestedAction: 'Add funds to your wallet or reduce the amount.',
      severity: 'error',
      recovery: 'increase-gas',
      originalError: error,
    };
  }

  // Nonce too low (usually from speed-up / replacement)
  if (code === 'NONCE_EXPIRED' || msgIncludes(error, 'nonce too low', 'nonce has already been used')) {
    return {
      category: 'contract',
      message: 'Transaction nonce is outdated.',
      suggestedAction: 'Wait for pending transactions to confirm, then retry.',
      severity: 'warning',
      recovery: 'retry',
      originalError: error,
    };
  }

  // Replacement underpriced
  if (msgIncludes(error, 'replacement transaction underpriced', 'underpriced')) {
    return {
      category: 'contract',
      message: 'Replacement transaction gas price is too low.',
      suggestedAction: 'Increase the gas price and try again.',
      severity: 'warning',
      recovery: 'increase-gas',
      originalError: error,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Classify: Validation errors
// ---------------------------------------------------------------------------

function classifyValidationError(error: unknown): ClassifiedError | null {
  if (
    msgIncludes(
      error,
      'invalid address',
      'invalid amount',
      'invalid input',
      'ENS name not configured',
      'INVALID_ARGUMENT',
    )
  ) {
    return {
      category: 'validation',
      message: 'Invalid input provided.',
      suggestedAction: 'Please check your input values and try again.',
      severity: 'warning',
      recovery: 'none',
      originalError: error,
    };
  }

  if (msgIncludes(error, 'overflow', 'NUMERIC_FAULT')) {
    return {
      category: 'validation',
      message: 'Numeric value is out of the allowed range.',
      suggestedAction: 'Use a smaller value.',
      severity: 'warning',
      recovery: 'none',
      originalError: error,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Classify: Auth errors
// ---------------------------------------------------------------------------

function classifyAuthError(error: unknown): ClassifiedError | null {
  if (
    msgIncludes(error, 'unauthorized', '401', 'not authenticated', 'authentication required')
  ) {
    return {
      category: 'auth',
      message: 'Your session has expired.',
      suggestedAction: 'Please log in again to continue.',
      severity: 'warning',
      recovery: 'login',
      originalError: error,
    };
  }

  if (msgIncludes(error, 'forbidden', '403', 'not authorized', 'access denied')) {
    return {
      category: 'auth',
      message: 'You do not have permission for this action.',
      suggestedAction: 'Contact an administrator if you believe this is a mistake.',
      severity: 'error',
      recovery: 'contact-support',
      originalError: error,
    };
  }

  if (msgIncludes(error, 'token expired', 'jwt expired', 'invalid token', 'jwt malformed')) {
    return {
      category: 'auth',
      message: 'Your authentication token has expired.',
      suggestedAction: 'Please log in again.',
      severity: 'warning',
      recovery: 'login',
      originalError: error,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert any thrown value to a readable string.
 */
export function errorToString(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Classify any thrown value into a structured `ClassifiedError`.
 *
 * The classification pipeline runs in priority order:
 *   1. Wallet errors   (user-initiated, informational)
 *   2. Network errors  (connectivity, rate limits)
 *   3. Contract errors  (reverts, gas, funds)
 *   4. Validation errors (bad input)
 *   5. Auth errors       (expired session)
 *   6. Fallback unknown
 */
export function classifyError(error: unknown): ClassifiedError {
  const classified =
    classifyWalletError(error) ??
    classifyNetworkError(error) ??
    classifyContractError(error) ??
    classifyValidationError(error) ??
    classifyAuthError(error);

  if (classified) return classified;

  // Fallback: unknown error
  const rawMessage = errorToString(error);
  return {
    category: 'unknown',
    message: rawMessage.length > 0 && rawMessage.length < 120
      ? rawMessage
      : 'An unexpected error occurred.',
    suggestedAction: 'Please try again or reload the page.',
    severity: 'error',
    recovery: 'retry',
    originalError: error,
  };
}

/**
 * Quick helper that returns only the user-friendly message.
 * Drop-in replacement for the previous getErrorMessage.
 */
export function getErrorMessage(error: unknown): string {
  return classifyError(error).message;
}

/**
 * Show an error toast with the classified message and log the error.
 *
 * @param error   - The caught error.
 * @param context - Optional label shown before the message (e.g. "Mint").
 */
export function showError(error: unknown, context?: string): void {
  const classified = classifyError(error);
  const display = context
    ? `${context}: ${classified.message}`
    : classified.message;

  // Log every error with full context for debugging.
  logger.error(`[${classified.category}] ${display}`, classified.originalError);

  // User-rejected wallet actions are low-severity; show a lighter toast.
  if (classified.severity === 'info') {
    toast(display, { icon: '\u2139\uFE0F', duration: 3000 });
    return;
  }

  // Critical errors get a longer duration so the user can read them.
  const duration = classified.severity === 'critical' ? 10_000 : 6_000;
  toast.error(display, { duration });
}

/**
 * Show an error toast with both the message and suggested action.
 * Use this for important flows (transactions, form submissions) where
 * guiding the user is valuable.
 */
export function showDetailedError(error: unknown, context?: string): void {
  const classified = classifyError(error);
  const title = context
    ? `${context}: ${classified.message}`
    : classified.message;

  logger.error(
    `[${classified.category}] ${title} | Action: ${classified.suggestedAction}`,
    classified.originalError,
  );

  if (classified.severity === 'info') {
    toast(title, { icon: '\u2139\uFE0F', duration: 3000 });
    return;
  }

  const duration = classified.severity === 'critical' ? 12_000 : 8_000;
  toast.error(`${title}\n${classified.suggestedAction}`, { duration });
}
