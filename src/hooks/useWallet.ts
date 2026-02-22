import { useCallback } from 'react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import {
  useActiveWallet,
  useActiveWalletChain,
  useActiveWalletConnectionStatus,
  useConnectModal,
  useDisconnect,
  useSwitchActiveWalletChain,
} from 'thirdweb/react';

import logger from '../lib/logger';
import { getProvider as getStoreProvider, useWalletStore } from '../store/walletStore.ts';
import {
  THIRDWEB_DEFAULT_CHAIN,
  THIRDWEB_SUPPORTED_CHAINS,
  THIRDWEB_THEME,
  THIRDWEB_WALLETCONNECT_PROJECT_ID,
  THIRDWEB_WALLETS,
  getThirdwebAppMetadata,
  getThirdwebChain,
  isThirdwebConfigured,
  thirdwebClient,
} from '../lib/thirdweb';
import { clearWalletBoundStores } from '../wallet/walletBoundStores';

function parseWalletError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  if (/user rejected|rejected by user|ACTION_REJECTED|denied/i.test(message)) {
    return 'Request rejected. Please approve the prompt in your wallet to continue.';
  }

  if (/user closed|cancelled|canceled|abort|modal/i.test(message)) {
    return 'Wallet connection was cancelled.';
  }

  if (/already pending/i.test(message)) {
    return 'A request is already pending — please check your wallet app.';
  }

  if (/chain.*not.*support|unsupported.*chain|network.*not.*support/i.test(message)) {
    return 'This network is not supported by your wallet. You may need to add it manually.';
  }

  if (/insufficient funds/i.test(message)) {
    return 'Insufficient funds for this transaction.';
  }

  if (/timeout|timed out|ETIMEDOUT/i.test(message)) {
    return 'Network request timed out. Please check your connection and try again.';
  }

  if (message.length > 0 && message.length < 220) {
    return message;
  }

  return 'Wallet action failed. Please try again.';
}

async function fetchBalanceWithRetry(
  provider: ethers.BrowserProvider,
  address: string,
  retries = 2,
): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const raw = await provider.getBalance(address);
      return ethers.formatEther(raw);
    } catch (err) {
      if (attempt === retries) {
        logger.error('Balance fetch failed after retries:', err);
        return '0';
      }
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
    }
  }
  return '0';
}

export function useWallet() {
  const wallet = useWalletStore((s) => s.wallet);
  const setWallet = useWalletStore((s) => s.setWallet);
  const resetWallet = useWalletStore((s) => s.resetWallet);
  const setLastError = useWalletStore((s) => s.setLastError);
  const setConnectionStatus = useWalletStore((s) => s.setConnectionStatus);
  const beginChainSwitch = useWalletStore((s) => s.beginChainSwitch);
  const failChainSwitch = useWalletStore((s) => s.failChainSwitch);

  const activeWallet = useActiveWallet();
  const activeWalletChain = useActiveWalletChain();
  const connectionStatus = useActiveWalletConnectionStatus();
  const { connect, isConnecting: isModalConnecting } = useConnectModal();
  const { disconnect } = useDisconnect();
  const switchActiveWalletChain = useSwitchActiveWalletChain();

  const connectWallet = useCallback(async () => {
    if (!thirdwebClient || !isThirdwebConfigured) {
      const msg =
        'Wallet connection is not configured. Set VITE_THIRDWEB_CLIENT_ID before using on-chain features.';
      setLastError(msg);
      setConnectionStatus('degraded');
      toast.error(msg);
      return;
    }

    if (
      connectionStatus === 'connecting' ||
      isModalConnecting ||
      wallet.connectionStatus === 'switching'
    ) {
      return;
    }

    setConnectionStatus('connecting');
    setWallet({ isConnecting: true, lastError: null });
    setLastError(null);

    try {
      const origin =
        typeof window !== 'undefined' ? window.location.origin : 'https://fueki-tech.com';

      const connectedWallet = await connect({
        client: thirdwebClient,
        wallets: THIRDWEB_WALLETS,
        appMetadata: getThirdwebAppMetadata(),
        chain: activeWalletChain ?? THIRDWEB_DEFAULT_CHAIN,
        chains: THIRDWEB_SUPPORTED_CHAINS,
        title: 'Connect to Fueki',
        titleIcon: '',
        size: 'wide',
        termsOfServiceUrl: `${origin}/terms`,
        privacyPolicyUrl: `${origin}/privacy`,
        showAllWallets: true,
        theme: THIRDWEB_THEME,
        walletConnect: THIRDWEB_WALLETCONNECT_PROJECT_ID
          ? { projectId: THIRDWEB_WALLETCONNECT_PROJECT_ID }
          : undefined,
      });

      const connectedAddress = connectedWallet.getAccount()?.address;
      if (connectedAddress) {
        toast.success(
          `Connected: ${connectedAddress.slice(0, 6)}...${connectedAddress.slice(-4)}`,
        );
      }
    } catch (err: unknown) {
      logger.error('Wallet connection failed:', err);
      const message = parseWalletError(err);
      setLastError(message);
      setConnectionStatus('degraded');
      if (!/cancelled/i.test(message)) {
        toast.error(message);
      }
    } finally {
      setWallet({ isConnecting: false });
    }
  }, [
    activeWalletChain,
    connect,
    connectionStatus,
    isModalConnecting,
    setConnectionStatus,
    setLastError,
    setWallet,
    wallet.connectionStatus,
  ]);

  const disconnectWallet = useCallback(() => {
    if (activeWallet) {
      disconnect(activeWallet);
    }

    resetWallet();
    clearWalletBoundStores();
    setLastError(null);
    toast.success('Wallet disconnected');
  }, [activeWallet, disconnect, resetWallet, setLastError]);

  const switchNetwork = useCallback(
    async (chainId: number) => {
      if (!activeWallet) {
        const msg = 'Please connect your wallet first.';
        setLastError(msg);
        toast.error(msg);
        return;
      }

      const chain = getThirdwebChain(chainId);
      if (!chain) {
        const msg = 'Requested network is not available.';
        setLastError(msg);
        toast.error(msg);
        return;
      }

      beginChainSwitch(chainId);
      clearWalletBoundStores();

      try {
        await switchActiveWalletChain(chain);
        setLastError(null);
      } catch (err: unknown) {
        const message = parseWalletError(err);
        failChainSwitch(message);
        toast.error(message);
      }
    },
    [
      activeWallet,
      beginChainSwitch,
      failChainSwitch,
      setLastError,
      switchActiveWalletChain,
    ],
  );

  const refreshBalance = useCallback(async () => {
    if (!wallet.address || !wallet.isConnected) return;

    const provider = getStoreProvider();
    if (!provider) return;

    const balance = await fetchBalanceWithRetry(provider, wallet.address);
    setWallet({ balance, lastSyncAt: Date.now() });
  }, [setWallet, wallet.address, wallet.isConnected]);

  return {
    ...wallet,
    error: wallet.lastError,
    isConnecting:
      wallet.isConnecting || connectionStatus === 'connecting' || isModalConnecting,
    isSwitchingNetwork: wallet.connectionStatus === 'switching',
    connectWallet,
    disconnectWallet,
    switchNetwork,
    refreshBalance,
    isWalletInstalled: isThirdwebConfigured,
    discoveredProviders: [],
  };
}
