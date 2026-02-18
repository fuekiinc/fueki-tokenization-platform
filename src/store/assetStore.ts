import { create } from 'zustand';
import type { WrappedAsset, SecurityToken } from '../types/index.ts';

// ---------------------------------------------------------------------------
// State & Actions interfaces
// ---------------------------------------------------------------------------

export interface AssetState {
  wrappedAssets: WrappedAsset[];
  isLoadingAssets: boolean;
  assetsError: string | null;
  securityTokens: SecurityToken[];
  isLoadingSecurityTokens: boolean;
  securityTokensError: string | null;
}

export interface AssetActions {
  // Wrapped assets
  setAssets: (assets: WrappedAsset[]) => void;
  addAsset: (asset: WrappedAsset) => void;
  updateAsset: (address: string, partial: Partial<WrappedAsset>) => void;
  removeAsset: (address: string) => void;
  setLoadingAssets: (loading: boolean) => void;
  setAssetsError: (error: string | null) => void;
  // Security tokens
  setSecurityTokens: (tokens: SecurityToken[]) => void;
  addSecurityToken: (token: SecurityToken) => void;
  updateSecurityToken: (address: string, partial: Partial<SecurityToken>) => void;
  removeSecurityToken: (address: string) => void;
  setLoadingSecurityTokens: (loading: boolean) => void;
  setSecurityTokensError: (error: string | null) => void;
}

export type AssetStore = AssetState & AssetActions;

// ---------------------------------------------------------------------------
// Fetch generation guard
// ---------------------------------------------------------------------------
// Prevents stale async fetches from overwriting newer data.
// Call `nextAssetFetchGeneration()` at the start of a fetch and compare the
// returned value against `getAssetFetchGeneration()` before committing
// results to the store. If they differ, a newer fetch was initiated and the
// current results should be discarded.
// ---------------------------------------------------------------------------

let _assetFetchGeneration = 0;

/** Increment and return the new generation number. Call at fetch start. */
export function nextAssetFetchGeneration(): number {
  return ++_assetFetchGeneration;
}

/** Return the current generation number. Compare after async work. */
export function getAssetFetchGeneration(): number {
  return _assetFetchGeneration;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialAssetState: AssetState = {
  wrappedAssets: [],
  isLoadingAssets: false,
  assetsError: null,
  securityTokens: [],
  isLoadingSecurityTokens: false,
  securityTokensError: null,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAssetStore = create<AssetStore>()((set) => ({
  ...initialAssetState,

  // ---- Wrapped assets -------------------------------------------------------

  setAssets: (assets) => set({ wrappedAssets: assets, assetsError: null }),

  addAsset: (asset) =>
    set((state) => ({
      wrappedAssets: [...state.wrappedAssets, asset],
    })),

  updateAsset: (address, partial) =>
    set((state) => ({
      wrappedAssets: state.wrappedAssets.map((a) =>
        a.address === address ? { ...a, ...partial } : a,
      ),
    })),

  removeAsset: (address) =>
    set((state) => ({
      wrappedAssets: state.wrappedAssets.filter((a) => a.address !== address),
    })),

  setLoadingAssets: (loading) => set({ isLoadingAssets: loading }),

  setAssetsError: (error) => set({ assetsError: error }),

  // ---- Security tokens ------------------------------------------------------

  setSecurityTokens: (tokens) =>
    set({ securityTokens: tokens, securityTokensError: null }),

  addSecurityToken: (token) =>
    set((state) => ({
      securityTokens: [...state.securityTokens, token],
    })),

  updateSecurityToken: (address, partial) =>
    set((state) => ({
      securityTokens: state.securityTokens.map((t) =>
        t.address === address ? { ...t, ...partial } : t,
      ),
    })),

  removeSecurityToken: (address) =>
    set((state) => ({
      securityTokens: state.securityTokens.filter((t) => t.address !== address),
    })),

  setLoadingSecurityTokens: (loading) => set({ isLoadingSecurityTokens: loading }),

  setSecurityTokensError: (error) => set({ securityTokensError: error }),
}));
