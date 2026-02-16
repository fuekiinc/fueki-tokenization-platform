import { create } from 'zustand';
import type { TradeHistory } from '../types/index.ts';

// ---------------------------------------------------------------------------
// State & Actions interfaces
// ---------------------------------------------------------------------------

export interface TradeState {
  tradeHistory: TradeHistory[];
  isLoadingTrades: boolean;
  tradesError: string | null;
}

export interface TradeActions {
  setTrades: (trades: TradeHistory[]) => void;
  addTrade: (trade: TradeHistory) => void;
  updateTrade: (id: string, partial: Partial<TradeHistory>) => void;
  setLoadingTrades: (loading: boolean) => void;
  setTradesError: (error: string | null) => void;
}

export type TradeStore = TradeState & TradeActions;

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialTradesState: TradeState = {
  tradeHistory: [],
  isLoadingTrades: false,
  tradesError: null,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useTradeStore = create<TradeStore>()((set) => ({
  ...initialTradesState,

  setTrades: (trades) => set({ tradeHistory: trades, tradesError: null }),

  addTrade: (trade) =>
    set((state) => ({
      tradeHistory: [trade, ...state.tradeHistory],
    })),

  updateTrade: (id, partial) =>
    set((state) => ({
      tradeHistory: state.tradeHistory.map((t) =>
        t.id === id ? { ...t, ...partial } : t,
      ),
    })),

  setLoadingTrades: (loading) => set({ isLoadingTrades: loading }),

  setTradesError: (error) => set({ tradesError: error }),
}));
