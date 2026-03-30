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
import { LiquidityPoolAMMLegacyABI } from '../../contracts/abis/LiquidityPoolAMMLegacy.ts';
import { getNetworkConfig, getNetworkMetadata } from '../../contracts/addresses';
import { multicall, multicallSameTarget } from './multicall.ts';
import type { MulticallRequest, MulticallResult } from './multicall.ts';
import { multicall as rpcMulticall, multicallSameTarget as rpcMulticallSameTarget } from '../rpc/multicall';
import {
  findHealthyEndpoint,
  getOrderedRpcEndpoints,
  getWalletSwitchRpcUrls,
  isRetryableRpcError,
  reportRpcEndpointFailure,
  reportRpcEndpointSuccess,
  selectRpcEndpoint,
} from '../rpc/endpoints';
import { createReadOnlyRpcProvider } from '../rpc/providers';
import {
  getCached,
  invalidateCacheForAsset as invalidateCacheForAssetGlobal,
  invalidateChainCache,
  makeChainCacheKey,
  setCache,
  TTL_ALLOWANCE,
  TTL_BALANCE,
  TTL_MARKET,
  TTL_MEDIUM,
  TTL_POOL,
} from './rpcCache.ts';
import { dedupeRpcRequest } from '../rpc/requestDedup';
import { getSigner as getStoreSigner } from '../../store/walletStore.ts';
import {
  sendTransactionWithRetry,
  waitForTransactionReceipt,
} from './txExecution.ts';
import { buildBufferedFeeOverrides } from './transactionOverrides';
import { queryRecentLogsBestEffort } from './logQuery';
import logger from '../logger';

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

export interface AssetSnapshot extends AssetDetails {
  address: string;
  balance: bigint;
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
  /** Unix timestamp (seconds) after which the order can no longer be filled. 0 = no expiry. */
  deadline: bigint;
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

export interface SecurityTokenDeploymentGasEstimate {
  gasUnits: bigint;
  gasPriceWei: bigint;
  estimatedCostWei: bigint;
}

export interface WrappedAssetDeploymentGasEstimate {
  gasUnits: bigint;
  gasPriceWei: bigint;
  estimatedCostWei: bigint;
}

type BigNumberishLike = string | number | bigint;

interface RawSecurityTokenDetails {
  tokenAddress?: string;
  transferRulesAddress?: string;
  creator?: string;
  name?: string;
  symbol?: string;
  decimals?: BigNumberishLike;
  totalSupply?: BigNumberishLike;
  maxTotalSupply?: BigNumberishLike;
  documentHash?: string;
  documentType?: string;
  originalValue?: BigNumberishLike;
  createdAt?: BigNumberishLike;
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

interface RawPool {
  token0?: string;
  token1?: string;
  reserve0?: BigNumberishLike;
  reserve1?: BigNumberishLike;
  totalLiquidity?: BigNumberishLike;
  kLast?: BigNumberishLike;
}

const SECURITY_TOKEN_CREATE_MODERN_SIGNATURE =
  'createSecurityToken(bytes,bytes,string,string,uint8,uint256,uint256,bytes32,string,uint256,uint256,uint256)';
const SECURITY_TOKEN_CREATE_LEGACY_SIGNATURE =
  'createSecurityToken(string,string,uint8,uint256,uint256,bytes32,string,uint256,uint256,uint256)';
const SECURITY_TOKEN_CREATE_MODERN_SELECTOR =
  ethers.id(SECURITY_TOKEN_CREATE_MODERN_SIGNATURE).slice(2, 10).toLowerCase();
const SECURITY_TOKEN_CREATE_LEGACY_SELECTOR =
  ethers.id(SECURITY_TOKEN_CREATE_LEGACY_SIGNATURE).slice(2, 10).toLowerCase();
const PAYLOAD_MISMATCH_PATTERN =
  /function selector was not recognized|unknown selector|no matching fragment|unrecognized function selector|selector[^|]*not recognized/i;
const securityTokenCreateSignatureCache = new Map<number, typeof SECURITY_TOKEN_CREATE_MODERN_SIGNATURE | typeof SECURITY_TOKEN_CREATE_LEGACY_SIGNATURE>();

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

  // LiquidityPoolAMM custom errors
  '0x1ab7da6b': 'Transaction deadline has expired. Please try again.',
  '0x8dc525d1': 'Insufficient Token A amount for this pool operation. Try adjusting your amounts or increasing slippage.',
  '0xef71d091': 'Insufficient Token B amount for this pool operation. Try adjusting your amounts or increasing slippage.',
  '0xa01a9df6': 'Insufficient ETH sent for this operation.',
  '0xbb55fd27': 'Insufficient liquidity in the pool for this operation.',
  '0xbb2875c3': 'Output amount is below your minimum. Try increasing slippage tolerance.',
  '0x302e29cb': 'Pool invariant violated — the reserves are in an unexpected state.',
  '0xbd8bc364': 'Invalid constant product (K) — pool state inconsistency detected.',
  '0xd0d04f60': 'No ETH balance available to withdraw from the AMM.',
  '0xf48e3c26': 'A pool already exists for this token pair.',
  '0x76ecffc0': 'No liquidity pool exists for this token pair. Please create the pool first.',
  '0x37ed32e8': 'Reentrancy detected — please wait and try again.',
  '0x201b580a': 'Cannot create a pool with the same token on both sides.',
  '0x90b8ec18': 'Token transfer failed. Check that you have approved sufficient allowance and have enough balance.',
  '0x1f2a2005': 'Amount must be greater than zero.',

  // AssetBackedExchange custom errors
  '0x3e0526e5': 'Insufficient fill amount for this order.',
  '0xb331e421': 'Only the order maker can perform this action.',
  '0x1d4ecc5b': 'This order is no longer active (already filled or cancelled).',
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

function extractErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  const candidate = err as {
    shortMessage?: unknown;
    message?: unknown;
    details?: unknown;
    cause?: unknown;
  };
  if (typeof candidate?.shortMessage === 'string') return candidate.shortMessage;
  if (typeof candidate?.message === 'string') return candidate.message;
  if (typeof candidate?.details === 'string') return candidate.details;
  if (candidate?.cause) return extractErrorMessage(candidate.cause);
  return String(err);
}

/**
 * True when ethers signals an actual on-chain revert (CALL_EXCEPTION) as
 * opposed to a transport / funds error.  These carry the real Solidity
 * reason string or custom error selector and should be surfaced to the user.
 */
function isContractRevertError(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  if (code === 'CALL_EXCEPTION' || code === 'ACTION_REJECTED') return true;
  const message = extractErrorMessage(err);
  return /execution reverted|CALL_EXCEPTION|revert/i.test(message);
}

/**
 * True when the RPC/ethers reports INSUFFICIENT_FUNDS during gas estimation.
 * This can be a genuine balance shortage OR a misleading error wrapping a
 * contract revert — callers should fall through to wallet-native estimation
 * rather than aborting.
 */
function isInsufficientFundsError(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  if (code === 'INSUFFICIENT_FUNDS') return true;
  const message = extractErrorMessage(err);
  return /insufficient funds|INSUFFICIENT_FUNDS/i.test(message);
}

function isUserRejection(err: unknown): boolean {
  const message = extractErrorMessage(err);
  const code = (err as { code?: string | number })?.code;
  return (
    code === 4001 ||
    code === 'ACTION_REJECTED' ||
    /user (rejected|denied)|ACTION_REJECTED/i.test(message)
  );
}


function isValidRpcUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function dedupeRpcUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const raw of urls) {
    const normalized = raw.trim();
    if (!normalized || !isValidRpcUrl(normalized)) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(normalized);
  }
  return deduped;
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
  // Build a combined reason string but also keep the specific revert reason
  // separate so we can prioritise Solidity errors over generic RPC messages.
  const outerMessage = err instanceof Error ? err.message : String(err);
  const reason = revertReason ?? outerMessage;
  // Also concatenate all nested messages for deeper pattern matching
  const deepReason = [revertReason, outerMessage].filter(Boolean).join(' | ');
  const errorData = extractErrorDataHex(err);

  if (errorData && errorData.length >= 10) {
    const selector = errorData.slice(0, 10);
    const mapped = CUSTOM_ERROR_SELECTOR_MESSAGES[selector];
    if (mapped) return mapped;
  }

  // ---- Solidity custom errors (check BEFORE generic RPC errors) ----
  // These take priority because ethers.js often wraps a contract revert
  // inside a generic "insufficient funds" or "cannot estimate gas" error.

  if (/MintExceedsOriginalValue/i.test(deepReason)) {
    return 'Mint amount exceeds the original document value. The contract rejected the transaction.';
  }

  if (/EmptyName/i.test(deepReason)) {
    return 'Token name cannot be empty.';
  }

  if (/EmptySymbol/i.test(deepReason)) {
    return 'Token symbol cannot be empty.';
  }

  if (/ZeroMintAmount/i.test(deepReason)) {
    return 'Mint amount must be greater than zero.';
  }

  if (/ZeroAddress/i.test(deepReason) && !/0x0{40}/.test(deepReason)) {
    return 'Recipient address cannot be the zero address.';
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

  // ---- AMM / Exchange custom errors (by name in reason string) ----
  if (/DeadlineExpired/i.test(deepReason)) {
    return 'Transaction deadline has expired. Please try again.';
  }
  if (/InsufficientAAmount/i.test(deepReason)) {
    return 'Insufficient Token A amount for this pool operation. Try adjusting your amounts or increasing slippage.';
  }
  if (/InsufficientBAmount/i.test(deepReason)) {
    return 'Insufficient Token B amount for this pool operation. Try adjusting your amounts or increasing slippage.';
  }
  if (/InsufficientEth/i.test(deepReason)) {
    return 'Insufficient ETH sent for this operation.';
  }
  if (/InsufficientLiquidity/i.test(deepReason)) {
    return 'Insufficient liquidity in the pool for this operation.';
  }
  if (/InsufficientOutput/i.test(deepReason)) {
    return 'Output amount is below your minimum. Try increasing slippage tolerance.';
  }
  if (/InvariantViolation/i.test(deepReason)) {
    return 'Pool invariant violated — the reserves are in an unexpected state.';
  }
  if (/InvalidK\b/i.test(deepReason)) {
    return 'Invalid constant product (K) — pool state inconsistency detected.';
  }
  if (/PoolExists/i.test(deepReason)) {
    return 'A pool already exists for this token pair.';
  }
  if (/PoolNotFound/i.test(deepReason)) {
    return 'No liquidity pool exists for this token pair. Please create the pool first.';
  }
  if (/SameToken/i.test(deepReason)) {
    return 'Cannot use the same token on both sides.';
  }
  if (/TransferFailed/i.test(deepReason)) {
    return 'Token transfer failed. Check that you have approved sufficient allowance and have enough balance.';
  }
  if (/InsufficientFill/i.test(deepReason)) {
    return 'Insufficient fill amount for this order.';
  }
  if (/NotMaker/i.test(deepReason)) {
    return 'Only the order maker can perform this action.';
  }
  if (/OrderNotActive/i.test(deepReason)) {
    return 'This order is no longer active (already filled or cancelled).';
  }

  if (PAYLOAD_MISMATCH_PATTERN.test(deepReason)) {
    return 'The transaction payload is incompatible with the deployed contract on this network. Refresh and try again.';
  }

  // User rejected from wallet
  if (/user (rejected|denied)|ACTION_REJECTED/i.test(deepReason)) {
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

  // RPC endpoint unavailable / overloaded upstream
  if (/rpc endpoint not found or unavailable|service unavailable|bad gateway|gateway timeout|httpstatus"?\s*:\s*521/i.test(reason)) {
    return 'RPC endpoint is temporarily unavailable. Please retry in a few moments.';
  }

  // RPC endpoint circuit-breaker/cooldown messages from upstream providers
  if (/rpc endpoint returned too many errors|retrying in|different rpc endpoint/i.test(reason)) {
    return 'RPC endpoint is temporarily overloaded. Please retry in a few seconds.';
  }

  // RPC timeout
  if (/timeout|ETIMEDOUT|ECONNREFUSED/i.test(reason)) {
    return 'Network request timed out. Please check your internet connection and try again.';
  }

  // Wallet/provider transport failures
  if (/failed to fetch|fetch failed|network request failed|networkerror/i.test(reason)) {
    return 'Network error — unable to reach the RPC node. The node may be temporarily overloaded. Please try again in a moment.';
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

  // Fallback: return the reason if it is short enough, otherwise generic.
  // Strip raw hex data (0x...) from the message but still show the
  // human-readable portion so users get a meaningful error.
  if (reason && reason.length < 300) {
    // Remove long hex strings (addresses, calldata) but keep the message
    const cleaned = reason.replace(/0x[0-9a-fA-F]{8,}/g, '').trim();
    if (cleaned.length > 10 && cleaned.length < 250) {
      return cleaned;
    }
  }

  return 'Transaction failed. Please try again or check your wallet for details.';
}

function isPayloadMismatchError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /transaction payload is incompatible with the deployed contract/i.test(msg) ||
    PAYLOAD_MISMATCH_PATTERN.test(msg)
  );
}

function isSecurityTokenFactoryPayloadMismatchError(err: unknown): boolean {
  return isPayloadMismatchError(err);
}

function isAmmPayloadMismatchError(err: unknown): boolean {
  return isPayloadMismatchError(err);
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
// Read-only provider for components that need direct RPC access
// ---------------------------------------------------------------------------

/**
 * Module-level cache of read-only providers keyed by chain ID.
 * Avoids creating a new JsonRpcProvider on every component render.
 */
const _readOnlyProviders = new Map<number, ethers.JsonRpcProvider>();

/**
 * Return a read-only `JsonRpcProvider` for the given chain that connects
 * directly to our configured RPC endpoints (QuickNode, dRPC, etc.) instead
 * of routing through the thirdweb proxy.
 *
 * Use this in components that need to read contract state (balances, token
 * metadata, pool data, etc.) without consuming the wallet's rate-limited
 * thirdweb proxy RPC. Write operations should still use the BrowserProvider
 * from `walletStore.getProvider()` to go through the user's wallet.
 *
 * The provider is cached per chain ID for the lifetime of the page.
 */
/** Track which RPC URL each cached provider was created with. */
const _readOnlyProviderUrls = new Map<number, string>();

export function getReadOnlyProvider(chainId: number): ethers.JsonRpcProvider {
  const rpcUrl = selectRpcEndpoint(chainId);
  const cached = _readOnlyProviders.get(chainId);
  const cachedUrl = _readOnlyProviderUrls.get(chainId);

  // Return cached provider only if the endpoint hasn't changed (e.g. due
  // to a cooldown switching us to a fallback). This ensures we don't keep
  // using a dead provider after the endpoint health system rotates away.
  if (cached && cachedUrl === rpcUrl) return cached;

  // Destroy the old provider if the endpoint changed.
  if (cached) {
    cached.destroy();
    _readOnlyProviders.delete(chainId);
    _readOnlyProviderUrls.delete(chainId);
  }

  const provider = createReadOnlyRpcProvider(rpcUrl, chainId);

  // Keep the cache bounded.
  if (_readOnlyProviders.size >= 10) {
    const oldest = _readOnlyProviders.keys().next().value;
    if (oldest !== undefined) {
      const evicted = _readOnlyProviders.get(oldest);
      _readOnlyProviders.delete(oldest);
      _readOnlyProviderUrls.delete(oldest);
      evicted?.destroy();
    }
  }

  _readOnlyProviders.set(chainId, provider);
  _readOnlyProviderUrls.set(chainId, rpcUrl);
  return provider;
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
   * Always fetches fresh from the BrowserProvider so that account/chain
   * changes in the wallet are picked up immediately. Falls back to the
   * store signer only when the BrowserProvider fails (e.g. during a
   * transient disconnect).
   */
  async getSigner(): Promise<ethers.Signer> {
    // Return cached signer to avoid repeated eth_requestAccounts RPC calls
    // through the wallet's thirdweb proxy. Each getSigner() call otherwise
    // triggers a round-trip that counts towards rate limits.
    if (this.signer) return this.signer;

    try {
      this.signer = await this.provider.getSigner();
      return this.signer;
    } catch {
      // BrowserProvider.getSigner() can fail during transient disconnects
      // or if the provider's internal state is stale. Fall back to the
      // store signer which was captured at wallet connection time.
      const storeSigner = getStoreSigner();
      if (storeSigner) {
        this.signer = storeSigner as unknown as ethers.Signer;
        return this.signer;
      }
      throw new Error(
        'Unable to obtain a wallet signer. Please reconnect your wallet.',
      );
    }
  }

  /** Maximum cached read providers to prevent unbounded memory growth. */
  private static readonly MAX_READ_PROVIDERS = 10;

  private getReadProvider(endpoint: string): ethers.JsonRpcProvider {
    const cached = this.readProviders.get(endpoint);
    if (cached) return cached;

    // Evict the oldest entry if the cache is full.
    if (this.readProviders.size >= ContractService.MAX_READ_PROVIDERS) {
      const oldest = this.readProviders.keys().next().value;
      if (oldest !== undefined) {
        const evicted = this.readProviders.get(oldest);
        this.readProviders.delete(oldest);
        evicted?.destroy();
      }
    }

    const provider = createReadOnlyRpcProvider(endpoint, this.chainId);
    this.readProviders.set(endpoint, provider);
    return provider;
  }

  private async withReadProvider<T>(
    callback: (provider: ethers.Provider) => Promise<T>,
  ): Promise<T> {
    const endpoints = getOrderedRpcEndpoints(this.chainId);
    if (endpoints.length === 0) return callback(this.provider);

    // Try the preferred (already health-ranked) endpoint first.
    const primary = endpoints[0];
    try {
      const result = await callback(this.getReadProvider(primary));
      reportRpcEndpointSuccess(this.chainId, primary);
      return result;
    } catch (error) {
      if (!isRetryableRpcError(error)) throw error;
      reportRpcEndpointFailure(this.chainId, primary);
    }

    // Primary failed transiently — try remaining endpoints with a small
    // staggered delay to avoid hammering all fallbacks simultaneously.
    for (let i = 1; i < endpoints.length; i++) {
      // Brief pause between fallback attempts (300ms) so we don't blast
      // every endpoint at once after a rate-limit.
      await new Promise((r) => setTimeout(r, 300));
      const endpoint = endpoints[i];
      try {
        const result = await callback(this.getReadProvider(endpoint));
        reportRpcEndpointSuccess(this.chainId, endpoint);
        return result;
      } catch (error) {
        if (!isRetryableRpcError(error)) throw error;
        reportRpcEndpointFailure(this.chainId, endpoint);
      }
    }

    // All read-only RPCs failed — brief pause then fall back to the
    // wallet's own provider as a last resort.
    await new Promise((r) => setTimeout(r, 500));
    return callback(this.provider);
  }

  private async withContractRead<T>(
    contractFactory: (provider: ethers.Provider) => ethers.Contract,
    callback: (contract: ethers.Contract) => Promise<T>,
  ): Promise<T> {
    return this.withReadProvider((provider) => callback(contractFactory(provider)));
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

  private async detectSecurityTokenCreateSignature(
    factory: ethers.Contract,
  ): Promise<
    | typeof SECURITY_TOKEN_CREATE_MODERN_SIGNATURE
    | typeof SECURITY_TOKEN_CREATE_LEGACY_SIGNATURE
    | null
  > {
    const cached = securityTokenCreateSignatureCache.get(this.chainId);
    if (cached) {
      return cached;
    }

    const factoryAddress = this.resolveContractAddress(factory);

    try {
      const code = await this.withReadProvider((provider) =>
        provider.getCode(factoryAddress),
      );
      const normalizedCode = code.toLowerCase();
      const hasModernSelector = normalizedCode.includes(
        SECURITY_TOKEN_CREATE_MODERN_SELECTOR,
      );
      const hasLegacySelector = normalizedCode.includes(
        SECURITY_TOKEN_CREATE_LEGACY_SELECTOR,
      );

      const resolvedSignature =
        hasModernSelector && !hasLegacySelector
          ? SECURITY_TOKEN_CREATE_MODERN_SIGNATURE
          : hasLegacySelector && !hasModernSelector
            ? SECURITY_TOKEN_CREATE_LEGACY_SIGNATURE
            : null;

      if (resolvedSignature) {
        securityTokenCreateSignatureCache.set(this.chainId, resolvedSignature);
      }

      return resolvedSignature;
    } catch (error) {
      logger.warn(
        '[SecurityTokenFactory compatibility] failed to inspect deployed factory bytecode; falling back to selector retry path',
        error,
      );
      return null;
    }
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

  /**
   * Estimate gas/cost for creating a new WrappedAsset through the
   * WrappedAssetFactory using resilient read-RPC fallback.
   */
  async estimateCreateWrappedAssetGas(
    name: string,
    symbol: string,
    documentHash: string,
    documentType: string,
    originalValue: bigint,
    mintAmount: bigint,
    recipient: string,
  ): Promise<WrappedAssetDeploymentGasEstimate> {
    const signer = await this.getSigner();
    const signerAddress = await signer.getAddress();
    const factory = this.getFactoryContract(signer);

    this.validateAddress(recipient, 'recipient');
    const encodedHash = encodeDocumentHash(documentHash);

    const args: unknown[] = [
      name,
      symbol,
      encodedHash,
      documentType,
      originalValue,
      mintAmount,
      recipient,
    ];

    const gasUnits = await this.estimateGasWithFallback(
      factory,
      'createWrappedAsset',
      args,
      signerAddress,
    );

    if (gasUnits === null) {
      throw new Error(
        'Unable to estimate gas right now because RPC endpoints are temporarily unavailable. Please retry in a moment.',
      );
    }

    const feeData = await this.withReadProvider((provider) => provider.getFeeData());
    const gasPriceWei = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;

    return {
      gasUnits,
      gasPriceWei,
      estimatedCostWei: gasUnits * gasPriceWei,
    };
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
    try {
      const result = await this.withContractRead(
        (provider) => this.getFactoryContract(provider),
        (factory) => factory.getUserAssets(userAddress) as Promise<string[]>,
      );
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
    try {
      const result = await this.withContractRead(
        (provider) => this.getFactoryContract(provider),
        (factory) => factory.getTotalAssets() as Promise<bigint>,
      );
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
    try {
      return await this.withContractRead(
        (provider) => this.getFactoryContract(provider),
        (factory) => factory.getAssetAtIndex(index) as Promise<string>,
      );
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
      const results = await this.withReadProvider((provider) =>
        multicallSameTarget(
          provider,
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
        ),
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
        const events = await this.withContractRead(
          (provider) => this.getFactoryContract(provider),
          async (factory) => {
            const filter = factory.filters.AssetCreated(null, assetAddress);
            return factory.queryFilter(filter);
          },
        );
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
      const results = await this.withReadProvider((provider) =>
        multicallSameTarget(
          provider,
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
        ),
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

      const results: MulticallResult[] = await this.withReadProvider((provider) =>
        multicall(provider, requests),
      );
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

  async getAssetBalances(
    assetAddresses: string[],
    userAddress: string,
  ): Promise<Record<string, bigint>> {
    this.validateAddress(userAddress, 'user');
    const normalizedAddresses = Array.from(
      new Set(
        assetAddresses
          .map((address) => address.trim())
          .filter((address) => address.length > 0),
      ),
    );

    const balances: Record<string, bigint> = {};
    const missingAddresses: string[] = [];

    for (const assetAddress of normalizedAddresses) {
      this.validateAddress(assetAddress, 'asset');
      const cacheKey = this.cacheKey(`asset:${assetAddress}:balance:${userAddress}`);
      const cached = getCached<bigint>(cacheKey);
      if (cached !== undefined) {
        balances[assetAddress] = cached;
        continue;
      }
      missingAddresses.push(assetAddress);
    }

    if (missingAddresses.length === 0) {
      return balances;
    }

    const requestKey = this.cacheKey(
      `asset-balances:${userAddress}:${missingAddresses.join(',')}`,
    );

    const fetchedBalances = await dedupeRpcRequest<Record<string, bigint>>(requestKey, async () => {
      const results = await rpcMulticall<bigint>(
        this.chainId,
        missingAddresses.map((assetAddress) => ({
          target: assetAddress,
          abi: WrappedAssetABI,
          functionName: 'balanceOf',
          args: [userAddress],
        })),
      );

      return missingAddresses.reduce<Record<string, bigint>>((accumulator, assetAddress, index) => {
        const balance = results[index]?.success
          ? BigInt(results[index].data as bigint)
          : 0n;
        const cacheKey = this.cacheKey(`asset:${assetAddress}:balance:${userAddress}`);
        setCache(cacheKey, balance, TTL_BALANCE);
        accumulator[assetAddress] = balance;
        return accumulator;
      }, {});
    });

    return { ...balances, ...fetchedBalances };
  }

  async getAssetAllowances(
    assetAddresses: string[],
    ownerAddress: string,
    spenderAddress: string,
  ): Promise<Record<string, bigint>> {
    this.validateAddress(ownerAddress, 'owner');
    this.validateAddress(spenderAddress, 'spender');
    const normalizedAddresses = Array.from(
      new Set(
        assetAddresses
          .map((address) => address.trim())
          .filter((address) => address.length > 0),
      ),
    );

    const allowances: Record<string, bigint> = {};
    const missingAddresses: string[] = [];

    for (const assetAddress of normalizedAddresses) {
      this.validateAddress(assetAddress, 'asset');
      const cacheKey = this.cacheKey(`asset:${assetAddress}:allowance:${ownerAddress}:${spenderAddress}`);
      const cached = getCached<bigint>(cacheKey);
      if (cached !== undefined) {
        allowances[assetAddress] = cached;
        continue;
      }
      missingAddresses.push(assetAddress);
    }

    if (missingAddresses.length === 0) {
      return allowances;
    }

    const requestKey = this.cacheKey(
      `asset-allowances:${ownerAddress}:${spenderAddress}:${missingAddresses.join(',')}`,
    );

    const fetchedAllowances = await dedupeRpcRequest<Record<string, bigint>>(requestKey, async () => {
      const results = await rpcMulticall<bigint>(
        this.chainId,
        missingAddresses.map((assetAddress) => ({
          target: assetAddress,
          abi: WrappedAssetABI,
          functionName: 'allowance',
          args: [ownerAddress, spenderAddress],
        })),
      );

      return missingAddresses.reduce<Record<string, bigint>>((accumulator, assetAddress, index) => {
        const allowance = results[index]?.success
          ? BigInt(results[index].data as bigint)
          : 0n;
        const cacheKey = this.cacheKey(
          `asset:${assetAddress}:allowance:${ownerAddress}:${spenderAddress}`,
        );
        setCache(cacheKey, allowance, TTL_ALLOWANCE);
        accumulator[assetAddress] = allowance;
        return accumulator;
      }, {});
    });

    return { ...allowances, ...fetchedAllowances };
  }

  async getUserAssetSnapshots(
    assetAddresses: string[],
    userAddress: string,
  ): Promise<AssetSnapshot[]> {
    if (assetAddresses.length === 0) {
      return [];
    }

    const [details, balances] = await Promise.all([
      this.getMultipleAssetDetails(assetAddresses),
      this.getAssetBalances(assetAddresses, userAddress),
    ]);

    return assetAddresses.reduce<AssetSnapshot[]>((accumulator, assetAddress, index) => {
      const detail = details[index];
      if (!detail) {
        return accumulator;
      }

      accumulator.push({
        address: assetAddress,
        ...detail,
        balance: balances[assetAddress] ?? 0n,
      });
      return accumulator;
    }, []);
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
    try {
      return await dedupeRpcRequest<bigint>(cacheKey, async () => {
        const result = await this.withContractRead(
        (provider) => this.getAssetContract(assetAddress, provider),
        (asset) => asset.balanceOf(userAddress) as Promise<bigint>,
        );
        setCache(cacheKey, result, TTL_BALANCE);
        return result;
      });
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
    try {
      return await dedupeRpcRequest<bigint>(cacheKey, async () => {
        const result = await this.withContractRead(
        (provider) => this.getAssetContract(assetAddress, provider),
        (asset) => asset.allowance(ownerAddress, spenderAddress) as Promise<bigint>,
        );
        setCache(cacheKey, result, TTL_ALLOWANCE);
        return result;
      });
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
    try {
      const raw = await this.withContractRead(
        (provider) => this.getExchangeContract(provider),
        (exchange) => exchange.getOrders(tokenSell, tokenBuy) as Promise<Record<string, unknown>[]>,
      );
      return raw.map((r: Record<string, unknown>) => this.parseOrder(r));
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch orders for pair ${tokenSell}/${tokenBuy}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Retrieve a single order by its ID. */
  async getOrder(orderId: bigint): Promise<Order> {
    try {
      const raw = await this.withContractRead(
        (provider) => this.getExchangeContract(provider),
        (exchange) => exchange.getOrder(orderId) as Promise<Record<string, unknown>>,
      );
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
    try {
      const events = await this.withContractRead(
        (provider) => this.getExchangeContract(provider),
        async (exchange) => {
          const filter = exchange.filters.OrderCreated(null, userAddress);
          return exchange.queryFilter(filter);
        },
      );
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
   * Compatibility notes:
   * - Newer factory deployments accept child contract bytecodes as the first
   *   two parameters.
   * - Legacy factory deployments use an immutable deployer and do not accept
   *   bytecode parameters.
   *
   * This method attempts the modern signature first and falls back to the
   * legacy signature when the deployed contract rejects the selector.
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
    const preferredSignature = await this.detectSecurityTokenCreateSignature(
      factory,
    );

    const encodedHash = encodeDocumentHash(documentHash);

    const modernArgs: unknown[] = [
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
    ];

    const legacyArgs: unknown[] = [
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
    ];

    const primarySignature =
      preferredSignature ?? SECURITY_TOKEN_CREATE_MODERN_SIGNATURE;
    const primaryArgs =
      primarySignature === SECURITY_TOKEN_CREATE_MODERN_SIGNATURE
        ? modernArgs
        : legacyArgs;
    const fallbackSignature =
      primarySignature === SECURITY_TOKEN_CREATE_MODERN_SIGNATURE
        ? SECURITY_TOKEN_CREATE_LEGACY_SIGNATURE
        : SECURITY_TOKEN_CREATE_MODERN_SIGNATURE;
    const fallbackArgs =
      fallbackSignature === SECURITY_TOKEN_CREATE_MODERN_SIGNATURE
        ? modernArgs
        : legacyArgs;

    let tx: ethers.ContractTransactionResponse;
    try {
      tx = await this.executeWrite(
        factory,
        primarySignature,
        primaryArgs,
      );
    } catch (primaryErr: unknown) {
      if (
        preferredSignature !== null &&
        !isSecurityTokenFactoryPayloadMismatchError(primaryErr)
      ) {
        throw primaryErr;
      }

      if (!isSecurityTokenFactoryPayloadMismatchError(primaryErr)) {
        throw primaryErr;
      }

      logger.warn(
        `[SecurityTokenFactory compatibility] ${primarySignature} selector rejected, retrying ${fallbackSignature}`,
        primaryErr,
      );

      try {
        tx = await this.executeWrite(
          factory,
          fallbackSignature,
          fallbackArgs,
        );
      } catch (fallbackErr: unknown) {
        if (isSecurityTokenFactoryPayloadMismatchError(fallbackErr)) {
          throw new Error(
            'This network uses an incompatible SecurityTokenFactory deployment. Refresh and verify the selected network before retrying.',
          );
        }
        throw fallbackErr;
      }
    }

    this.invalidateCachePrefix('factory:');
    return tx;
  }

  /**
   * Estimate gas/cost for creating a new ERC-1404 security token through the
   * SecurityTokenFactory using resilient read-RPC fallback.
   */
  async estimateCreateSecurityTokenGas(
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
  ): Promise<SecurityTokenDeploymentGasEstimate> {
    const signer = await this.getSigner();
    const signerAddress = await signer.getAddress();
    const factory = this.getSecurityTokenFactoryContract(signer);
    const preferredSignature = await this.detectSecurityTokenCreateSignature(
      factory,
    );
    const encodedHash = encodeDocumentHash(documentHash);

    const modernArgs: unknown[] = [
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
    ];
    const legacyArgs: unknown[] = [
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
    ];

    const primarySignature =
      preferredSignature ?? SECURITY_TOKEN_CREATE_MODERN_SIGNATURE;
    const primaryArgs =
      primarySignature === SECURITY_TOKEN_CREATE_MODERN_SIGNATURE
        ? modernArgs
        : legacyArgs;
    const fallbackSignature =
      primarySignature === SECURITY_TOKEN_CREATE_MODERN_SIGNATURE
        ? SECURITY_TOKEN_CREATE_LEGACY_SIGNATURE
        : SECURITY_TOKEN_CREATE_MODERN_SIGNATURE;
    const fallbackArgs =
      fallbackSignature === SECURITY_TOKEN_CREATE_MODERN_SIGNATURE
        ? modernArgs
        : legacyArgs;

    let gasUnits: bigint | null;
    try {
      gasUnits = await this.estimateGasWithFallback(
        factory,
        primarySignature,
        primaryArgs,
        signerAddress,
      );
    } catch (primaryErr: unknown) {
      if (
        preferredSignature !== null &&
        !isSecurityTokenFactoryPayloadMismatchError(primaryErr)
      ) {
        throw primaryErr;
      }

      if (!isSecurityTokenFactoryPayloadMismatchError(primaryErr)) {
        throw primaryErr;
      }

      logger.warn(
        `[SecurityTokenFactory compatibility] ${primarySignature} estimate selector rejected, retrying ${fallbackSignature}`,
        primaryErr,
      );

      try {
        gasUnits = await this.estimateGasWithFallback(
          factory,
          fallbackSignature,
          fallbackArgs,
          signerAddress,
        );
      } catch (fallbackErr: unknown) {
        if (isSecurityTokenFactoryPayloadMismatchError(fallbackErr)) {
          throw new Error(
            'Unable to estimate security token deployment gas because this network has an incompatible factory deployment.',
          );
        }
        throw fallbackErr;
      }
    }

    if (gasUnits === null) {
      throw new Error(
        'Unable to estimate gas right now because RPC endpoints are temporarily unavailable. Please retry in a moment.',
      );
    }

    const feeData = await this.withReadProvider((provider) => provider.getFeeData());
    const gasPriceWei = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;

    return {
      gasUnits,
      gasPriceWei,
      estimatedCostWei: gasUnits * gasPriceWei,
    };
  }

  // -----------------------------------------------------------------------
  // Security Token Factory read operations
  // -----------------------------------------------------------------------

  /** Get all security token addresses created by a user. */
  async getUserSecurityTokens(userAddress: string): Promise<string[]> {
    this.validateAddress(userAddress, 'user');
    try {
      return await this.withContractRead(
        (provider) => this.getSecurityTokenFactoryContract(provider),
        (factory) => factory.getUserTokens(userAddress) as Promise<string[]>,
      );
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch security tokens for user: ${parseContractError(error)}`,
      );
    }
  }

  /** Get total number of security tokens deployed through the factory. */
  async getTotalSecurityTokens(): Promise<bigint> {
    try {
      return await this.withContractRead(
        (provider) => this.getSecurityTokenFactoryContract(provider),
        (factory) => factory.getTotalTokens() as Promise<bigint>,
      );
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
    try {
      const raw = await this.withContractRead(
        (provider) => this.getSecurityTokenFactoryContract(provider),
        (factory) => factory.getTokenDetails(tokenAddress) as Promise<RawSecurityTokenDetails>,
      );
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
    try {
      return await this.withContractRead(
        (provider) => this.getSecurityTokenContract(tokenAddress, provider),
        (token) => token.balanceOf(userAddress) as Promise<bigint>,
      );
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
    try {
      return await this.withContractRead(
        (provider) => this.getSecurityTokenContract(tokenAddress, provider),
        (token) => token.unlockedBalanceOf(userAddress) as Promise<bigint>,
      );
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
    try {
      return await this.withContractRead(
        (provider) => this.getSecurityTokenContract(tokenAddress, provider),
        (token) => token.lockedAmountOf(userAddress) as Promise<bigint>,
      );
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
    // Default deadline: 30 days from now. Pass 0 for no expiry.
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60);
    const tx = await this.executeWrite(exchange, 'createOrder', [
      tokenSell, tokenBuy, amountSell, amountBuy, deadline,
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
    // Default deadline: 30 days from now. Pass 0 for no expiry.
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60);
    const tx = await this.executeWrite(exchange, 'createOrderSellETH', [tokenBuy, amountBuy, deadline], {
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
    const cacheKey = this.cacheKey(`exchange:order:${orderId.toString()}`);
    const cached = getCached<Order>(cacheKey);
    if (cached) return cached;

    try {
      return await dedupeRpcRequest<Order>(cacheKey, async () => {
        const raw = await this.withContractRead(
        (provider) => this.getAssetBackedExchangeContract(provider),
        (exchange) => exchange.getOrder(orderId) as Promise<Record<string, unknown>>,
        );
        const parsed = this.parseOrder(raw);
        setCache(cacheKey, parsed, TTL_MEDIUM);
        return parsed;
      });
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch order #${orderId}: ${parseContractError(error)}`,
      );
    }
  }

  async getExchangeOrders(orderIds: bigint[]): Promise<Order[]> {
    if (orderIds.length === 0) {
      return [];
    }

    const uniqueOrderIds = Array.from(
      new Set(orderIds.map((orderId) => orderId.toString())),
    ).map((value) => BigInt(value));

    const ordersById = new Map<string, Order>();
    const missingOrderIds: bigint[] = [];

    for (const orderId of uniqueOrderIds) {
      const cacheKey = this.cacheKey(`exchange:order:${orderId.toString()}`);
      const cached = getCached<Order>(cacheKey);
      if (cached) {
        ordersById.set(orderId.toString(), cached);
        continue;
      }
      missingOrderIds.push(orderId);
    }

    if (missingOrderIds.length > 0) {
      const requestKey = this.cacheKey(
        `exchange:orders:${missingOrderIds.map((id) => id.toString()).join(',')}`,
      );

      const fetchedOrders = await dedupeRpcRequest<Order[]>(requestKey, async () => {
        const config = getNetworkConfig(this.chainId);
        if (!config?.assetBackedExchangeAddress) {
          return [];
        }

        const results = await rpcMulticallSameTarget<Record<string, unknown>>(
          this.chainId,
          config.assetBackedExchangeAddress,
          AssetBackedExchangeABI,
          missingOrderIds.map((orderId) => ({
            functionName: 'getOrder',
            args: [orderId],
          })),
        );

        return missingOrderIds.reduce<Order[]>((accumulator, orderId, index) => {
          const raw = results[index];
          if (!raw?.success || !raw.data) {
            return accumulator;
          }
          const parsed = this.parseOrder(raw.data as Record<string, unknown>);
          const cacheKey = this.cacheKey(`exchange:order:${orderId.toString()}`);
          setCache(cacheKey, parsed, TTL_MEDIUM);
          accumulator.push(parsed);
          return accumulator;
        }, []);
      });

      for (const order of fetchedOrders) {
        ordersById.set(order.id.toString(), order);
      }
    }

    return uniqueOrderIds
      .map((orderId) => ordersById.get(orderId.toString()) ?? null)
      .filter((order): order is Order => order !== null);
  }

  /** Get all order IDs for a user on the asset-backed exchange. */
  async getExchangeUserOrders(userAddress: string): Promise<bigint[]> {
    this.validateAddress(userAddress, 'user');
    const cacheKey = this.cacheKey(`exchange:user-orders:${userAddress}`);
    const cached = getCached<bigint[]>(cacheKey);
    if (cached) return cached;

    try {
      return await dedupeRpcRequest<bigint[]>(cacheKey, async () => {
        const result = await this.withContractRead(
        (provider) => this.getAssetBackedExchangeContract(provider),
        (exchange) => exchange.getUserOrders(userAddress) as Promise<bigint[]>,
        );
        setCache(cacheKey, result, TTL_MEDIUM);
        return result;
      });
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch your orders: ${parseContractError(error)}`,
      );
    }
  }

  /** Get active orders for a specific trading pair on the asset-backed exchange. */
  async getExchangeActiveOrders(tokenSell: string, tokenBuy: string): Promise<Order[]> {
    const cacheKey = this.cacheKey(`exchange:active-orders:${tokenSell}:${tokenBuy}`);
    const cached = getCached<Order[]>(cacheKey);
    if (cached) return cached;

    try {
      return await dedupeRpcRequest<Order[]>(cacheKey, async () => {
        const raw = await this.withContractRead(
        (provider) => this.getAssetBackedExchangeContract(provider),
        (exchange) =>
          exchange.getActiveOrders(tokenSell, tokenBuy) as Promise<Record<string, unknown>[]>,
        );
        const parsed = raw.map((r: Record<string, unknown>) => this.parseOrder(r));
        setCache(cacheKey, parsed, TTL_MEDIUM);
        return parsed;
      });
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch active orders: ${parseContractError(error)}`,
      );
    }
  }

  /** Get order IDs that a user filled as a taker (via OrderFilled events). */
  async getExchangeFilledOrderIds(userAddress: string): Promise<bigint[]> {
    this.validateAddress(userAddress, 'user');
    const cacheKey = this.cacheKey(`exchange:filled-order-ids:${userAddress}`);
    const cached = getCached<bigint[]>(cacheKey);
    if (cached) return cached;

    try {
      return await dedupeRpcRequest<bigint[]>(cacheKey, async () => {
        const events = await this.withContractRead(
        (provider) => this.getAssetBackedExchangeContract(provider),
        async (exchange) => {
          const provider = exchange.runner && 'provider' in exchange.runner
            ? (exchange.runner as { provider: ethers.Provider }).provider
            : null;
          if (!provider) {
            return exchange.queryFilter(exchange.filters.OrderFilled(null, userAddress), 0);
          }

          return queryRecentLogsBestEffort(
            provider,
            (queryProvider, fromBlock, toBlock) => {
              const queryExchange = this.getAssetBackedExchangeContract(queryProvider);
              return queryExchange.queryFilter(
                queryExchange.filters.OrderFilled(null, userAddress),
                fromBlock,
                toBlock,
              );
            },
            {
              chainId: this.chainId,
              label: 'exchange OrderFilled (filled order ids)',
              maxLookbackBlocks: 200_000,
              initialChunkSize: 50_000,
              maxRequests: 8,
              maxEvents: 200,
            },
          );
        },
        );
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
        setCache(cacheKey, ids, TTL_MARKET);
        return ids;
      });
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch filled orders for user ${userAddress}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Get the ETH balance available for withdrawal from the exchange. */
  async getExchangeEthBalance(userAddress: string): Promise<bigint> {
    this.validateAddress(userAddress, 'user');
    const cacheKey = this.cacheKey(`exchange:eth-balance:${userAddress}`);
    const cached = getCached<bigint>(cacheKey);
    if (cached !== undefined) return cached;

    try {
      return await dedupeRpcRequest<bigint>(cacheKey, async () => {
        const result = await this.withContractRead(
        (provider) => this.getAssetBackedExchangeContract(provider),
        (exchange) => exchange.ethBalances(userAddress) as Promise<bigint>,
        );
        setCache(cacheKey, result, TTL_BALANCE);
        return result;
      });
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

  /**
   * Legacy AMM ABI accessor for older deployments that use pre-deadline
   * liquidity/swap signatures.
   */
  getLegacyAMMContract(
    signerOrProvider?: ethers.Signer | ethers.Provider,
  ): ethers.Contract {
    const config = getNetworkConfig(this.chainId);
    if (!config || !config.ammAddress) {
      throw new Error(`LiquidityPoolAMM not deployed on chain ${this.chainId}`);
    }
    return new ethers.Contract(
      config.ammAddress,
      LiquidityPoolAMMLegacyABI,
      signerOrProvider || this.provider,
    );
  }

  /**
   * Execute a modern AMM write call and transparently retry against the legacy
   * AMM ABI when the deployed contract rejects the modern function selector.
   */
  private async executeAMMWriteWithLegacyFallback(
    modernMethod: string,
    modernArgs: unknown[],
    legacyMethod: string,
    legacyArgs: unknown[],
    overrides?: ethers.Overrides,
  ): Promise<ethers.ContractTransactionResponse> {
    const signer = await this.getSigner();
    const modernAmm = this.getAMMContract(signer);

    try {
      return await this.executeWrite(modernAmm, modernMethod, modernArgs, overrides);
    } catch (modernErr: unknown) {
      if (!isAmmPayloadMismatchError(modernErr)) {
        throw modernErr;
      }

      logger.warn(
        `[AMM compatibility] ${modernMethod}: modern selector rejected, retrying legacy ABI`,
        modernErr,
      );

      const legacyAmm = this.getLegacyAMMContract(signer);
      try {
        return await this.executeWrite(legacyAmm, legacyMethod, legacyArgs, overrides);
      } catch (legacyErr: unknown) {
        if (isAmmPayloadMismatchError(legacyErr)) {
          throw new Error(
            'Legacy AMM contracts are not deployed or are misconfigured on this network. Switch to Orbital AMM or another network.',
          );
        }
        throw legacyErr;
      }
    }
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
    const tx = await this.executeAMMWriteWithLegacyFallback(
      'addLiquidity',
      [
        tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin, minLiquidity, dl,
      ],
      'addLiquidity',
      [
        tokenA, tokenB, amountADesired, amountBDesired, minLiquidity,
      ],
    );
    this.invalidateAssetCache(tokenA);
    this.invalidateAssetCache(tokenB);
    this.invalidateCachePrefix('amm:');
    return tx;
  }

  /** Add liquidity to an ETH / ERC-20 pool. */
  async addLiquidityETH(
    token: string,
    amountTokenDesired: bigint,
    minLiquidity: bigint,
    ethAmount: bigint,
    amountTokenMin: bigint = 0n,
    amountETHMin: bigint = 0n,
    deadline?: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    this.validateAddress(token, 'token');
    const dl = deadline ?? this._defaultDeadline();
    const tx = await this.executeAMMWriteWithLegacyFallback(
      'addLiquidityETH',
      [
        token,
        amountTokenDesired,
        amountTokenMin,
        amountETHMin,
        minLiquidity,
        dl,
      ],
      'addLiquidityETH',
      [token, amountTokenDesired, minLiquidity],
      { value: ethAmount },
    );
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
    const tx = await this.executeAMMWriteWithLegacyFallback(
      'removeLiquidity',
      [tokenA, tokenB, liquidity, minA, minB, dl],
      'removeLiquidity',
      [tokenA, tokenB, liquidity, minA, minB],
    );
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
    const tx = await this.executeAMMWriteWithLegacyFallback(
      'removeLiquidityETH',
      [token, liquidity, minToken, minETH, dl],
      'removeLiquidityETH',
      [token, liquidity, minToken, minETH],
    );
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
    const tx = await this.executeAMMWriteWithLegacyFallback(
      'swap',
      [tokenIn, tokenOut, amountIn, minAmountOut, dl],
      'swap',
      [tokenIn, tokenOut, amountIn, minAmountOut],
    );
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
    const tx = await this.executeAMMWriteWithLegacyFallback(
      'swapETHForToken',
      [token, minAmountOut, dl],
      'swapETHForToken',
      [token, minAmountOut],
      { value: ethAmount },
    );
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
    const tx = await this.executeAMMWriteWithLegacyFallback(
      'swapTokenForETH',
      [token, amountIn, minETH, dl],
      'swapTokenForETH',
      [token, amountIn, minETH],
    );
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
    try {
      return await dedupeRpcRequest<Pool>(cacheKey, async () => {
        const raw = await this.withContractRead(
        (provider) => this.getAMMContract(provider),
        (amm) => amm.getPool(tokenA, tokenB) as Promise<RawPool>,
        );
        const result: Pool = {
        token0: raw.token0 ?? ethers.ZeroAddress,
        token1: raw.token1 ?? ethers.ZeroAddress,
        reserve0: BigInt(raw.reserve0 ?? 0),
        reserve1: BigInt(raw.reserve1 ?? 0),
        totalLiquidity: BigInt(raw.totalLiquidity ?? 0),
        kLast: BigInt(raw.kLast ?? 0),
        };
        setCache(cacheKey, result, TTL_POOL);
        return result;
      });
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch AMM pool data: ${parseContractError(error)}`,
      );
    }
  }

  async getAMMPoolSnapshot(
    tokenA: string,
    tokenB: string,
    userAddress: string,
  ): Promise<{ pool: Pool; liquidityBalance: bigint }> {
    this.validateAddress(tokenA, 'tokenA');
    this.validateAddress(tokenB, 'tokenB');
    this.validateAddress(userAddress, 'user');

    const cacheKey = this.cacheKey(`amm:pool-snapshot:${tokenA}:${tokenB}:${userAddress}`);
    const cached = getCached<{ pool: Pool; liquidityBalance: bigint }>(cacheKey);
    if (cached) return cached;

    try {
      const config = getNetworkConfig(this.chainId);
      if (!config?.ammAddress) {
        throw new Error(`LiquidityPoolAMM not deployed on chain ${this.chainId}`);
      }

      return await dedupeRpcRequest(cacheKey, async () => {
        const results = await rpcMulticallSameTarget<unknown>(
          this.chainId,
          config.ammAddress,
          LiquidityPoolAMMABI,
          [
            { functionName: 'getPool', args: [tokenA, tokenB] },
            { functionName: 'getLiquidityBalance', args: [tokenA, tokenB, userAddress] },
          ],
        );

        const rawPool = (results[0]?.success ? results[0].data : null) as RawPool | null;
        const pool: Pool = {
          token0: rawPool?.token0 ?? ethers.ZeroAddress,
          token1: rawPool?.token1 ?? ethers.ZeroAddress,
          reserve0: BigInt(rawPool?.reserve0 ?? 0),
          reserve1: BigInt(rawPool?.reserve1 ?? 0),
          totalLiquidity: BigInt(rawPool?.totalLiquidity ?? 0),
          kLast: BigInt(rawPool?.kLast ?? 0),
        };
        const liquidityBalance = results[1]?.success
          ? BigInt(results[1].data as bigint)
          : 0n;

        const snapshot = { pool, liquidityBalance };
        setCache(cacheKey, snapshot, TTL_POOL);
        setCache(this.cacheKey(`amm:pool:${tokenA}:${tokenB}`), pool, TTL_POOL);
        setCache(
          this.cacheKey(`amm:pool:${tokenA}:${tokenB}:lp:${userAddress}`),
          liquidityBalance,
          TTL_POOL,
        );
        return snapshot;
      });
    } catch (error: unknown) {
      throw new Error(
        `Failed to fetch AMM pool snapshot: ${parseContractError(error)}`,
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
    const cacheKey = this.cacheKey(`amm:pool:${tokenA}:${tokenB}:lp:${provider}`);
    const cached = getCached<bigint>(cacheKey);
    if (cached !== undefined) return cached;

    try {
      return await dedupeRpcRequest<bigint>(cacheKey, async () => {
        const result = await this.withContractRead(
        (readProvider) => this.getAMMContract(readProvider),
        (amm) => amm.getLiquidityBalance(tokenA, tokenB, provider) as Promise<bigint>,
        );
        setCache(cacheKey, result, TTL_POOL);
        return result;
      });
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
    try {
      return await this.withContractRead(
        (provider) => this.getAMMContract(provider),
        (amm) => amm.quote(tokenIn, tokenOut, amountIn) as Promise<bigint>,
      );
    } catch (error: unknown) {
      throw new Error(
        `Failed to get swap quote: ${parseContractError(error)}`,
      );
    }
  }

  /** Get withdrawable ETH balance from the AMM contract. */
  async getAMMEthBalance(userAddress: string): Promise<bigint> {
    this.validateAddress(userAddress, 'user');
    try {
      return await this.withContractRead(
        (provider) => this.getAMMContract(provider),
        (amm) => amm.ethBalances(userAddress) as Promise<bigint>,
      );
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
    const receipt = await waitForTransactionReceipt(tx, {
      chainId: this.chainId,
      confirmations,
      label: 'ContractService.waitForTransaction',
    });
    if (!receipt) {
      throw new Error('Transaction receipt is null — the transaction may still be pending.');
    }
    if (receipt.status === 0) {
      throw new Error(
        'Transaction was mined but reverted on-chain. ' +
        'This usually means the contract conditions were not met (e.g. insufficient balance, expired deadline, or slippage exceeded).',
      );
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
    if (address === ethers.ZeroAddress) {
      throw new Error(`${label} address cannot be the zero address`);
    }
  }

  /**
   * Execute a write transaction with upfront gas estimation.
   *
   * Gas estimation serves as a dry-run: if the transaction would revert,
   * the estimateGas call fails first with a descriptive Solidity error.
   * On transient RPC overload failures, this method retries via configured
   * fallback read RPC endpoints without triggering implicit wallet chain/RPC
   * reconfiguration.
   */
  private resolveContractAddress(contract: ethers.Contract): string {
    const target = contract.target;
    if (typeof target === 'string' && ethers.isAddress(target)) {
      return target;
    }
    throw new Error('Unable to resolve contract target address');
  }

  private async isWalletProviderHealthy(): Promise<boolean> {
    try {
      await this.provider.getBlockNumber();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Best-effort wallet RPC recovery path.
   *
   * Some wallet network profiles can point to stale/broken RPC URLs, which
   * surface as "Failed to fetch" on writes. Re-issuing
   * `wallet_addEthereumChain` with current RPC metadata can recover these
   * profiles for custom/test networks.
   */
  private async tryRecoverWalletRpcTransport(): Promise<boolean> {
    const network = getNetworkMetadata(this.chainId);
    if (!network) return false;

    const healthyEndpoint = await findHealthyEndpoint(this.chainId).catch(() => null);
    const rpcUrls = dedupeRpcUrls([
      ...(healthyEndpoint ? [healthyEndpoint] : []),
      ...getWalletSwitchRpcUrls(this.chainId),
      ...getOrderedRpcEndpoints(this.chainId),
      network.rpcUrl,
    ]);

    if (rpcUrls.length === 0) return false;

    const chainParams = {
      chainId: ethers.toQuantity(this.chainId),
      chainName: network.name,
      nativeCurrency: network.nativeCurrency,
      rpcUrls,
      ...(network.blockExplorer
        ? { blockExplorerUrls: [network.blockExplorer] }
        : {}),
    };

    try {
      await this.provider.send('wallet_addEthereumChain', [chainParams]);
    } catch {
      // Ignore: some wallets reject add for pre-installed chains.
    }

    try {
      await this.provider.send('wallet_switchEthereumChain', [
        { chainId: chainParams.chainId },
      ]);
    } catch {
      // Ignore: wallet may already be on this chain.
    }

    return this.isWalletProviderHealthy();
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
      // If the error contains a Solidity revert reason (CALL_EXCEPTION),
      // throw it immediately so the user gets the real error message
      // (e.g. MintExceedsOriginalValue) instead of a misleading gas error.
      if (isContractRevertError(error)) {
        throw error;
      }

      // For "insufficient funds" during estimation: the RPC may be
      // conflating a revert with a balance check, or the estimate may be
      // legitimately too expensive. Return null to let the wallet handle
      // its own estimation and give the user a chance to confirm/reject.
      if (isInsufficientFundsError(error)) {
        logger.warn(
          `[estimateGas] ${method}: estimation returned INSUFFICIENT_FUNDS — ` +
          'falling through to wallet-native estimation.',
          error,
        );
        return null;
      }

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
        if (isContractRevertError(fallbackError)) {
          throw fallbackError;
        }
        if (isInsufficientFundsError(fallbackError)) {
          logger.warn(
            `[estimateGas] ${method}: fallback estimation also returned ` +
            'INSUFFICIENT_FUNDS — falling through to wallet.',
            fallbackError,
          );
          return null;
        }
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
    const methodFn = contract.getFunction(method);
    if (!methodFn) {
      throw new Error(`Contract method unavailable: ${method}`);
    }

    // Build the merged overrides. If the caller didn't supply a gasLimit,
    // estimate gas using our own healthy read RPC endpoints (QuickNode etc.)
    // BEFORE calling the contract method. This is critical because ethers'
    // internal gas estimation goes through the wallet's RPC (thirdweb proxy),
    // which may be rate-limited or unreachable. By pre-estimating and passing
    // gasLimit as an override, the only wallet RPC call is eth_sendTransaction
    // itself — which MetaMask handles natively and reliably.
    const mergedOverrides: ethers.Overrides = { ...(overrides ?? {}) };
    const callerProvidedFeeOverrides =
      mergedOverrides.gasPrice != null ||
      mergedOverrides.maxFeePerGas != null ||
      mergedOverrides.maxPriorityFeePerGas != null;

    if (mergedOverrides.gasLimit == null) {
      try {
        const signerAddress = await (await this.getSigner()).getAddress();
        const gasEstimate = await this.estimateGasWithFallback(
          contract,
          method,
          args,
          signerAddress,
          overrides,
        );
        if (gasEstimate !== null) {
          // 25% buffer for safety on complex deployments (e.g. factory mint)
          mergedOverrides.gasLimit = (gasEstimate * 125n) / 100n;
        }
      } catch (estErr) {
        // If estimation fails with a revert, surface the real error.
        if (isContractRevertError(estErr)) {
          const userMessage = parseContractError(estErr);
          throw new Error(userMessage);
        }
        // For network/transport failures during estimation, continue without
        // a gasLimit — the wallet will do its own estimation.
        logger.warn(`[executeWrite] ${method}: gas estimation failed, proceeding without gasLimit`, estErr);
      }
    }

    // Pre-populate EIP-1559 fee data from our own direct RPC endpoints
    // (Alchemy/QuickNode) instead of letting ethers fetch it through the
    // wallet's thirdweb proxy which may be rate-limited or return stale
    // values. Add a 50% buffer to maxFeePerGas to absorb base-fee
    // fluctuations between estimation and inclusion — especially on L2s
    // like Arbitrum where base fees can spike between blocks.
    const clearAutoFeeOverrides = () => {
      if (callerProvidedFeeOverrides) return;
      delete mergedOverrides.gasPrice;
      delete mergedOverrides.maxFeePerGas;
      delete mergedOverrides.maxPriorityFeePerGas;
    };

    const populateFeeOverrides = async () => {
      if (callerProvidedFeeOverrides) return;
      clearAutoFeeOverrides();
      try {
        const feeOverrides = await this.withReadProvider((provider) =>
          buildBufferedFeeOverrides(provider),
        );

        if (
          feeOverrides.gasPrice != null ||
          feeOverrides.maxFeePerGas != null ||
          feeOverrides.maxPriorityFeePerGas != null
        ) {
          Object.assign(mergedOverrides, feeOverrides);
        } else {
          logger.warn(
            `[executeWrite] ${method}: read RPC fee data was unavailable or inconsistent, deferring to wallet`,
          );
        }
      } catch (feeErr) {
        // Non-fatal: the wallet will handle fee estimation as fallback.
        clearAutoFeeOverrides();
        logger.warn(`[executeWrite] ${method}: fee data fetch failed, deferring to wallet`, feeErr);
      }
    };

    await populateFeeOverrides();

    // Pre-populate the nonce from our healthy read RPC so ethers doesn't
    // need to call eth_getTransactionCount through the wallet's potentially
    // rate-limited thirdweb proxy. Combined with gasLimit and fee overrides,
    // this minimises the number of wallet-proxy RPC calls to just
    // eth_sendTransaction itself.
    if (mergedOverrides.nonce == null) {
      try {
        const signerAddress = await (await this.getSigner()).getAddress();
        const nonce = await this.withReadProvider((p) =>
          p.getTransactionCount(signerAddress, 'pending'),
        );
        mergedOverrides.nonce = nonce;
      } catch {
        // Non-fatal: ethers will fetch nonce via the wallet provider.
      }
    }

    // Pre-emptively switch the wallet's chain RPC to our paid Alchemy
    // endpoints BEFORE the first attempt. Without this, the very first
    // eth_sendTransaction goes through the thirdweb free-tier proxy which
    // rate-limits aggressively. This is the single most important step to
    // avoid "Network is busy (rate limited)" errors.
    await this.tryRecoverWalletRpcTransport().catch(() => {});

    let activeContract = contract;

    try {
      return await sendTransactionWithRetry(
        () =>
          activeContract.getFunction(method)(
            ...args,
            mergedOverrides,
          ) as Promise<ethers.ContractTransactionResponse>,
        {
          label: `ContractService.${method}`,
          onRetry: async (_attempt, error) => {
            const errMsg = error instanceof Error ? error.message : String(error);
            const isBaseFeeError = /max fee per gas less than block base fee/i.test(errMsg);

            // Re-fetch fee data on base-fee errors so the retry uses fresh pricing.
            if (isBaseFeeError) {
              await populateFeeOverrides();
            }

            // On rate-limit errors, reconfigure the wallet's chain RPC to
            // use our paid Alchemy endpoints instead of the rate-limited
            // thirdweb proxy. Also recover on non-rate-limit transport errors.
            await this.tryRecoverWalletRpcTransport().catch(() => {});

            // Re-fetch nonce via our healthy read RPC for the retry.
            try {
              const signerAddress = await (await this.getSigner()).getAddress();
              const freshNonce = await this.withReadProvider((p) =>
                p.getTransactionCount(signerAddress, 'pending'),
              );
              mergedOverrides.nonce = freshNonce;
            } catch {
              // Non-fatal.
            }

            const freshSigner = await this.getSigner();
            activeContract = contract.connect(freshSigner) as ethers.Contract;
          },
        },
      );
    } catch (err: unknown) {
      if (isUserRejection(err)) {
        throw new Error('Transaction was rejected in your wallet.');
      }
      throw new Error(parseContractError(err));
    }
  }

  /**
   * Parse a raw order tuple returned from the exchange contract.
   *
   * The Solidity Order struct fields are:
   *   id, maker, tokenSell, tokenBuy, amountSell, amountBuy,
   *   filledSell, filledBuy, cancelled, deadline
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
        deadline: BigInt(raw.deadline as string | number | bigint ?? 0),
      };
    } catch (_err: unknown) {
      throw new Error(
        `Failed to parse order data from blockchain. The data may be corrupted or the contract interface has changed.`,
      );
    }
  }
}
