import { useCallback, useEffect, useRef, useState } from 'react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import {
  useActiveAccount,
  useActiveWallet,
  useActiveWalletChain,
  useActiveWalletConnectionStatus,
  useConnectModal,
  useDisconnect,
  useSwitchActiveWalletChain,
} from 'thirdweb/react';
import { EIP1193 } from 'thirdweb/wallets';

import logger from '../lib/logger';
import { getProvider as getStoreProvider, useWalletStore } from '../store/walletStore.ts';
import { useAssetStore } from '../store/assetStore.ts';
import { useTradeStore } from '../store/tradeStore.ts';
import { useExchangeStore } from '../store/exchangeStore.ts';
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

function parseWalletError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  if (/user rejected|rejected by user|ACTION_REJECTED/i.test(message)) {
    return 'Connection request was rejected. Please approve the wallet prompt to connect.';
  }

  if (/user closed|cancelled|canceled|modal/i.test(message)) {
    return 'Wallet connection was cancelled.';
  }

  if (/already pending/i.test(message)) {
    return 'A wallet connection request is already pending. Please check your wallet app.';
  }

  if (/unsupported chain|network/i.test(message)) {
    return 'Selected network is not supported by the connected wallet.';
  }

  if (message.length > 0 && message.length < 220) {
    return message;
  }

  return 'Wallet action failed. Please try again.';
}

function clearWalletBoundStores(): void {
  useAssetStore.getState().setAssets([]);
  useAssetStore.getState().setSecurityTokens([]);
  useTradeStore.getState().setTrades([]);
  useExchangeStore.getState().setOrders([]);
  useExchangeStore.getState().setUserOrders([]);
}

export function useWallet() {
  const wallet = useWalletStore((s) => s.wallet);
  const setWallet = useWalletStore((s) => s.setWallet);
  const setProvider = useWalletStore((s) => s.setProvider);
  const setSigner = useWalletStore((s) => s.setSigner);
  const resetWallet = useWalletStore((s) => s.resetWallet);
  const setEnsName = useWalletStore((s) => s.setEnsName);
  const persistConnection = useWalletStore((s) => s.persistConnection);

  const activeAccount = useActiveAccount();
  const activeWallet = useActiveWallet();
  const activeWalletChain = useActiveWalletChain();
  const connectionStatus = useActiveWalletConnectionStatus();
  const { connect, isConnecting: isModalConnecting } = useConnectModal();
  const { disconnect } = useDisconnect();
  const switchActiveWalletChain = useSwitchActiveWalletChain();

  const [error, setError] = useState<string | null>(null);

  const wasConnectedRef = useRef(false);

  const resolveEnsName = useCallback(
    async (address: string, provider: ethers.BrowserProvider) => {
      try {
        const network = await provider.getNetwork();
        if (Number(network.chainId) !== 1) {
          setEnsName(null);
          return;
        }
        const name = await provider.lookupAddress(address);
        setEnsName(name);
      } catch {
        setEnsName(null);
      }
    },
    [setEnsName],
  );

  const syncWalletStore = useCallback(async () => {
    const isConnecting = connectionStatus === 'connecting' || isModalConnecting;
    const isConnected =
      connectionStatus === 'connected' &&
      Boolean(activeWallet) &&
      Boolean(activeAccount?.address);

    if (!isConnected || !activeWallet || !activeAccount?.address) {
      setProvider(null);
      setSigner(null);
      setWallet({
        address: null,
        chainId: activeWalletChain?.id ?? null,
        isConnected: false,
        isConnecting,
        balance: '0',
      });
      if (!isConnecting) {
        setEnsName(null);
      }
      return;
    }

    if (!thirdwebClient || !isThirdwebConfigured) {
      setWallet({
        address: activeAccount.address,
        chainId: activeWalletChain?.id ?? null,
        isConnected: true,
        isConnecting,
      });
      return;
    }

    const chain = activeWalletChain ?? getThirdwebChain(activeWallet.getChain()?.id) ?? THIRDWEB_DEFAULT_CHAIN;

    try {
      const eip1193Provider = EIP1193.toProvider({
        wallet: activeWallet,
        chain,
        client: thirdwebClient,
      });

      const provider = new ethers.BrowserProvider(eip1193Provider as ethers.Eip1193Provider);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      // Set provider and signer FIRST so they're available even if balance
      // fetch fails (e.g. slow RPC on testnets like Holesky).
      setProvider(provider);
      setSigner(signer);

      let balance = '0';
      try {
        const rawBalance = await provider.getBalance(address);
        balance = ethers.formatEther(rawBalance);
      } catch (balanceErr) {
        logger.error('Failed to fetch balance (provider still usable):', balanceErr);
      }

      setWallet({
        address,
        chainId: chain.id,
        isConnected: true,
        isConnecting,
        balance,
      });

      persistConnection();
      void resolveEnsName(address, provider);
      setError(null);
    } catch (err) {
      logger.error('Failed to sync thirdweb wallet into ethers provider:', err);

      // Still try to create provider from the wallet's native EIP-1193
      // interface as a fallback before giving up entirely.
      try {
        const fallbackEip1193 = EIP1193.toProvider({
          wallet: activeWallet,
          chain,
          client: thirdwebClient,
        });
        const fallbackProvider = new ethers.BrowserProvider(
          fallbackEip1193 as ethers.Eip1193Provider,
        );
        setProvider(fallbackProvider);
        const fallbackSigner = await fallbackProvider.getSigner();
        setSigner(fallbackSigner);
        logger.info('Fallback provider/signer created successfully');
      } catch {
        setProvider(null);
        setSigner(null);
      }

      setWallet({
        address: activeAccount.address,
        chainId: chain.id,
        isConnected: true,
        isConnecting,
      });
    }
  }, [
    activeAccount,
    activeWallet,
    activeWalletChain,
    connectionStatus,
    isModalConnecting,
    persistConnection,
    resolveEnsName,
    setEnsName,
    setProvider,
    setSigner,
    setWallet,
  ]);

  useEffect(() => {
    void syncWalletStore();
  }, [syncWalletStore]);

  useEffect(() => {
    const isConnected = connectionStatus === 'connected';

    if (isConnected) {
      wasConnectedRef.current = true;
      return;
    }

    if (connectionStatus === 'disconnected' && wasConnectedRef.current) {
      wasConnectedRef.current = false;
      resetWallet();
      clearWalletBoundStores();
      setError(null);
    }
  }, [connectionStatus, resetWallet]);

  const connectWallet = useCallback(async () => {
    if (!thirdwebClient || !isThirdwebConfigured) {
      const msg =
        'Wallet connection is not configured. Set VITE_THIRDWEB_CLIENT_ID before using on-chain features.';
      setError(msg);
      toast.error(msg);
      return;
    }

    if (connectionStatus === 'connecting' || isModalConnecting) return;

    setWallet({ isConnecting: true });
    setError(null);

    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://fueki.io';

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
        toast.success(`Wallet connected: ${connectedAddress.slice(0, 6)}...${connectedAddress.slice(-4)}`);
      }
    } catch (err: unknown) {
      logger.error('Wallet connection failed:', err);
      const message = parseWalletError(err);
      setError(message);
      setWallet({ isConnecting: false });
      if (!/cancelled/i.test(message)) {
        toast.error(message);
      }
    }
  }, [
    activeWalletChain,
    connect,
    connectionStatus,
    isModalConnecting,
    setWallet,
  ]);

  const disconnectWallet = useCallback(() => {
    if (activeWallet) {
      disconnect(activeWallet);
    }

    resetWallet();
    clearWalletBoundStores();
    setError(null);
    toast.success('Wallet disconnected');
  }, [activeWallet, disconnect, resetWallet]);

  const switchNetwork = useCallback(
    async (chainId: number) => {
      if (!activeWallet) {
        const msg = 'Please connect your wallet first.';
        setError(msg);
        toast.error(msg);
        return;
      }

      const chain = getThirdwebChain(chainId);
      if (!chain) {
        const msg = 'Requested network is not available.';
        setError(msg);
        toast.error(msg);
        return;
      }

      try {
        await switchActiveWalletChain(chain);
        setError(null);
      } catch (err: unknown) {
        const message = parseWalletError(err);
        setError(message);
        toast.error(message);
      }
    },
    [activeWallet, switchActiveWalletChain],
  );

  const refreshBalance = useCallback(async () => {
    if (!wallet.address || !wallet.isConnected) return;

    try {
      const provider = getStoreProvider();
      if (!provider) return;
      const balance = await provider.getBalance(wallet.address);
      setWallet({ balance: ethers.formatEther(balance) });
    } catch (err) {
      logger.error('Failed to refresh balance:', err);
      toast.error('Failed to refresh wallet balance');
    }
  }, [setWallet, wallet.address, wallet.isConnected]);

  return {
    ...wallet,
    error,
    connectWallet,
    disconnectWallet,
    switchNetwork,
    refreshBalance,
    isWalletInstalled: isThirdwebConfigured,
    discoveredProviders: [],
  };
}
