/**
 * Multicall3 batching utility for reducing RPC round-trips.
 *
 * Uses the standard Multicall3 contract deployed at the same deterministic
 * address on all major EVM chains. Encodes multiple contract read calls into
 * a single `aggregate3` RPC call and decodes results per-call, with
 * graceful per-call failure handling.
 *
 * Features:
 *   - Batch size limiting (max 50 calls per RPC request) to avoid gas limits.
 *   - Automatic sequential fallback if the Multicall3 call reverts.
 *   - Per-call allowFailure so one revert does not break the batch.
 *
 * @see https://www.multicall3.com/
 */

import { ethers } from 'ethers';
import type { InterfaceAbi } from 'ethers';
import logger from '../logger';
import { isRetryableRpcError } from '../rpc/endpoints';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Multicall3 is deployed at the same deterministic address on 70+ chains
 * including Ethereum, Arbitrum, Optimism, Base, Polygon, Holesky, etc.
 */
export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

/**
 * Maximum number of calls in a single aggregate3 batch.
 * Public RPCs and some nodes have gas limits on eth_call that can be
 * exceeded with very large batches. 50 is a safe default.
 */
const MAX_BATCH_SIZE = 50;

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
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Execute a single batch of requests via Multicall3.
 * This function assumes the batch is already within MAX_BATCH_SIZE.
 */
async function executeBatch<T>(
  provider: ethers.Provider,
  _requests: MulticallRequest[],
  interfaces: ethers.Interface[],
  functionNames: string[],
  calls: { target: string; allowFailure: boolean; callData: string }[],
): Promise<MulticallResult<T>[]> {
  const multicall3 = new ethers.Contract(
    MULTICALL3_ADDRESS,
    MULTICALL3_ABI,
    provider,
  );

  const rawResults: { success: boolean; returnData: string }[] =
    await multicall3.aggregate3.staticCall(calls);

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

/**
 * Execute requests one at a time as a fallback when Multicall3 fails.
 * This handles chains where Multicall3 is not deployed or when the
 * aggregate3 call itself reverts (e.g. due to gas limits).
 */
async function executeSequentialFallback<T>(
  provider: ethers.Provider,
  requests: MulticallRequest[],
): Promise<MulticallResult<T>[]> {
  const ifaceCache = new Map<InterfaceAbi, ethers.Interface>();
  function getIface(abi: InterfaceAbi): ethers.Interface {
    let iface = ifaceCache.get(abi);
    if (!iface) {
      iface = new ethers.Interface(abi);
      ifaceCache.set(abi, iface);
    }
    return iface;
  }

  const results: MulticallResult<T>[] = [];

  for (const req of requests) {
    try {
      const iface = getIface(req.abi);
      const callData = iface.encodeFunctionData(req.functionName, req.args ?? []);
      const rawResult = await provider.call({
        to: req.target,
        data: callData,
      });

      if (!rawResult || rawResult === '0x') {
        results.push({ success: false, data: null });
        continue;
      }

      const decoded = iface.decodeFunctionResult(req.functionName, rawResult);
      const data = decoded.length === 1 ? decoded[0] : decoded;
      results.push({ success: true, data: data as T });
    } catch (error) {
      // Transport / provider failures should trigger higher-level endpoint
      // failover instead of silently looking like contract-level null data.
      if (isRetryableRpcError(error)) {
        throw error;
      }
      results.push({ success: false, data: null });
    }
  }

  return results;
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
 * If the total number of requests exceeds MAX_BATCH_SIZE (50), the
 * calls are split into multiple batches executed sequentially.
 *
 * If the Multicall3 contract call itself fails (e.g. not deployed on
 * the chain), the function falls back to sequential individual calls.
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
  const allCalls: { target: string; allowFailure: boolean; callData: string }[] = [];
  const allInterfaces: ethers.Interface[] = [];
  const allFunctionNames: string[] = [];

  for (const req of requests) {
    const iface = getInterface(req.abi);
    const callData = iface.encodeFunctionData(req.functionName, req.args ?? []);
    allCalls.push({
      target: req.target,
      allowFailure: req.allowFailure !== false, // default true
      callData,
    });
    allInterfaces.push(iface);
    allFunctionNames.push(req.functionName);
  }

  // Split into batches of MAX_BATCH_SIZE and execute.
  try {
    const allResults: MulticallResult<T>[] = [];

    for (let offset = 0; offset < allCalls.length; offset += MAX_BATCH_SIZE) {
      const batchCalls = allCalls.slice(offset, offset + MAX_BATCH_SIZE);
      const batchInterfaces = allInterfaces.slice(offset, offset + MAX_BATCH_SIZE);
      const batchFunctionNames = allFunctionNames.slice(offset, offset + MAX_BATCH_SIZE);
      const batchRequests = requests.slice(offset, offset + MAX_BATCH_SIZE);

      const batchResults = await executeBatch<T>(
        provider,
        batchRequests,
        batchInterfaces,
        batchFunctionNames,
        batchCalls,
      );
      allResults.push(...batchResults);
    }

    return allResults;
  } catch (err: unknown) {
    // Multicall3 failed entirely -- fall back to sequential calls.
    logger.warn(
      '[multicall] aggregate3 failed, falling back to sequential calls:',
      err instanceof Error ? err.message : String(err),
    );
    return executeSequentialFallback<T>(provider, requests);
  }
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
