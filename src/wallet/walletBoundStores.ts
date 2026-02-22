import { useAssetStore } from '../store/assetStore';
import { useTradeStore } from '../store/tradeStore';
import { useExchangeStore } from '../store/exchangeStore';

/**
 * Clear chain/account-bound stores when wallet disconnects or switches chain.
 */
export function clearWalletBoundStores(): void {
  useAssetStore.getState().setAssets([]);
  useAssetStore.getState().setSecurityTokens([]);
  useTradeStore.getState().setTrades([]);
  useExchangeStore.getState().setOrders([]);
  useExchangeStore.getState().setUserOrders([]);
}
