import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  ArrowRightLeft,
  Coins,
  Copy,
  Globe,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { ethers } from 'ethers';
import logger from '../lib/logger';
import { classifyError, showError } from '../lib/errorUtils';
import { getProvider, useWalletStore } from '../store/walletStore.ts';
import { getAssetFetchGeneration, nextAssetFetchGeneration, useAssetStore } from '../store/assetStore.ts';
import { useTradeStore } from '../store/tradeStore.ts';
import { useExchangeStore } from '../store/exchangeStore.ts';
import { useAuthStore } from '../store/authStore';
import { useWallet } from '../hooks/useWallet';
import { ContractService } from '../lib/blockchain/contracts';
import { isRetryableRpcError } from '../lib/rpc/endpoints';
import { retryAsync } from '../lib/utils/retry';
import { copyToClipboard, formatAddress } from '../lib/utils/helpers';
import { SUPPORTED_NETWORKS } from '../contracts/addresses';
import { useDemoWalletStore } from '../components/DemoMode/DemoWalletProvider';

// Dashboard sub-components
import StatsGrid from '../components/Dashboard/StatsGrid';
import RecentActivity from '../components/Dashboard/RecentActivity';
import QuickActions from '../components/Dashboard/QuickActions';
import PortfolioChart from '../components/Dashboard/PortfolioChart';
import ValueChart from '../components/Dashboard/ValueChart';
import DashboardSkeleton from '../components/Dashboard/DashboardSkeleton';
import { ErrorState } from '../components/Common/StateDisplays';
import { ComponentErrorBoundary } from '../components/ErrorBoundary';
import FuekiBrand from '../components/Brand/FuekiBrand';
import { CARD_CLASSES } from '../lib/designTokens';

// ---------------------------------------------------------------------------
// Shared glass morphism style tokens (from design system)
// ---------------------------------------------------------------------------

const GLASS = CARD_CLASSES.base;

// ---------------------------------------------------------------------------
// Getting-started step card
// ---------------------------------------------------------------------------

function StepCard({
  step,
  icon: Icon,
  title,
  children,
  accentColor,
}: {
  step: number;
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  accentColor: string;
}) {
  return (
    <div className={clsx(GLASS, 'relative overflow-hidden p-6')}>
      <div className="flex items-start gap-4">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${accentColor}18` }}
        >
          <Icon className="h-5 w-5" style={{ color: accentColor }} />
        </div>
        <div className="min-w-0">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest" style={{ color: accentColor }}>
            Step {step}
          </p>
          <h3 className="mb-2 text-base font-semibold text-white">{title}</h3>
          <div className="text-sm leading-relaxed text-gray-400">{children}</div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Network name helper
// ---------------------------------------------------------------------------

function getNetworkName(chainId: number | null): string {
  if (!chainId) return 'Unknown';
  const network = SUPPORTED_NETWORKS[chainId];
  return network?.name ?? `Chain ${chainId}`;
}

// ---------------------------------------------------------------------------
// DashboardPage
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { isConnected, address, isSwitchingNetwork } = useWallet();
  const user = useAuthStore((s) => s.user);
  const isDemoActive = user?.demoActive === true;
  const demoWalletSettingUp = useDemoWalletStore((s) => s.isSettingUp);
  const demoWalletError = useDemoWalletStore((s) => s.setupError);
  const demoWalletReady = useDemoWalletStore((s) => s.isReady);
  const wrappedAssets = useAssetStore((s) => s.wrappedAssets);
  const tradeHistory = useTradeStore((s) => s.tradeHistory);
  const userOrders = useExchangeStore((s) => s.userOrders);
  const setAssets = useAssetStore((s) => s.setAssets);
  const setUserOrders = useExchangeStore((s) => s.setUserOrders);
  const setTrades = useTradeStore((s) => s.setTrades);
  const setLoadingAssets = useAssetStore((s) => s.setLoadingAssets);
  const chainId = useWalletStore((s) => s.wallet.chainId);
  const providerReady = useWalletStore((s) => s.wallet.providerReady);

  // Track whether the initial data fetch is still in progress
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  // Track critical load failure for inline error display
  const [loadError, setLoadError] = useState<string | null>(null);

  // ---- Data fetching -------------------------------------------------------

  // Use refs to avoid dependency cycles in fetchData.
  const wrappedAssetsRef = useRef(wrappedAssets);
  useEffect(() => {
    wrappedAssetsRef.current = wrappedAssets;
  }, [wrappedAssets]);

  const tradeHistoryRef = useRef(tradeHistory);
  useEffect(() => {
    tradeHistoryRef.current = tradeHistory;
  }, [tradeHistory]);

  const fetchData = useCallback(async () => {
    setLoadError(null);

    if (!isConnected || !address || !chainId || isSwitchingNetwork) {
      setIsInitialLoading(false);
      return;
    }

    // Wallet may report connected before BrowserProvider/signer are hydrated.
    // Keep skeleton state until provider is actually ready.
    if (!providerReady) {
      return;
    }

    const provider = getProvider();
    if (!provider) {
      logger.debug('Dashboard data fetch deferred: provider not yet available');
      return;
    }

    let service: ContractService;
    try {
      service = new ContractService(provider, chainId);
    } catch (error) {
      showError(error, 'Unable to initialize contracts on this network');
      setIsInitialLoading(false);
      setLoadError('Unable to initialize contracts. Please check your network and try again.');
      return;
    }

    // Fetch assets — gather addresses from three sources:
    //   1. Assets the user created (factory.getUserAssets)
    //   2. ALL platform assets (factory.getAssetAtIndex) so we catch assets
    //      the user holds but didn't create (received via transfer/exchange)
    //   3. Previously known addresses still in the store (continuity)
    const gen = nextAssetFetchGeneration();
    setLoadingAssets(true);
    try {
      const totalAssetCount = await retryAsync(
        () => service.getTotalAssets(),
        {
          maxAttempts: 3,
          baseDelayMs: 800,
          label: 'dashboard:getTotalAssets',
          isRetryable: isRetryableRpcError,
        },
      );
      if (gen !== getAssetFetchGeneration()) return; // stale fetch, discard
      if (totalAssetCount === 0n) {
        setAssets([]);
      } else {
        // Source 1: assets the connected wallet created
        let userAssetAddresses: string[] = [];
        try {
          userAssetAddresses = await retryAsync(
            () => service.getUserAssets(address),
            {
              maxAttempts: 3,
              baseDelayMs: 800,
              label: 'dashboard:getUserAssets',
              isRetryable: isRetryableRpcError,
            },
          );
        } catch (error) {
          logger.warn('Unable to fetch user-created asset list:', error);
        }
        if (gen !== getAssetFetchGeneration()) return;

        // Source 2: all platform assets (iterate factory index)
        // Fetch in small sequential batches to avoid RPC rate limiting.
        let allPlatformAddresses: string[] = [];
        try {
          const count = Number(totalAssetCount);
          const maxScan = Math.min(count, 100);
          const BATCH_SIZE = 5;
          for (let start = 0; start < maxScan; start += BATCH_SIZE) {
            if (gen !== getAssetFetchGeneration()) return;
            const end = Math.min(start + BATCH_SIZE, maxScan);
            const batch = [];
            for (let i = start; i < end; i++) {
              batch.push(service.getAssetAtIndex(i).catch(() => null));
            }
            const results = await Promise.all(batch);
            for (const r of results) {
              if (r) allPlatformAddresses.push(r);
            }
          }
        } catch (error) {
          logger.warn('Unable to enumerate platform assets:', error);
        }
        if (gen !== getAssetFetchGeneration()) return;

        // Merge all address sources and deduplicate
        const knownAddresses = new Set<string>([
          ...userAssetAddresses,
          ...allPlatformAddresses,
          ...wrappedAssetsRef.current.map((a) => a.address),
        ]);

        // Fetch details + user balance for each asset in parallel
        const assetList: import('../types').WrappedAsset[] = [];
        await Promise.all(
          Array.from(knownAddresses).map(async (addr) => {
            try {
              const [details, balance] = await Promise.all([
                service.getAssetDetails(addr),
                service.getAssetBalance(addr, address),
              ]);
              assetList.push({
                address: addr,
                name: details.name,
                symbol: details.symbol,
                totalSupply: details.totalSupply.toString(),
                balance: balance.toString(),
                documentHash: details.documentHash,
                documentType: details.documentType,
                originalValue: details.originalValue.toString(),
              });
            } catch (error) {
              logger.warn(`Skipping asset ${addr}:`, error);
            }
          }),
        );
        if (gen !== getAssetFetchGeneration()) return; // stale fetch, discard
        setAssets(assetList);
      }
    } catch (error) {
      const classified = classifyError(error);
      if (classified.category === 'network') {
        logger.warn('Dashboard asset load degraded by network/RPC issue', error);
        if (wrappedAssetsRef.current.length === 0) {
          setAssets([]);
        }
      } else {
        showError(error, 'Unable to load assets from blockchain RPC');
        if (wrappedAssetsRef.current.length === 0) {
          setLoadError(
            'Unable to load your assets from the current network. Please retry, then verify your wallet network and RPC connectivity.',
          );
        }
      }
    } finally {
      setLoadingAssets(false);
    }

    // Fetch user orders from AssetBackedExchange (maker + taker)
    try {
      const [makerIds, takerIds] = await Promise.all([
        service.getExchangeUserOrders(address),
        service.getExchangeFilledOrderIds(address),
      ]);

      // Merge and deduplicate order IDs
      const seen = new Set<string>();
      const allIds: bigint[] = [];
      for (const id of [...makerIds, ...takerIds]) {
        const key = id.toString();
        if (!seen.has(key)) {
          seen.add(key);
          allIds.push(id);
        }
      }

      if (allIds.length > 0) {
        const orderDetails = await Promise.all(
          allIds.map((id) => service.getExchangeOrder(id).catch(() => null)),
        );
        const exchangeOrders: import('../types').ExchangeOrder[] = orderDetails
          .filter((o): o is NonNullable<typeof o> => o !== null)
          .map((o) => ({
            id: o.id.toString(),
            maker: o.maker,
            tokenSell: o.tokenSell,
            tokenBuy: o.tokenBuy,
            amountSell: o.amountSell.toString(),
            amountBuy: o.amountBuy.toString(),
            filledSell: o.filledSell.toString(),
            filledBuy: o.filledBuy.toString(),
            cancelled: o.cancelled,
          }));
        setUserOrders(exchangeOrders);
      } else {
        setUserOrders([]);
      }
    } catch (error) {
      // Non-critical: exchange data is supplementary on the dashboard
      logger.warn('Unable to load exchange orders:', error);
    }

    // Fetch trade history from on-chain events
    // We query three event sources:
    //   1. AssetCreated events from the factory (mint history)
    //   2. OrderFilled events where user is the taker
    //   3. OrderFilled events for orders the user created (maker fills)
    try {
      const trades: import('../types').TradeHistory[] = [];
      const seenTx = new Set<string>();
      const addr = address.toLowerCase();

      // 1. Mint history — query AssetCreated events from the factory
      try {
        const factory = service.getFactoryContract();
        const mintFilter = factory.filters.AssetCreated(address);
        const mintEvents = await factory.queryFilter(mintFilter);

        for (const evt of mintEvents) {
          const log = evt as ethers.EventLog;
          const txKey = `mint-${log.transactionHash}-${log.index}`;
          if (seenTx.has(txKey)) continue;
          seenTx.add(txKey);

          const assetAddr = log.args[1] as string;
          // Try to resolve asset name from already-loaded assets
          const knownAsset = wrappedAssetsRef.current.find(
            (a) => a.address.toLowerCase() === assetAddr.toLowerCase(),
          );

          let timestampMs = Date.now();
          try {
            const block = await log.getBlock();
            if (block) timestampMs = block.timestamp * 1000;
          } catch { /* use current time as fallback */ }

          trades.push({
            id: txKey,
            type: 'mint',
            asset: knownAsset?.name ?? assetAddr.slice(0, 10),
            assetSymbol: knownAsset?.symbol ?? 'TOKEN',
            amount: knownAsset?.totalSupply
              ? ethers.formatUnits(knownAsset.totalSupply, 18)
              : '0',
            txHash: log.transactionHash,
            timestamp: timestampMs,
            from: ethers.ZeroAddress,
            to: address,
            status: 'confirmed',
          });
        }
      } catch (error) {
        logger.warn('Unable to load mint history:', error);
      }

      // 2 & 3. Exchange trade history (fills as taker and maker)
      try {
        const exchange = service.getAssetBackedExchangeContract();

        const takerFilter = exchange.filters.OrderFilled(null, address);
        const takerFillEvents = await exchange.queryFilter(takerFilter);

        const makerFilter = exchange.filters.OrderCreated(null, address);
        const makerEvents = await exchange.queryFilter(makerFilter);
        const makerOrderIds = new Set(
          makerEvents.map((e) => ((e as ethers.EventLog).args[0] as bigint).toString()),
        );

        const allFillEvents = makerOrderIds.size > 0
          ? await exchange.queryFilter(exchange.filters.OrderFilled())
          : [];
        const makerFillEvents = allFillEvents.filter((e) =>
          makerOrderIds.has(((e as ethers.EventLog).args[0] as bigint).toString()),
        );

        for (const evt of [...takerFillEvents, ...makerFillEvents]) {
          const log = evt as ethers.EventLog;
          const txKey = `${log.transactionHash}-${log.index}`;
          if (seenTx.has(txKey)) continue;
          seenTx.add(txKey);

          const orderId = log.args[0] as bigint;
          const taker = (log.args[1] as string).toLowerCase();
          const fillSell = log.args[2] as bigint;
          const fillBuy = log.args[3] as bigint;
          const isTaker = taker === addr;

          let timestampMs = Date.now();
          try {
            const block = await log.getBlock();
            if (block) timestampMs = block.timestamp * 1000;
          } catch { /* use current time as fallback */ }

          trades.push({
            id: `fill-${txKey}`,
            type: 'exchange',
            asset: `Order #${orderId.toString()}`,
            assetSymbol: isTaker ? 'FILL' : 'SOLD',
            amount: ethers.formatUnits(isTaker ? fillBuy : fillSell, 18),
            txHash: log.transactionHash,
            timestamp: timestampMs,
            from: isTaker ? taker : addr,
            to: isTaker ? addr : taker,
            status: 'confirmed',
          });
        }
      } catch (error) {
        logger.warn('Unable to load exchange trade history:', error);
      }

      // Merge with existing in-memory trade history
      const existing = tradeHistoryRef.current;
      const existingIds = new Set(existing.map((t) => t.id));
      const merged = [...existing];
      for (const t of trades) {
        if (!existingIds.has(t.id)) merged.push(t);
      }
      merged.sort((a, b) => b.timestamp - a.timestamp);
      setTrades(merged);
    } catch (error) {
      logger.warn('Unable to load trade history:', error);
    }

    setIsInitialLoading(false);
  }, [
    isConnected,
    address,
    chainId,
    providerReady,
    isSwitchingNetwork,
    setAssets,
    setLoadingAssets,
    setUserOrders,
    setTrades,
  ]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // In demo mode, re-trigger data fetch once the demo wallet is ready.
  // The initial fetchData call may have short-circuited because the demo
  // wallet hadn't finished async setup yet.
  useEffect(() => {
    if (isDemoActive && demoWalletReady && isConnected && providerReady) {
      void fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoActive, demoWalletReady]);

  // ---- Demo mode: wallet still initialising --------------------------------

  if (isDemoActive && !isConnected) {
    // Demo wallet is setting up asynchronously; show skeleton instead of the
    // "not connected" hero page so users don't get confused.
    if (demoWalletSettingUp || (!demoWalletReady && !demoWalletError)) {
      return <DashboardSkeleton />;
    }
    // Demo wallet setup failed -- show an actionable error.
    if (demoWalletError) {
      return (
        <div className="w-full pt-12">
          <ErrorState
            message={`Demo wallet could not be activated: ${demoWalletError}`}
            onRetry={() => window.location.reload()}
          />
        </div>
      );
    }
  }

  // ---- Not connected state -------------------------------------------------

  if (!isConnected) {
    return (
      <div className="relative min-h-[calc(100vh-5rem)] overflow-hidden">
        {/* ---- Animated gradient mesh background ---- */}
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute -left-1/4 -top-1/4 h-[60vh] w-[60vh] rounded-full opacity-30 blur-[120px]"
            style={{
              background: 'radial-gradient(circle, #3B82F6, transparent 70%)',
              animation: 'drift-1 20s ease-in-out infinite',
            }}
          />
          <div
            className="absolute -right-1/4 top-1/4 h-[50vh] w-[50vh] rounded-full opacity-20 blur-[120px]"
            style={{
              background: 'radial-gradient(circle, #8B5CF6, transparent 70%)',
              animation: 'drift-2 25s ease-in-out infinite',
            }}
          />
          <div
            className="absolute bottom-0 left-1/3 h-[40vh] w-[40vh] rounded-full opacity-20 blur-[120px]"
            style={{
              background: 'radial-gradient(circle, #06B6D4, transparent 70%)',
              animation: 'drift-3 22s ease-in-out infinite',
            }}
          />

          {/* Animated grid pattern overlay */}
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
              backgroundSize: '60px 60px',
              animation: 'grid-shift 30s linear infinite',
            }}
          />

          {/* Radial vignette */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse at 50% 50%, transparent 0%, #0D0F14 80%)',
            }}
          />
        </div>

        {/* ---- Hero content ---- */}
        <div className="relative z-10 flex flex-col items-center px-4 py-16 text-center sm:px-8 md:px-12 md:py-24 lg:py-28">
          <FuekiBrand
            variant="full"
            className="justify-center mb-4"
            imageClassName="h-20 w-auto drop-shadow-[0_20px_44px_rgba(8,24,38,0.45)]"
          />

          <p className="mb-4 text-sm font-medium uppercase tracking-[0.25em] text-gray-500">
            Institutional-Grade Asset Tokenization
          </p>

          <p className="mx-auto max-w-xl text-lg leading-relaxed text-gray-400">
            Wall Street Infrastructure. Main Street Access.
          </p>

          {/* Getting Started Guide */}
          <div className="mx-auto mt-12 w-full max-w-2xl">
            <h2 className="mb-8 text-2xl font-bold text-white sm:text-3xl">
              Getting Started
            </h2>

            <div className="space-y-4 text-left">
              <StepCard step={1} icon={Wallet} title="Download a Crypto Wallet" accentColor="#3B82F6">
                <p>
                  To use the platform you need an external crypto wallet. If you don't
                  already have one, download any of the following:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li><strong className="text-gray-300">MetaMask</strong> &mdash; available as a browser extension and mobile app</li>
                  <li><strong className="text-gray-300">Trust Wallet</strong> &mdash; mobile-first wallet with broad token support</li>
                  <li><strong className="text-gray-300">Phantom</strong> &mdash; multi-chain wallet for browser and mobile</li>
                </ul>
              </StepCard>

              <StepCard step={2} icon={Coins} title="Connect Your Wallet" accentColor="#8B5CF6">
                <p>
                  Once your wallet is set up, click the{' '}
                  <strong className="text-gray-300">"Connect Wallet"</strong> button in
                  the upper-right corner of the screen and approve the connection in
                  your wallet.
                </p>
              </StepCard>

              <StepCard step={3} icon={ShieldCheck} title="Mint Your Tokens" accentColor="#06B6D4">
                <p>
                  With your wallet connected you can begin creating assets:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>
                    <strong className="text-gray-300">Fungible Tokens</strong> &mdash;
                    go to the Mint page to create standard fungible tokens.
                  </li>
                  <li>
                    <strong className="text-gray-300">Security Tokens</strong> &mdash;
                    navigate to Security Tokens to mint and configure ERC-1404F
                    compliant security tokens with built-in transfer restrictions.
                  </li>
                </ul>
              </StepCard>

              <StepCard step={4} icon={ArrowRightLeft} title="Trade & Monetize" accentColor="#F59E0B">
                <p>
                  Once your tokens are minted, you can monetize them through:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>
                    <strong className="text-gray-300">Exchange</strong> &mdash;
                    list and fill peer-to-peer orders with other verified investors.
                  </li>
                  <li>
                    <strong className="text-gray-300">Orbital AMM</strong> &mdash;
                    provide liquidity or swap tokens using the automated market maker.
                  </li>
                </ul>
              </StepCard>
            </div>
          </div>
        </div>

        <style>{`
          @keyframes drift-1 {
            0%, 100% { transform: translate(0, 0) scale(1); }
            33% { transform: translate(5%, 10%) scale(1.05); }
            66% { transform: translate(-3%, -5%) scale(0.95); }
          }
          @keyframes drift-2 {
            0%, 100% { transform: translate(0, 0) scale(1); }
            33% { transform: translate(-8%, 5%) scale(1.1); }
            66% { transform: translate(4%, -8%) scale(0.9); }
          }
          @keyframes drift-3 {
            0%, 100% { transform: translate(0, 0) scale(1); }
            33% { transform: translate(6%, -4%) scale(0.95); }
            66% { transform: translate(-5%, 6%) scale(1.08); }
          }
          @keyframes grid-shift {
            0% { transform: translate(0, 0); }
            100% { transform: translate(60px, 60px); }
          }
        `}</style>
      </div>
    );
  }

  // ---- Loading state (connected but data not yet loaded) --------------------

  if (isInitialLoading) {
    return <DashboardSkeleton />;
  }

  // ---- Error state (data failed to load) -----------------------------------

  if (loadError && wrappedAssets.length === 0) {
    return (
      <div className="w-full pt-12">
        <ErrorState
          message={loadError}
          onRetry={() => void fetchData()}
        />
      </div>
    );
  }

  // ---- Connected state -----------------------------------------------------

  const networkName = getNetworkName(chainId);

  // Build a greeting based on the time of day
  const getGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const displayName = user?.firstName || (address ? formatAddress(address) : 'there');

  return (
    <div className="w-full">
      {/* ================================================================== */}
      {/* Page Header -- Vercel / Linear style: title left, wallet right    */}
      {/* ================================================================== */}
      <div className="mb-8 sm:mb-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          {/* Left: title + subtitle */}
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {getGreeting()}, {displayName}
            </h1>
            <p className="mt-3 text-base leading-relaxed text-gray-400">
              Overview of your tokenized assets and platform activity.
            </p>
          </div>

          {/* Right: wallet info cluster */}
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            {/* Wallet address pill */}
            {address && (
              <button
                onClick={() => void copyToClipboard(address)}
                className={clsx(
                  'group flex items-center gap-2.5 rounded-xl border border-white/[0.06] px-4 py-2.5',
                  'bg-white/[0.03] transition-all duration-200',
                  'hover:border-white/[0.12] hover:bg-white/[0.05]',
                )}
                title="Copy wallet address"
              >
                <span className="text-sm font-medium tabular-nums text-gray-300">
                  {formatAddress(address)}
                </span>
                <Copy className="h-3.5 w-3.5 text-gray-500 transition-colors group-hover:text-gray-300" />
              </button>
            )}

            {/* Network badge */}
            <div
              className={clsx(
                'flex items-center gap-2.5 rounded-xl border border-white/[0.06] px-4 py-2.5',
                'bg-white/[0.03]',
              )}
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping motion-reduce:animate-none rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span className="text-sm font-medium text-gray-300">
                {networkName}
              </span>
            </div>

            {/* Chain ID pill */}
            {chainId && (
              <div
                className={clsx(
                  'flex items-center gap-2 rounded-xl border border-white/[0.06] px-4 py-2.5',
                  'bg-white/[0.03]',
                )}
              >
                <Globe className="h-3.5 w-3.5 text-gray-500" />
                <span className="text-sm font-medium text-gray-400">
                  Chain {chainId}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Separator line */}
        <div className="mt-8 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      </div>

      {/* ================================================================== */}
      {/* Stats Row -- 4 metric cards (4 col desktop, 2 tablet, 1 mobile)  */}
      {/* ================================================================== */}
      <ComponentErrorBoundary name="StatsGrid">
        <StatsGrid
          wrappedAssets={wrappedAssets}
          userOrders={userOrders}
          tradeHistory={tradeHistory}
        />
      </ComponentErrorBoundary>

      {/* ================================================================== */}
      {/* Charts Row -- two columns side by side                            */}
      {/* ================================================================== */}
      <div className="mt-8 grid grid-cols-1 gap-6 sm:mt-10 sm:gap-8 lg:grid-cols-2">
        <ComponentErrorBoundary name="PortfolioChart">
          <PortfolioChart assets={wrappedAssets} />
        </ComponentErrorBoundary>
        <ComponentErrorBoundary name="ValueChart">
          <ValueChart tradeHistory={tradeHistory} />
        </ComponentErrorBoundary>
      </div>

      {/* ================================================================== */}
      {/* Activity feed -- full width below charts                          */}
      {/* ================================================================== */}
      <div className="mt-8 sm:mt-10">
        <ComponentErrorBoundary name="ActivityFeed">
          <RecentActivity trades={tradeHistory} chainId={chainId} />
        </ComponentErrorBoundary>
      </div>

      {/* ================================================================== */}
      {/* Quick Actions -- full width at bottom                             */}
      {/* ================================================================== */}
      <div className="mt-8 sm:mt-10">
        <QuickActions />
      </div>
    </div>
  );
}
