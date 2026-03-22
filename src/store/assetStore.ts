import { create } from 'zustand';
import type { SecurityToken, WrappedAsset } from '../types/index.ts';
import { withStoreMiddleware } from './storeMiddleware';

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
  /** ISO timestamp of the last successful asset fetch. */
  lastFetchedAt: string | null;
  /** ISO timestamp of the last successful security token fetch. */
  lastTokensFetchedAt: string | null;
}

export interface AssetActions {
  // Wrapped assets
  setAssets: (assets: WrappedAsset[]) => void;
  addAsset: (asset: WrappedAsset) => void;
  addAssetOptimistic: (asset: WrappedAsset, rollback: () => void) => () => void;
  updateAsset: (address: string, partial: Partial<WrappedAsset>) => void;
  removeAsset: (address: string) => void;
  setLoadingAssets: (loading: boolean) => void;
  setAssetsError: (error: string | null) => void;
  batchUpdateAssets: (updates: Array<{ address: string; partial: Partial<WrappedAsset> }>) => void;
  // Security tokens
  setSecurityTokens: (tokens: SecurityToken[]) => void;
  addSecurityToken: (token: SecurityToken) => void;
  updateSecurityToken: (address: string, partial: Partial<SecurityToken>) => void;
  removeSecurityToken: (address: string) => void;
  setLoadingSecurityTokens: (loading: boolean) => void;
  setSecurityTokensError: (error: string | null) => void;
  batchUpdateSecurityTokens: (updates: Array<{ address: string; partial: Partial<SecurityToken> }>) => void;
  // Cache management
  isCacheValid: (maxAgeMs?: number) => boolean;
  isTokensCacheValid: (maxAgeMs?: number) => boolean;
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
// Cache duration defaults
// ---------------------------------------------------------------------------

const DEFAULT_CACHE_MAX_AGE_MS = 30_000; // 30 seconds

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
  lastFetchedAt: null,
  lastTokensFetchedAt: null,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAssetStore = create<AssetStore>()(withStoreMiddleware('asset', (set, get) => ({
  ...initialAssetState,

  // ---- Wrapped assets -------------------------------------------------------

  setAssets: (assets) =>
    set({
      wrappedAssets: assets,
      assetsError: null,
      lastFetchedAt: new Date().toISOString(),
    }),

  addAsset: (asset) =>
    set((state) => ({
      wrappedAssets: [...state.wrappedAssets, asset],
    })),

  addAssetOptimistic: (asset, rollback) => {
    set((state) => ({
      wrappedAssets: [...state.wrappedAssets, asset],
    }));
    return () => {
      rollback();
      set((state) => ({
        wrappedAssets: state.wrappedAssets.filter(
          (a) => a.address !== asset.address,
        ),
      }));
    };
  },

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

  setAssetsError: (error) => set({ assetsError: error, isLoadingAssets: false }),

  batchUpdateAssets: (updates) =>
    set((state) => {
      const updateMap = new Map(
        updates.map((u) => [u.address, u.partial]),
      );
      return {
        wrappedAssets: state.wrappedAssets.map((a) => {
          const partial = updateMap.get(a.address);
          return partial ? { ...a, ...partial } : a;
        }),
      };
    }),

  // ---- Security tokens ------------------------------------------------------

  setSecurityTokens: (tokens) =>
    set({
      securityTokens: tokens,
      securityTokensError: null,
      lastTokensFetchedAt: new Date().toISOString(),
    }),

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

  setSecurityTokensError: (error) =>
    set({ securityTokensError: error, isLoadingSecurityTokens: false }),

  batchUpdateSecurityTokens: (updates) =>
    set((state) => {
      const updateMap = new Map(
        updates.map((u) => [u.address, u.partial]),
      );
      return {
        securityTokens: state.securityTokens.map((t) => {
          const partial = updateMap.get(t.address);
          return partial ? { ...t, ...partial } : t;
        }),
      };
    }),

  // ---- Cache management -----------------------------------------------------

  isCacheValid: (maxAgeMs = DEFAULT_CACHE_MAX_AGE_MS) => {
    const { lastFetchedAt } = get();
    if (!lastFetchedAt) return false;
    return Date.now() - new Date(lastFetchedAt).getTime() < maxAgeMs;
  },

  isTokensCacheValid: (maxAgeMs = DEFAULT_CACHE_MAX_AGE_MS) => {
    const { lastTokensFetchedAt } = get();
    if (!lastTokensFetchedAt) return false;
    return Date.now() - new Date(lastTokensFetchedAt).getTime() < maxAgeMs;
  },
})));

// ---------------------------------------------------------------------------
// Selectors -- use with shallow comparison for performance
// ---------------------------------------------------------------------------

export const selectWrappedAssets = (state: AssetStore) => state.wrappedAssets;
export const selectSecurityTokens = (state: AssetStore) => state.securityTokens;
export const selectIsLoadingAssets = (state: AssetStore) => state.isLoadingAssets;
export const selectIsLoadingSecurityTokens = (state: AssetStore) => state.isLoadingSecurityTokens;
export const selectAssetsError = (state: AssetStore) => state.assetsError;
export const selectSecurityTokensError = (state: AssetStore) => state.securityTokensError;
