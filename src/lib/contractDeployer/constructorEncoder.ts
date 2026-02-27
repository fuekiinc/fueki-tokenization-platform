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
    if (decimals !== undefined && decimals > 0) {
      return ethers.parseUnits(raw.replace(/[,\s]/g, ''), decimals);
    }
    return BigInt(raw.replace(/[,\s]/g, ''));
  }

  // ---- uint64 ----
  if (type === 'uint64') {
    return BigInt(raw.replace(/[,\s]/g, ''));
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
    return raw;
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
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => BigInt(s));
  }

  // Fallback: return raw string for unknown types
  return raw;
}
