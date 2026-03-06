/**
 * Trade state management store.
 *
 * Manages:
 *   - Trade form state (input amounts, selected tokens)
 *   - Slippage tolerance settings (persisted via localStorage)
 *   - Recent confirmed trade history
 *   - Pending transaction tracking
 */

import { create } from 'zustand';
import type { TradeHistory } from '../types/index.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** localStorage key for persisted slippage tolerance. */
const SLIPPAGE_PERSISTENCE_KEY = 'fueki:trade:slippage';
/** localStorage key for persisted recent trade history. */
const TRADE_HISTORY_PERSISTENCE_KEY = 'fueki:trade:history:v1';

/** Default slippage tolerance (0.5%). */
const DEFAULT_SLIPPAGE_BPS = 50;

/** Minimum slippage tolerance (0.01%). */
const MIN_SLIPPAGE_BPS = 1;

/** Maximum slippage tolerance (50%). */
const MAX_SLIPPAGE_BPS = 5000;

/** Maximum number of recent trades to keep in memory. */
const MAX_RECENT_TRADES = 100;

/** Maximum number of pending transactions to track. */
const MAX_PENDING_TXS = 20;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A pending transaction being tracked by the store. */
export interface PendingTx {
  /** Transaction hash. */
  txHash: string;
  /** Human-readable description of the transaction. */
  description: string;
  /** Type of operation. */
  type: TradeHistory['type'];
  /** Token address involved. */
  asset: string;
  /** Symbol of the token involved. */
  assetSymbol: string;
  /** Amount as a display string. */
  amount: string;
  /** Timestamp (ms) when the tx was submitted. */
  submittedAt: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Load persisted slippage from localStorage. */
function loadSlippage(): number {
  try {
    const raw = localStorage.getItem(SLIPPAGE_PERSISTENCE_KEY);
    if (!raw) return DEFAULT_SLIPPAGE_BPS;
    const parsed = parseInt(raw, 10);
    if (isNaN(parsed) || parsed < MIN_SLIPPAGE_BPS || parsed > MAX_SLIPPAGE_BPS) {
      return DEFAULT_SLIPPAGE_BPS;
    }
    return parsed;
  } catch {
    return DEFAULT_SLIPPAGE_BPS;
  }
}

/** Persist slippage to localStorage. */
function saveSlippage(bps: number): void {
  try {
    localStorage.setItem(SLIPPAGE_PERSISTENCE_KEY, String(bps));
  } catch {
    // localStorage may be unavailable
  }
}

function isValidTradeHistoryEntry(value: unknown): value is TradeHistory {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TradeHistory>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.type === 'string' &&
    typeof candidate.asset === 'string' &&
    typeof candidate.assetSymbol === 'string' &&
    typeof candidate.amount === 'string' &&
    typeof candidate.txHash === 'string' &&
    typeof candidate.timestamp === 'number' &&
    typeof candidate.from === 'string' &&
    typeof candidate.to === 'string' &&
    (candidate.status === 'pending' ||
      candidate.status === 'confirmed' ||
      candidate.status === 'failed')
  );
}

function loadTradeHistory(): TradeHistory[] {
  try {
    const raw = localStorage.getItem(TRADE_HISTORY_PERSISTENCE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isValidTradeHistoryEntry)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_RECENT_TRADES);
  } catch {
    return [];
  }
}

function saveTradeHistory(trades: TradeHistory[]): void {
  try {
    localStorage.setItem(
      TRADE_HISTORY_PERSISTENCE_KEY,
      JSON.stringify(trades.slice(0, MAX_RECENT_TRADES)),
    );
  } catch {
    // localStorage may be unavailable
  }
}

// ---------------------------------------------------------------------------
// State & Actions interfaces
// ---------------------------------------------------------------------------

export interface TradeState {
  tradeHistory: TradeHistory[];
  isLoadingTrades: boolean;
  tradesError: string | null;
  /** Slippage tolerance in basis points (e.g. 50 = 0.5%). */
  slippageBps: number;
  /** Currently pending (unconfirmed) transactions. */
  pendingTransactions: PendingTx[];
}

export interface TradeActions {
  setTrades: (trades: TradeHistory[]) => void;
  addTrade: (trade: TradeHistory) => void;
  updateTrade: (id: string, partial: Partial<TradeHistory>) => void;
  setLoadingTrades: (loading: boolean) => void;
  setTradesError: (error: string | null) => void;
  /** Set slippage tolerance in basis points. Clamped and persisted. */
  setSlippage: (bps: number) => void;
  /** Get the slippage as a decimal multiplier (e.g. 0.005 for 50 bps). */
  getSlippageDecimal: () => number;
  /** Add a pending transaction. Oldest is evicted if at capacity. */
  addPendingTx: (tx: PendingTx) => void;
  /** Remove a pending transaction by hash (e.g. after confirmation/failure). */
  removePendingTx: (txHash: string) => void;
  /** Clear all pending transactions. */
  clearPendingTxs: () => void;
}

export type TradeStore = TradeState & TradeActions;

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialTradesState: TradeState = {
  tradeHistory: loadTradeHistory(),
  isLoadingTrades: false,
  tradesError: null,
  slippageBps: loadSlippage(),
  pendingTransactions: [],
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useTradeStore = create<TradeStore>()((set, get) => ({
  ...initialTradesState,

  setTrades: (trades) => {
    // Keep only the most recent MAX_RECENT_TRADES entries.
    const trimmed = trades.length > MAX_RECENT_TRADES
      ? trades.slice(0, MAX_RECENT_TRADES)
      : trades;
    saveTradeHistory(trimmed);
    set({ tradeHistory: trimmed, tradesError: null });
  },

  addTrade: (trade) =>
    set((state) => {
      const updated = [trade, ...state.tradeHistory];
      const trimmed = updated.length > MAX_RECENT_TRADES
        ? updated.slice(0, MAX_RECENT_TRADES)
        : updated;
      saveTradeHistory(trimmed);
      return {
        tradeHistory: trimmed,
      };
    }),

  updateTrade: (id, partial) =>
    set((state) => {
      const updated = state.tradeHistory.map((t) =>
        t.id === id ? { ...t, ...partial } : t,
      );
      saveTradeHistory(updated);
      return { tradeHistory: updated };
    }),

  setLoadingTrades: (loading) => set({ isLoadingTrades: loading }),

  setTradesError: (error) => set({ tradesError: error }),

  setSlippage: (bps) => {
    const clamped = Math.max(MIN_SLIPPAGE_BPS, Math.min(MAX_SLIPPAGE_BPS, Math.round(bps)));
    saveSlippage(clamped);
    set({ slippageBps: clamped });
  },

  getSlippageDecimal: () => {
    return get().slippageBps / 10_000;
  },

  addPendingTx: (tx) =>
    set((state) => {
      const updated = [tx, ...state.pendingTransactions];
      return {
        pendingTransactions: updated.length > MAX_PENDING_TXS
          ? updated.slice(0, MAX_PENDING_TXS)
          : updated,
      };
    }),

  removePendingTx: (txHash) =>
    set((state) => ({
      pendingTransactions: state.pendingTransactions.filter(
        (t) => t.txHash !== txHash,
      ),
    })),

  clearPendingTxs: () => set({ pendingTransactions: [] }),
}));
