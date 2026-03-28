// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

// NOTE: provider and signer are intentionally NOT part of this interface.
// They are non-serializable objects stored as module-level refs in
// useAppStore.ts and accessed via getProvider() / getSigner().
export interface WalletState {
  address: string | null;
  chainId: number | null;
  isConnected: boolean;
  isConnecting: boolean;
  balance: string;
}

export interface NetworkInfo {
  chainId: number;
  name: string;
  rpcUrl: string;
  blockExplorer: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

// ---------------------------------------------------------------------------
// Document Parsing
// ---------------------------------------------------------------------------

export type SupportedFileType = 'json' | 'csv' | 'xml' | 'pdf' | 'png' | 'jpg';

export interface ParsedTransaction {
  id: string;
  type: string;
  amount: number;
  currency: string;
  description: string;
  date: string;
  from?: string;
  to?: string;
  reference?: string;
  metadata?: Record<string, unknown>;
  /** Confidence that this amount is a meaningful stated value (0-1). PDF only. */
  confidence?: number;
  /** True when this transaction represents the primary stated value of the document. */
  isPrimaryValue?: boolean;
}

export interface ParsedDocument {
  fileName: string;
  fileType: SupportedFileType;
  transactions: ParsedTransaction[];
  totalValue: number;
  currency: string;
  /** ISO-8601 string -- stored as a string so the Zustand store stays serializable. */
  parsedAt: string;
  documentHash: string;
  /** Semantic document type detected by the intelligence module (e.g. "appraisal", "invoice"). */
  documentClassification?: string;
  /** How the primary value was determined (e.g. "keyword_match", "largest_amount_fallback"). */
  valueExtractionMethod?: string;
  /** Confidence in the extracted totalValue (0-1). */
  valueConfidence?: number;
}

// ---------------------------------------------------------------------------
// Wrapped Assets (ERC-20 tokens backed by parsed documents)
// ---------------------------------------------------------------------------

export interface WrappedAsset {
  address: string;
  name: string;
  symbol: string;
  totalSupply: string;
  balance: string;
  documentHash: string;
  documentType: string;
  originalValue: string;
  createdAt?: number;
}

// ---------------------------------------------------------------------------
// Security Tokens (ERC-1404 compliance tokens from SecurityTokenFactory)
// ---------------------------------------------------------------------------

export interface SecurityToken {
  address: string;
  transferRulesAddress: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  maxTotalSupply: string;
  balance: string;
  unlockedBalance: string;
  lockedBalance: string;
  documentHash: string;
  documentType: string;
  originalValue: string;
  creator: string;
  createdAt?: number;
  isPaused?: boolean;
}

// ---------------------------------------------------------------------------
// Exchange
// ---------------------------------------------------------------------------

/**
 * Serializable representation of an on-chain exchange order for the Zustand
 * store.
 *
 * All `bigint` values from the contract layer are stored as **decimal strings**
 * so that the store remains fully JSON-serializable (required for devtools,
 * persistence middleware, SSR hydration, etc.).  Convert back to `bigint` at
 * the point of use with `BigInt(value)`.
 *
 * The Solidity struct tracks fill amounts for both sides of the order
 * (`filledSell`, `filledBuy`) and has no timestamp field -- timestamps
 * should be derived from the block in which the OrderCreated event was
 * emitted if needed.
 */
export interface ExchangeOrder {
  /** Decimal string representation of the on-chain order id. */
  id: string;
  maker: string;
  tokenSell: string;
  tokenBuy: string;
  /** Decimal string -- use `BigInt(amountSell)` when calling contracts. */
  amountSell: string;
  /** Decimal string -- use `BigInt(amountBuy)` when calling contracts. */
  amountBuy: string;
  /** Decimal string of the total filled amount on the sell side. */
  filledSell: string;
  /** Decimal string of the total filled amount on the buy side. */
  filledBuy: string;
  cancelled: boolean;
  /** Decimal string -- unix timestamp (seconds) after which the order expires. "0" = no expiry. */
  deadline: string;
}

// ---------------------------------------------------------------------------
// Liquidity Pools (AMM)
// ---------------------------------------------------------------------------

/** Serializable representation of an AMM liquidity pool. */
export interface LiquidityPool {
  poolId: string;
  token0: string;
  token1: string;
  reserve0: string;
  reserve1: string;
  totalLiquidity: string;
  kLast: string;
}

/** A user's LP position in a specific pool. */
export interface LiquidityPosition {
  poolId: string;
  token0: string;
  token1: string;
  liquidity: string;
  share: number;
}

// ---------------------------------------------------------------------------
// Trade History
// ---------------------------------------------------------------------------

export interface TradeHistory {
  id: string;
  type: 'mint' | 'burn' | 'transfer' | 'exchange' | 'security-mint' | 'swap-eth' | 'swap-erc20';
  asset: string;
  assetSymbol: string;
  amount: string;
  txHash: string;
  timestamp: number;
  from: string;
  to: string;
  status: 'pending' | 'confirmed' | 'failed';
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

export interface MintFormData {
  name: string;
  symbol: string;
  document: ParsedDocument | null;
  mintAmount: string;
  recipient: string;
}

// ---------------------------------------------------------------------------
// UI / Notifications
// ---------------------------------------------------------------------------

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  timestamp: number;
  /** Whether the notification should be automatically removed after `duration` ms. Defaults to true. */
  autoDismiss?: boolean;
  /** Auto-dismiss delay in milliseconds. Defaults to 5000. Only used when autoDismiss is not false. */
  duration?: number;
}

export interface ModalContent {
  title: string;
  body: string;
  data?: unknown;
}
