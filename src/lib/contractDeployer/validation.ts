/**
 * Constructor parameter validation for the Fueki Smart Contract Deployer.
 *
 * Validates user-supplied string values against their declared Solidity types
 * before encoding and deployment. Each validator returns a human-readable error
 * message or null when the value is acceptable.
 */

import { ethers } from 'ethers';
import type { ContractTemplate } from '../../types/contractDeployer';

// ---------------------------------------------------------------------------
// Batch validation
// ---------------------------------------------------------------------------

/**
 * Validate all constructor parameter values for a given template.
 * Returns a Record of field name to error message, or an empty object if all valid.
 */
export function validateConstructorParams(
  template: ContractTemplate,
  values: Record<string, string>,
): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const param of template.constructorParams) {
    const value = (values[param.name] ?? '').trim();
    const required = param.required !== false;

    if (!value && required) {
      errors[param.name] = `${param.label} is required`;
      continue;
    }
    if (!value) continue;

    const error = validateSolidityValue(value, param.type);
    if (error) {
      errors[param.name] = error;
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Single-value validation
// ---------------------------------------------------------------------------

/**
 * Validate a single value against its Solidity type.
 * Returns an error message string or null if valid.
 */
export function validateSolidityValue(value: string, type: string): string | null {
  // ---- address ----
  if (type === 'address') {
    return validateAddress(value);
  }

  // ---- uint256 / uint64 ----
  if (type === 'uint256' || type === 'uint64') {
    return validateUint(value, type);
  }

  // ---- string ----
  if (type === 'string') {
    return validateString(value);
  }

  // ---- bool ----
  if (type === 'bool') {
    return validateBool(value);
  }

  // ---- bytes32 ----
  if (type === 'bytes32') {
    return validateBytes32(value);
  }

  // ---- address[] ----
  if (type === 'address[]') {
    return validateAddressArray(value);
  }

  // ---- uint256[] (dynamic) ----
  if (type === 'uint256[]') {
    return validateUintArray(value, null);
  }

  // ---- uint256[N] (fixed-length) ----
  const fixedMatch = type.match(/^uint256\[(\d+)]$/);
  if (fixedMatch) {
    const expectedLength = parseInt(fixedMatch[1], 10);
    return validateUintArray(value, expectedLength);
  }

  // Unknown type -- allow through (encoder will catch any runtime issues)
  return null;
}

// ---------------------------------------------------------------------------
// Individual type validators
// ---------------------------------------------------------------------------

function validateAddress(value: string): string | null {
  if (!ethers.isAddress(value)) {
    return 'Must be a valid Ethereum address (0x followed by 40 hex characters)';
  }
  if (value === ethers.ZeroAddress) {
    return 'Zero address is not allowed';
  }
  return null;
}

function validateUint(value: string, type: 'uint256' | 'uint64'): string | null {
  // Allow decimal notation for values that will be parsed with ethers.parseUnits
  // (e.g. "1000.5" for a token amount with 18 decimals).
  // Also allow plain integers (e.g. "1000").
  const cleaned = value.replace(/[,\s]/g, '');

  if (!cleaned) {
    return `${type} value is required`;
  }

  // Reject clearly non-numeric input
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return `Must be a valid non-negative number`;
  }

  const num = Number(cleaned);
  if (isNaN(num) || !isFinite(num)) {
    return 'Must be a valid number';
  }
  if (num < 0) {
    return `${type} cannot be negative`;
  }

  // For integer-only contexts without decimals, reject decimals
  // Note: actual decimal handling (parseUnits) is controlled by the param.decimals
  // field at the encoding layer. Here we allow decimals through since the
  // encoder will use parseUnits when decimals are specified.

  if (type === 'uint64') {
    try {
      const bigVal = BigInt(cleaned);
      const MAX_UINT64 = (1n << 64n) - 1n;
      if (bigVal > MAX_UINT64) {
        return `Value exceeds maximum uint64 (${MAX_UINT64.toString()})`;
      }
    } catch {
      // May be a decimal -- only integers are valid for uint64
      if (cleaned.includes('.')) {
        return 'uint64 must be a whole number (no decimals)';
      }
      return 'Must be a valid integer';
    }
  }

  return null;
}

function validateString(value: string): string | null {
  if (!value.trim()) {
    return 'String value cannot be empty';
  }
  return null;
}

function validateBool(value: string): string | null {
  const lower = value.toLowerCase();
  if (lower !== 'true' && lower !== 'false') {
    return 'Must be "true" or "false"';
  }
  return null;
}

function validateBytes32(value: string): string | null {
  // bytes32 must be a 0x-prefixed 66-character hex string (0x + 64 hex chars)
  if (!value.startsWith('0x')) {
    return 'Must start with 0x prefix';
  }
  if (value.length !== 66) {
    return 'bytes32 must be exactly 66 characters (0x + 64 hex digits)';
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    return 'Must contain only hexadecimal characters after 0x';
  }
  return null;
}

function validateAddressArray(value: string): string | null {
  const items = value.split(',').map((s) => s.trim());

  if (items.length === 0 || (items.length === 1 && !items[0])) {
    return 'At least one address is required';
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) {
      return `Address at position ${i + 1} is empty`;
    }
    if (!ethers.isAddress(item)) {
      return `Invalid address at position ${i + 1}: "${item}"`;
    }
  }

  return null;
}

function validateUintArray(value: string, expectedLength: number | null): string | null {
  const items = value.split(',').map((s) => s.trim());

  if (items.length === 0 || (items.length === 1 && !items[0])) {
    return 'At least one number is required';
  }

  if (expectedLength !== null && items.length !== expectedLength) {
    return `Expected exactly ${expectedLength} values, got ${items.length}`;
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) {
      return `Value at position ${i + 1} is empty`;
    }
    if (!/^\d+$/.test(item)) {
      return `Invalid number at position ${i + 1}: "${item}" (must be a non-negative integer)`;
    }
    try {
      BigInt(item);
    } catch {
      return `Value at position ${i + 1} is not a valid integer`;
    }
  }

  return null;
}
