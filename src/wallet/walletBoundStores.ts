import { useAssetStore } from '../store/assetStore';
import { useTradeStore } from '../store/tradeStore';
import { useExchangeStore } from '../store/exchangeStore';
import { useSecurityTokenStore } from '../store/securityTokenStore';

/**
 * Clear chain/account-bound stores when wallet disconnects or switches chain.
 * All stores that hold wallet-specific data must be reset here to prevent
 * stale data from leaking across account/chain switches.
 */
export function clearWalletBoundStores(): void {
  useAssetStore.getState().setAssets([]);
  useAssetStore.getState().setSecurityTokens([]);
  useTradeStore.getState().setTrades([]);
  useExchangeStore.getState().setOrders([]);
  useExchangeStore.getState().setUserOrders([]);
  useSecurityTokenStore.getState().reset();
}
