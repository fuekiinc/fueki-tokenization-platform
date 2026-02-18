/**
 * Wallet state management store.
 *
 * Manages:
 *   - Connection state (address, chainId, isConnected, isConnecting)
 *   - Native balance (ETH)
 *   - ENS name resolution for the connected address
 *   - Token balance tracking (ERC-20 balances keyed by address)
 *   - Connection persistence across page reloads (via localStorage)
 *
 * Non-serializable objects (BrowserProvider, JsonRpcSigner) are stored
 * in module-level refs outside the Zustand store.
 */

import { create } from 'zustand';
import type { BrowserProvider, JsonRpcSigner } from 'ethers';
import { invalidateCache } from '../lib/blockchain/rpcCache';

// ---------------------------------------------------------------------------
// Persistence key for localStorage
// ---------------------------------------------------------------------------

const WALLET_PERSISTENCE_KEY = 'fueki:wallet:connected';

// ---------------------------------------------------------------------------
// Module-level refs for non-serializable objects.
// Zustand state should remain serializable; provider & signer live here.
// ---------------------------------------------------------------------------

let _provider: BrowserProvider | null = null;
let _signer: JsonRpcSigner | null = null;

export function getProvider(): BrowserProvider | null {
  return _provider;
}

export function getSigner(): JsonRpcSigner | null {
  return _signer;
}

// ---------------------------------------------------------------------------
// State & Actions interfaces
// ---------------------------------------------------------------------------

export interface WalletState {
  wallet: {
    address: string | null;
    chainId: number | null;
    isConnected: boolean;
    isConnecting: boolean;
    balance: string;
    /** Resolved ENS name for the connected address (null if none). */
    ensName: string | null;
    /** Token balances keyed by checksummed token address. */
    tokenBalances: Record<string, string>;
  };
}

export interface WalletActions {
  setWallet: (partial: Partial<WalletState['wallet']>) => void;
  setProvider: (provider: BrowserProvider | null) => void;
  setSigner: (signer: JsonRpcSigner | null) => void;
  resetWallet: () => void;
  setChainId: (chainId: number) => void;
  /** Update a single token balance in the store. */
  setTokenBalance: (tokenAddress: string, balance: string) => void;
  /** Batch-update multiple token balances at once. */
  setTokenBalances: (balances: Record<string, string>) => void;
  /** Set the resolved ENS name for the connected address. */
  setEnsName: (name: string | null) => void;
  /** Persist connection preference to localStorage. */
  persistConnection: () => void;
  /** Clear persisted connection preference. */
  clearPersistedConnection: () => void;
  /** Check if a previous connection was persisted. */
  hasPersistedConnection: () => boolean;
}

export type WalletStore = WalletState & WalletActions;

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialWalletState: WalletState['wallet'] = {
  address: null,
  chainId: null,
  isConnected: false,
  isConnecting: false,
  balance: '0',
  ensName: null,
  tokenBalances: {},
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWalletStore = create<WalletStore>()((set, get) => ({
  wallet: { ...initialWalletState },

  setWallet: (partial) =>
    set((state) => ({
      wallet: { ...state.wallet, ...partial },
    })),

  setProvider: (provider) => {
    _provider = provider;
  },

  setSigner: (signer) => {
    _signer = signer;
  },

  resetWallet: () => {
    _provider = null;
    _signer = null;
    // Invalidate the RPC cache on disconnect so stale data does not
    // survive a reconnection to a different account.
    invalidateCache();
    // Clear persisted connection.
    try {
      localStorage.removeItem(WALLET_PERSISTENCE_KEY);
    } catch {
      // localStorage may be unavailable (private browsing, etc.)
    }
    set({
      wallet: { ...initialWalletState },
    });
  },

  setChainId: (chainId) =>
    set((state) => ({
      wallet: { ...state.wallet, chainId },
    })),

  setTokenBalance: (tokenAddress, balance) =>
    set((state) => ({
      wallet: {
        ...state.wallet,
        tokenBalances: {
          ...state.wallet.tokenBalances,
          [tokenAddress]: balance,
        },
      },
    })),

  setTokenBalances: (balances) =>
    set((state) => ({
      wallet: {
        ...state.wallet,
        tokenBalances: {
          ...state.wallet.tokenBalances,
          ...balances,
        },
      },
    })),

  setEnsName: (name) =>
    set((state) => ({
      wallet: { ...state.wallet, ensName: name },
    })),

  persistConnection: () => {
    try {
      const { address, chainId } = get().wallet;
      if (address && chainId) {
        localStorage.setItem(
          WALLET_PERSISTENCE_KEY,
          JSON.stringify({ address, chainId, timestamp: Date.now() }),
        );
      }
    } catch {
      // localStorage may be unavailable
    }
  },

  clearPersistedConnection: () => {
    try {
      localStorage.removeItem(WALLET_PERSISTENCE_KEY);
    } catch {
      // localStorage may be unavailable
    }
  },

  hasPersistedConnection: () => {
    try {
      const raw = localStorage.getItem(WALLET_PERSISTENCE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as { address?: string; chainId?: number; timestamp?: number };
      // Consider persisted connections stale after 24 hours.
      const MAX_AGE_MS = 24 * 60 * 60 * 1000;
      if (parsed.timestamp && Date.now() - parsed.timestamp > MAX_AGE_MS) {
        localStorage.removeItem(WALLET_PERSISTENCE_KEY);
        return false;
      }
      return Boolean(parsed.address);
    } catch {
      return false;
    }
  },
}));
