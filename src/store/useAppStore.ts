import { create } from 'zustand';
import type { BrowserProvider, JsonRpcSigner } from 'ethers';
import type {
  ParsedDocument,
  WrappedAsset,
  SecurityToken,
  TradeHistory,
  ExchangeOrder,
  Notification,
  ModalContent,
} from '../types';

// ---------------------------------------------------------------------------
// Module-level refs for non-serializable objects.
// Zustand state should remain serializable; provider & signer live here.
// ---------------------------------------------------------------------------

let _provider: BrowserProvider | null = null;
let _signer: JsonRpcSigner | null = null;

export function getProvider(): BrowserProvider | null {
  return _provider;
}

export function getSigner(): JsonRpcSigner | null {
  return _signer;
}

// ---------------------------------------------------------------------------
// Slice state types
// ---------------------------------------------------------------------------

interface WalletSliceState {
  wallet: {
    address: string | null;
    chainId: number | null;
    isConnected: boolean;
    isConnecting: boolean;
    balance: string;
  };
}

interface WalletSliceActions {
  setWallet: (partial: Partial<WalletSliceState['wallet']>) => void;
  setProvider: (provider: BrowserProvider | null) => void;
  setSigner: (signer: JsonRpcSigner | null) => void;
  resetWallet: () => void;
  setChainId: (chainId: number) => void;
}

interface DocumentsSliceState {
  parsedDocuments: ParsedDocument[];
  currentDocument: ParsedDocument | null;
}

interface DocumentsSliceActions {
  addDocument: (doc: ParsedDocument) => void;
  removeDocument: (hash: string) => void;
  setCurrentDocument: (doc: ParsedDocument | null) => void;
  clearDocuments: () => void;
}

interface AssetsSliceState {
  wrappedAssets: WrappedAsset[];
  isLoadingAssets: boolean;
  assetsError: string | null;
}

interface AssetsSliceActions {
  setAssets: (assets: WrappedAsset[]) => void;
  addAsset: (asset: WrappedAsset) => void;
  updateAsset: (address: string, partial: Partial<WrappedAsset>) => void;
  removeAsset: (address: string) => void;
  setLoadingAssets: (loading: boolean) => void;
  setAssetsError: (error: string | null) => void;
}

interface SecurityTokensSliceState {
  securityTokens: SecurityToken[];
  isLoadingSecurityTokens: boolean;
  securityTokensError: string | null;
}

interface SecurityTokensSliceActions {
  setSecurityTokens: (tokens: SecurityToken[]) => void;
  addSecurityToken: (token: SecurityToken) => void;
  updateSecurityToken: (address: string, partial: Partial<SecurityToken>) => void;
  removeSecurityToken: (address: string) => void;
  setLoadingSecurityTokens: (loading: boolean) => void;
  setSecurityTokensError: (error: string | null) => void;
}

interface TradesSliceState {
  tradeHistory: TradeHistory[];
  isLoadingTrades: boolean;
  tradesError: string | null;
}

interface TradesSliceActions {
  setTrades: (trades: TradeHistory[]) => void;
  addTrade: (trade: TradeHistory) => void;
  updateTrade: (id: string, partial: Partial<TradeHistory>) => void;
  setLoadingTrades: (loading: boolean) => void;
  setTradesError: (error: string | null) => void;
}

interface ExchangeSliceState {
  orders: ExchangeOrder[];
  userOrders: ExchangeOrder[];
  isLoadingOrders: boolean;
  ordersError: string | null;
}

interface ExchangeSliceActions {
  setOrders: (orders: ExchangeOrder[]) => void;
  addOrder: (order: ExchangeOrder) => void;
  /** id is a decimal string matching ExchangeOrder['id']. */
  removeOrder: (id: string) => void;
  setUserOrders: (orders: ExchangeOrder[]) => void;
  setLoadingOrders: (loading: boolean) => void;
  setOrdersError: (error: string | null) => void;
}

interface UISliceState {
  activeTab: string;
  isModalOpen: boolean;
  modalContent: ModalContent | null;
  notifications: Notification[];
}

interface UISliceActions {
  setActiveTab: (tab: string) => void;
  openModal: (content: ModalContent) => void;
  closeModal: () => void;
  addNotification: (notification: Notification) => void;
  removeNotification: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Combined store type
// ---------------------------------------------------------------------------

export type AppStore = WalletSliceState &
  WalletSliceActions &
  DocumentsSliceState &
  DocumentsSliceActions &
  AssetsSliceState &
  AssetsSliceActions &
  SecurityTokensSliceState &
  SecurityTokensSliceActions &
  TradesSliceState &
  TradesSliceActions &
  ExchangeSliceState &
  ExchangeSliceActions &
  UISliceState &
  UISliceActions;

// ---------------------------------------------------------------------------
// Initial state constants
// ---------------------------------------------------------------------------

const initialWalletState: WalletSliceState['wallet'] = {
  address: null,
  chainId: null,
  isConnected: false,
  isConnecting: false,
  balance: '0',
};

const initialDocumentsState: DocumentsSliceState = {
  parsedDocuments: [],
  currentDocument: null,
};

const initialAssetsState: AssetsSliceState = {
  wrappedAssets: [],
  isLoadingAssets: false,
  assetsError: null,
};

const initialSecurityTokensState: SecurityTokensSliceState = {
  securityTokens: [],
  isLoadingSecurityTokens: false,
  securityTokensError: null,
};

const initialTradesState: TradesSliceState = {
  tradeHistory: [],
  isLoadingTrades: false,
  tradesError: null,
};

const initialExchangeState: ExchangeSliceState = {
  orders: [],
  userOrders: [],
  isLoadingOrders: false,
  ordersError: null,
};

const initialUIState: UISliceState = {
  activeTab: 'dashboard',
  isModalOpen: false,
  modalContent: null,
  notifications: [],
};

// ---------------------------------------------------------------------------
// Notification auto-dismiss timers.
// Kept at module level so they can be cleared when notifications are removed
// manually or when the store is reset.
// ---------------------------------------------------------------------------

const _notificationTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAppStore = create<AppStore>()((set) => ({
  // ---- Wallet slice -------------------------------------------------------
  wallet: { ...initialWalletState },

  setWallet: (partial) =>
    set((state) => ({
      wallet: { ...state.wallet, ...partial },
    })),

  setProvider: (provider) => {
    _provider = provider;
  },

  setSigner: (signer) => {
    _signer = signer;
  },

  resetWallet: () => {
    _provider = null;
    _signer = null;
    set({
      wallet: { ...initialWalletState },
      // Clear wallet-specific on-chain data (including error and loading
      // flags) so stale state from the previous wallet is never shown
      // after disconnect.
      ...initialAssetsState,
      ...initialSecurityTokensState,
      ...initialTradesState,
      ...initialExchangeState,
    });
  },

  setChainId: (chainId) =>
    set((state) => ({
      wallet: { ...state.wallet, chainId },
    })),

  // ---- Documents slice ----------------------------------------------------
  ...initialDocumentsState,

  addDocument: (doc) =>
    set((state) => ({
      parsedDocuments: [...state.parsedDocuments, doc],
    })),

  removeDocument: (hash) =>
    set((state) => ({
      parsedDocuments: state.parsedDocuments.filter(
        (d) => d.documentHash !== hash,
      ),
      currentDocument:
        state.currentDocument?.documentHash === hash
          ? null
          : state.currentDocument,
    })),

  setCurrentDocument: (doc) => set({ currentDocument: doc }),

  clearDocuments: () =>
    set({ ...initialDocumentsState }),

  // ---- Assets slice -------------------------------------------------------
  ...initialAssetsState,

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

  // ---- Security Tokens slice -----------------------------------------------
  ...initialSecurityTokensState,

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

  // ---- Trades slice -------------------------------------------------------
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

  // ---- Exchange slice -----------------------------------------------------
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

  // ---- UI slice -----------------------------------------------------------
  ...initialUIState,

  setActiveTab: (tab) => set({ activeTab: tab }),

  openModal: (content) =>
    set({ isModalOpen: true, modalContent: content }),

  closeModal: () =>
    set({ isModalOpen: false, modalContent: null }),

  addNotification: (notification) => {
    set((state) => ({
      notifications: [...state.notifications, notification],
    }));

    // Schedule auto-dismiss unless explicitly disabled.
    if (notification.autoDismiss !== false) {
      const delay = notification.duration ?? 5_000;
      const timer = setTimeout(() => {
        _notificationTimers.delete(notification.id);
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== notification.id),
        }));
      }, delay);
      _notificationTimers.set(notification.id, timer);
    }
  },

  removeNotification: (id) => {
    // Clear any pending auto-dismiss timer to prevent a no-op firing later.
    const timer = _notificationTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      _notificationTimers.delete(id);
    }
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },
}));
