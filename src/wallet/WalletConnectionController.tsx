import { useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import {
  useActiveAccount,
  useActiveWallet,
  useActiveWalletChain,
  useActiveWalletConnectionStatus,
} from 'thirdweb/react';
import { EIP1193 } from 'thirdweb/wallets';

import logger from '../lib/logger';
import { getProvider, getSigner, isSwitchInProgress, useWalletStore } from '../store/walletStore';
import {
  getThirdwebChain,
  isThirdwebConfigured,
  THIRDWEB_DEFAULT_CHAIN,
  thirdwebClient,
} from '../lib/thirdweb';
import { clearWalletBoundStores } from './walletBoundStores';
import { findHealthyEndpoint } from '../lib/rpc/endpoints';
import { getReadOnlyProvider } from '../lib/blockchain/contracts';
import { useAuthStore } from '../store/authStore';
import { queryKeys } from '../lib/queryClient';
import { syncConnectedWalletAddress } from '../lib/auth/walletLinking';

function parseConnectionError(err: unknown): string {
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

  if (/timeout|timed out|ETIMEDOUT/i.test(message)) {
    return 'Network request timed out. Please check your connection and try again.';
  }

  if (message.length > 0 && message.length < 220) {
    return message;
  }

  return 'Wallet action failed. Please try again.';
}

async function fetchBalanceWithRetry(
  _provider: ethers.BrowserProvider,
  address: string,
  chainId?: number | null,
  retries = 2,
): Promise<string> {
  // Prefer direct RPC provider to avoid thirdweb proxy rate limits.
  if (chainId) {
    try {
      const readProvider = getReadOnlyProvider(chainId);
      const raw = await readProvider.getBalance(address);
      return ethers.formatEther(raw);
    } catch (err) {
      logger.debug('Balance fetch via direct RPC failed, trying fallbacks:', err);
    }

    // Fallback: probe for a healthy endpoint.
    try {
      const rpcUrl = await findHealthyEndpoint(chainId);
      if (rpcUrl) {
        const fallback = new ethers.JsonRpcProvider(rpcUrl);
        const raw = await fallback.getBalance(address);
        fallback.destroy();
        return ethers.formatEther(raw);
      }
    } catch (err) {
      logger.debug('Balance fallback via healthy RPC also failed:', err);
    }
  }

  // Last resort: try the wallet's own provider (thirdweb proxy).
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const raw = await _provider.getBalance(address);
      return ethers.formatEther(raw);
    } catch (err) {
      if (attempt === retries) {
        logger.debug('Balance fetch via wallet provider failed after retries:', err);
      } else {
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
      }
    }
  }

  return '0';
}

function matchesCurrentWallet(address: string, chainId: number | null): boolean {
  const currentWallet = useWalletStore.getState().wallet;
  return (
    currentWallet.isConnected &&
    typeof currentWallet.address === 'string' &&
    currentWallet.address.toLowerCase() === address.toLowerCase() &&
    currentWallet.chainId === chainId
  );
}

interface BalanceSnapshot {
  address: string;
  chainId: number | null;
  balance: string;
}

/**
 * Single wallet/network orchestrator.
 * Mount once near the app root so wallet sync side effects run exactly once.
 */
export function WalletConnectionController() {
  const authUser = useAuthStore((s) => s.user);
  const isDemoActive = authUser?.demoActive === true;
  const setAuthUser = useAuthStore((s) => s.setUser);
  const wallet = useWalletStore((s) => s.wallet);
  const setWallet = useWalletStore((s) => s.setWallet);
  const setProvider = useWalletStore((s) => s.setProvider);
  const setSigner = useWalletStore((s) => s.setSigner);
  const setEnsName = useWalletStore((s) => s.setEnsName);
  const persistConnection = useWalletStore((s) => s.persistConnection);
  const setConnectionStatus = useWalletStore((s) => s.setConnectionStatus);
  const setLastError = useWalletStore((s) => s.setLastError);
  const completeChainSwitch = useWalletStore((s) => s.completeChainSwitch);

  const activeAccount = useActiveAccount();
  const activeWallet = useActiveWallet();
  const activeWalletChain = useActiveWalletChain();
  const connectionStatus = useActiveWalletConnectionStatus();

  const wasConnectedRef = useRef(false);
  const syncVersionRef = useRef(0);
  /** Consecutive balance poll failures -- used for exponential backoff. */
  const balanceFailCountRef = useRef(0);
  /** Debounce timer for disconnect detection during chain switches. */
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Avoid repeated wallet-link prompts while the same user/address remains active. */
  const walletLinkAttemptKeyRef = useRef<string | null>(null);

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
    if (isDemoActive) {
      return;
    }

    const version = ++syncVersionRef.current;
    const isStale = () => syncVersionRef.current !== version;

    const isConnecting = connectionStatus === 'connecting';
    const isConnected =
      connectionStatus === 'connected' &&
      Boolean(activeWallet) &&
      Boolean(activeAccount?.address);
    const isSwitching = wallet.connectionStatus === 'switching' || isSwitchInProgress();

    if (!isConnected || !activeWallet || !activeAccount?.address) {
      if (isStale()) return;

      if (isSwitching) {
        setWallet({
          address: wallet.address,
          chainId: wallet.chainId,
          isConnected: wallet.isConnected,
          isConnecting: true,
          connectionStatus: 'switching',
          providerReady: Boolean(getProvider()),
          signerReady: wallet.signerReady,
          switchTargetChainId: wallet.switchTargetChainId,
          balance: wallet.balance,
          lastSyncAt: Date.now(),
        });
        return;
      }

      setProvider(null);
      setSigner(null);

      setWallet({
        address: null,
        chainId: activeWalletChain?.id ?? null,
        isConnected: false,
        isConnecting: isConnecting,
        connectionStatus: isConnecting ? 'connecting' : 'disconnected',
        providerReady: false,
        signerReady: false,
        switchTargetChainId: null,
        balance: '0',
        lastSyncAt: Date.now(),
      });

      if (!isConnecting) {
        setEnsName(null);
      }

      if (!isConnecting) {
        setLastError(null);
      }

      return;
    }

    if (!thirdwebClient || !isThirdwebConfigured) {
      if (isStale()) return;

      setWallet({
        address: activeAccount.address,
        chainId: activeWalletChain?.id ?? null,
        isConnected: false,
        isConnecting: false,
        connectionStatus: 'degraded',
        providerReady: false,
        signerReady: false,
        lastError:
          'Wallet connection is not configured. Set VITE_THIRDWEB_CLIENT_ID before using on-chain features.',
        lastSyncAt: Date.now(),
      });
      return;
    }

    const chain =
      activeWalletChain ??
      getThirdwebChain(activeWallet.getChain()?.id) ??
      THIRDWEB_DEFAULT_CHAIN;

    // During a chain switch thirdweb may still report "connected" on the
    // OLD chain while the switch is in flight.  If we proceed we'd create
    // a provider/signer for the old chain and overwrite the "switching"
    // state, effectively cancelling the switch.  Wait until the active
    // chain matches the target before syncing.
    if (
      wallet.connectionStatus === 'switching' &&
      wallet.switchTargetChainId != null &&
      chain.id !== wallet.switchTargetChainId
    ) {
      // Keep waiting while an explicit switch request is still in-flight.
      if (isSwitchInProgress()) {
        return;
      }

      // Recovery path: thirdweb can occasionally remain on the old chain even
      // after a switch call resolves. Do not deadlock in "switching" forever.
      logger.warn('Recovering from stale switching state after chain mismatch', {
        expectedChainId: wallet.switchTargetChainId,
        activeChainId: chain.id,
      });
    }

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

      if (isStale()) return;

      setProvider(provider);
      setSigner(signer);

      const balance = await fetchBalanceWithRetry(provider, address, chain.id);
      if (isStale()) return;

      setWallet({
        address,
        chainId: chain.id,
        isConnected: true,
        isConnecting: false,
        connectionStatus: 'connected',
        providerReady: true,
        signerReady: true,
        switchTargetChainId: null,
        balance,
        lastError: null,
        lastSyncAt: Date.now(),
      });

      completeChainSwitch();
      persistConnection();
      setLastError(null);
      setConnectionStatus('connected');
      void resolveEnsName(address, provider);
    } catch (err) {
      logger.error('Failed to create ethers provider from thirdweb wallet:', err);
      if (isStale()) return;

      const message = parseConnectionError(err);

      setProvider(null);
      setSigner(null);
      setWallet({
        address: activeAccount.address,
        chainId: chain.id,
        isConnected: false,
        isConnecting: false,
        connectionStatus: 'degraded',
        providerReady: false,
        signerReady: false,
        switchTargetChainId: null,
        lastError: message,
        lastSyncAt: Date.now(),
      });
      setLastError(message);
      setConnectionStatus('degraded');
    }
  }, [
    activeAccount,
    activeWallet,
    activeWalletChain,
    completeChainSwitch,
    connectionStatus,
    persistConnection,
    resolveEnsName,
    setConnectionStatus,
    setEnsName,
    setLastError,
    setProvider,
    setSigner,
    setWallet,
    isDemoActive,
    wallet.address,
    wallet.balance,
    wallet.chainId,
    wallet.connectionStatus,
    wallet.isConnected,
    wallet.signerReady,
    wallet.switchTargetChainId,
  ]);

  useEffect(() => {
    void syncWalletStore();
  }, [syncWalletStore]);

  useEffect(() => {
    if (!authUser?.id || !wallet.isConnected || !wallet.address) {
      walletLinkAttemptKeyRef.current = null;
      return;
    }

    if (
      isDemoActive
      || wallet.connectionStatus !== 'connected'
      || !wallet.signerReady
    ) {
      return;
    }

    const signer = getSigner();
    if (!signer) {
      return;
    }

    const linkKey = `${authUser.id}:${wallet.address.toLowerCase()}`;
    if (walletLinkAttemptKeyRef.current === linkKey) {
      return;
    }

    walletLinkAttemptKeyRef.current = linkKey;
    let cancelled = false;

    void (async () => {
      try {
        const updatedUser = await syncConnectedWalletAddress(wallet.address!, signer);
        if (cancelled) {
          return;
        }
        setAuthUser(updatedUser);
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : 'Wallet connected, but we could not link it to your Fueki account.';

        logger.warn('Failed to sync wallet connection to authenticated user', {
          error,
          userId: authUser.id,
          walletAddress: wallet.address,
        });
        toast.error(message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    authUser?.id,
    isDemoActive,
    setAuthUser,
    wallet.address,
    wallet.connectionStatus,
    wallet.isConnected,
    wallet.signerReady,
  ]);

  useEffect(() => {
    if (isDemoActive) {
      clearTimeout(disconnectTimerRef.current);
      return () => clearTimeout(disconnectTimerRef.current);
    }

    const connected = connectionStatus === 'connected';

    if (connected) {
      wasConnectedRef.current = true;
      // Cancel any pending disconnect timer — we're connected again.
      clearTimeout(disconnectTimerRef.current);
      return () => clearTimeout(disconnectTimerRef.current);
    }

    if (connectionStatus === 'disconnected' && wasConnectedRef.current) {
      clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = setTimeout(() => {
        // Read ALL state fresh from stores at timer-fire time — NOT from
        // the stale closure captured when the effect ran 2.5s ago.
        const latest = useWalletStore.getState().wallet;
        const isSwitching = latest.connectionStatus === 'switching' || isSwitchInProgress();

        // If the user reconnected during the debounce window, the store
        // will show isConnected: true. Do not wipe their session.
        if (!isSwitching && !latest.isConnected) {
          wasConnectedRef.current = false;
          clearWalletBoundStores();
          setLastError(null);
        }
      }, 2_500);
    }

    return () => clearTimeout(disconnectTimerRef.current);
  }, [activeAccount?.address, activeWallet, connectionStatus, isDemoActive, setLastError]);

  useEffect(() => {
    if (isDemoActive) {
      balanceFailCountRef.current = 0;
      return;
    }
    if (!wallet.isConnected || !wallet.address) {
      balanceFailCountRef.current = 0;
    }
  }, [isDemoActive, wallet.isConnected, wallet.address]);

  const balanceQuery = useQuery<BalanceSnapshot>({
    queryKey: queryKeys.balance(wallet.address, wallet.chainId),
    enabled: !isDemoActive && wallet.isConnected && Boolean(wallet.address),
    refetchInterval: 15_000,
    queryFn: async () => {
      // FIX: read fresh from store to avoid stale closure.
      const currentWallet = useWalletStore.getState().wallet;
      if (!currentWallet.address || !currentWallet.isConnected) {
        throw new Error('Wallet is not connected');
      }

      const { address, chainId } = currentWallet;

      try {
        if (chainId) {
          const readProvider = getReadOnlyProvider(chainId);
          const raw = await readProvider.getBalance(address);
          return { address, chainId, balance: ethers.formatEther(raw) };
        }

        const provider = getProvider();
        if (!provider) {
          throw new Error('Wallet provider unavailable');
        }

        const raw = await provider.getBalance(address);
        return { address, chainId, balance: ethers.formatEther(raw) };
      } catch {
        if (chainId) {
          let fallback: ethers.JsonRpcProvider | undefined;
          try {
            const rpcUrl = await findHealthyEndpoint(chainId);
            if (rpcUrl) {
              fallback = new ethers.JsonRpcProvider(rpcUrl);
              const raw = await fallback.getBalance(address);
              return { address, chainId, balance: ethers.formatEther(raw) };
            }
          } finally {
            fallback?.destroy();
          }
        }

        const provider = getProvider();
        if (!provider) {
          throw new Error('Wallet provider unavailable');
        }

        const raw = await provider.getBalance(address);
        return { address, chainId, balance: ethers.formatEther(raw) };
      }
    },
  });

  useEffect(() => {
    if (!balanceQuery.data) {
      return;
    }

    const { address, chainId, balance } = balanceQuery.data;
    if (!matchesCurrentWallet(address, chainId)) {
      return;
    }

    setWallet({ balance, lastSyncAt: Date.now() });
    balanceFailCountRef.current = 0;
  }, [balanceQuery.data, setWallet]);

  useEffect(() => {
    if (balanceQuery.error && balanceQuery.fetchStatus === 'idle') {
      balanceFailCountRef.current += 1;
    }
  }, [balanceQuery.error, balanceQuery.fetchStatus, balanceQuery.errorUpdatedAt]);

  return null;
}
