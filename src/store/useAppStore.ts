/**
 * Application-wide store and backward-compatibility re-export layer.
 *
 * Provides global state that does not belong to any single domain store
 * (feature flags, network status, global loading). Also re-exports all
 * domain stores for code that imports from `useAppStore` directly.
 */

import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

export interface FeatureFlags {
  enableOrbitalAMM: boolean;
  enableSecurityTokens: boolean;
  enableDocumentParsing: boolean;
  enableExport: boolean;
}

const defaultFeatureFlags: FeatureFlags = {
  enableOrbitalAMM: true,
  enableSecurityTokens: true,
  enableDocumentParsing: true,
  enableExport: true,
};

// ---------------------------------------------------------------------------
// State & Actions interfaces
// ---------------------------------------------------------------------------

export interface AppState {
  /** Whether the initial application bootstrap has completed. */
  isAppReady: boolean;
  /** Global loading overlay (e.g. during initial data fetch). */
  isGlobalLoading: boolean;
  /** Current network connectivity status. */
  isOnline: boolean;
  /** Whether the WebSocket / RPC connection to the blockchain is live. */
  isChainConnected: boolean;
  /** Feature flags controlling which sections are visible. */
  featureFlags: FeatureFlags;
  /** Global error message shown in the app shell. */
  globalError: string | null;
}

export interface AppActions {
  setAppReady: (ready: boolean) => void;
  setGlobalLoading: (loading: boolean) => void;
  setOnline: (online: boolean) => void;
  setChainConnected: (connected: boolean) => void;
  setFeatureFlags: (flags: Partial<FeatureFlags>) => void;
  setGlobalError: (error: string | null) => void;
  resetApp: () => void;
}

export type AppStore = AppState & AppActions;

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialAppState: AppState = {
  isAppReady: false,
  isGlobalLoading: false,
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isChainConnected: false,
  featureFlags: { ...defaultFeatureFlags },
  globalError: null,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAppStore = create<AppStore>()((set) => ({
  ...initialAppState,

  setAppReady: (ready) => set({ isAppReady: ready }),

  setGlobalLoading: (loading) => set({ isGlobalLoading: loading }),

  setOnline: (online) => set({ isOnline: online }),

  setChainConnected: (connected) => set({ isChainConnected: connected }),

  setFeatureFlags: (flags) =>
    set((state) => ({
      featureFlags: { ...state.featureFlags, ...flags },
    })),

  setGlobalError: (error) => set({ globalError: error }),

  resetApp: () => set({ ...initialAppState }),
}));

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const selectIsAppReady = (state: AppStore) => state.isAppReady;
export const selectIsGlobalLoading = (state: AppStore) => state.isGlobalLoading;
export const selectIsOnline = (state: AppStore) => state.isOnline;
export const selectIsChainConnected = (state: AppStore) => state.isChainConnected;
export const selectFeatureFlags = (state: AppStore) => state.featureFlags;
export const selectGlobalError = (state: AppStore) => state.globalError;

// ---------------------------------------------------------------------------
// Domain store re-exports (backward compatibility)
// ---------------------------------------------------------------------------

export { useWalletStore, getProvider, getSigner } from './walletStore.ts';
export { useDocumentStore } from './documentStore.ts';
export { useAssetStore } from './assetStore.ts';
export { useTradeStore } from './tradeStore.ts';
export { useExchangeStore } from './exchangeStore.ts';
export { useUIStore } from './uiStore.ts';

export type { WalletStore } from './walletStore.ts';
export type { DocumentStore } from './documentStore.ts';
export type { AssetStore } from './assetStore.ts';
export type { TradeStore } from './tradeStore.ts';
export type { ExchangeStore } from './exchangeStore.ts';
export type { UIStore } from './uiStore.ts';
