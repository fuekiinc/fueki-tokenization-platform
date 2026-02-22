/**
 * Wallet state management store.
 *
 * Manages:
 *   - Connection state (address, chainId, isConnected, isConnecting)
 *   - Connection lifecycle status (connected/connecting/switching/degraded)
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
import { invalidateCache, invalidateChainCache } from '../lib/blockchain/rpcCache';

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

export type WalletConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'switching'
  | 'degraded';

// ---------------------------------------------------------------------------
// State & Actions interfaces
// ---------------------------------------------------------------------------

export interface WalletState {
  wallet: {
    address: string | null;
    chainId: number | null;
    isConnected: boolean;
    isConnecting: boolean;
    /** High-level lifecycle status for UI and action gating. */
    connectionStatus: WalletConnectionStatus;
    /** True when an ethers BrowserProvider instance is available. */
    providerReady: boolean;
    /** True when an ethers Signer instance is available. */
    signerReady: boolean;
    /** Last successful sync timestamp (ms since epoch). */
    lastSyncAt: number | null;
    /** Last connection/sync error for UX display. */
    lastError: string | null;
    /** Chain id currently being switched to (when switching). */
    switchTargetChainId: number | null;
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
  setConnectionStatus: (status: WalletConnectionStatus) => void;
  setLastError: (error: string | null) => void;
  beginChainSwitch: (targetChainId: number) => void;
  completeChainSwitch: () => void;
  failChainSwitch: (error: string | null) => void;
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
  connectionStatus: 'disconnected',
  providerReady: false,
  signerReady: false,
  lastSyncAt: null,
  lastError: null,
  switchTargetChainId: null,
  balance: '0',
  ensName: null,
  tokenBalances: {},
};

function normalizeWalletState(wallet: WalletState['wallet']): WalletState['wallet'] {
  const providerReady = Boolean(_provider);
  const signerReady = Boolean(_signer);

  const next: WalletState['wallet'] = {
    ...wallet,
    providerReady,
    signerReady,
  };

  // Invariant: do not report connected unless provider+signer are both ready.
  if (!providerReady || !signerReady) {
    if (next.isConnected) {
      next.isConnected = false;
    }
    if (next.connectionStatus === 'connected') {
      next.connectionStatus = next.isConnecting ? 'connecting' : 'degraded';
    }
  }

  // Invariant: a "connected" lifecycle state must reflect an actual connected wallet.
  if (next.connectionStatus === 'connected' && !next.isConnected) {
    next.connectionStatus = next.isConnecting ? 'connecting' : 'degraded';
  }

  if (next.connectionStatus === 'disconnected') {
    next.isConnecting = false;
    next.isConnected = false;
    next.lastError = null;
  }

  return next;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWalletStore = create<WalletStore>()((set, get) => ({
  wallet: { ...initialWalletState },

  setWallet: (partial) =>
    set((state) => ({
      wallet: normalizeWalletState({ ...state.wallet, ...partial }),
    })),

  setProvider: (provider) => {
    _provider = provider;
    set((state) => ({
      wallet: normalizeWalletState({
        ...state.wallet,
        lastSyncAt: Date.now(),
      }),
    }));
  },

  setSigner: (signer) => {
    _signer = signer;
    set((state) => ({
      wallet: normalizeWalletState({
        ...state.wallet,
        lastSyncAt: Date.now(),
      }),
    }));
  },

  setConnectionStatus: (status) =>
    set((state) => ({
      wallet: normalizeWalletState({
        ...state.wallet,
        connectionStatus: status,
        isConnecting: status === 'connecting' || status === 'switching',
        switchTargetChainId: status === 'switching' ? state.wallet.switchTargetChainId : null,
      }),
    })),

  setLastError: (error) =>
    set((state) => ({
      wallet: normalizeWalletState({
        ...state.wallet,
        lastError: error,
      }),
    })),

  beginChainSwitch: (targetChainId) => {
    const previousChainId = get().wallet.chainId;

    if (previousChainId !== null) {
      invalidateChainCache(previousChainId);
    }
    invalidateChainCache(targetChainId);

    _provider = null;
    _signer = null;

    set((state) => ({
      wallet: normalizeWalletState({
        ...state.wallet,
        chainId: targetChainId,
        isConnected: false,
        isConnecting: true,
        connectionStatus: 'switching',
        switchTargetChainId: targetChainId,
        lastError: null,
        ensName: null,
        tokenBalances: {},
      }),
    }));
  },

  completeChainSwitch: () =>
    set((state) => ({
      wallet: normalizeWalletState({
        ...state.wallet,
        connectionStatus: state.wallet.isConnected ? 'connected' : 'connecting',
        isConnecting: !state.wallet.isConnected,
        switchTargetChainId: null,
        lastSyncAt: Date.now(),
      }),
    })),

  failChainSwitch: (error) => {
    _provider = null;
    _signer = null;
    set((state) => ({
      wallet: normalizeWalletState({
        ...state.wallet,
        isConnected: false,
        isConnecting: false,
        connectionStatus: 'degraded',
        switchTargetChainId: null,
        lastError: error,
      }),
    }));
  },

  resetWallet: () => {
    _provider = null;
    _signer = null;
    // Invalidate all cached RPC data on disconnect.
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
      wallet: normalizeWalletState({ ...state.wallet, chainId }),
    })),

  setTokenBalance: (tokenAddress, balance) =>
    set((state) => ({
      wallet: normalizeWalletState({
        ...state.wallet,
        tokenBalances: {
          ...state.wallet.tokenBalances,
          [tokenAddress]: balance,
        },
      }),
    })),

  setTokenBalances: (balances) =>
    set((state) => ({
      wallet: normalizeWalletState({
        ...state.wallet,
        tokenBalances: {
          ...state.wallet.tokenBalances,
          ...balances,
        },
      }),
    })),

  setEnsName: (name) =>
    set((state) => ({
      wallet: normalizeWalletState({ ...state.wallet, ensName: name }),
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
