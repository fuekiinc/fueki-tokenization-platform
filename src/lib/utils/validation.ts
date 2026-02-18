/**
 * Shared form validation utilities.
 *
 * Centralises common validation patterns (Ethereum address, token symbol, etc.)
 * so every form in the platform reuses the same rules.
 */

import { ethers } from 'ethers';

// ---------------------------------------------------------------------------
// Ethereum address
// ---------------------------------------------------------------------------

/** Returns true when `value` is a valid Ethereum address (0x + 40 hex chars). */
export function isValidEthAddress(value: string): boolean {
  return ethers.isAddress(value);
}

/** Returns true when the address is the zero address. */
export function isZeroAddress(value: string): boolean {
  try {
    return value === ethers.ZeroAddress;
  } catch {
    return false;
  }
}

/**
 * Strips whitespace from a pasted string and validates it as an Ethereum
 * address.  Returns an object with the cleaned value and a validity flag.
 */
export function sanitizePastedAddress(raw: string): {
  value: string;
  valid: boolean;
} {
  const cleaned = raw.replace(/\s/g, '');
  return { value: cleaned, valid: isValidEthAddress(cleaned) };
}

// ---------------------------------------------------------------------------
// Token symbol
// ---------------------------------------------------------------------------

const SYMBOL_REGEX = /^[A-Z0-9]+$/;

/**
 * Validates a token symbol.
 * Returns an error string or null if valid.
 */
export function validateTokenSymbol(symbol: string): string | null {
  if (!symbol.trim()) return 'Token symbol is required';
  if (symbol.length > 11) return 'Symbol must be 11 characters or fewer';
  if (!SYMBOL_REGEX.test(symbol)) return 'Symbol must be uppercase letters and numbers only';
  return null;
}

// ---------------------------------------------------------------------------
// Numeric amount
// ---------------------------------------------------------------------------

/**
 * Validates a human-readable numeric amount string.
 * Returns an error string or null if valid.
 */
export function validatePositiveAmount(
  raw: string,
  fieldName = 'Amount',
): string | null {
  const cleaned = raw.replace(/[,\s]/g, '');
  if (!cleaned) return `${fieldName} is required`;
  const num = Number(cleaned);
  if (isNaN(num)) return `${fieldName} must be a valid number`;
  if (num <= 0) return `${fieldName} must be greater than zero`;
  return null;
}
