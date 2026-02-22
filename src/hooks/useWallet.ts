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

// ---------------------------------------------------------------------------
// Error parsing — user-friendly, actionable messages
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Store cleanup
// ---------------------------------------------------------------------------

function clearWalletBoundStores(): void {
  useAssetStore.getState().setAssets([]);
  useAssetStore.getState().setSecurityTokens([]);
  useTradeStore.getState().setTrades([]);
  useExchangeStore.getState().setOrders([]);
  useExchangeStore.getState().setUserOrders([]);
}

// ---------------------------------------------------------------------------
// Balance fetch with retry
// ---------------------------------------------------------------------------

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
      // Brief delay before retry (200ms, 600ms)
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
    }
  }
  return '0';
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

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
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);

  const wasConnectedRef = useRef(false);

  // Monotonic counter to discard stale async sync results.
  // Every time syncWalletStore fires, it captures the current value;
  // if a newer call increments the counter before an older call completes,
  // the older call's state updates are skipped.
  const syncVersionRef = useRef(0);

  // Background balance polling interval
  const balanceIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // ---- ENS resolution (mainnet only) --------------------------------------

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

  // ---- Core sync: thirdweb hooks → zustand store --------------------------

  const syncWalletStore = useCallback(async () => {
    const version = ++syncVersionRef.current;
    const isStale = () => syncVersionRef.current !== version;

    const isConnecting = connectionStatus === 'connecting' || isModalConnecting;
    const isConnected =
      connectionStatus === 'connected' &&
      Boolean(activeWallet) &&
      Boolean(activeAccount?.address);

    // ---- Not connected ----------------------------------------------------
    if (!isConnected || !activeWallet || !activeAccount?.address) {
      if (isStale()) return;
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

    // ---- Thirdweb not configured ------------------------------------------
    if (!thirdwebClient || !isThirdwebConfigured) {
      if (isStale()) return;
      setWallet({
        address: activeAccount.address,
        chainId: activeWalletChain?.id ?? null,
        isConnected: true,
        isConnecting,
      });
      return;
    }

    // ---- Resolve chain ----------------------------------------------------
    const chain =
      activeWalletChain ??
      getThirdwebChain(activeWallet.getChain()?.id) ??
      THIRDWEB_DEFAULT_CHAIN;

    // ---- Create provider & signer -----------------------------------------
    try {
      const eip1193Provider = EIP1193.toProvider({
        wallet: activeWallet,
        chain,
        client: thirdwebClient,
      });

      const provider = new ethers.BrowserProvider(
        eip1193Provider as ethers.Eip1193Provider,
      );
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      // Discard if a newer sync started while we were awaiting.
      if (isStale()) return;

      // Set provider/signer immediately so they're available for transactions
      // even if the subsequent balance fetch is slow or fails.
      setProvider(provider);
      setSigner(signer);

      // Fetch balance (non-critical — retries internally)
      const balance = await fetchBalanceWithRetry(provider, address);
      if (isStale()) return;

      setWallet({
        address,
        chainId: chain.id,
        isConnected: true,
        isConnecting: false,
        balance,
      });

      persistConnection();
      void resolveEnsName(address, provider);
      setError(null);
    } catch (err) {
      logger.error('Failed to create ethers provider from thirdweb wallet:', err);
      if (isStale()) return;

      setProvider(null);
      setSigner(null);
      setWallet({
        address: activeAccount.address,
        chainId: chain.id,
        isConnected: true,
        isConnecting: false,
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

  // Re-sync whenever thirdweb hooks change
  useEffect(() => {
    void syncWalletStore();
  }, [syncWalletStore]);

  // ---- Disconnect detection -----------------------------------------------

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

  // ---- Background balance polling (every 30s when connected) --------------

  useEffect(() => {
    clearInterval(balanceIntervalRef.current);

    if (!wallet.isConnected || !wallet.address) return;

    balanceIntervalRef.current = setInterval(async () => {
      const provider = getStoreProvider();
      if (!provider || !wallet.address) return;
      try {
        const raw = await provider.getBalance(wallet.address);
        setWallet({ balance: ethers.formatEther(raw) });
      } catch {
        // Silent — don't spam user with toast on background poll failure
      }
    }, 30_000);

    return () => clearInterval(balanceIntervalRef.current);
  }, [wallet.isConnected, wallet.address, setWallet]);

  // ---- Connect wallet -----------------------------------------------------

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
      setError(message);
      if (!/cancelled/i.test(message)) {
        toast.error(message);
      }
    } finally {
      // Always clear isConnecting — syncWalletStore will set the real state.
      setWallet({ isConnecting: false });
    }
  }, [
    activeWalletChain,
    connect,
    connectionStatus,
    isModalConnecting,
    setWallet,
  ]);

  // ---- Disconnect wallet --------------------------------------------------

  const disconnectWallet = useCallback(() => {
    if (activeWallet) {
      disconnect(activeWallet);
    }

    resetWallet();
    clearWalletBoundStores();
    setError(null);
    toast.success('Wallet disconnected');
  }, [activeWallet, disconnect, resetWallet]);

  // ---- Switch network with verification -----------------------------------

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

      setIsSwitchingNetwork(true);

      try {
        await switchActiveWalletChain(chain);
        setError(null);
        // syncWalletStore will fire when activeWalletChain updates
      } catch (err: unknown) {
        const message = parseWalletError(err);
        setError(message);
        toast.error(message);
      } finally {
        setIsSwitchingNetwork(false);
      }
    },
    [activeWallet, switchActiveWalletChain],
  );

  // ---- Manual balance refresh ---------------------------------------------

  const refreshBalance = useCallback(async () => {
    if (!wallet.address || !wallet.isConnected) return;

    const provider = getStoreProvider();
    if (!provider) return;

    const balance = await fetchBalanceWithRetry(provider, wallet.address);
    setWallet({ balance });
  }, [setWallet, wallet.address, wallet.isConnected]);

  // ---- Public API ---------------------------------------------------------

  return {
    ...wallet,
    error,
    isSwitchingNetwork,
    connectWallet,
    disconnectWallet,
    switchNetwork,
    refreshBalance,
    isWalletInstalled: isThirdwebConfigured,
    discoveredProviders: [],
  };
}
