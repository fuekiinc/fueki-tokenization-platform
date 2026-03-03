/**
 * ABI parser for the Fueki Smart Contract Deployer.
 *
 * Parses a compiled contract's ABI into categorized read/write functions and
 * events so the contract interaction page can render appropriate UI for each
 * function type.
 */

import { ethers } from 'ethers';
import type { ABIEvent, ABIFunction, ABIParam } from '../../types/contractDeployer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedABI {
  /** View and pure functions (read-only, no gas cost). */
  readFunctions: ABIFunction[];
  /** Nonpayable and payable functions (state-changing, require gas). */
  writeFunctions: ABIFunction[];
  /** Contract events. */
  events: ABIEvent[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a contract ABI into categorized read/write functions and events.
 *
 * Functions are classified by their `stateMutability`:
 * - `view` and `pure` -> readFunctions (no gas, call only)
 * - `nonpayable` and `payable` -> writeFunctions (require a transaction)
 *
 * All categories are sorted alphabetically by name for consistent UI ordering.
 *
 * @param abi - The raw ABI array from a compiled contract artifact.
 * @returns A `ParsedABI` object with categorized functions and events.
 */
export function parseABI(abi: readonly Record<string, unknown>[]): ParsedABI {
  const iface = new ethers.Interface(abi as ethers.InterfaceAbi);
  const readFunctions: ABIFunction[] = [];
  const writeFunctions: ABIFunction[] = [];
  const events: ABIEvent[] = [];

  // ---- Functions ----
  iface.forEachFunction((func) => {
    const abiFunc: ABIFunction = {
      name: func.name,
      stateMutability: func.stateMutability as ABIFunction['stateMutability'],
      inputs: func.inputs.map(mapParam),
      outputs: func.outputs.map(mapParam),
    };

    if (func.stateMutability === 'view' || func.stateMutability === 'pure') {
      readFunctions.push(abiFunc);
    } else {
      writeFunctions.push(abiFunc);
    }
  });

  // ---- Events ----
  iface.forEachEvent((event) => {
    events.push({
      name: event.name,
      inputs: event.inputs.map(mapParam),
    });
  });

  // Sort all categories alphabetically for deterministic UI ordering
  readFunctions.sort((a, b) => a.name.localeCompare(b.name));
  writeFunctions.sort((a, b) => a.name.localeCompare(b.name));
  events.sort((a, b) => a.name.localeCompare(b.name));

  return { readFunctions, writeFunctions, events };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Map an ethers.js `ParamType` to our `ABIParam` interface.
 * Handles tuple (struct) types by recursively mapping their components.
 */
function mapParam(param: ethers.ParamType): ABIParam {
  const result: ABIParam = {
    name: param.name || '',
    type: param.type,
  };

  // Preserve the indexed flag for event parameters
  if (param.indexed) {
    result.indexed = true;
  }

  // Recursively map tuple components (Solidity structs)
  if (param.components && param.components.length > 0) {
    result.components = param.components.map(mapParam);
  }

  return result;
}
