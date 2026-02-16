import { useEffect, useRef, useCallback, useState } from 'react';
import clsx from 'clsx';
import {
  FileText,
  Repeat,
  Shield,
  Copy,
  Globe,
  Layers,
} from 'lucide-react';
import { ethers } from 'ethers';
import { showError } from '../lib/errorUtils';
import { useWalletStore, getProvider } from '../store/walletStore.ts';
import { useAssetStore } from '../store/assetStore.ts';
import { useTradeStore } from '../store/tradeStore.ts';
import { useExchangeStore } from '../store/exchangeStore.ts';
import { useWallet } from '../hooks/useWallet';
import { ContractService } from '../lib/blockchain/contracts';
import { formatAddress, copyToClipboard } from '../lib/utils/helpers';
import { SUPPORTED_NETWORKS } from '../contracts/addresses';

// Dashboard sub-components
import AssetGrid from '../components/Dashboard/AssetGrid';
import RecentActivity from '../components/Dashboard/RecentActivity';
import QuickActions from '../components/Dashboard/QuickActions';
import PortfolioChart from '../components/Dashboard/PortfolioChart';
import ValueChart from '../components/Dashboard/ValueChart';
import DashboardSkeleton from '../components/Dashboard/DashboardSkeleton';

// ---------------------------------------------------------------------------
// Shared glass morphism style tokens
// ---------------------------------------------------------------------------

const GLASS =
  'bg-[#0D0F14]/80 backdrop-blur-xl border border-white/[0.06] rounded-2xl';

const GLASS_HOVER =
  'hover:border-white/[0.12] hover:shadow-lg hover:shadow-black/20 transition-all duration-300';

// ---------------------------------------------------------------------------
// Feature card for the not-connected hero
// ---------------------------------------------------------------------------

function FeatureCard({
  icon: Icon,
  title,
  description,
  gradientFrom,
  gradientTo,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  return (
    <div
      className={clsx(
        GLASS,
        GLASS_HOVER,
        'group relative overflow-hidden p-10 text-center',
      )}
    >
      {/* Background glow */}
      <div
        className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: `radial-gradient(ellipse at 50% 0%, ${gradientFrom}08, transparent 70%)`,
        }}
      />

      <div className="relative">
        <div
          className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{
            background: `linear-gradient(135deg, ${gradientFrom}20, ${gradientTo}20)`,
          }}
        >
          <Icon className="h-7 w-7" style={{ color: gradientFrom }} />
        </div>
        <h3 className="mb-3 text-lg font-semibold text-white">{title}</h3>
        <p className="text-sm leading-relaxed text-gray-400">{description}</p>
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
  const { isConnected, address } = useWallet();
  const wrappedAssets = useAssetStore((s) => s.wrappedAssets);
  const tradeHistory = useTradeStore((s) => s.tradeHistory);
  const userOrders = useExchangeStore((s) => s.userOrders);
  const setAssets = useAssetStore((s) => s.setAssets);
  const setUserOrders = useExchangeStore((s) => s.setUserOrders);
  const setTrades = useTradeStore((s) => s.setTrades);
  const setLoadingAssets = useAssetStore((s) => s.setLoadingAssets);
  const chainId = useWalletStore((s) => s.wallet.chainId);

  // Track whether the initial data fetch is still in progress
  const [isInitialLoading, setIsInitialLoading] = useState(true);

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
    if (!isConnected || !address || !chainId) {
      setIsInitialLoading(false);
      return;
    }

    const provider = getProvider();
    if (!provider) {
      setIsInitialLoading(false);
      return;
    }

    let service: ContractService;
    try {
      service = new ContractService(provider, chainId);
    } catch (error) {
      showError(error, 'Failed to initialize contracts');
      setIsInitialLoading(false);
      return;
    }

    // Fetch assets
    setLoadingAssets(true);
    try {
      const totalAssetCount = await service.getTotalAssets();
      if (totalAssetCount === 0n) {
        setAssets([]);
      } else {
        let userAssetAddresses: string[] = [];
        try {
          userAssetAddresses = await service.getUserAssets(address);
        } catch (error) {
          showError(error, 'Failed to fetch your assets');
        }

        const knownAddresses = new Set<string>([
          ...userAssetAddresses,
          ...wrappedAssetsRef.current.map((a) => a.address),
        ]);

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
              console.warn(`Skipping asset ${addr}:`, error);
            }
          }),
        );
        setAssets(assetList);
      }
    } catch (error) {
      showError(error, 'Failed to load assets');
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
      showError(error, 'Failed to load orders');
    }

    // Fetch trade history from on-chain events (user-scoped filters)
    try {
      const exchange = service.getAssetBackedExchangeContract();
      const addr = address.toLowerCase();

      // Get OrderFilled events where user is the taker
      const takerFilter = exchange.filters.OrderFilled(null, address);
      const takerFillEvents = await exchange.queryFilter(takerFilter);

      // Get OrderCreated events where user is the maker (to detect their filled orders)
      const makerFilter = exchange.filters.OrderCreated(null, address);
      const makerEvents = await exchange.queryFilter(makerFilter);
      const makerOrderIds = new Set(
        makerEvents.map((e) => ((e as ethers.EventLog).args[0] as bigint).toString()),
      );

      // Get OrderFilled events for the user's maker orders
      const allFillEvents = makerOrderIds.size > 0
        ? await exchange.queryFilter(exchange.filters.OrderFilled())
        : [];
      const makerFillEvents = allFillEvents.filter((e) =>
        makerOrderIds.has(((e as ethers.EventLog).args[0] as bigint).toString()),
      );

      // Deduplicate and build trades
      const trades: import('../types').TradeHistory[] = [];
      const seenTx = new Set<string>();

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

        const block = await log.getBlock();
        // Use milliseconds to match Date.now() convention in the rest of the app
        const timestampMs = block ? block.timestamp * 1000 : Date.now();
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

      // Merge with existing trade history (mints, burns, etc.) via ref to avoid dep cycle
      const existing = tradeHistoryRef.current;
      const existingIds = new Set(existing.map((t) => t.id));
      const merged = [...existing];
      for (const t of trades) {
        if (!existingIds.has(t.id)) merged.push(t);
      }
      merged.sort((a, b) => b.timestamp - a.timestamp);
      setTrades(merged);
    } catch (error) {
      showError(error, 'Failed to load trade history');
    }

    setIsInitialLoading(false);
  }, [isConnected, address, chainId, setAssets, setLoadingAssets, setUserOrders, setTrades]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

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
        <div className="relative z-10 flex flex-col items-center justify-center px-8 py-28 text-center sm:px-12 lg:py-36">
          <div className="mb-4 flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600">
              <Layers className="h-5 w-5 text-white" />
            </div>
            <span className="text-2xl font-bold tracking-tight text-white">
              Fueki
            </span>
          </div>

          <p className="mb-12 text-sm font-medium uppercase tracking-[0.25em] text-gray-500">
            Institutional-Grade Asset Tokenization
          </p>

          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight text-white sm:text-5xl lg:text-6xl">
            Tokenize, Trade &{' '}
            <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
              Verify
            </span>{' '}
            Real-World Assets
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-gray-400">
            Transform documents into ERC-20 tokens. Trade peer-to-peer on a
            decentralized exchange. Every action is transparent and on-chain.
          </p>

          <div className="mx-auto mt-24 grid w-full max-w-4xl grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-10">
            <FeatureCard
              icon={FileText}
              title="Tokenize Assets"
              description="Upload financial documents, parse their content, and mint backed ERC-20 tokens in one seamless flow."
              gradientFrom="#3B82F6"
              gradientTo="#6366F1"
            />
            <FeatureCard
              icon={Repeat}
              title="Trade P2P"
              description="List and fill orders on a fully decentralized exchange. No intermediaries, no custody risk."
              gradientFrom="#8B5CF6"
              gradientTo="#A855F7"
            />
            <FeatureCard
              icon={Shield}
              title="Full Transparency"
              description="Every mint, burn, and transfer is recorded on-chain with verifiable document hashes."
              gradientFrom="#06B6D4"
              gradientTo="#14B8A6"
            />
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

  // ---- Connected state -----------------------------------------------------

  const networkName = getNetworkName(chainId);

  return (
    <div className="w-full">
      {/* ================================================================== */}
      {/* Page Header -- Vercel / Linear style: title left, wallet right    */}
      {/* ================================================================== */}
      <div className="mb-12 sm:mb-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          {/* Left: title + subtitle */}
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Dashboard
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
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
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
        <div className="mt-10 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      </div>

      {/* ================================================================== */}
      {/* Stats Row -- 4 cards in a spacious grid                           */}
      {/* ================================================================== */}
      <AssetGrid
        wrappedAssets={wrappedAssets}
        userOrders={userOrders}
        tradeHistory={tradeHistory}
      />

      {/* ================================================================== */}
      {/* Charts Row -- two columns with generous spacing                   */}
      {/* ================================================================== */}
      <div className="mt-12 grid grid-cols-1 gap-8 sm:mt-16 sm:gap-10 lg:grid-cols-2">
        <PortfolioChart assets={wrappedAssets} />
        <ValueChart tradeHistory={tradeHistory} />
      </div>

      {/* ================================================================== */}
      {/* Activity + Quick Actions                                          */}
      {/* ================================================================== */}
      <div className="mt-12 grid grid-cols-1 gap-8 sm:mt-16 sm:gap-10 lg:grid-cols-3">
        {/* Activity feed -- takes 2/3 width on large screens */}
        <div className="lg:col-span-2">
          <RecentActivity trades={tradeHistory} />
        </div>

        {/* Quick actions sidebar */}
        <QuickActions />
      </div>
    </div>
  );
}
