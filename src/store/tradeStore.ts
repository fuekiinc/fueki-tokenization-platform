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
import { mergeTradeHistoryEntries } from '../lib/dashboardActivity';
import { withStoreMiddleware } from './storeMiddleware';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** localStorage key for persisted slippage tolerance. */
const SLIPPAGE_PERSISTENCE_KEY = 'fueki:trade:slippage';
/** localStorage prefix for wallet/network-scoped recent trade history. */
const TRADE_HISTORY_PERSISTENCE_PREFIX = 'fueki:trade:history:v2';

/** Default slippage tolerance (0.5%). */
const DEFAULT_SLIPPAGE_BPS = 50;

/** Minimum slippage tolerance (0.01%). */
const MIN_SLIPPAGE_BPS = 1;

/** Maximum slippage tolerance (50%). */
const MAX_SLIPPAGE_BPS = 5000;

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

function makeTradeHistoryScopeKey(address: string | null, chainId: number | null): string | null {
  if (!address || !chainId) return null;
  return `${TRADE_HISTORY_PERSISTENCE_PREFIX}:${chainId}:${address.toLowerCase()}`;
}

function normalizeTradeHistory(trades: TradeHistory[]): TradeHistory[] {
  return mergeTradeHistoryEntries(trades.filter(isValidTradeHistoryEntry));
}

function loadTradeHistory(scopeKey: string | null): TradeHistory[] {
  if (!scopeKey) return [];
  try {
    const raw = localStorage.getItem(scopeKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalizeTradeHistory(parsed);
  } catch {
    return [];
  }
}

function saveTradeHistory(scopeKey: string | null, trades: TradeHistory[]): void {
  if (!scopeKey) return;
  try {
    localStorage.setItem(scopeKey, JSON.stringify(normalizeTradeHistory(trades)));
  } catch {
    // localStorage may be unavailable
  }
}

// ---------------------------------------------------------------------------
// State & Actions interfaces
// ---------------------------------------------------------------------------

export interface TradeState {
  activeScopeKey: string | null;
  tradeHistory: TradeHistory[];
  isLoadingTrades: boolean;
  tradesError: string | null;
  /** Slippage tolerance in basis points (e.g. 50 = 0.5%). */
  slippageBps: number;
  /** Currently pending (unconfirmed) transactions. */
  pendingTransactions: PendingTx[];
}

export interface TradeActions {
  setScope: (address: string | null, chainId: number | null) => void;
  clearVisibleTrades: () => void;
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
  activeScopeKey: null,
  tradeHistory: [],
  isLoadingTrades: false,
  tradesError: null,
  slippageBps: loadSlippage(),
  pendingTransactions: [],
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useTradeStore = create<TradeStore>()(withStoreMiddleware('trade', (set, get) => ({
  ...initialTradesState,

  setScope: (address, chainId) =>
    set((state) => {
      const nextScopeKey = makeTradeHistoryScopeKey(address, chainId);
      if (state.activeScopeKey === nextScopeKey) {
        return state;
      }

      return {
        activeScopeKey: nextScopeKey,
        tradeHistory: loadTradeHistory(nextScopeKey),
        tradesError: null,
      };
    }),

  clearVisibleTrades: () =>
    set({
      tradeHistory: [],
      isLoadingTrades: false,
      tradesError: null,
    }),

  setTrades: (trades) => {
    const trimmed = normalizeTradeHistory(trades);
    saveTradeHistory(get().activeScopeKey, trimmed);
    set({ tradeHistory: trimmed, tradesError: null });
  },

  addTrade: (trade) =>
    set((state) => {
      const trimmed = mergeTradeHistoryEntries([trade], state.tradeHistory);
      saveTradeHistory(state.activeScopeKey, trimmed);
      return {
        tradeHistory: trimmed,
      };
    }),

  updateTrade: (id, partial) =>
    set((state) => {
      const updated = state.tradeHistory.map((t) =>
        t.id === id ? { ...t, ...partial } : t,
      );
      saveTradeHistory(state.activeScopeKey, updated);
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
})));
