import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import type { BrowserProvider, JsonRpcSigner } from 'ethers';
import { useAuthStore } from '../../store/authStore';
import { useWalletStore } from '../../store/walletStore';
import logger from '../../lib/logger';
import { findHealthyEndpoint, getOrderedRpcEndpoints } from '../../lib/rpc/endpoints';

/**
 * DEMO_CHAIN_ID is the chain ID for the demo testnet (Arbitrum Sepolia).
 */
const DEMO_CHAIN_ID = 421614;

type RuntimeEnvWindow = Window & {
  __FUEKI_RUNTIME_ENV__?: Record<string, string>;
};

function resolveDemoWalletKey(): string {
  if (typeof window !== 'undefined') {
    const runtimeKey = (window as RuntimeEnvWindow).__FUEKI_RUNTIME_ENV__?.VITE_DEMO_WALLET_KEY;
    if (typeof runtimeKey === 'string' && runtimeKey.trim()) {
      return runtimeKey.trim();
    }
  }

  const buildKey = import.meta.env.VITE_DEMO_WALLET_KEY;
  return typeof buildKey === 'string' ? buildKey.trim() : '';
}

// ---------------------------------------------------------------------------
// Demo wallet lifecycle store – consumed by DashboardPage and other components
// to show appropriate loading / error states while the demo wallet initialises.
// ---------------------------------------------------------------------------

interface DemoWalletState {
  /** True while the async wallet setup is in progress. */
  isSettingUp: boolean;
  /** Non-null when setup failed (RPC unreachable, missing env var, etc.). */
  setupError: string | null;
  /** True once setup completed successfully. */
  isReady: boolean;
}

interface DemoWalletActions {
  markSettingUp: () => void;
  markReady: () => void;
  markError: (msg: string) => void;
  reset: () => void;
}

const initialDemoWalletState: DemoWalletState = {
  isSettingUp: false,
  setupError: null,
  isReady: false,
};

export const useDemoWalletStore = create<DemoWalletState & DemoWalletActions>()(
  (set) => ({
    ...initialDemoWalletState,
    markSettingUp: () =>
      set({ isSettingUp: true, setupError: null, isReady: false }),
    markReady: () =>
      set({ isSettingUp: false, setupError: null, isReady: true }),
    markError: (msg: string) =>
      set({ isSettingUp: false, setupError: msg, isReady: false }),
    reset: () => set({ ...initialDemoWalletState }),
  }),
);

/**
 * DemoWalletProvider
 *
 * When the user is in demo mode, this component:
 * 1. Reads the VITE_DEMO_WALLET_KEY env var (a Arbitrum Sepolia private key)
 * 2. Creates an ethers.Wallet + JsonRpcProvider for Arbitrum Sepolia
 * 3. Injects the wallet address and chain ID into the wallet store
 *
 * The demo wallet is a shared platform-owned Arbitrum Sepolia wallet pre-funded
 * with testnet ETH. Since it only holds testnet assets, exposing the
 * private key as a Vite env var (client-side) is acceptable.
 *
 * On demo end, the wallet store is reset.
 */
export default function DemoWalletProvider() {
  const user = useAuthStore((s) => s.user);
  const isDemoActive = user?.demoActive === true;
  const setProvider = useWalletStore((s) => s.setProvider);
  const setSigner = useWalletStore((s) => s.setSigner);
  const setWallet = useWalletStore((s) => s.setWallet);
  const resetWallet = useWalletStore((s) => s.resetWallet);
  const setupDone = useRef(false);
  const wasDemoActiveRef = useRef(false);

  const markSettingUp = useDemoWalletStore((s) => s.markSettingUp);
  const markReady = useDemoWalletStore((s) => s.markReady);
  const markError = useDemoWalletStore((s) => s.markError);
  const resetDemoStore = useDemoWalletStore((s) => s.reset);

  useEffect(() => {
    if (!isDemoActive) {
      if (wasDemoActiveRef.current) {
        // End demo mode cleanly so normal thirdweb sync can take over.
        setProvider(null);
        setSigner(null);
        resetWallet();
        resetDemoStore();
      }
      setupDone.current = false;
      wasDemoActiveRef.current = false;
      return;
    }

    wasDemoActiveRef.current = true;

    if (setupDone.current) return;

    const demoKey = resolveDemoWalletKey();
    if (!demoKey) {
      const msg =
        'Demo wallet key is not configured. Please contact support or try again later.';
      logger.warn(
        '[DemoWalletProvider] VITE_DEMO_WALLET_KEY is not set. Demo wallet will not be activated.',
      );
      markError(msg);
      return;
    }

    markSettingUp();

    let cancelled = false;

    (async () => {
      try {
        // Dynamic import to avoid loading ethers for non-demo users
        const { Wallet, JsonRpcProvider, formatEther } = await import('ethers');

        if (cancelled) return;

        const healthyRpc =
          (await findHealthyEndpoint(DEMO_CHAIN_ID)) ??
          getOrderedRpcEndpoints(DEMO_CHAIN_ID)[0];
        if (!healthyRpc) {
          throw new Error('No healthy Arbitrum Sepolia RPC endpoint is available for demo mode.');
        }

        if (cancelled) return;

        const provider = new JsonRpcProvider(healthyRpc, DEMO_CHAIN_ID);
        const wallet = new Wallet(demoKey, provider);
        const address = await wallet.getAddress();

        if (cancelled) return;

        let balanceStr = '0';
        try {
          const balanceWei = await provider.getBalance(address);
          balanceStr = formatEther(balanceWei);
        } catch (balErr) {
          // Non-fatal: wallet is still usable even if initial balance fetch fails.
          logger.warn('[DemoWalletProvider] Balance fetch failed, continuing:', balErr);
        }

        if (cancelled) return;

        // Store the demo wallet address/signer and lock chain to Arbitrum Sepolia.
        // Casts are intentional: the global wallet store expects browser-wallet
        // types but demo mode uses a direct JsonRpcProvider + Wallet signer.
        setProvider(provider as unknown as BrowserProvider);
        setSigner(wallet as unknown as JsonRpcSigner);
        setWallet({
          address,
          chainId: DEMO_CHAIN_ID,
          isConnected: true,
          isConnecting: false,
          connectionStatus: 'connected',
          providerReady: true,
          signerReady: true,
          lastError: null,
          switchTargetChainId: null,
          balance: balanceStr,
          lastSyncAt: Date.now(),
        });

        setupDone.current = true;
        markReady();
        logger.info(
          `[DemoWalletProvider] Demo wallet activated: ${address.slice(0, 8)}... via ${healthyRpc}`,
        );
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : 'Failed to initialise demo wallet';
        logger.error('[DemoWalletProvider] Failed to setup demo wallet:', err);
        markError(msg);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isDemoActive, markError, markReady, markSettingUp, resetDemoStore, resetWallet, setProvider, setSigner, setWallet]);

  // This is a "provider" component -- it does not render visible UI.
  return null;
}
