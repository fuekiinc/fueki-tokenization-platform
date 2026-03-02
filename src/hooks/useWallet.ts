import { useCallback } from 'react';
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

import { getNetworkMetadata } from '../contracts/addresses';
import logger from '../lib/logger';
import {
  findHealthyEndpoint,
  getOrderedRpcEndpoints,
  getWalletSwitchRpcUrls,
} from '../lib/rpc/endpoints';
import { getProvider as getStoreProvider, setSwitchInProgress, useWalletStore } from '../store/walletStore.ts';
import {
  getThirdwebAppMetadata,
  getThirdwebChainForSwitch,
  isThirdwebConfigured,
  THIRDWEB_DEFAULT_CHAIN,
  THIRDWEB_SUPPORTED_CHAINS,
  THIRDWEB_THEME,
  THIRDWEB_WALLETCONNECT_PROJECT_ID,
  THIRDWEB_WALLETS,
  thirdwebClient,
} from '../lib/thirdweb';
import { clearWalletBoundStores } from '../wallet/walletBoundStores';
import { useAuthStore } from '../store/authStore';

const SWITCH_PRECHECK_TIMEOUT_MS = 3_500;

type RequestProvider = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
  providers?: unknown;
  selectedAddress?: string;
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
  isTrust?: boolean;
  isTrustWallet?: boolean;
  isRabby?: boolean;
  isPhantom?: boolean;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function toErrorCode(error: unknown): number | null {
  const maybeCode = (error as { code?: unknown })?.code;
  return typeof maybeCode === 'number' ? maybeCode : null;
}

function isUserRejectedError(error: unknown): boolean {
  const code = toErrorCode(error);
  const message = error instanceof Error ? error.message : String(error);
  return code === 4001 || /user rejected|rejected by user|ACTION_REJECTED|denied/i.test(message);
}

function isChainNotAddedError(error: unknown): boolean {
  const code = toErrorCode(error);
  const message = error instanceof Error ? error.message : String(error);
  return (
    code === 4902 ||
    /unrecognized chain|unknown chain|chain not added|network not added|unsupported chain id/i.test(
      message,
    )
  );
}

function providerMatchesWalletId(provider: RequestProvider, walletId: string): boolean {
  switch (walletId) {
    case 'io.metamask':
      return Boolean(provider.isMetaMask);
    case 'com.coinbase.wallet':
      return Boolean(provider.isCoinbaseWallet);
    case 'com.trustwallet.app':
      return Boolean(provider.isTrust || provider.isTrustWallet);
    case 'io.rabby':
      return Boolean(provider.isRabby);
    case 'app.phantom':
      return Boolean(provider.isPhantom);
    default:
      return false;
  }
}

function normalizeAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

async function getProviderAccounts(provider: RequestProvider): Promise<string[]> {
  try {
    const result = await provider.request({ method: 'eth_accounts' });
    if (!Array.isArray(result)) return [];
    return result
      .map((value) => (typeof value === 'string' ? normalizeAddress(value) : null))
      .filter((value): value is string => Boolean(value));
  } catch {
    return [];
  }
}

async function prioritizeProvidersForAddress(
  providers: RequestProvider[],
  activeAddress?: string | null,
): Promise<RequestProvider[]> {
  const normalizedActiveAddress = normalizeAddress(activeAddress);
  if (!normalizedActiveAddress || providers.length <= 1) {
    return providers;
  }

  const withAddress: RequestProvider[] = [];
  const withoutAddress: RequestProvider[] = [];

  for (const provider of providers) {
    const accounts = await getProviderAccounts(provider);
    if (accounts.includes(normalizedActiveAddress)) {
      withAddress.push(provider);
    } else {
      withoutAddress.push(provider);
    }
  }

  return [...withAddress, ...withoutAddress];
}

function getInjectedProviderCandidates(
  activeWalletId: string,
  activeAddress?: string | null,
): RequestProvider[] {
  if (typeof window === 'undefined') return [];

  const ethereumAny = (window as Window & { ethereum?: unknown }).ethereum;
  if (!ethereumAny) return [];

  const baseProviders = Array.isArray((ethereumAny as { providers?: unknown }).providers)
    ? (((ethereumAny as { providers?: unknown }).providers as unknown[]) ?? [])
    : [ethereumAny];

  const requestProviders = baseProviders.filter(
    (provider): provider is RequestProvider =>
      Boolean(
        provider &&
        typeof provider === 'object' &&
        typeof (provider as { request?: unknown }).request === 'function',
      ),
  );

  const matchedProviders = requestProviders.filter((provider) =>
    providerMatchesWalletId(provider, activeWalletId),
  );
  const normalizedActiveAddress = normalizeAddress(activeAddress);
  const matchingSelectedAddress = normalizedActiveAddress
    ? requestProviders.filter(
        (provider) =>
          normalizeAddress(provider.selectedAddress) === normalizedActiveAddress,
      )
    : [];
  const matchingWalletAndAddress = normalizedActiveAddress
    ? matchedProviders.filter(
        (provider) =>
          normalizeAddress(provider.selectedAddress) === normalizedActiveAddress,
      )
    : [];

  const prioritized = [
    ...matchingWalletAndAddress,
    ...matchingSelectedAddress,
    ...matchedProviders,
    ...requestProviders,
  ];

  const unique: RequestProvider[] = [];
  const seen = new Set<RequestProvider>();
  for (const provider of prioritized) {
    if (seen.has(provider)) continue;
    seen.add(provider);
    unique.push(provider);
  }

  return unique;
}

function parseChainId(rawChainId: unknown): number | null {
  if (typeof rawChainId === 'number' && Number.isFinite(rawChainId)) {
    return rawChainId;
  }
  if (typeof rawChainId === 'string' && rawChainId.trim()) {
    const value = rawChainId.trim();
    const parsed = value.startsWith('0x')
      ? Number.parseInt(value, 16)
      : Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function getInjectedProviderChainId(
  activeWalletId: string,
  activeAddress?: string | null,
): Promise<number | null> {
  const providers = await prioritizeProvidersForAddress(
    getInjectedProviderCandidates(activeWalletId, activeAddress),
    activeAddress,
  );
  for (const provider of providers) {
    try {
      const chainId = parseChainId(
        await provider.request({ method: 'eth_chainId' }),
      );
      if (chainId !== null) {
        return chainId;
      }
    } catch {
      // Ignore provider-level chain lookup failures and continue.
    }
  }
  return null;
}

async function getResolvedWalletChainId(
  activeWallet: ReturnType<typeof useActiveWallet>,
  activeAddress?: string | null,
): Promise<number | null> {
  if (!activeWallet) return null;
  const injectedChainId = await getInjectedProviderChainId(
    activeWallet.id,
    activeAddress,
  );
  if (injectedChainId !== null) {
    return injectedChainId;
  }
  const walletChainId = parseChainId(activeWallet.getChain()?.id);
  if (walletChainId !== null) {
    return walletChainId;
  }
  return null;
}

async function waitForWalletChain(
  activeWallet: ReturnType<typeof useActiveWallet>,
  targetChainId: number,
  activeAddress?: string | null,
  timeoutMs = 3_000,
): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const currentChainId = await getResolvedWalletChainId(
      activeWallet,
      activeAddress,
    );
    if (currentChainId === targetChainId) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function parseWalletError(err: unknown): string {
  const code = toErrorCode(err);
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

  if (code === 4902 || /unrecognized chain|chain not added|network not added/i.test(message)) {
    return 'The target network is not configured in your wallet. Please approve adding it and try again.';
  }

  if (code === 4001) {
    return 'Request rejected. Please approve the prompt in your wallet to continue.';
  }

  if (/chain.*not.*support|unsupported.*chain|network.*not.*support/i.test(message)) {
    return 'This network is not supported by your wallet. You may need to add it manually.';
  }

  if (/namespace|eip155|session.*chain|chain not approved/i.test(message)) {
    return 'Your wallet session does not include this network. Reconnect wallet and enable the target chain.';
  }

  if (/insufficient funds/i.test(message)) {
    return 'Insufficient funds for this transaction.';
  }

  if (/timeout|timed out|ETIMEDOUT/i.test(message)) {
    return 'Network request timed out. Please check your connection and try again.';
  }

  if (/failed to fetch|fetch failed|network request failed|networkerror/i.test(message)) {
    return 'Your wallet RPC endpoint is unreachable. Re-select the network and try again.';
  }

  if (message.length > 0 && message.length < 220) {
    return message;
  }

  return 'Wallet action failed. Please try again.';
}

function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const url of urls) {
    const normalized = url.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(url);
  }
  return deduped;
}

function isValidRpcUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

async function attemptRawProviderChainSwitch(
  targetChainId: number,
  preferredRpcUrl: string | null,
  activeWallet: ReturnType<typeof useActiveWallet>,
  activeAddress?: string | null,
): Promise<void> {
  if (!activeWallet) {
    throw new Error('Wallet is not available for direct network switching.');
  }

  const candidateProviders = getInjectedProviderCandidates(
    activeWallet.id,
    activeAddress,
  );
  const orderedProviders = await prioritizeProvidersForAddress(
    candidateProviders,
    activeAddress,
  );
  if (orderedProviders.length === 0) {
    throw new Error('No injected wallet provider is available for fallback chain switch.');
  }

  const network = getNetworkMetadata(targetChainId);
  const walletSafeRpcUrls = getWalletSwitchRpcUrls(targetChainId);
  const fallbackRpcUrls = getOrderedRpcEndpoints(targetChainId);
  const orderedRpcUrls = dedupeUrls([
    ...(preferredRpcUrl ? [preferredRpcUrl] : []),
    ...walletSafeRpcUrls,
    ...fallbackRpcUrls,
    ...(network?.rpcUrl ? [network.rpcUrl] : []),
  ]).filter(isValidRpcUrl);
  const rpcUrlsForChainParams =
    orderedRpcUrls.length > 0
      ? orderedRpcUrls
      : (network?.rpcUrl ? [network.rpcUrl] : []);

  const chainParams = {
    chainId: ethers.toQuantity(targetChainId),
    chainName: network?.name ?? `Chain ${targetChainId}`,
    nativeCurrency: network?.nativeCurrency ?? {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    rpcUrls: rpcUrlsForChainParams,
    ...(network?.blockExplorer ? { blockExplorerUrls: [network.blockExplorer] } : {}),
  };
  const shouldRefreshChainConfig = targetChainId === 17000;

  let lastError: unknown = null;

  for (const provider of orderedProviders) {
    try {
      if (shouldRefreshChainConfig) {
        try {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [chainParams],
          });
        } catch (refreshError) {
          if (isUserRejectedError(refreshError)) {
            throw refreshError;
          }
        }
      }

      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: chainParams.chainId }],
        });
      } catch (switchError) {
        if (isUserRejectedError(switchError)) {
          throw switchError;
        }

        if (!isChainNotAddedError(switchError)) {
          throw switchError;
        }

        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [chainParams],
        });

        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: chainParams.chainId }],
        });
      }

      return;
    } catch (error) {
      if (isUserRejectedError(error)) {
        throw error;
      }

      lastError = error;
      logger.debug('Raw provider chain switch fallback attempt failed', {
        walletId: activeWallet.id,
        chainId: targetChainId,
        error,
      });
    }
  }

  throw lastError ?? new Error('Fallback chain switch failed on all injected providers.');
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

  const activeAccount = useActiveAccount();
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
        const isDemoActive = useAuthStore.getState().user?.demoActive === true;
        if (isDemoActive) {
          const msg =
            'Demo mode is pinned to Holesky. Exit demo mode to connect your own wallet and switch networks.';
          setLastError(msg);
          toast.error(msg);
          return;
        }
        const msg = 'Please connect your wallet first.';
        setLastError(msg);
        toast.error(msg);
        return;
      }

      if (useWalletStore.getState().wallet.connectionStatus === 'switching') {
        return;
      }

      setSwitchInProgress(true);
      beginChainSwitch(chainId);

      try {
        // Quick RPC preflight to find a healthy endpoint for the target chain.
        const preferredRpc = await findHealthyEndpoint(chainId, SWITCH_PRECHECK_TIMEOUT_MS)
          .catch(() => null);

        const chain = getThirdwebChainForSwitch(chainId, preferredRpc);

        // Tier 1: Thirdweb's primary switch (works for all wallet types).
        // Single 30s timeout — if the wallet doesn't respond, fail fast.
        try {
          await withTimeout(
            switchActiveWalletChain(chain),
            30_000,
            'Network switch',
          );
        } catch (primaryError) {
          // User rejected — bail immediately, no fallback.
          if (isUserRejectedError(primaryError)) throw primaryError;

          logger.warn('Primary switch failed, trying raw EIP-1193 fallback', primaryError);

          // Tier 2: Raw injected-provider fallback (MetaMask, Rabby, etc.).
          // Skip entirely for WalletConnect / non-injected wallets.
          const candidates = getInjectedProviderCandidates(activeWallet?.id);
          if (candidates.length > 0) {
            try {
              await withTimeout(
                attemptRawProviderChainSwitch(
                  chainId,
                  preferredRpc,
                  activeWallet,
                  activeAccount?.address,
                ),
                15_000,
                'Fallback network switch',
              );
              // Re-sync thirdweb after raw provider switch.
              await switchActiveWalletChain(chain).catch(() => {});
            } catch (fallbackError) {
              if (isUserRejectedError(fallbackError)) throw fallbackError;
              // Both tiers failed — throw the original error (more informative).
              throw primaryError;
            }
          } else {
            // No injected provider (WalletConnect, etc.) — throw immediately.
            throw primaryError;
          }
        }

        // Brief wait for chain confirmation (3s max, non-blocking).
        await waitForWalletChain(activeWallet, chainId, activeAccount?.address);

        clearWalletBoundStores();
        setLastError(null);
      } catch (err: unknown) {
        logger.error('switchNetwork failed:', err);
        const message = parseWalletError(err);
        failChainSwitch(message);
        toast.error(message);
      } finally {
        setSwitchInProgress(false);
      }
    },
    [
      activeWallet,
      activeAccount?.address,
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
