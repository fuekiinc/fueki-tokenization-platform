import { create } from 'zustand';
import type { BrowserProvider, JsonRpcSigner } from 'ethers';

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
  };
}

export interface WalletActions {
  setWallet: (partial: Partial<WalletState['wallet']>) => void;
  setProvider: (provider: BrowserProvider | null) => void;
  setSigner: (signer: JsonRpcSigner | null) => void;
  resetWallet: () => void;
  setChainId: (chainId: number) => void;
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
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWalletStore = create<WalletStore>()((set) => ({
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
    set({
      wallet: { ...initialWalletState },
    });
  },

  setChainId: (chainId) =>
    set((state) => ({
      wallet: { ...state.wallet, chainId },
    })),
}));
