/**
 * Blockchain contract interaction layer for the tokenization platform.
 *
 * Provides a typed service class that wraps ethers.js contract calls for the
 * WrappedAsset, WrappedAssetFactory, and AssetExchange smart contracts.
 * All write operations obtain a signer automatically; read operations use the
 * provider directly for lower overhead.
 */

import { ethers } from 'ethers';
import { WrappedAssetABI } from '../../contracts/abis/WrappedAsset.ts';
import { WrappedAssetFactoryABI } from '../../contracts/abis/WrappedAssetFactory.ts';
import { AssetExchangeABI } from '../../contracts/abis/AssetExchange.ts';
import { SecurityTokenFactoryABI } from '../../contracts/abis/SecurityTokenFactory.ts';
import { SecurityTokenABI } from '../../contracts/abis/SecurityToken.ts';
import { AssetBackedExchangeABI } from '../../contracts/abis/AssetBackedExchange.ts';
import { LiquidityPoolAMMABI } from '../../contracts/abis/LiquidityPoolAMM.ts';
import { getNetworkConfig, getNetworkMetadata } from '../../contracts/addresses';
import { multicall, multicallSameTarget } from './multicall.ts';
import type { MulticallRequest, MulticallResult } from './multicall.ts';
import {
  getOrderedRpcEndpoints,
  isRetryableRpcError,
  reportRpcEndpointFailure,
  reportRpcEndpointSuccess,
} from '../rpc/endpoints';
import {
  getCached,
  invalidateCacheForAsset as invalidateCacheForAssetGlobal,
  invalidateChainCache,
  makeChainCacheKey,
  setCache,
} from './rpcCache.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssetDetails {
  name: string;
  symbol: string;
  totalSupply: bigint;
  /** bytes32 hex string returned by the contract (e.g. "0xabcd..."). */
  documentHash: string;
  documentType: string;
  originalValue: bigint;
}

/**
 * Aggregated asset information built from on-chain calls to the factory
 * registry and the individual WrappedAsset token. The factory itself does
 * not expose a `getAssetDetails` view, so this data is composed by the
 * service layer.
 */
export interface FactoryAssetDetails {
  creator: string;
  assetAddress: string;
  name: string;
  symbol: string;
  /** bytes32 hex string returned by the contract (e.g. "0xabcd..."). */
  documentHash: string;
  documentType: string;
  originalValue: bigint;
  totalSupply: bigint;
}

/**
 * Represents an order from the AssetExchange contract.
 *
 * The Solidity struct uses `filledSell`, `filledBuy`, and `cancelled` --
 * there is no `status` enum, no `createdAt` timestamp, no `filledAt`, and
 * no `filledBy` address.
 */
export interface Order {
  id: bigint;
  maker: string;
  tokenSell: string;
  tokenBuy: string;
  amountSell: bigint;
  amountBuy: bigint;
  filledSell: bigint;
  filledBuy: bigint;
  cancelled: boolean;
}

/** Details of an ERC-1404 security token from the SecurityTokenFactory. */
export interface SecurityTokenDetails {
  tokenAddress: string;
  transferRulesAddress: string;
  creator: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
  maxTotalSupply: bigint;
  documentHash: string;
  documentType: string;
  originalValue: bigint;
  createdAt: bigint;
}

/** On-chain representation of an AMM liquidity pool. */
export interface Pool {
  token0: string;
  token1: string;
  reserve0: bigint;
  reserve1: bigint;
  totalLiquidity: bigint;
  kLast: bigint;
}

/** Sentinel address representing native ETH in AssetBackedExchange orders. */
export const ETH_SENTINEL = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

/** Check whether a given token address is the ETH sentinel. */
export function isETH(address: string | null): boolean {
  if (!address) return false;
  return address.toLowerCase() === ETH_SENTINEL.toLowerCase();
}

const CUSTOM_ERROR_SELECTOR_MESSAGES: Record<string, string> = {
  // EasyAccessControl (security token)
  '0x54f7a00c': 'Your connected wallet does not have the Wallets Admin role required for this action.',
  '0xc2df30cc': 'Your connected wallet does not have the Contract Admin role required for this action.',
  '0x6570a0de': 'Your connected wallet does not have the Transfer Admin role required for this action.',
  '0xb32a86ea': 'Your connected wallet does not have the Reserve Admin role required for this action.',
  '0xa7829562': 'Your connected wallet needs either Wallets Admin or Reserve Admin role for this action.',
  '0x8a90727a': 'The target address does not currently have the specified role(s).',
  '0xd92e233d': 'A required address parameter cannot be the zero address.',
  '0xd954416a': 'The requested role value is invalid.',

  // Common security-token custom errors
  '0x84bc5401': 'Recipient address cannot be the zero address.',
  '0x66736f63': 'Recipient address cannot be the zero address.',
  '0x4a76e5b5': 'Sender or recipient address cannot be the zero address.',
  '0xc7be2851': 'Mint amount exceeds the max total supply configured for this token.',
  '0xf1b7e15e': 'Insufficient token balance for this action.',
  '0x15c840d8': 'Requested amount exceeds unlocked balance for this address.',
};

function extractErrorDataHex(err: unknown): string | null {
  const candidates: unknown[] = [
    (err as { data?: unknown })?.data,
    (err as { error?: { data?: unknown } })?.error?.data,
    (err as { info?: { error?: { data?: unknown } } })?.info?.error?.data,
    (err as { error?: { error?: { data?: unknown } } })?.error?.error?.data,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && /^0x[0-9a-fA-F]+$/.test(candidate)) {
      return candidate.toLowerCase();
    }
    if (
      candidate &&
      typeof candidate === 'object' &&
      typeof (candidate as { data?: unknown }).data === 'string' &&
      /^0x[0-9a-fA-F]+$/.test((candidate as { data: string }).data)
    ) {
      return (candidate as { data: string }).data.toLowerCase();
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a contract/RPC error into a concise, user-friendly message.
 *
 * ethers v6 wraps Solidity revert reasons, custom errors, and RPC failures
 * inside nested error objects.  This function digs out the actionable reason
 * and maps common patterns to clear text.
 */
export function parseContractError(err: unknown): string {
  // 1. Try to extract the Solidity revert reason from ethers v6 error types.
  const revertReason =
    (err as { reason?: string })?.reason ??
    (err as { error?: { message?: string } })?.error?.message ??
    (err as { data?: { message?: string } })?.data?.message;

  // 2. Map known Solidity revert strings / custom error names.
  const reason = revertReason ?? (err instanceof Error ? err.message : String(err));
  const errorData = extractErrorDataHex(err);

  if (errorData && errorData.length >= 10) {
    const selector = errorData.slice(0, 10);
    const mapped = CUSTOM_ERROR_SELECTOR_MESSAGES[selector];
    if (mapped) return mapped;
  }

  if (/DoesNotHaveWalletsAdminRole/i.test(reason)) {
    return 'Your connected wallet does not have the Wallets Admin role required for this action.';
  }

  if (/DoesNotHaveContractAdminRole/i.test(reason)) {
    return 'Your connected wallet does not have the Contract Admin role required for this action.';
  }

  if (/DoesNotHaveTransferAdminRole/i.test(reason)) {
    return 'Your connected wallet does not have the Transfer Admin role required for this action.';
  }

  if (/DoesNotHaveReserveAdminRole/i.test(reason)) {
    return 'Your connected wallet does not have the Reserve Admin role required for this action.';
  }

  if (/DoesNotHaveWalletsOrReserveAdminRole/i.test(reason)) {
    return 'Your connected wallet needs either Wallets Admin or Reserve Admin role for this action.';
  }

  // User rejected from wallet
  if (/user (rejected|denied)|ACTION_REJECTED/i.test(reason)) {
    return 'Transaction was rejected in your wallet.';
  }

  // Insufficient funds / balance
  if (/insufficient funds|INSUFFICIENT_FUNDS/i.test(reason)) {
    return 'Insufficient funds to cover the transaction and gas fees.';
  }

  // Nonce too low (stale nonce from pending tx)
  if (/nonce.*too low|NONCE_EXPIRED/i.test(reason)) {
    return 'Transaction nonce conflict. Please wait for your pending transaction to confirm, then try again.';
  }

  // Gas estimation failed (generic revert without reason string)
  if (/cannot estimate gas|UNPREDICTABLE_GAS_LIMIT/i.test(reason)) {
    return 'Transaction would fail on-chain. Please check your inputs and balances.';
  }

  // RPC rate limiting
  if (/rate limit|429|too many requests/i.test(reason)) {
    return 'Network is busy (rate limited). Please wait a moment and try again.';
  }

  // RPC endpoint circuit-breaker/cooldown messages from upstream providers
  if (/rpc endpoint returned too many errors|retrying in|different rpc endpoint/i.test(reason)) {
    return 'RPC endpoint is temporarily overloaded. Please retry in a few seconds.';
  }

  // RPC timeout
  if (/timeout|ETIMEDOUT|ECONNREFUSED/i.test(reason)) {
    return 'Network request timed out. Please check your internet connection and try again.';
  }

  // Revert with reason string
  if (/execution reverted/i.test(reason)) {
    // Try to extract the actual revert string
    const revertMatch = reason.match(/reverted(?:\s+with\s+reason\s+string\s+)?['":]?\s*(.+?)['"]?$/i);
    if (revertMatch && revertMatch[1]) {
      const cleanReason = revertMatch[1].replace(/^['"]|['"]$/g, '').trim();
      if (cleanReason.length > 0 && cleanReason.length < 200) {
        return `Transaction reverted: ${cleanReason}`;
      }
    }
    if (/unknown custom error/i.test(reason) && errorData) {
      return `Transaction reverted with custom contract error (${errorData.slice(0, 10)}).`;
    }
    return 'Transaction would revert on-chain. Please check your inputs and permissions and try again.';
  }

  // Transfer amount exceeds balance
  if (/transfer amount exceeds balance|ERC20InsufficientBalance/i.test(reason)) {
    return 'Token transfer amount exceeds your available balance.';
  }

  // Allowance exceeded
  if (/insufficient allowance|ERC20InsufficientAllowance/i.test(reason)) {
    return 'Token allowance is insufficient. Please approve a higher amount.';
  }

  // Fallback: return the reason if it is short enough, otherwise generic
  if (reason && reason.length < 200 && !reason.includes('0x')) {
    return reason;
  }

  return 'Transaction failed. Please try again or check your wallet for details.';
}

/**
 * Encode a document hash string into a bytes32 value suitable for the
 * factory's `createWrappedAsset` parameter.
 *
 * - If the input is already a 66-character hex string (0x + 64 hex chars),
 *   it is returned as-is (already valid bytes32).
 * - If it is a shorter hex string, it is zero-padded to 32 bytes.
 * - Otherwise the input is hashed with keccak256 to produce a bytes32 value.
 */
export function encodeDocumentHash(input: string): string {
  // Already a full-length bytes32 hex string
  if (/^0x[0-9a-fA-F]{64}$/.test(input)) {
    return input;
  }
  // Shorter hex string -- zero-pad to 32 bytes on the right.
  // ethers v6 zeroPadBytes requires even-length hex data (whole bytes), so
  // we must ensure the hex portion has an even number of characters.
  if (/^0x[0-9a-fA-F]+$/.test(input) && input.length <= 66) {
    const evenInput =
      (input.length - 2) % 2 !== 0
        ? `0x0${input.slice(2)}`
        : input;
    return ethers.zeroPadBytes(evenInput, 32);
  }
  // Arbitrary string -- hash it to get a deterministic bytes32
  return ethers.keccak256(ethers.toUtf8Bytes(input));
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ContractService {
  private provider: ethers.BrowserProvider;
  private signer: ethers.Signer | null = null;
  private chainId: number;
  private readProviders: Map<string, ethers.JsonRpcProvider>;

  constructor(provider: ethers.BrowserProvider, chainId: number) {
    this.provider = provider;
    this.chainId = chainId;
    this.readProviders = new Map();
  }

  private cacheKey(key: string): string {
    return makeChainCacheKey(this.chainId, key);
  }

  private invalidateCachePrefix(prefix?: string): void {
    invalidateChainCache(this.chainId, prefix);
  }

  private invalidateAssetCache(assetAddress: string): void {
    invalidateCacheForAssetGlobal(assetAddress, this.chainId);
  }

  // -----------------------------------------------------------------------
  // Signer
  // -----------------------------------------------------------------------

  /**
   * Obtain the connected signer.
   *
   * The signer is always fetched fresh from the provider so that account
   * changes in the wallet (e.g. MetaMask account switch) are picked up
   * immediately. BrowserProvider.getSigner() is cheap -- it does not
   * trigger a new user approval prompt.
   */
  async getSigner(): Promise<ethers.Signer> {
    this.signer = await this.provider.getSigner();
    return this.signer;
  }

  private getReadProvider(endpoint: string): ethers.JsonRpcProvider {
    const cached = this.readProviders.get(endpoint);
    if (cached) return cached;

    const provider = new ethers.JsonRpcProvider(endpoint, this.chainId);
    this.readProviders.set(endpoint, provider);
    return provider;
  }

  private async withReadProvider<T>(
    callback: (provider: ethers.Provider) => Promise<T>,
  ): Promise<T> {
    const endpoints = getOrderedRpcEndpoints(this.chainId);
    if (endpoints.length === 0) {
      return callback(this.provider);
    }

    let lastError: unknown = null;
    for (const endpoint of endpoints) {
      const readProvider = this.getReadProvider(endpoint);
      try {
        const result = await callback(readProvider);
        reportRpcEndpointSuccess(this.chainId, endpoint);
        return result;
      } catch (error) {
        lastError = error;
        if (isRetryableRpcError(error)) {
          reportRpcEndpointFailure(this.chainId, endpoint);
          continue;
        }
        throw error;
      }
    }

    if (lastError) {
      throw lastError;
    }
    return callback(this.provider);
  }

  // -----------------------------------------------------------------------
  // Contract accessors
  // -----------------------------------------------------------------------

  /**
   * Return an ethers Contract instance bound to the deployed
   * WrappedAssetFactory on the current chain.
   */
  getFactoryContract(
    signerOrProvider?: ethers.Signer | ethers.Provider,
  ): ethers.Contract {
    const config = getNetworkConfig(this.chainId);
    if (!config || !config.factoryAddress) {
      throw new Error(`Factory not deployed on chain ${this.chainId}`);
    }
    return new ethers.Contract(
      config.factoryAddress,
      WrappedAssetFactoryABI,
      signerOrProvider || this.provider,
    );
  }

  /**
   * Return an ethers Contract instance bound to the deployed
   * AssetExchange on the current chain.
   */
  getExchangeContract(
    signerOrProvider?: ethers.Signer | ethers.Provider,
  ): ethers.Contract {
    const config = getNetworkConfig(this.chainId);
    if (!config || !config.exchangeAddress) {
      throw new Error(`Exchange not deployed on chain ${this.chainId}`);
    }
    return new ethers.Contract(
      config.exchangeAddress,
      AssetExchangeABI,
      signerOrProvider || this.provider,
    );
  }

  /**
   * Return an ethers Contract instance for a specific WrappedAsset token
   * at the given address.
   */
  getAssetContract(
    address: string,
    signerOrProvider?: ethers.Signer | ethers.Provider,
  ): ethers.Contract {
    return new ethers.Contract(
      address,
      WrappedAssetABI,
      signerOrProvider || this.provider,
    );
  }

  /**
   * Return an ethers Contract instance bound to the deployed
   * SecurityTokenFactory on the current chain.
   */
  getSecurityTokenFactoryContract(
    signerOrProvider?: ethers.Signer | ethers.Provider,
  ): ethers.Contract {
    const config = getNetworkConfig(this.chainId);
    if (!config || !config.securityTokenFactoryAddress) {
      throw new Error(`SecurityTokenFactory not deployed on chain ${this.chainId}`);
    }
    return new ethers.Contract(
      config.securityTokenFactoryAddress,
      SecurityTokenFactoryABI,
      signerOrProvider || this.provider,
    );
  }

  /**
   * Return an ethers Contract instance for a specific ERC-1404 security token.
   */
  getSecurityTokenContract(
    address: string,
    signerOrProvider?: ethers.Signer | ethers.Provider,
  ): ethers.Contract {
    return new ethers.Contract(
      address,
      SecurityTokenABI,
      signerOrProvider || this.provider,
    );
  }

  /**
   * Return an ethers Contract instance bound to the deployed
   * AssetBackedExchange on the current chain.
   */
  getAssetBackedExchangeContract(
    signerOrProvider?: ethers.Signer | ethers.Provider,
  ): ethers.Contract {
    const config = getNetworkConfig(this.chainId);
    if (!config || !config.assetBackedExchangeAddress) {
      throw new Error(`AssetBackedExchange not deployed on chain ${this.chainId}`);
    }
    return new ethers.Contract(
      config.assetBackedExchangeAddress,
      AssetBackedExchangeABI,
      signerOrProvider || this.provider,
    );
  }

  // -----------------------------------------------------------------------
  // Factory write operations
  // -----------------------------------------------------------------------

  /**
   * Deploy a new WrappedAsset token through the factory contract.
   * The caller must be connected via a signer (wallet).
   *
   * `documentHash` is automatically encoded to bytes32:
   *   - A 66-char hex string (0x + 64 hex digits) is passed through as-is.
   *   - Any other string is hashed via keccak256 to produce a bytes32 value.
   */
  async createWrappedAsset(
    name: string,
    symbol: string,
    documentHash: string,
    documentType: string,
    originalValue: bigint,
    mintAmount: bigint,
    recipient: string,
  ): Promise<ethers.ContractTransactionResponse> {
    const signer = await this.getSigner();
    const factory = this.getFactoryContract(signer);

    this.validateAddress(recipient, 'recipient');

    // The Solidity factory expects bytes32 for documentHash. Encode the
    // caller-provided string (which may be a plain hash, a hex string, or an
    // arbitrary label) into a proper bytes32 value.
    const encodedHash = encodeDocumentHash(documentHash);

    const tx = await this.executeWrite(factory, 'createWrappedAsset', [
      name,
      symbol,
      encodedHash,
      documentType,
      originalValue,
      mintAmount,
      recipient,
    ]);
    this.invalidateCachePrefix('factory:');
    return tx;
  }

  // -----------------------------------------------------------------------
  // Factory read operations
  // -----------------------------------------------------------------------

  /** Retrieve all asset contract addresses created by a specific user. */
  async getUserAssets(userAddress: string): Promise<string[]> {
    this.validateAddress(userAddress, 'user');
    const cacheKey = this.cacheKey(`factory:assets:${userAddress}`);
    const cached = getCached<string[]>(cacheKey);
    if (cached) return cached;
    const factory = this.getFactoryContract();
    try {
      const result = await factory.getUserAssets(userAddress);
      setCache(cacheKey, result as string[]);
      return result;
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch user assets for ${userAddress}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Retrieve the total number of assets created through the factory. */
  async getTotalAssets(): Promise<bigint> {
    const cacheKey = this.cacheKey('factory:totalAssets');
    const cached = getCached<bigint>(cacheKey);
    if (cached !== undefined) return cached;
    const factory = this.getFactoryContract();
    try {
      const result: bigint = await factory.getTotalAssets();
      setCache(cacheKey, result);
      return result;
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch total assets: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Retrieve the asset address at a given index in the factory's global list. */
  async getAssetAtIndex(index: bigint | number): Promise<string> {
    const factory = this.getFactoryContract();
    try {
      return await factory.getAssetAtIndex(index);
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch asset at index ${index}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Retrieve detailed metadata for an asset by composing on-chain data
   * from the individual WrappedAsset token contract and the factory's
   * `AssetCreated` event log.
   *
   * NOTE: The Solidity WrappedAssetFactory does NOT have a `getAssetDetails`
   * view function. This method reads the token contract directly and
   * identifies the creator by scanning the factory's AssetCreated events.
   */
  async getFactoryAssetDetails(
    assetAddress: string,
  ): Promise<FactoryAssetDetails> {
    this.validateAddress(assetAddress, 'asset');
    const cacheKey = this.cacheKey(`asset:${assetAddress}:factoryDetails`);
    const cached = getCached<FactoryAssetDetails>(cacheKey);
    if (cached) return cached;

    try {
      // Batch all token property reads into a single RPC call via Multicall3.
      const results = await multicallSameTarget(
        this.provider,
        assetAddress,
        WrappedAssetABI,
        [
          { functionName: 'name' },
          { functionName: 'symbol' },
          { functionName: 'totalSupply' },
          { functionName: 'documentHash' },
          { functionName: 'documentType' },
          { functionName: 'originalValue' },
        ],
      );

      const name = results[0].success ? (results[0].data as string) : '';
      const symbol = results[1].success ? (results[1].data as string) : '';
      const totalSupply = results[2].success ? BigInt(results[2].data as bigint) : 0n;
      const documentHash = results[3].success ? (results[3].data as string) : '';
      const documentType = results[4].success ? (results[4].data as string) : '';
      const originalValue = results[5].success ? BigInt(results[5].data as bigint) : 0n;

      // Attempt to resolve the creator from the factory's AssetCreated event log.
      let creator = ethers.ZeroAddress;
      try {
        const factory = this.getFactoryContract();
        const filter = factory.filters.AssetCreated(null, assetAddress);
        const events = await factory.queryFilter(filter);
        if (events.length > 0) {
          creator = (events[0] as ethers.EventLog).args[0]; // first indexed param = creator
        }
      } catch {
        // Event resolution is best-effort; creator defaults to zero address.
      }

      const result: FactoryAssetDetails = {
        creator,
        assetAddress,
        name,
        symbol,
        documentHash,
        documentType,
        originalValue,
        totalSupply,
      };
      setCache(cacheKey, result);
      return result;
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch asset details for ${assetAddress}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Asset read operations
  // -----------------------------------------------------------------------

  /** Aggregate key details directly from a WrappedAsset token contract. */
  async getAssetDetails(assetAddress: string): Promise<AssetDetails> {
    this.validateAddress(assetAddress, 'asset');
    const cacheKey = this.cacheKey(`asset:${assetAddress}:details`);
    const cached = getCached<AssetDetails>(cacheKey);
    if (cached) return cached;
    try {
      // Batch all property reads into a single RPC call via Multicall3.
      const results = await multicallSameTarget(
        this.provider,
        assetAddress,
        WrappedAssetABI,
        [
          { functionName: 'name' },
          { functionName: 'symbol' },
          { functionName: 'totalSupply' },
          { functionName: 'documentHash' },
          { functionName: 'documentType' },
          { functionName: 'originalValue' },
        ],
      );

      const result: AssetDetails = {
        name: results[0].success ? (results[0].data as string) : '',
        symbol: results[1].success ? (results[1].data as string) : '',
        totalSupply: results[2].success ? BigInt(results[2].data as bigint) : 0n,
        documentHash: results[3].success ? (results[3].data as string) : '',
        documentType: results[4].success ? (results[4].data as string) : '',
        originalValue: results[5].success ? BigInt(results[5].data as bigint) : 0n,
      };
      setCache(cacheKey, result);
      return result;
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch asset details for ${assetAddress}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Batch-load details for multiple asset addresses in a single RPC call.
   * Uses Multicall3 to read name, symbol, totalSupply, documentHash,
   * documentType, and originalValue for every address in one round-trip.
   */
  async getMultipleAssetDetails(
    assetAddresses: string[],
  ): Promise<(AssetDetails | null)[]> {
    if (assetAddresses.length === 0) return [];

    try {
      const fields = ['name', 'symbol', 'totalSupply', 'documentHash', 'documentType', 'originalValue'] as const;
      const requests: MulticallRequest[] = [];

      for (const addr of assetAddresses) {
        for (const fn of fields) {
          requests.push({
            target: addr,
            abi: WrappedAssetABI,
            functionName: fn,
          });
        }
      }

      const results: MulticallResult[] = await multicall(this.provider, requests);
      const assets: (AssetDetails | null)[] = [];

      for (let i = 0; i < assetAddresses.length; i++) {
        const offset = i * fields.length;
        const nameResult = results[offset];
        const symbolResult = results[offset + 1];
        const totalSupplyResult = results[offset + 2];
        const docHashResult = results[offset + 3];
        const docTypeResult = results[offset + 4];
        const origValueResult = results[offset + 5];

        // If the first call (name) failed, the address is likely invalid.
        if (!nameResult.success) {
          assets.push(null);
          continue;
        }

        assets.push({
          name: nameResult.data as string,
          symbol: symbolResult.success ? (symbolResult.data as string) : '',
          totalSupply: totalSupplyResult.success ? BigInt(totalSupplyResult.data as bigint) : 0n,
          documentHash: docHashResult.success ? (docHashResult.data as string) : '',
          documentType: docTypeResult.success ? (docTypeResult.data as string) : '',
          originalValue: origValueResult.success ? BigInt(origValueResult.data as bigint) : 0n,
        });
      }

      return assets;
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch asset details: ${parseContractError(error)}`,
      );
    }
  }

  /** Get the token balance of a specific address for a WrappedAsset. */
  async getAssetBalance(
    assetAddress: string,
    userAddress: string,
  ): Promise<bigint> {
    this.validateAddress(assetAddress, 'asset');
    this.validateAddress(userAddress, 'user');
    const cacheKey = this.cacheKey(`asset:${assetAddress}:balance:${userAddress}`);
    const cached = getCached<bigint>(cacheKey);
    if (cached !== undefined) return cached;
    const asset = this.getAssetContract(assetAddress);
    try {
      const result: bigint = await asset.balanceOf(userAddress);
      setCache(cacheKey, result);
      return result;
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch balance for ${userAddress} on ${assetAddress}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Get the allowance granted by an owner to a spender. */
  async getAssetAllowance(
    assetAddress: string,
    ownerAddress: string,
    spenderAddress: string,
  ): Promise<bigint> {
    this.validateAddress(assetAddress, 'asset');
    this.validateAddress(ownerAddress, 'owner');
    this.validateAddress(spenderAddress, 'spender');
    const cacheKey = this.cacheKey(`asset:${assetAddress}:allowance:${ownerAddress}:${spenderAddress}`);
    const cached = getCached<bigint>(cacheKey);
    if (cached !== undefined) return cached;
    const asset = this.getAssetContract(assetAddress);
    try {
      const result: bigint = await asset.allowance(ownerAddress, spenderAddress);
      setCache(cacheKey, result);
      return result;
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch allowance for ${ownerAddress}->${spenderAddress} on ${assetAddress}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Asset write operations
  // -----------------------------------------------------------------------

  /** Transfer tokens from the connected wallet to a recipient. */
  async transferAsset(
    assetAddress: string,
    to: string,
    amount: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    this.validateAddress(assetAddress, 'asset');
    this.validateAddress(to, 'recipient');
    const signer = await this.getSigner();
    const asset = this.getAssetContract(assetAddress, signer);
    const tx = await this.executeWrite(asset, 'transfer', [to, amount]);
    this.invalidateAssetCache(assetAddress);
    return tx;
  }

  /** Approve a spender to transfer tokens on behalf of the connected wallet. */
  async approveAsset(
    assetAddress: string,
    spender: string,
    amount: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    this.validateAddress(assetAddress, 'asset');
    this.validateAddress(spender, 'spender');
    const signer = await this.getSigner();
    const asset = this.getAssetContract(assetAddress, signer);
    const tx = await this.executeWrite(asset, 'approve', [spender, amount]);
    this.invalidateAssetCache(assetAddress);
    return tx;
  }

  /** Burn tokens from the connected wallet, permanently removing them. */
  async burnAsset(
    assetAddress: string,
    amount: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    this.validateAddress(assetAddress, 'asset');
    const signer = await this.getSigner();
    const asset = this.getAssetContract(assetAddress, signer);
    const tx = await this.executeWrite(asset, 'burn', [amount]);
    this.invalidateAssetCache(assetAddress);
    return tx;
  }

  // -----------------------------------------------------------------------
  // Exchange write operations
  // -----------------------------------------------------------------------

  /**
   * Place a new limit order on the exchange.
   * The caller sells `amountSell` of `tokenSell` to receive `amountBuy`
   * of `tokenBuy`. The sell-side tokens must be pre-approved for the
   * exchange contract.
   */
  async createOrder(
    tokenSell: string,
    tokenBuy: string,
    amountSell: bigint,
    amountBuy: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    this.validateAddress(tokenSell, 'tokenSell');
    this.validateAddress(tokenBuy, 'tokenBuy');
    const signer = await this.getSigner();
    const exchange = this.getExchangeContract(signer);
    const tx = await this.executeWrite(exchange, 'createOrder', [
      tokenSell,
      tokenBuy,
      amountSell,
      amountBuy,
    ]);
    this.invalidateAssetCache(tokenSell);
    this.invalidateAssetCache(tokenBuy);
    return tx;
  }

  /**
   * Fill an existing open order. The caller becomes the taker.
   *
   * The Solidity function signature is:
   *   `fillOrder(uint256 orderId, uint256 fillAmountBuy)`
   *
   * `fillAmountBuy` is the amount of the order's buy-side token that the
   * taker is providing. The proportional sell-side amount is calculated
   * on-chain.
   */
  async fillOrder(
    orderId: bigint,
    fillAmountBuy: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    const signer = await this.getSigner();
    const exchange = this.getExchangeContract(signer);
    const tx = await this.executeWrite(exchange, 'fillOrder', [orderId, fillAmountBuy]);
    this.invalidateCachePrefix('asset:');
    return tx;
  }

  /** Cancel an open order. Only the original maker can cancel. */
  async cancelOrder(
    orderId: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    const signer = await this.getSigner();
    const exchange = this.getExchangeContract(signer);
    const tx = await this.executeWrite(exchange, 'cancelOrder', [orderId]);
    this.invalidateCachePrefix('asset:');
    return tx;
  }

  // -----------------------------------------------------------------------
  // Exchange read operations
  // -----------------------------------------------------------------------

  /**
   * Retrieve all active orders for a given directed trading pair
   * (tokenSell -> tokenBuy).
   */
  async getOrders(tokenSell: string, tokenBuy: string): Promise<Order[]> {
    this.validateAddress(tokenSell, 'tokenSell');
    this.validateAddress(tokenBuy, 'tokenBuy');
    const exchange = this.getExchangeContract();
    try {
      const raw = await exchange.getOrders(tokenSell, tokenBuy);
      return raw.map((r: Record<string, unknown>) => this.parseOrder(r));
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch orders for pair ${tokenSell}/${tokenBuy}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Retrieve a single order by its ID. */
  async getOrder(orderId: bigint): Promise<Order> {
    const exchange = this.getExchangeContract();
    try {
      const raw = await exchange.getOrder(orderId);
      return this.parseOrder(raw);
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch order ${orderId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Retrieve all order IDs ever created by a user.
   *
   * NOTE: The Solidity AssetExchange contract does NOT have a `getUserOrders`
   * view function. This method scans the `OrderCreated` event log for orders
   * where the maker matches the given address.
   */
  async getUserOrders(userAddress: string): Promise<bigint[]> {
    this.validateAddress(userAddress, 'user');
    const exchange = this.getExchangeContract();
    try {
      const filter = exchange.filters.OrderCreated(null, userAddress);
      const events = await exchange.queryFilter(filter);
      return events.map((e) => (e as ethers.EventLog).args[0] as bigint);
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch orders for user ${userAddress}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Security Token Factory write operations
  // -----------------------------------------------------------------------

  /**
   * Deploy a new ERC-1404 compliant security token through the factory.
   * Creates both a TransferRules contract and a RestrictedSwap token with
   * built-in lockups, dividends, and atomic swap capabilities.
   *
   * The on-chain factory uses a SecurityTokenDeployer pattern: the caller
   * must supply the creation bytecodes for the TransferRules and
   * RestrictedSwap contracts. These are passed as the first two parameters
   * (`rulesBytecode` and `swapBytecode`) and forwarded verbatim to the
   * deployer.
   */
  async createSecurityToken(
    rulesBytecode: string,
    swapBytecode: string,
    name: string,
    symbol: string,
    decimals: number,
    totalSupply: bigint,
    maxTotalSupply: bigint,
    documentHash: string,
    documentType: string,
    originalValue: bigint,
    minTimelockAmount: bigint,
    maxReleaseDelay: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    const signer = await this.getSigner();
    const factory = this.getSecurityTokenFactoryContract(signer);

    const encodedHash = encodeDocumentHash(documentHash);

    const tx = await this.executeWrite(factory, 'createSecurityToken', [
      rulesBytecode,
      swapBytecode,
      name,
      symbol,
      decimals,
      totalSupply,
      maxTotalSupply,
      encodedHash,
      documentType,
      originalValue,
      minTimelockAmount,
      maxReleaseDelay,
    ]);
    this.invalidateCachePrefix('factory:');
    return tx;
  }

  // -----------------------------------------------------------------------
  // Security Token Factory read operations
  // -----------------------------------------------------------------------

  /** Get all security token addresses created by a user. */
  async getUserSecurityTokens(userAddress: string): Promise<string[]> {
    this.validateAddress(userAddress, 'user');
    const factory = this.getSecurityTokenFactoryContract();
    try {
      return await factory.getUserTokens(userAddress);
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch security tokens for user: ${parseContractError(error)}`,
      );
    }
  }

  /** Get total number of security tokens deployed through the factory. */
  async getTotalSecurityTokens(): Promise<bigint> {
    const factory = this.getSecurityTokenFactoryContract();
    try {
      return await factory.getTotalTokens();
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch total security tokens: ${parseContractError(error)}`,
      );
    }
  }

  /** Get full details of a security token by its address. */
  async getSecurityTokenDetails(tokenAddress: string): Promise<SecurityTokenDetails> {
    this.validateAddress(tokenAddress, 'token');
    const cacheKey = this.cacheKey(`asset:${tokenAddress}:securityDetails`);
    const cached = getCached<SecurityTokenDetails>(cacheKey);
    if (cached) return cached;
    const factory = this.getSecurityTokenFactoryContract();
    try {
      const raw = await factory.getTokenDetails(tokenAddress);
      const result: SecurityTokenDetails = {
        tokenAddress: raw.tokenAddress ?? tokenAddress,
        transferRulesAddress: raw.transferRulesAddress ?? ethers.ZeroAddress,
        creator: raw.creator ?? ethers.ZeroAddress,
        name: raw.name ?? '',
        symbol: raw.symbol ?? '',
        decimals: Number(raw.decimals ?? 18),
        totalSupply: BigInt(raw.totalSupply ?? 0),
        maxTotalSupply: BigInt(raw.maxTotalSupply ?? 0),
        documentHash: raw.documentHash ?? '',
        documentType: raw.documentType ?? '',
        originalValue: BigInt(raw.originalValue ?? 0),
        createdAt: BigInt(raw.createdAt ?? 0),
      };
      setCache(cacheKey, result);
      return result;
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch security token details: ${parseContractError(error)}`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Security Token operations (on individual tokens)
  // -----------------------------------------------------------------------

  /** Get the balance of a security token for a specific address. */
  async getSecurityTokenBalance(tokenAddress: string, userAddress: string): Promise<bigint> {
    this.validateAddress(tokenAddress, 'token');
    this.validateAddress(userAddress, 'user');
    const token = this.getSecurityTokenContract(tokenAddress);
    try {
      return await token.balanceOf(userAddress);
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch security token balance: ${parseContractError(error)}`,
      );
    }
  }

  /** Get the unlocked (transferable) balance of a security token. */
  async getSecurityTokenUnlockedBalance(tokenAddress: string, userAddress: string): Promise<bigint> {
    this.validateAddress(tokenAddress, 'token');
    this.validateAddress(userAddress, 'user');
    const token = this.getSecurityTokenContract(tokenAddress);
    try {
      return await token.unlockedBalanceOf(userAddress);
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch unlocked balance: ${parseContractError(error)}`,
      );
    }
  }

  /** Get the locked balance of a security token. */
  async getSecurityTokenLockedBalance(tokenAddress: string, userAddress: string): Promise<bigint> {
    this.validateAddress(tokenAddress, 'token');
    this.validateAddress(userAddress, 'user');
    const token = this.getSecurityTokenContract(tokenAddress);
    try {
      return await token.lockedAmountOf(userAddress);
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch locked balance: ${parseContractError(error)}`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Asset-Backed Exchange write operations (ETH/BTC/ERC-20 trading)
  // -----------------------------------------------------------------------

  /**
   * Create a limit order selling an ERC-20 token for another token.
   * The sell token must be pre-approved for the exchange contract.
   */
  async createExchangeOrder(
    tokenSell: string,
    tokenBuy: string,
    amountSell: bigint,
    amountBuy: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    this.validateAddress(tokenSell, 'tokenSell');
    this.validateAddress(tokenBuy, 'tokenBuy');
    const signer = await this.getSigner();
    const exchange = this.getAssetBackedExchangeContract(signer);
    const tx = await this.executeWrite(exchange, 'createOrder', [
      tokenSell, tokenBuy, amountSell, amountBuy,
    ]);
    this.invalidateAssetCache(tokenSell);
    this.invalidateAssetCache(tokenBuy);
    return tx;
  }

  /**
   * Create a limit order selling native ETH for an ERC-20 token.
   */
  async createExchangeOrderSellETH(
    tokenBuy: string,
    amountBuy: bigint,
    ethAmount: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    this.validateAddress(tokenBuy, 'tokenBuy');
    const signer = await this.getSigner();
    const exchange = this.getAssetBackedExchangeContract(signer);
    const tx = await this.executeWrite(exchange, 'createOrderSellETH', [tokenBuy, amountBuy], {
      value: ethAmount,
    });
    this.invalidateAssetCache(tokenBuy);
    return tx;
  }

  /** Fill an exchange order by providing the buy-side ERC-20 token. */
  async fillExchangeOrder(
    orderId: bigint,
    fillAmountBuy: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    const signer = await this.getSigner();
    const exchange = this.getAssetBackedExchangeContract(signer);
    const tx = await this.executeWrite(exchange, 'fillOrder', [orderId, fillAmountBuy]);
    this.invalidateCachePrefix('asset:');
    return tx;
  }

  /** Fill an exchange order with native ETH (for orders where tokenBuy is ETH). */
  async fillExchangeOrderWithETH(
    orderId: bigint,
    ethAmount: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    const signer = await this.getSigner();
    const exchange = this.getAssetBackedExchangeContract(signer);
    const tx = await this.executeWrite(exchange, 'fillOrderWithETH', [orderId], {
      value: ethAmount,
    });
    this.invalidateCachePrefix('asset:');
    return tx;
  }

  /** Cancel an exchange order on the asset-backed exchange. */
  async cancelExchangeOrder(
    orderId: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    const signer = await this.getSigner();
    const exchange = this.getAssetBackedExchangeContract(signer);
    const tx = await this.executeWrite(exchange, 'cancelOrder', [orderId]);
    this.invalidateCachePrefix('asset:');
    return tx;
  }

  /** Withdraw credited ETH from cancelled sell-ETH orders. */
  async withdrawExchangeEth(): Promise<ethers.ContractTransactionResponse> {
    const signer = await this.getSigner();
    const exchange = this.getAssetBackedExchangeContract(signer);
    return this.executeWrite(exchange, 'withdrawEth', []);
  }

  /** Approve the asset-backed exchange to spend a token. */
  async approveAssetBackedExchange(
    assetAddress: string,
    amount: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    const config = getNetworkConfig(this.chainId);
    if (!config || !config.assetBackedExchangeAddress) {
      throw new Error(`AssetBackedExchange not deployed on chain ${this.chainId}`);
    }
    return this.approveAsset(assetAddress, config.assetBackedExchangeAddress, amount);
  }

  // -----------------------------------------------------------------------
  // Asset-Backed Exchange read operations
  // -----------------------------------------------------------------------

  /** Get an order from the asset-backed exchange. */
  async getExchangeOrder(orderId: bigint): Promise<Order> {
    const exchange = this.getAssetBackedExchangeContract();
    try {
      const raw = await exchange.getOrder(orderId);
      return this.parseOrder(raw);
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch order #${orderId}: ${parseContractError(error)}`,
      );
    }
  }

  /** Get all order IDs for a user on the asset-backed exchange. */
  async getExchangeUserOrders(userAddress: string): Promise<bigint[]> {
    this.validateAddress(userAddress, 'user');
    const exchange = this.getAssetBackedExchangeContract();
    try {
      return await exchange.getUserOrders(userAddress);
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch your orders: ${parseContractError(error)}`,
      );
    }
  }

  /** Get active orders for a specific trading pair on the asset-backed exchange. */
  async getExchangeActiveOrders(tokenSell: string, tokenBuy: string): Promise<Order[]> {
    const exchange = this.getAssetBackedExchangeContract();
    try {
      const raw = await exchange.getActiveOrders(tokenSell, tokenBuy);
      return raw.map((r: Record<string, unknown>) => this.parseOrder(r));
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch active orders: ${parseContractError(error)}`,
      );
    }
  }

  /** Get order IDs that a user filled as a taker (via OrderFilled events). */
  async getExchangeFilledOrderIds(userAddress: string): Promise<bigint[]> {
    this.validateAddress(userAddress, 'user');
    const exchange = this.getAssetBackedExchangeContract();
    try {
      const filter = exchange.filters.OrderFilled(null, userAddress);

      // Public RPCs limit eth_getLogs range. Query the latest ~50 000 blocks
      // (roughly 1 week on mainnet) to stay within typical provider limits.
      const provider = exchange.runner && 'provider' in exchange.runner
        ? (exchange.runner as { provider: ethers.Provider }).provider
        : null;
      let fromBlock: number | string = 0;
      if (provider) {
        try {
          const latest = await provider.getBlockNumber();
          fromBlock = Math.max(0, latest - 50_000);
        } catch {
          // Fall back to scanning all blocks if we can't get the block number
        }
      }

      const events = await exchange.queryFilter(filter, fromBlock);
      // Deduplicate order IDs (a user can fill the same order multiple times via partial fills)
      const seen = new Set<string>();
      const ids: bigint[] = [];
      for (const e of events) {
        const orderId = (e as ethers.EventLog).args[0] as bigint;
        const key = orderId.toString();
        if (!seen.has(key)) {
          seen.add(key);
          ids.push(orderId);
        }
      }
      return ids;
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch filled orders for user ${userAddress}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Get the ETH balance available for withdrawal from the exchange. */
  async getExchangeEthBalance(userAddress: string): Promise<bigint> {
    this.validateAddress(userAddress, 'user');
    const exchange = this.getAssetBackedExchangeContract();
    try {
      return await exchange.ethBalances(userAddress);
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch withdrawable ETH balance: ${parseContractError(error)}`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // AMM contract accessor
  // -----------------------------------------------------------------------

  /**
   * Return an ethers Contract instance bound to the deployed
   * LiquidityPoolAMM on the current chain.
   */
  getAMMContract(
    signerOrProvider?: ethers.Signer | ethers.Provider,
  ): ethers.Contract {
    const config = getNetworkConfig(this.chainId);
    if (!config || !config.ammAddress) {
      throw new Error(`LiquidityPoolAMM not deployed on chain ${this.chainId}`);
    }
    return new ethers.Contract(
      config.ammAddress,
      LiquidityPoolAMMABI,
      signerOrProvider || this.provider,
    );
  }

  // -----------------------------------------------------------------------
  // AMM write operations
  // -----------------------------------------------------------------------

  /** Create a new liquidity pool for a token pair. */
  async createPool(
    tokenA: string,
    tokenB: string,
  ): Promise<ethers.ContractTransactionResponse> {
    this.validateAddress(tokenA, 'tokenA');
    this.validateAddress(tokenB, 'tokenB');
    const signer = await this.getSigner();
    const amm = this.getAMMContract(signer);
    return this.executeWrite(amm, 'createPool', [tokenA, tokenB]);
  }

  /** Default transaction deadline: 20 minutes from now (in seconds). */
  private _defaultDeadline(): bigint {
    return BigInt(Math.floor(Date.now() / 1000) + 1200);
  }

  /** Add liquidity to an ERC-20 / ERC-20 pool. */
  async addLiquidity(
    tokenA: string,
    tokenB: string,
    amountADesired: bigint,
    amountBDesired: bigint,
    minLiquidity: bigint,
    amountAMin: bigint = 0n,
    amountBMin: bigint = 0n,
    deadline?: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    this.validateAddress(tokenA, 'tokenA');
    this.validateAddress(tokenB, 'tokenB');
    const dl = deadline ?? this._defaultDeadline();
    const signer = await this.getSigner();
    const amm = this.getAMMContract(signer);
    const tx = await this.executeWrite(amm, 'addLiquidity', [
      tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin, minLiquidity, dl,
    ]);
    this.invalidateAssetCache(tokenA);
    this.invalidateAssetCache(tokenB);
    this.invalidateCachePrefix('amm:');
    return tx;
  }

  /** Add liquidity to an ETH / ERC-20 pool. */
  async addLiquidityETH(
    token: string,
    amountToken: bigint,
    minLiquidity: bigint,
    ethAmount: bigint,
    deadline?: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    this.validateAddress(token, 'token');
    const dl = deadline ?? this._defaultDeadline();
    const signer = await this.getSigner();
    const amm = this.getAMMContract(signer);
    const tx = await this.executeWrite(amm, 'addLiquidityETH', [
      token, amountToken, minLiquidity, dl,
    ], { value: ethAmount });
    this.invalidateAssetCache(token);
    this.invalidateCachePrefix('amm:');
    return tx;
  }

  /** Remove liquidity from an ERC-20 / ERC-20 pool. */
  async removeLiquidity(
    tokenA: string,
    tokenB: string,
    liquidity: bigint,
    minA: bigint,
    minB: bigint,
    deadline?: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    this.validateAddress(tokenA, 'tokenA');
    this.validateAddress(tokenB, 'tokenB');
    const dl = deadline ?? this._defaultDeadline();
    const signer = await this.getSigner();
    const amm = this.getAMMContract(signer);
    const tx = await this.executeWrite(amm, 'removeLiquidity', [
      tokenA, tokenB, liquidity, minA, minB, dl,
    ]);
    this.invalidateAssetCache(tokenA);
    this.invalidateAssetCache(tokenB);
    this.invalidateCachePrefix('amm:');
    return tx;
  }

  /** Remove liquidity from an ETH / ERC-20 pool. */
  async removeLiquidityETH(
    token: string,
    liquidity: bigint,
    minToken: bigint,
    minETH: bigint,
    deadline?: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    this.validateAddress(token, 'token');
    const dl = deadline ?? this._defaultDeadline();
    const signer = await this.getSigner();
    const amm = this.getAMMContract(signer);
    const tx = await this.executeWrite(amm, 'removeLiquidityETH', [
      token, liquidity, minToken, minETH, dl,
    ]);
    this.invalidateAssetCache(token);
    this.invalidateCachePrefix('amm:');
    return tx;
  }

  /** Swap ERC-20 for ERC-20 through the AMM. */
  async swapAMM(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    minAmountOut: bigint,
    deadline?: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    this.validateAddress(tokenIn, 'tokenIn');
    this.validateAddress(tokenOut, 'tokenOut');
    const dl = deadline ?? this._defaultDeadline();
    const signer = await this.getSigner();
    const amm = this.getAMMContract(signer);
    const tx = await this.executeWrite(amm, 'swap', [
      tokenIn, tokenOut, amountIn, minAmountOut, dl,
    ]);
    this.invalidateAssetCache(tokenIn);
    this.invalidateAssetCache(tokenOut);
    this.invalidateCachePrefix('amm:');
    return tx;
  }

  /** Swap native ETH for an ERC-20 token via the AMM. */
  async swapETHForToken(
    token: string,
    minAmountOut: bigint,
    ethAmount: bigint,
    deadline?: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    this.validateAddress(token, 'token');
    const dl = deadline ?? this._defaultDeadline();
    const signer = await this.getSigner();
    const amm = this.getAMMContract(signer);
    const tx = await this.executeWrite(amm, 'swapETHForToken', [
      token, minAmountOut, dl,
    ], { value: ethAmount });
    this.invalidateAssetCache(token);
    this.invalidateCachePrefix('amm:');
    return tx;
  }

  /** Swap an ERC-20 token for native ETH via the AMM. */
  async swapTokenForETH(
    token: string,
    amountIn: bigint,
    minETH: bigint,
    deadline?: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    this.validateAddress(token, 'token');
    const dl = deadline ?? this._defaultDeadline();
    const signer = await this.getSigner();
    const amm = this.getAMMContract(signer);
    const tx = await this.executeWrite(amm, 'swapTokenForETH', [
      token, amountIn, minETH, dl,
    ]);
    this.invalidateAssetCache(token);
    this.invalidateCachePrefix('amm:');
    return tx;
  }

  /** Approve the AMM contract to spend a token. */
  async approveAMM(
    assetAddress: string,
    amount: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    const config = getNetworkConfig(this.chainId);
    if (!config || !config.ammAddress) {
      throw new Error(`LiquidityPoolAMM not deployed on chain ${this.chainId}`);
    }
    return this.approveAsset(assetAddress, config.ammAddress, amount);
  }

  /** Withdraw credited ETH from the AMM contract. */
  async withdrawAMMEth(): Promise<ethers.ContractTransactionResponse> {
    const signer = await this.getSigner();
    const amm = this.getAMMContract(signer);
    return this.executeWrite(amm, 'withdrawEth', []);
  }

  // -----------------------------------------------------------------------
  // AMM read operations
  // -----------------------------------------------------------------------

  /** Get pool data for a token pair from the AMM. */
  async getAMMPool(tokenA: string, tokenB: string): Promise<Pool> {
    this.validateAddress(tokenA, 'tokenA');
    this.validateAddress(tokenB, 'tokenB');
    const cacheKey = this.cacheKey(`amm:pool:${tokenA}:${tokenB}`);
    const cached = getCached<Pool>(cacheKey);
    if (cached) return cached;
    const amm = this.getAMMContract();
    try {
      const raw = await amm.getPool(tokenA, tokenB);
      const result: Pool = {
        token0: raw.token0 ?? ethers.ZeroAddress,
        token1: raw.token1 ?? ethers.ZeroAddress,
        reserve0: BigInt(raw.reserve0 ?? 0),
        reserve1: BigInt(raw.reserve1 ?? 0),
        totalLiquidity: BigInt(raw.totalLiquidity ?? 0),
        kLast: BigInt(raw.kLast ?? 0),
      };
      setCache(cacheKey, result);
      return result;
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch AMM pool data: ${parseContractError(error)}`,
      );
    }
  }

  /** Get LP balance for a user in a specific AMM pool. */
  async getAMMLiquidityBalance(
    tokenA: string,
    tokenB: string,
    provider: string,
  ): Promise<bigint> {
    this.validateAddress(tokenA, 'tokenA');
    this.validateAddress(tokenB, 'tokenB');
    this.validateAddress(provider, 'provider');
    const amm = this.getAMMContract();
    try {
      return await amm.getLiquidityBalance(tokenA, tokenB, provider);
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch LP balance: ${parseContractError(error)}`,
      );
    }
  }

  /** Get expected output for a swap via the AMM. */
  async getAMMQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
  ): Promise<bigint> {
    this.validateAddress(tokenIn, 'tokenIn');
    this.validateAddress(tokenOut, 'tokenOut');
    const amm = this.getAMMContract();
    try {
      return await amm.quote(tokenIn, tokenOut, amountIn);
    } catch (error: unknown) {
      throw new Error(
        `Failed to get swap quote: ${parseContractError(error)}`,
      );
    }
  }

  /** Get withdrawable ETH balance from the AMM contract. */
  async getAMMEthBalance(userAddress: string): Promise<bigint> {
    this.validateAddress(userAddress, 'user');
    const amm = this.getAMMContract();
    try {
      return await amm.ethBalances(userAddress);
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch AMM ETH balance: ${parseContractError(error)}`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Utilities
  // -----------------------------------------------------------------------

  /**
   * Approve the exchange contract to spend a given amount of a token
   * on behalf of the connected wallet. This is a convenience wrapper
   * commonly needed before placing a sell order.
   */
  async approveExchange(
    assetAddress: string,
    amount: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    const config = getNetworkConfig(this.chainId);
    if (!config || !config.exchangeAddress) {
      throw new Error(`Exchange not deployed on chain ${this.chainId}`);
    }
    return this.approveAsset(assetAddress, config.exchangeAddress, amount);
  }

  /**
   * Wait for a transaction to be mined and return the receipt.
   * Throws if the transaction reverts.
   */
  async waitForTransaction(
    tx: ethers.ContractTransactionResponse,
    confirmations = 1,
  ): Promise<ethers.TransactionReceipt> {
    const receipt = await tx.wait(confirmations);
    if (!receipt) {
      throw new Error('Transaction receipt is null');
    }
    if (receipt.status === 0) {
      throw new Error(`Transaction reverted: ${tx.hash}`);
    }
    return receipt;
  }

  /**
   * Validate that a string is a well-formed Ethereum address.
   * Throws a descriptive error instead of letting ethers produce a
   * low-level "invalid address" deep inside an RPC call.
   */
  private validateAddress(address: string, label: string): void {
    if (!ethers.isAddress(address)) {
      throw new Error(`Invalid ${label} address: ${address}`);
    }
  }

  /**
   * Execute a write transaction with upfront gas estimation.
   *
   * Gas estimation serves as a dry-run: if the transaction would revert,
   * the estimateGas call fails first with a descriptive Solidity error.
   * On transient RPC overload failures, this method retries via configured
   * fallback endpoints and wallet RPC reconfiguration before surfacing an error.
   */
  private resolveContractAddress(contract: ethers.Contract): string {
    const target = contract.target;
    if (typeof target === 'string' && ethers.isAddress(target)) {
      return target;
    }
    throw new Error('Unable to resolve contract target address');
  }

  private getWalletChainParams(preferredRpcUrl?: string): {
    chainId: string;
    chainName: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    rpcUrls: string[];
    blockExplorerUrls?: string[];
  } {
    const metadata = getNetworkMetadata(this.chainId);
    const orderedEndpoints = getOrderedRpcEndpoints(this.chainId);
    const rpcUrls = preferredRpcUrl
      ? [preferredRpcUrl, ...orderedEndpoints.filter((endpoint) => endpoint !== preferredRpcUrl)]
      : orderedEndpoints;

    return {
      chainId: ethers.toQuantity(this.chainId),
      chainName: metadata?.name ?? `Chain ${this.chainId}`,
      nativeCurrency: metadata?.nativeCurrency ?? {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
      },
      rpcUrls,
      ...(metadata?.blockExplorer ? { blockExplorerUrls: [metadata.blockExplorer] } : {}),
    };
  }

  private async reconfigureWalletRpc(preferredRpcUrl: string): Promise<void> {
    const params = this.getWalletChainParams(preferredRpcUrl);
    const chainRef = { chainId: params.chainId };

    try {
      await this.provider.send('wallet_addEthereumChain', [params]);
    } catch {
      // Ignore add errors; switch may still work if chain already exists.
    }
    await this.provider.send('wallet_switchEthereumChain', [chainRef]);
  }

  private async tryWalletRpcFailoverAndSend(
    signer: ethers.Signer,
    txRequest: ethers.TransactionRequest,
  ): Promise<ethers.ContractTransactionResponse | null> {
    const endpoints = getOrderedRpcEndpoints(this.chainId);
    const fallbackEndpoints = endpoints.slice(1);
    if (fallbackEndpoints.length === 0) return null;

    let lastError: unknown = null;

    for (const endpoint of fallbackEndpoints) {
      try {
        await this.reconfigureWalletRpc(endpoint);
      } catch (error) {
        lastError = error;
        continue;
      }

      try {
        const tx = await signer.sendTransaction(txRequest);
        reportRpcEndpointSuccess(this.chainId, endpoint);
        return tx as unknown as ethers.ContractTransactionResponse;
      } catch (error) {
        lastError = error;
        if (isRetryableRpcError(error)) {
          reportRpcEndpointFailure(this.chainId, endpoint);
          continue;
        }
        throw error;
      }
    }

    if (lastError) {
      throw lastError;
    }
    return null;
  }

  private async signAndBroadcastWithReadRpcFallback(
    signer: ethers.Signer,
    signerAddress: string,
    txRequest: ethers.TransactionRequest,
  ): Promise<ethers.ContractTransactionResponse> {
    const [nonce, feeData] = await Promise.all([
      this.withReadProvider((provider) =>
        provider.getTransactionCount(signerAddress, 'pending'),
      ),
      this.withReadProvider((provider) => provider.getFeeData()),
    ]);

    const signingRequest: ethers.TransactionRequest = {
      ...txRequest,
      chainId: this.chainId,
      nonce,
    };

    const hasEip1559 =
      feeData.maxFeePerGas !== null && feeData.maxPriorityFeePerGas !== null;
    if (hasEip1559) {
      signingRequest.type = 2;
      signingRequest.maxFeePerGas =
        signingRequest.maxFeePerGas ?? feeData.maxFeePerGas ?? undefined;
      signingRequest.maxPriorityFeePerGas =
        signingRequest.maxPriorityFeePerGas ??
        feeData.maxPriorityFeePerGas ??
        undefined;
      delete signingRequest.gasPrice;
    } else if (feeData.gasPrice !== null && signingRequest.gasPrice == null) {
      signingRequest.gasPrice = feeData.gasPrice;
    }

    const signedRawTx = await signer.signTransaction(signingRequest);
    const broadcastTx = await this.withReadProvider((provider) =>
      provider.broadcastTransaction(signedRawTx),
    );
    return broadcastTx as unknown as ethers.ContractTransactionResponse;
  }

  private async estimateGasWithFallback(
    contract: ethers.Contract,
    method: string,
    args: unknown[],
    signerAddress: string,
    overrides?: ethers.Overrides,
  ): Promise<bigint | null> {
    const methodRef = (contract as Record<string, unknown>)[method] as {
      estimateGas: (...params: unknown[]) => Promise<bigint>;
      populateTransaction: (...params: unknown[]) => Promise<ethers.TransactionRequest>;
    } | undefined;

    if (!methodRef || typeof methodRef.estimateGas !== 'function') {
      throw new Error(`Contract method unavailable: ${method}`);
    }

    try {
      return await methodRef.estimateGas(...args, overrides ?? {});
    } catch (error) {
      if (!isRetryableRpcError(error)) {
        throw error;
      }

      const populated = await methodRef.populateTransaction(...args, overrides ?? {});
      const toAddress = (typeof populated.to === 'string' && populated.to) || this.resolveContractAddress(contract);

      try {
        return await this.withReadProvider((readProvider) =>
          readProvider.estimateGas({
            from: signerAddress,
            to: toAddress,
            data: populated.data,
            value: populated.value,
          }),
        );
      } catch (fallbackError) {
        if (!isRetryableRpcError(fallbackError)) {
          throw fallbackError;
        }
        // Fall back to wallet-provided estimation on sendTransaction.
        return null;
      }
    }
  }

  private async executeWrite(
    contract: ethers.Contract,
    method: string,
    args: unknown[],
    overrides?: ethers.Overrides,
  ): Promise<ethers.ContractTransactionResponse> {
    const methodRef = (contract as Record<string, unknown>)[method] as {
      populateTransaction: (...params: unknown[]) => Promise<ethers.TransactionRequest>;
    } | undefined;

    if (!methodRef || typeof methodRef.populateTransaction !== 'function') {
      throw new Error(`Contract method unavailable: ${method}`);
    }

    try {
      const signer = await this.getSigner();
      const signerAddress = await signer.getAddress();
      const populated = await methodRef.populateTransaction(...args, overrides ?? {});
      const toAddress = (typeof populated.to === 'string' && populated.to) || this.resolveContractAddress(contract);

      const gasEstimate = await this.estimateGasWithFallback(
        contract,
        method,
        args,
        signerAddress,
        overrides,
      );

      const txRequest: ethers.TransactionRequest = {
        ...populated,
        ...(overrides ?? {}),
        to: toAddress,
      };

      if (gasEstimate !== null) {
        // 20% buffer: gasEstimate * 120 / 100
        txRequest.gasLimit = (gasEstimate * 120n) / 100n;
      }

      try {
        const tx = await signer.sendTransaction(txRequest);
        return tx as unknown as ethers.ContractTransactionResponse;
      } catch (sendError) {
        if (!isRetryableRpcError(sendError)) {
          throw sendError;
        }

        const failoverTx = await this.tryWalletRpcFailoverAndSend(signer, txRequest);
        if (failoverTx) {
          return failoverTx;
        }
        return await this.signAndBroadcastWithReadRpcFallback(
          signer,
          signerAddress,
          txRequest,
        );
      }
    } catch (err: unknown) {
      // Re-throw with a user-friendly message via parseContractError.
      const userMessage = parseContractError(err);
      throw new Error(userMessage);
    }
  }

  /**
   * Parse a raw order tuple returned from the exchange contract.
   *
   * The Solidity Order struct fields are:
   *   id, maker, tokenSell, tokenBuy, amountSell, amountBuy,
   *   filledSell, filledBuy, cancelled
   */
  private parseOrder(raw: Record<string, unknown>): Order {
    try {
      return {
        id: BigInt(raw.id as string | number | bigint),
        maker: (raw.maker as string) || ethers.ZeroAddress,
        tokenSell: (raw.tokenSell as string) || ethers.ZeroAddress,
        tokenBuy: (raw.tokenBuy as string) || ethers.ZeroAddress,
        amountSell: BigInt(raw.amountSell as string | number | bigint),
        amountBuy: BigInt(raw.amountBuy as string | number | bigint),
        filledSell: BigInt(raw.filledSell as string | number | bigint),
        filledBuy: BigInt(raw.filledBuy as string | number | bigint),
        cancelled: Boolean(raw.cancelled),
      };
    } catch (err: unknown) {
      throw new Error(
        `Failed to parse order data from blockchain. The data may be corrupted or the contract interface has changed.`,
      );
    }
  }
}
