import { useCallback, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import {
  useActiveAccount,
  useActiveWallet,
  useActiveWalletChain,
  useActiveWalletConnectionStatus,
} from 'thirdweb/react';
import { EIP1193 } from 'thirdweb/wallets';

import logger from '../lib/logger';
import { getProvider, useWalletStore } from '../store/walletStore';
import {
  THIRDWEB_DEFAULT_CHAIN,
  getThirdwebChain,
  isThirdwebConfigured,
  thirdwebClient,
} from '../lib/thirdweb';
import { clearWalletBoundStores } from './walletBoundStores';
import { findHealthyEndpoint } from '../lib/rpc/endpoints';

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
  provider: ethers.BrowserProvider,
  address: string,
  chainId?: number | null,
  retries = 2,
): Promise<string> {
  // Try the wallet's own provider first.
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const raw = await provider.getBalance(address);
      return ethers.formatEther(raw);
    } catch (err) {
      if (attempt === retries) {
        logger.debug('Balance fetch via wallet provider failed after retries:', err);
      } else {
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
      }
    }
  }

  // Fallback: use a healthy public RPC endpoint for balance lookup.
  if (chainId) {
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

  return '0';
}

/**
 * Single wallet/network orchestrator.
 * Mount once near the app root so wallet sync side effects run exactly once.
 */
export function WalletConnectionController() {
  const wallet = useWalletStore((s) => s.wallet);
  const setWallet = useWalletStore((s) => s.setWallet);
  const setProvider = useWalletStore((s) => s.setProvider);
  const setSigner = useWalletStore((s) => s.setSigner);
  const resetWallet = useWalletStore((s) => s.resetWallet);
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
  const balanceIntervalRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Consecutive balance poll failures -- used for exponential backoff. */
  const balanceFailCountRef = useRef(0);

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
    const version = ++syncVersionRef.current;
    const isStale = () => syncVersionRef.current !== version;

    const isConnecting = connectionStatus === 'connecting';
    const isConnected =
      connectionStatus === 'connected' &&
      Boolean(activeWallet) &&
      Boolean(activeAccount?.address);

    if (!isConnected || !activeWallet || !activeAccount?.address) {
      if (isStale()) return;

      setProvider(null);
      setSigner(null);

      const isSwitching = wallet.connectionStatus === 'switching';

      setWallet({
        address: null,
        chainId: isSwitching ? wallet.switchTargetChainId : activeWalletChain?.id ?? null,
        isConnected: false,
        isConnecting: isSwitching || isConnecting,
        connectionStatus: isSwitching ? 'switching' : (isConnecting ? 'connecting' : 'disconnected'),
        providerReady: false,
        signerReady: false,
        switchTargetChainId: isSwitching ? wallet.switchTargetChainId : null,
        balance: '0',
        lastSyncAt: Date.now(),
      });

      if (!isConnecting) {
        setEnsName(null);
      }

      if (!isConnecting && wallet.connectionStatus !== 'switching') {
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
      return;
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
    wallet.connectionStatus,
    wallet.switchTargetChainId,
  ]);

  useEffect(() => {
    void syncWalletStore();
  }, [syncWalletStore]);

  useEffect(() => {
    const connected = connectionStatus === 'connected';

    if (connected) {
      wasConnectedRef.current = true;
      return;
    }

    if (connectionStatus === 'disconnected' && wasConnectedRef.current) {
      // During chain switches thirdweb may briefly report "disconnected".
      // Read the zustand switching flag directly (not via hook selector)
      // so we don't add a reactive dep that would cause extra re-runs.
      const isSwitching =
        useWalletStore.getState().wallet.connectionStatus === 'switching';

      if (!isSwitching) {
        wasConnectedRef.current = false;
        resetWallet();
        clearWalletBoundStores();
        setLastError(null);
      }
    }
  }, [connectionStatus, resetWallet, setLastError]);

  useEffect(() => {
    clearTimeout(balanceIntervalRef.current);

    if (!wallet.isConnected || !wallet.address) {
      balanceFailCountRef.current = 0;
      return;
    }

    const BASE_INTERVAL = 60_000; // 60 s (was 30 s -- reduces RPC load)
    const MAX_INTERVAL = 5 * 60_000; // cap at 5 minutes on repeated failures

    function scheduleBalancePoll() {
      const backoff = Math.min(
        BASE_INTERVAL * Math.pow(2, balanceFailCountRef.current),
        MAX_INTERVAL,
      );

      balanceIntervalRef.current = setTimeout(async () => {
        const provider = getProvider();
        if (!provider || !wallet.address) return;
        try {
          const raw = await provider.getBalance(wallet.address);
          setWallet({ balance: ethers.formatEther(raw), lastSyncAt: Date.now() });
          balanceFailCountRef.current = 0; // reset on success
        } catch {
          // Wallet provider RPC failed — try a healthy public endpoint.
          if (wallet.chainId) {
            try {
              const rpcUrl = await findHealthyEndpoint(wallet.chainId);
              if (rpcUrl) {
                const fallback = new ethers.JsonRpcProvider(rpcUrl);
                const raw = await fallback.getBalance(wallet.address!);
                fallback.destroy();
                setWallet({ balance: ethers.formatEther(raw), lastSyncAt: Date.now() });
                balanceFailCountRef.current = 0;
                scheduleBalancePoll();
                return;
              }
            } catch {
              // fallback also failed
            }
          }
          balanceFailCountRef.current++;
        }
        scheduleBalancePoll();
      }, backoff);
    }

    scheduleBalancePoll();

    return () => clearTimeout(balanceIntervalRef.current);
  }, [wallet.isConnected, wallet.address, wallet.chainId, setWallet]);

  return null;
}
