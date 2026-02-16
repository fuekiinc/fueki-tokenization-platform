import { create } from 'zustand';
import type { ExchangeOrder } from '../types/index.ts';

// ---------------------------------------------------------------------------
// State & Actions interfaces
// ---------------------------------------------------------------------------

export interface ExchangeState {
  orders: ExchangeOrder[];
  userOrders: ExchangeOrder[];
  isLoadingOrders: boolean;
  ordersError: string | null;
}

export interface ExchangeActions {
  setOrders: (orders: ExchangeOrder[]) => void;
  addOrder: (order: ExchangeOrder) => void;
  /** id is a decimal string matching ExchangeOrder['id']. */
  removeOrder: (id: string) => void;
  setUserOrders: (orders: ExchangeOrder[]) => void;
  setLoadingOrders: (loading: boolean) => void;
  setOrdersError: (error: string | null) => void;
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
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useExchangeStore = create<ExchangeStore>()((set) => ({
  ...initialExchangeState,

  setOrders: (orders) => set({ orders, ordersError: null }),

  addOrder: (order) =>
    set((state) => ({
      orders: [...state.orders, order],
    })),

  removeOrder: (id) =>
    set((state) => ({
      orders: state.orders.filter((o) => o.id !== id),
      userOrders: state.userOrders.filter((o) => o.id !== id),
    })),

  setUserOrders: (orders) => set({ userOrders: orders }),

  setLoadingOrders: (loading) => set({ isLoadingOrders: loading }),

  setOrdersError: (error) => set({ ordersError: error }),
}));
