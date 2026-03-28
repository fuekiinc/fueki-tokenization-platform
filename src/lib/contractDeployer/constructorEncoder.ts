/**
 * Constructor argument encoder for the Fueki Smart Contract Deployer.
 *
 * Converts validated string-form values from the deployment wizard into typed
 * arguments that ethers.js ContractFactory expects. This module must be called
 * AFTER validation passes -- it assumes inputs are syntactically correct.
 */

import { ethers } from 'ethers';
import type { ContractTemplate } from '../../types/contractDeployer';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encode constructor parameter values from string form values to typed
 * ethers.js arguments. The returned array is ordered to match the template's
 * `constructorParams` declaration and can be spread directly into
 * `factory.deploy(...args)`.
 *
 * Must be called AFTER validation passes.
 */
export function encodeConstructorArgs(
  template: ContractTemplate,
  values: Record<string, string>,
): unknown[] {
  return template.constructorParams.map((param) => {
    const raw = (values[param.name] ?? '').trim();
    return encodeSolidityValue(raw, param.type, param.decimals);
  });
}

// ---------------------------------------------------------------------------
// Internal encoder
// ---------------------------------------------------------------------------

/**
 * Encode a single string value into its typed representation for ethers.js.
 *
 * @param raw - The trimmed string value from the form.
 * @param type - The Solidity type (e.g. 'address', 'uint256', 'string').
 * @param decimals - Optional decimal precision for uint256 values that
 *   represent token amounts. When provided, `ethers.parseUnits` is used.
 */
function encodeSolidityValue(raw: string, type: string, decimals?: number): unknown {
  // ---- address ----
  if (type === 'address') {
    return ethers.getAddress(raw);
  }

  // ---- uint256 ----
  if (type === 'uint256') {
    const cleaned = raw.replace(/[,\s]/g, '');
    if (!cleaned) {
      throw new Error('Value is required for uint256 parameter');
    }
    try {
      if (decimals !== undefined && decimals > 0) {
        return ethers.parseUnits(cleaned, decimals);
      }
      return BigInt(cleaned);
    } catch {
      throw new Error(`Invalid uint256 value: "${raw}". Must be a non-negative integer.`);
    }
  }

  // ---- uint64 ----
  if (type === 'uint64') {
    const cleaned = raw.replace(/[,\s]/g, '');
    if (!cleaned) {
      throw new Error('Value is required for uint64 parameter');
    }
    try {
      return BigInt(cleaned);
    } catch {
      throw new Error(`Invalid uint64 value: "${raw}". Must be a non-negative integer.`);
    }
  }

  // ---- string ----
  if (type === 'string') {
    return raw;
  }

  // ---- bool ----
  if (type === 'bool') {
    return raw.toLowerCase() === 'true';
  }

  // ---- bytes32 ----
  if (type === 'bytes32') {
    // If already a 0x-prefixed hex string of the right length, use it as-is.
    if (/^0x[0-9a-fA-F]{64}$/.test(raw)) {
      return raw;
    }
    // Otherwise encode the short string into a zero-padded bytes32.
    return ethers.encodeBytes32String(raw);
  }

  // ---- address[] ----
  if (type === 'address[]') {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => ethers.getAddress(s));
  }

  // ---- uint256[] (dynamic) ----
  if (type === 'uint256[]') {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => BigInt(s));
  }

  // ---- uint256[N] (fixed-length) ----
  const fixedMatch = type.match(/^uint256\[(\d+)]$/);
  if (fixedMatch) {
    const expectedLength = Number(fixedMatch[1]);
    const elements = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => BigInt(s));
    if (elements.length !== expectedLength) {
      throw new Error(
        `Expected ${expectedLength} element(s) for ${type}, but got ${elements.length}`,
      );
    }
    return elements;
  }

  // Fallback: return raw string for unknown types
  return raw;
}
