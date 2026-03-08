/**
 * Exchange state management store.
 *
 * Manages:
 *   - Order book state (all active orders, user orders)
 *   - Selected trading pair
 *   - Quote caching for swap estimates
 *   - Real-time order update handling
 *   - Trade history for the current pair
 */

import { create } from 'zustand';
import type { ExchangeOrder } from '../types/index.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Represents a selected trading pair. */
export interface TradingPair {
  tokenSell: string;
  tokenBuy: string;
  tokenSellSymbol: string;
  tokenBuySymbol: string;
}

/** Cached quote for a swap. */
export interface CachedQuote {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  /** Timestamp (ms) when the quote was fetched. */
  fetchedAt: number;
}

/** Quote TTL: 15 seconds. */
const QUOTE_TTL_MS = 15_000;

// ---------------------------------------------------------------------------
// State & Actions interfaces
// ---------------------------------------------------------------------------

export interface ExchangeState {
  orders: ExchangeOrder[];
  userOrders: ExchangeOrder[];
  isLoadingOrders: boolean;
  ordersError: string | null;
  /** Currently selected trading pair (null if none selected). */
  selectedPair: TradingPair | null;
  /** Cached swap quote (for the current pair). */
  cachedQuote: CachedQuote | null;
  /** Trade history entries for the current trading pair. */
  pairTradeHistory: ExchangeOrder[];
}

export interface ExchangeActions {
  reset: () => void;
  setOrders: (orders: ExchangeOrder[]) => void;
  addOrder: (order: ExchangeOrder) => void;
  /** Update an existing order in-place (e.g. after a partial fill). */
  updateOrder: (id: string, partial: Partial<ExchangeOrder>) => void;
  /** id is a decimal string matching ExchangeOrder['id']. */
  removeOrder: (id: string) => void;
  setUserOrders: (orders: ExchangeOrder[]) => void;
  setLoadingOrders: (loading: boolean) => void;
  setOrdersError: (error: string | null) => void;
  /** Set the selected trading pair. */
  setSelectedPair: (pair: TradingPair | null) => void;
  /** Cache a swap quote. */
  setCachedQuote: (quote: CachedQuote | null) => void;
  /**
   * Get the cached quote if it is still fresh (within QUOTE_TTL_MS).
   * Returns null if expired or no quote cached.
   */
  getFreshQuote: () => CachedQuote | null;
  /** Set trade history for the currently selected pair. */
  setPairTradeHistory: (trades: ExchangeOrder[]) => void;
  /**
   * Handle a real-time order update event from the blockchain.
   * Upserts the order into both the orders and userOrders arrays
   * if the order belongs to the current user.
   */
  handleOrderUpdate: (order: ExchangeOrder, userAddress: string | null) => void;
}

export type ExchangeStore = ExchangeState & ExchangeActions;

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialExchangeState: ExchangeState = {
  orders: [],
  userOrders: [],
  isLoadingOrders: false,
  ordersError: null,
  selectedPair: null,
  cachedQuote: null,
  pairTradeHistory: [],
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useExchangeStore = create<ExchangeStore>()((set, get) => ({
  ...initialExchangeState,

  reset: () => set({ ...initialExchangeState }),

  setOrders: (orders) => set({ orders, ordersError: null }),

  addOrder: (order) =>
    set((state) => ({
      orders: [...state.orders, order],
    })),

  updateOrder: (id, partial) =>
    set((state) => ({
      orders: state.orders.map((o) => (o.id === id ? { ...o, ...partial } : o)),
      userOrders: state.userOrders.map((o) => (o.id === id ? { ...o, ...partial } : o)),
    })),

  removeOrder: (id) =>
    set((state) => ({
      orders: state.orders.filter((o) => o.id !== id),
      userOrders: state.userOrders.filter((o) => o.id !== id),
    })),

  setUserOrders: (orders) => set({ userOrders: orders }),

  setLoadingOrders: (loading) => set({ isLoadingOrders: loading }),

  setOrdersError: (error) => set({ ordersError: error }),

  setSelectedPair: (pair) =>
    set({
      selectedPair: pair,
      // Clear stale data when pair changes.
      cachedQuote: null,
      pairTradeHistory: [],
    }),

  setCachedQuote: (quote) => set({ cachedQuote: quote }),

  getFreshQuote: () => {
    const { cachedQuote } = get();
    if (!cachedQuote) return null;
    if (Date.now() - cachedQuote.fetchedAt > QUOTE_TTL_MS) {
      // Quote expired -- clear it.
      set({ cachedQuote: null });
      return null;
    }
    return cachedQuote;
  },

  setPairTradeHistory: (trades) => set({ pairTradeHistory: trades }),

  handleOrderUpdate: (order, userAddress) =>
    set((state) => {
      // Upsert into the main orders array.
      const existingIdx = state.orders.findIndex((o) => o.id === order.id);
      const updatedOrders =
        existingIdx >= 0
          ? state.orders.map((o, i) => (i === existingIdx ? order : o))
          : [...state.orders, order];

      // Upsert into user orders if the order belongs to the connected user.
      let updatedUserOrders = state.userOrders;
      if (
        userAddress &&
        order.maker.toLowerCase() === userAddress.toLowerCase()
      ) {
        const userIdx = state.userOrders.findIndex((o) => o.id === order.id);
        updatedUserOrders =
          userIdx >= 0
            ? state.userOrders.map((o, i) => (i === userIdx ? order : o))
            : [...state.userOrders, order];
      }

      return { orders: updatedOrders, userOrders: updatedUserOrders };
    }),
}));
