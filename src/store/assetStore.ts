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
