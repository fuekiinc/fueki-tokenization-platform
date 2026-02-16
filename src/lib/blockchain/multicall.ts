/**
 * Multicall3 batching utility for reducing RPC round-trips.
 *
 * Uses the standard Multicall3 contract deployed at the same address
 * on all major EVM chains. Encodes multiple contract read calls into
 * a single `aggregate3` RPC call and decodes results per-call, with
 * graceful per-call failure handling.
 *
 * @see https://www.multicall3.com/
 */

import { ethers } from 'ethers';
import type { InterfaceAbi } from 'ethers';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Multicall3 is deployed at the same deterministic address on 70+ chains.
 */
export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

/**
 * Minimal human-readable ABI for Multicall3.aggregate3.
 */
const MULTICALL3_ABI = [
  'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[])',
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Describes a single contract call to be batched.
 *
 * `abi` accepts any ethers.js-compatible ABI format: human-readable string
 * arrays, JSON ABI arrays, or ethers Interface instances.
 */
export interface MulticallRequest {
  /** Target contract address. */
  target: string;
  /** ABI of the target contract (human-readable or JSON). */
  abi: InterfaceAbi;
  /** Name of the function to call. */
  functionName: string;
  /** Arguments passed to the function (defaults to []). */
  args?: unknown[];
  /** If true, a revert on this call will not revert the entire batch. Defaults to true. */
  allowFailure?: boolean;
}

/**
 * Result of a single batched call.
 */
export interface MulticallResult<T = unknown> {
  /** Whether the individual call succeeded. */
  success: boolean;
  /** Decoded return data, or null on failure. */
  data: T | null;
}

// ---------------------------------------------------------------------------
// Core implementation
// ---------------------------------------------------------------------------

/**
 * Batch multiple contract read calls into a single RPC request via
 * the Multicall3 contract.
 *
 * Each request is encoded independently, sent as one `aggregate3`
 * call, and then decoded back. Calls that revert on-chain return
 * `{ success: false, data: null }` without failing the entire batch.
 *
 * @param provider  An ethers.js Provider to execute the call against.
 * @param requests  Array of call descriptors to batch.
 * @returns         Array of results in the same order as `requests`.
 *
 * @example
 * ```ts
 * const results = await multicall(provider, [
 *   { target: token1, abi: WrappedAssetABI, functionName: 'name' },
 *   { target: token1, abi: WrappedAssetABI, functionName: 'symbol' },
 *   { target: token1, abi: WrappedAssetABI, functionName: 'totalSupply' },
 * ]);
 * const name = results[0].data as string;
 * ```
 */
export async function multicall<T = unknown>(
  provider: ethers.Provider,
  requests: MulticallRequest[],
): Promise<MulticallResult<T>[]> {
  if (requests.length === 0) {
    return [];
  }

  // Build an Interface for each unique ABI (to avoid re-parsing).
  // For most use-cases the same ABI is shared across many requests,
  // so a simple cache keyed by reference identity works well.
  const ifaceCache = new Map<InterfaceAbi, ethers.Interface>();
  function getInterface(abi: InterfaceAbi): ethers.Interface {
    let iface = ifaceCache.get(abi);
    if (!iface) {
      iface = new ethers.Interface(abi);
      ifaceCache.set(abi, iface);
    }
    return iface;
  }

  // Encode each call.
  const calls: { target: string; allowFailure: boolean; callData: string }[] = [];
  const interfaces: ethers.Interface[] = [];
  const functionNames: string[] = [];

  for (const req of requests) {
    const iface = getInterface(req.abi);
    const callData = iface.encodeFunctionData(req.functionName, req.args ?? []);
    calls.push({
      target: req.target,
      allowFailure: req.allowFailure !== false, // default true
      callData,
    });
    interfaces.push(iface);
    functionNames.push(req.functionName);
  }

  // Execute the batched call via Multicall3.
  const multicall3 = new ethers.Contract(
    MULTICALL3_ADDRESS,
    MULTICALL3_ABI,
    provider,
  );

  const rawResults: { success: boolean; returnData: string }[] =
    await multicall3.aggregate3.staticCall(calls);

  // Decode results.
  const results: MulticallResult<T>[] = [];
  for (let i = 0; i < rawResults.length; i++) {
    const { success, returnData } = rawResults[i];
    if (!success || returnData === '0x') {
      results.push({ success: false, data: null });
      continue;
    }

    try {
      const decoded = interfaces[i].decodeFunctionResult(
        functionNames[i],
        returnData,
      );
      // ethers returns a Result object. If the function returns a single
      // value, unwrap it for ergonomic use; otherwise return the full
      // Result (which behaves like an array/tuple).
      const data = decoded.length === 1 ? decoded[0] : decoded;
      results.push({ success: true, data: data as T });
    } catch {
      results.push({ success: false, data: null });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

/**
 * Batch-read a single function from multiple contract addresses.
 *
 * Useful for reading the same property (e.g. `name()`) from many
 * token contracts in one RPC call.
 *
 * @param provider      An ethers.js Provider.
 * @param addresses     Array of contract addresses.
 * @param abi           Shared ABI for all contracts.
 * @param functionName  The function to call on each address.
 * @param args          Shared arguments (defaults to []).
 * @returns             Array of results, one per address.
 */
export async function multicallSameFunction<T = unknown>(
  provider: ethers.Provider,
  addresses: string[],
  abi: InterfaceAbi,
  functionName: string,
  args?: unknown[],
): Promise<MulticallResult<T>[]> {
  const requests: MulticallRequest[] = addresses.map((target) => ({
    target,
    abi,
    functionName,
    args,
  }));
  return multicall<T>(provider, requests);
}

/**
 * Batch-read multiple functions from a single contract address.
 *
 * Useful for loading all properties of a single contract in one
 * RPC call (e.g. name, symbol, totalSupply, etc.).
 *
 * @param provider       An ethers.js Provider.
 * @param target         The contract address.
 * @param abi            The contract ABI.
 * @param calls          Array of { functionName, args? } descriptors.
 * @returns              Array of results, one per call.
 */
export async function multicallSameTarget<T = unknown>(
  provider: ethers.Provider,
  target: string,
  abi: InterfaceAbi,
  calls: { functionName: string; args?: unknown[] }[],
): Promise<MulticallResult<T>[]> {
  const requests: MulticallRequest[] = calls.map((c) => ({
    target,
    abi,
    functionName: c.functionName,
    args: c.args,
  }));
  return multicall<T>(provider, requests);
}
