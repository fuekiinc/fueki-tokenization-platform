import { useState, useCallback, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import { useWalletStore, getProvider as getStoreProvider } from '../store/walletStore.ts';
import { useAssetStore } from '../store/assetStore.ts';
import { useTradeStore } from '../store/tradeStore.ts';
import { useExchangeStore } from '../store/exchangeStore.ts';
import { SUPPORTED_NETWORKS } from '../contracts/addresses';

interface EthereumProvider {
  isMetaMask?: boolean;
  isTrust?: boolean;
  isCoinbaseWallet?: boolean;
  isBraveWallet?: boolean;
  isTokenPocket?: boolean;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: never[]) => void) => void;
  removeListener: (event: string, handler: (...args: never[]) => void) => void;
  providers?: EthereumProvider[];
}

interface EIP6963ProviderDetail {
  info: {
    uuid: string;
    name: string;
    icon: string;
    rdns: string;
  };
  provider: EthereumProvider;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
    trustwallet?: EthereumProvider;
  }
  interface WindowEventMap {
    'eip6963:announceProvider': CustomEvent<EIP6963ProviderDetail>;
  }
}

// ---------------------------------------------------------------------------
// Module-level EIP-6963 provider registry.
// Providers announce themselves via a CustomEvent; we collect them here so
// getEthereumProvider() can use modern wallet discovery.
// ---------------------------------------------------------------------------
const eip6963Providers: EIP6963ProviderDetail[] = [];
let eip6963Listening = false;

function startEIP6963Discovery(): void {
  if (typeof window === 'undefined' || eip6963Listening) return;
  eip6963Listening = true;

  window.addEventListener('eip6963:announceProvider', ((
    event: CustomEvent<EIP6963ProviderDetail>,
  ) => {
    const detail = event.detail;
    // Avoid duplicates (same uuid).
    if (!eip6963Providers.some((p) => p.info.uuid === detail.info.uuid)) {
      eip6963Providers.push(detail);
    }
  }) as EventListener);

  // Request providers already injected.
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

// Kick off discovery as early as possible (module load time).
startEIP6963Discovery();

// ---------------------------------------------------------------------------
// Module-level ref-counter so that wallet event listeners are registered
// exactly once and only removed when the LAST consumer unmounts.  A simple
// boolean flag would fail when component A unmounts (clearing the flag and
// removing listeners) while component B still expects them to be active.
// ---------------------------------------------------------------------------
let listenerConsumerCount = 0;

// ---------------------------------------------------------------------------
// Extract a user-friendly message from ethers v6 / wallet RPC errors.
//
// ethers v6 wraps low-level JSON-RPC errors in its own error classes.
// The original wallet message is often buried in `error.info.error.message`
// or `error.error.message`.  We dig it out and map known codes to clear text.
// ---------------------------------------------------------------------------
function parseWalletError(err: unknown): string {
  // 1. Try to extract the inner wallet/RPC error message.
  const inner =
    (err as { info?: { error?: { message?: string; code?: number } } })?.info
      ?.error ??
    (err as { error?: { message?: string; code?: number } })?.error;

  const code =
    inner?.code ??
    (err as { code?: number | string })?.code;

  const rawMessage =
    inner?.message ??
    (err instanceof Error ? err.message : '');

  // 2. Map known error codes / messages to user-facing text.

  // User rejected the request in their wallet popup.
  if (code === 4001 || /user (rejected|denied)/i.test(rawMessage)) {
    return 'Connection request was rejected. Please approve the wallet prompt to connect.';
  }

  // Wallet extension is present but has no unlocked / created account.
  if (
    code === -32603 &&
    /no active wallet/i.test(rawMessage)
  ) {
    return 'No active wallet found. Please open your wallet extension and create or unlock an account first.';
  }

  // Request already pending (user didn't act on a previous popup).
  if (code === -32002 || /already pending/i.test(rawMessage)) {
    return 'A wallet connection request is already pending. Please check your wallet extension popup.';
  }

  // Generic internal JSON-RPC error.
  if (code === -32603) {
    return rawMessage || 'Wallet encountered an internal error. Please try again.';
  }

  // 3. Fallback: use the raw message if it's short enough, otherwise generic.
  if (rawMessage && rawMessage.length < 200) {
    return rawMessage;
  }
  return 'Failed to connect wallet. Please try again.';
}

export function useWallet() {
  const wallet = useWalletStore((s) => s.wallet);
  const setWallet = useWalletStore((s) => s.setWallet);
  const setProvider = useWalletStore((s) => s.setProvider);
  const setSigner = useWalletStore((s) => s.setSigner);
  const resetWallet = useWalletStore((s) => s.resetWallet);

  const [error, setError] = useState<string | null>(null);

  // Refs that always point at the latest values so event-handler closures
  // never read stale state.
  const walletRef = useRef(wallet);
  walletRef.current = wallet;

  // Guard against concurrent connectWallet invocations (e.g. fast double-click
  // or a chain-change event firing while a connection is already in progress).
  const connectingRef = useRef(false);

  // ---- Helpers ------------------------------------------------------------

  /**
   * Discover available wallet providers.  MetaMask browser extension is
   * preferred; if it is not found we fall back to other wallets.
   *
   * Discovery order:
   *  1. EIP-6963 announced providers -- look for MetaMask first (rdns
   *     "io.metamask"), then take the first available provider.
   *  2. window.ethereum.providers array -- look for isMetaMask, then first.
   *  3. window.ethereum directly (legacy single-provider).
   *  4. window.trustwallet (Trust Wallet specific injection, older versions).
   */
  const getEthereumProvider = useCallback((): EthereumProvider | null => {
    if (typeof window === 'undefined') return null;

    // 1. EIP-6963: prefer MetaMask by rdns, then any announced provider.
    if (eip6963Providers.length > 0) {
      const metamask = eip6963Providers.find(
        (p) => p.info.rdns === 'io.metamask' || p.info.rdns === 'io.metamask.flask',
      );
      if (metamask) return metamask.provider;
      // Fallback: first non-Trust-Wallet EIP-6963 provider, then any.
      return eip6963Providers[0].provider;
    }

    // 2. Multi-provider environments (e.g. MetaMask + Coinbase co-installed).
    //    window.ethereum.providers is an array when multiple extensions inject.
    if (window.ethereum?.providers?.length) {
      const mm = window.ethereum.providers.find((p) => p.isMetaMask && !p.isBraveWallet);
      if (mm) return mm;
      return window.ethereum.providers[0];
    }

    // 3. Legacy single-provider -- check isMetaMask flag.
    if (window.ethereum) return window.ethereum;

    // 4. Trust Wallet specific injection (older versions).
    if (window.trustwallet) return window.trustwallet;

    return null;
  }, []);

  const checkIfWalletIsInstalled = useCallback((): boolean => {
    return getEthereumProvider() !== null;
  }, [getEthereumProvider]);

  // ---- Connect ------------------------------------------------------------

  const connectWallet = useCallback(async () => {
    const walletProvider = getEthereumProvider();

    if (!walletProvider) {
      const msg =
        'No Ethereum wallet detected. Please install MetaMask, Trust Wallet, or another Web3 wallet.';
      setError(msg);
      toast.error(msg);
      return;
    }

    // Prevent overlapping connection attempts (race-condition guard).
    if (connectingRef.current) return;
    connectingRef.current = true;

    try {
      setWallet({ isConnecting: true });
      setError(null);

      // Try multiple connection strategies. Some wallets (Trust Wallet, Brave,
      // Coinbase) don't support all methods and may trigger biometric auth
      // which can take extra time. We give generous timeouts.
      let accounts: string[] = [];

      // Helper: race a promise against a timeout. Wallets with biometric
      // unlock (Trust Wallet, etc.) may take 30+ seconds for the user to
      // authenticate, so we use a 120s timeout to avoid cutting them off.
      const withTimeout = <T,>(promise: Promise<T>, ms = 120_000): Promise<T> =>
        Promise.race([
          promise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Wallet request timed out. Please try again.')), ms),
          ),
        ]);

      // Strategy 1: eth_requestAccounts (standard EIP-1102)
      try {
        accounts = ((await withTimeout(walletProvider.request({
          method: 'eth_requestAccounts',
        }))) ?? []) as string[];
      } catch (reqErr: unknown) {
        const code = (reqErr as { code?: number }).code;

        // If user rejected (4001), don't try fallbacks -- they said no.
        if (code === 4001) throw reqErr;

        console.warn('eth_requestAccounts failed, trying wallet_requestPermissions...', reqErr);

        // Strategy 2: wallet_requestPermissions (works on some wallets that
        // don't implement eth_requestAccounts properly)
        try {
          await withTimeout(walletProvider.request({
            method: 'wallet_requestPermissions',
            params: [{ eth_accounts: {} }],
          }));
          accounts = ((await withTimeout(walletProvider.request({
            method: 'eth_accounts',
          }))) ?? []) as string[];
        } catch (permErr: unknown) {
          const permCode = (permErr as { code?: number }).code;
          if (permCode === 4001) throw permErr;

          console.warn('wallet_requestPermissions failed, trying eth_accounts...', permErr);

          // Strategy 3: eth_accounts (check if already authorized)
          try {
            accounts = ((await withTimeout(walletProvider.request({
              method: 'eth_accounts',
            }))) ?? []) as string[];
          } catch {
            // All strategies failed, rethrow the original error
            throw reqErr;
          }
        }
      }

      if (!accounts || accounts.length === 0) {
        throw new Error(
          'No accounts available. Please open your wallet extension, create or unlock an account, and try again.',
        );
      }

      // Use the discovered provider (not window.ethereum) so we bind to the
      // correct wallet instance in multi-wallet environments.
      const provider = new ethers.BrowserProvider(walletProvider as ethers.Eip1193Provider);

      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();
      const balance = await provider.getBalance(address);

      setProvider(provider);
      setSigner(signer);
      setWallet({
        address,
        chainId: Number(network.chainId),
        isConnected: true,
        isConnecting: false,
        balance: ethers.formatEther(balance),
      });

      toast.success(
        `Wallet connected: ${address.slice(0, 6)}...${address.slice(-4)}`,
      );
    } catch (err: unknown) {
      console.error('Wallet connection failed:', err);

      // Parse the user-facing message out of ethers v6 nested error structure.
      const message = parseWalletError(err);
      setError(message);
      toast.error(message);
      setWallet({ isConnecting: false, isConnected: false });
    } finally {
      connectingRef.current = false;
    }
  }, [getEthereumProvider, setWallet, setProvider, setSigner]);

  // Keep a ref to connectWallet so the event handlers always call the
  // latest version without needing to re-register listeners.
  const connectWalletRef = useRef(connectWallet);
  connectWalletRef.current = connectWallet;

  // ---- Disconnect ---------------------------------------------------------

  const disconnectWallet = useCallback(() => {
    resetWallet();
    // Clear data from other domain stores so a fresh connect starts clean.
    useAssetStore.getState().setAssets([]);
    useAssetStore.getState().setSecurityTokens([]);
    useTradeStore.getState().setTrades([]);
    useExchangeStore.getState().setOrders([]);
    useExchangeStore.getState().setUserOrders([]);
    setError(null);
  }, [resetWallet]);

  // ---- Network switching --------------------------------------------------

  const switchNetwork = useCallback(async (chainId: number) => {
    const walletProvider = getEthereumProvider();
    if (!walletProvider) return;

    const hexChainId = `0x${chainId.toString(16)}`;

    try {
      await walletProvider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hexChainId }],
      });
    } catch (err: unknown) {
      const code =
        (err as { code?: number }).code ??
        (err as { data?: { originalError?: { code?: number } } })?.data
          ?.originalError?.code;

      // 4902 = chain not configured in wallet. Attempt to add it automatically
      // using wallet_addEthereumChain with data from our SUPPORTED_NETWORKS
      // registry. This is critical for Holesky and other testnets that wallets
      // don't ship with by default.
      if (code === 4902) {
        const networkConfig = SUPPORTED_NETWORKS[chainId];
        if (networkConfig) {
          try {
            await walletProvider.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: hexChainId,
                  chainName: networkConfig.name,
                  rpcUrls: [networkConfig.rpcUrl],
                  blockExplorerUrls: networkConfig.blockExplorer
                    ? [networkConfig.blockExplorer]
                    : undefined,
                  nativeCurrency: networkConfig.nativeCurrency,
                },
              ],
            });
            return; // Success -- wallet will emit chainChanged.
          } catch (addErr: unknown) {
            const addCode = (addErr as { code?: number }).code;
            if (addCode === 4001) {
              const msg = 'Network addition was rejected. Please approve the wallet prompt to add the network.';
              setError(msg);
              toast.error(msg);
              return;
            }
            console.error('wallet_addEthereumChain failed:', addErr);
          }
        }
        const msg =
          'Network not configured in wallet and could not be added automatically. Please add it manually.';
        setError(msg);
        toast.error(msg);
      } else if (code === 4001) {
        const msg = 'Network switch was rejected. Please approve the wallet prompt to switch networks.';
        setError(msg);
        toast.error(msg);
      } else {
        const message = parseWalletError(err);
        setError(message);
        toast.error(message);
      }
    }
  }, [getEthereumProvider]);

  // ---- Balance refresh ----------------------------------------------------

  const refreshBalance = useCallback(async () => {
    if (!wallet.address || !wallet.isConnected) return;

    try {
      // Re-use the ethers BrowserProvider stored in the module-level ref;
      // fall back to creating a fresh one from the raw wallet provider.
      const existingProvider = getStoreProvider();
      const rawProvider = getEthereumProvider();
      if (!existingProvider && !rawProvider) return;
      const provider =
        existingProvider ?? new ethers.BrowserProvider(rawProvider! as ethers.Eip1193Provider);
      const balance = await provider.getBalance(wallet.address);
      setWallet({ balance: ethers.formatEther(balance) });
    } catch (err) {
      console.error('Failed to refresh balance:', err);
      toast.error('Failed to refresh wallet balance');
    }
  }, [wallet.address, wallet.isConnected, setWallet, getEthereumProvider]);

  // ---- Event listeners (account / chain changes) --------------------------
  //
  // Listeners are registered exactly ONCE across all hook instances via the
  // module-level ref counter.  Handler closures read from refs so they
  // always act on the most recent wallet / connectWallet values and never
  // go stale when deps change.
  // -----------------------------------------------------------------------

  useEffect(() => {
    // Resolve the provider using the same MetaMask-first logic as
    // getEthereumProvider() so we register listeners on the correct instance.
    let walletProvider: EthereumProvider | null = null;
    if (typeof window !== 'undefined') {
      if (eip6963Providers.length > 0) {
        const mm = eip6963Providers.find(
          (p) => p.info.rdns === 'io.metamask' || p.info.rdns === 'io.metamask.flask',
        );
        walletProvider = mm?.provider ?? eip6963Providers[0].provider;
      } else if (window.ethereum?.providers?.length) {
        walletProvider =
          window.ethereum.providers.find((p) => p.isMetaMask && !p.isBraveWallet) ??
          window.ethereum.providers[0];
      } else {
        walletProvider = window.ethereum ?? window.trustwallet ?? null;
      }
    }

    if (!walletProvider) return;

    // Increment the consumer count.  Only the first consumer actually
    // registers the listeners; subsequent consumers just bump the counter.
    listenerConsumerCount += 1;
    if (listenerConsumerCount > 1) return;

    const handleAccountsChanged = async (accounts: string[]) => {
      if (accounts.length === 0) {
        // User locked wallet or disconnected all accounts.
        useWalletStore.getState().resetWallet();
        useAssetStore.getState().setAssets([]);
        useAssetStore.getState().setSecurityTokens([]);
        useTradeStore.getState().setTrades([]);
        useExchangeStore.getState().setOrders([]);
        useExchangeStore.getState().setUserOrders([]);
        return;
      }

      // Normalize to checksum address for consistent comparison and storage.
      const checksumAddress = ethers.getAddress(accounts[0]);
      const currentAddress = walletRef.current.address;
      if (checksumAddress !== currentAddress) {
        try {
          const provider = new ethers.BrowserProvider(walletProvider as ethers.Eip1193Provider);
          const signer = await provider.getSigner();
          const balance = await provider.getBalance(checksumAddress);

          useWalletStore.getState().setProvider(provider);
          useWalletStore.getState().setSigner(signer);
          useWalletStore.getState().setWallet({
            address: checksumAddress,
            balance: ethers.formatEther(balance),
            isConnected: true,
          });
        } catch (err) {
          console.error('Failed to handle account change:', err);
          toast.error('Failed to update wallet after account change');
        }
      }
    };

    const handleChainChanged = (chainIdHex: string) => {
      const newChainId = parseInt(chainIdHex, 16);
      useWalletStore.getState().setChainId(newChainId);

      // Re-initialise provider & signer for the new chain
      if (walletRef.current.isConnected) {
        void connectWalletRef.current();
      }
    };

    // EIP-1193 disconnect: emitted when the wallet becomes disconnected from
    // all chains, or when Trust Wallet / Coinbase Wallet explicitly revoke
    // the dApp's permission from the wallet UI.
    const handleDisconnect = (error: { code: number; message: string }) => {
      console.warn('Wallet disconnect event:', error);
      useWalletStore.getState().resetWallet();
      useAssetStore.getState().setAssets([]);
      useAssetStore.getState().setSecurityTokens([]);
      useTradeStore.getState().setTrades([]);
      useExchangeStore.getState().setOrders([]);
      useExchangeStore.getState().setUserOrders([]);
    };

    walletProvider.on(
      'accountsChanged',
      handleAccountsChanged as (...args: never[]) => void,
    );
    walletProvider.on(
      'chainChanged',
      handleChainChanged as (...args: never[]) => void,
    );
    walletProvider.on(
      'disconnect',
      handleDisconnect as (...args: never[]) => void,
    );

    return () => {
      listenerConsumerCount = Math.max(0, listenerConsumerCount - 1);

      // Only tear down listeners when the very last consumer unmounts.
      if (listenerConsumerCount === 0) {
        walletProvider.removeListener(
          'accountsChanged',
          handleAccountsChanged as (...args: never[]) => void,
        );
        walletProvider.removeListener(
          'chainChanged',
          handleChainChanged as (...args: never[]) => void,
        );
        walletProvider.removeListener(
          'disconnect',
          handleDisconnect as (...args: never[]) => void,
        );
      }
    };
    // Empty deps: register once, use refs for latest values.
  }, []);

  // ---- Public API ---------------------------------------------------------

  return {
    ...wallet,
    error,
    connectWallet,
    disconnectWallet,
    switchNetwork,
    refreshBalance,
    isWalletInstalled: checkIfWalletIsInstalled(),
    /** EIP-6963 discovered wallet providers (for wallet-selection UIs). */
    discoveredProviders: eip6963Providers,
  };
}
