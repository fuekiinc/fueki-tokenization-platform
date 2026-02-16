// ---------------------------------------------------------------------------
// Backwards-compatibility re-export layer.
//
// Prefer importing domain stores directly:
//   import { useWalletStore, getProvider, getSigner } from './walletStore';
//   import { useDocumentStore } from './documentStore';
//   import { useAssetStore } from './assetStore';
//   import { useTradeStore } from './tradeStore';
//   import { useExchangeStore } from './exchangeStore';
//   import { useUIStore } from './uiStore';
//
// This file keeps the old `useAppStore` hook working for any code that has
// not yet migrated to the new granular stores.
// ---------------------------------------------------------------------------

export { useWalletStore, getProvider, getSigner } from './walletStore.ts';
export { useDocumentStore } from './documentStore.ts';
export { useAssetStore } from './assetStore.ts';
export { useTradeStore } from './tradeStore.ts';
export { useExchangeStore } from './exchangeStore.ts';
export { useUIStore } from './uiStore.ts';

export type { WalletStore } from './walletStore.ts';
export type { DocumentStore } from './documentStore.ts';
export type { AssetStore } from './assetStore.ts';
export type { TradeStore } from './tradeStore.ts';
export type { ExchangeStore } from './exchangeStore.ts';
export type { UIStore } from './uiStore.ts';
