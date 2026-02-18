/**
 * Production-grade validation utilities for the Fueki Tokenization Platform.
 *
 * Centralizes common validation patterns (Ethereum address, token symbol,
 * amount, email, password, chain ID, input sanitization) so every form
 * and API boundary reuses the same rules.
 */

import { ethers } from 'ethers';
import { SUPPORTED_NETWORKS } from '../../contracts/addresses.ts';

// ---------------------------------------------------------------------------
// Ethereum address
// ---------------------------------------------------------------------------

/**
 * Validate an Ethereum address.
 * Returns `true` when `address` is a valid checksummed or lowercase
 * 0x-prefixed 40-character hex string.
 */
export function isValidAddress(address: string): boolean {
  if (!address || typeof address !== 'string') return false;
  return ethers.isAddress(address);
}

/** Returns `true` when the address is the zero address. */
export function isZeroAddress(value: string): boolean {
  try {
    return value === ethers.ZeroAddress;
  } catch {
    return false;
  }
}

/**
 * Strips whitespace from a pasted string and validates it as an Ethereum
 * address. Returns an object with the cleaned value and a validity flag.
 */
export function sanitizePastedAddress(raw: string): {
  value: string;
  valid: boolean;
} {
  const cleaned = raw.replace(/\s/g, '');
  return { value: cleaned, valid: isValidAddress(cleaned) };
}

// ---------------------------------------------------------------------------
// Token amount
// ---------------------------------------------------------------------------

/**
 * Validate a human-readable token amount string.
 *
 * @param amount - The raw string to validate (e.g. "1,234.56").
 * @param decimals - Maximum decimal places allowed (default: 18 for ERC-20).
 * @returns `true` when the amount is a valid positive number within the
 *   specified decimal precision.
 */
export function isValidAmount(amount: string, decimals = 18): boolean {
  if (!amount || typeof amount !== 'string') return false;
  const cleaned = amount.replace(/[,\s]/g, '');
  if (!cleaned) return false;

  const num = Number(cleaned);
  if (isNaN(num) || !isFinite(num)) return false;
  if (num <= 0) return false;

  const parts = cleaned.split('.');
  if (parts.length > 2) return false;
  if (parts.length === 2 && parts[1].length > decimals) return false;

  return true;
}

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

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/**
 * Validate an email address format.
 * Uses the HTML5 specification pattern for email validation.
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  if (email.length > 254) return false;
  return EMAIL_REGEX.test(email);
}

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate password strength.
 *
 * Requirements:
 * - At least 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * - At least one special character
 */
export function isValidPassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (!password || typeof password !== 'string') {
    return { valid: false, errors: ['Password is required'] };
  }

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one digit');
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Input sanitization (XSS prevention)
// ---------------------------------------------------------------------------

const HTML_ENTITY_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#96;',
};

const HTML_ENTITY_REGEX = /[&<>"'/`]/g;

/**
 * Sanitize user input to prevent XSS attacks.
 * Escapes HTML entities and strips null bytes.
 */
export function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/\0/g, '')
    .replace(HTML_ENTITY_REGEX, (char) => HTML_ENTITY_MAP[char] ?? char);
}

// ---------------------------------------------------------------------------
// Chain ID
// ---------------------------------------------------------------------------

/**
 * Check whether a chain ID corresponds to a network the platform supports.
 */
export function isValidChainId(chainId: number): boolean {
  if (!Number.isInteger(chainId) || chainId <= 0) return false;
  return chainId in SUPPORTED_NETWORKS;
}

// ---------------------------------------------------------------------------
// Token symbol
// ---------------------------------------------------------------------------

const TOKEN_SYMBOL_REGEX = /^[A-Z0-9]{1,11}$/;

/**
 * Validate a token symbol.
 * Must be 1--11 uppercase alphanumeric characters.
 */
export function isValidTokenSymbol(symbol: string): boolean {
  if (!symbol || typeof symbol !== 'string') return false;
  return TOKEN_SYMBOL_REGEX.test(symbol);
}

/**
 * Validates a token symbol with a descriptive error message.
 * Returns an error string or null if valid.
 */
export function validateTokenSymbol(symbol: string): string | null {
  if (!symbol.trim()) return 'Token symbol is required';
  if (symbol.length > 11) return 'Symbol must be 11 characters or fewer';
  if (!TOKEN_SYMBOL_REGEX.test(symbol))
    return 'Symbol must be uppercase letters and numbers only';
  return null;
}

// ---------------------------------------------------------------------------
// Re-exports for backward compatibility
// ---------------------------------------------------------------------------

/** @deprecated Use `isValidAddress` instead. */
export const isValidEthAddress = isValidAddress;
