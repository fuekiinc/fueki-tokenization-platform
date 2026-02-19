/**
 * Security Token state management store.
 *
 * Manages:
 *   - Currently selected security token address
 *   - List of user-deployed security token addresses
 *   - Token details map (address -> SecurityTokenDetails)
 *   - Connected wallet's role bitmask per-token
 *   - Loading and error states
 *
 * This store is pure state -- all contract interactions live in the
 * useSecurityToken hook which updates this store as a side effect.
 */

import { create } from 'zustand';
import type { SecurityTokenDetails } from '../lib/blockchain/contracts';

// ---------------------------------------------------------------------------
// State & Actions interfaces
// ---------------------------------------------------------------------------

export interface SecurityTokenState {
  /** Currently active security token address for the management UI. */
  selectedTokenAddress: string | null;
  /** Addresses of security tokens deployed by the connected wallet. */
  tokenList: string[];
  /** Cached on-chain details keyed by checksummed token address. */
  tokenDetails: Record<string, SecurityTokenDetails>;
  /** Role bitmask results for the connected wallet on the selected token. */
  userRoles: Record<number, boolean>;
  /** Primary loading flag (token list, details). */
  isLoading: boolean;
  /** Granular loading flag for write transactions. */
  isTransacting: boolean;
  /** Human-readable error from the last failed operation. */
  error: string | null;
}

export interface SecurityTokenActions {
  setSelectedToken: (address: string | null) => void;
  setTokenList: (list: string[]) => void;
  setTokenDetails: (address: string, details: SecurityTokenDetails) => void;
  removeTokenDetails: (address: string) => void;
  setUserRoles: (roles: Record<number, boolean>) => void;
  setLoading: (loading: boolean) => void;
  setTransacting: (transacting: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export type SecurityTokenStore = SecurityTokenState & SecurityTokenActions;

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: SecurityTokenState = {
  selectedTokenAddress: null,
  tokenList: [],
  tokenDetails: {},
  userRoles: {},
  isLoading: false,
  isTransacting: false,
  error: null,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSecurityTokenStore = create<SecurityTokenStore>()((set) => ({
  ...initialState,

  setSelectedToken: (address) =>
    set({ selectedTokenAddress: address, error: null }),

  setTokenList: (list) =>
    set({ tokenList: list, error: null }),

  setTokenDetails: (address, details) =>
    set((state) => ({
      tokenDetails: { ...state.tokenDetails, [address]: details },
    })),

  removeTokenDetails: (address) =>
    set((state) => {
      const { [address]: _, ...rest } = state.tokenDetails;
      return { tokenDetails: rest };
    }),

  setUserRoles: (roles) =>
    set({ userRoles: roles }),

  setLoading: (loading) =>
    set({ isLoading: loading }),

  setTransacting: (transacting) =>
    set({ isTransacting: transacting }),

  setError: (error) =>
    set({ error, isLoading: false, isTransacting: false }),

  reset: () =>
    set({ ...initialState }),
}));

// ---------------------------------------------------------------------------
// Selectors -- use with shallow comparison for performance
// ---------------------------------------------------------------------------

export const selectSelectedTokenAddress = (state: SecurityTokenStore) =>
  state.selectedTokenAddress;

export const selectTokenList = (state: SecurityTokenStore) =>
  state.tokenList;

export const selectTokenDetails = (state: SecurityTokenStore) =>
  state.tokenDetails;

export const selectUserRoles = (state: SecurityTokenStore) =>
  state.userRoles;

export const selectIsLoading = (state: SecurityTokenStore) =>
  state.isLoading;

export const selectIsTransacting = (state: SecurityTokenStore) =>
  state.isTransacting;

export const selectError = (state: SecurityTokenStore) =>
  state.error;

/**
 * Derive the SecurityTokenDetails for the currently selected token.
 * Returns undefined if no token is selected or details are not loaded.
 */
export const selectActiveTokenDetails = (state: SecurityTokenStore) => {
  if (!state.selectedTokenAddress) return undefined;
  return state.tokenDetails[state.selectedTokenAddress];
};
