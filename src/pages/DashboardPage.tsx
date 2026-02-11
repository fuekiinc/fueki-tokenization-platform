import { useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  TrendingUp,
  BarChart3,
  Activity,
  ArrowUpRight,
  Package,
  DollarSign,
  Repeat,
  FileText,
  Shield,
  ArrowRight,
  ChevronUp,
  ChevronDown,
  Copy,
  Zap,
  Globe,
  Layers,
} from 'lucide-react';
import { useAppStore, getProvider } from '../store/useAppStore';
import { useWallet } from '../hooks/useWallet';
import { ContractService } from '../lib/blockchain/contracts';
import { formatCurrency, formatAddress, copyToClipboard } from '../lib/utils/helpers';
import { SUPPORTED_NETWORKS } from '../contracts/addresses';
import PortfolioChart from '../components/Dashboard/PortfolioChart';
import ActivityFeed from '../components/Dashboard/ActivityFeed';
import ValueChart from '../components/Dashboard/ValueChart';

// ---------------------------------------------------------------------------
// Shared glass morphism style tokens
// ---------------------------------------------------------------------------

const GLASS =
  'bg-[#0D0F14]/80 backdrop-blur-xl border border-white/[0.06] rounded-2xl';

const GLASS_HOVER =
  'hover:border-white/[0.12] hover:shadow-lg hover:shadow-black/20 transition-all duration-300';

// ---------------------------------------------------------------------------
// StatCard -- generous padding, icon in rounded-xl container, no clipping
// ---------------------------------------------------------------------------

function StatCard({
  title,
  value,
  icon: Icon,
  change,
  gradientFrom,
  gradientTo,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  change?: number;
  gradientFrom: string;
  gradientTo: string;
}) {
  const isPositive = change !== undefined && change >= 0;

  return (
    <div
      className={clsx(
        GLASS,
        'group relative overflow-hidden p-7 sm:p-9',
        'hover:border-white/[0.12] hover:shadow-lg hover:shadow-black/20',
        'transition-all duration-300',
      )}
    >
      {/* Subtle gradient glow on hover */}
      <div
        className={clsx(
          'absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-0',
          'transition-opacity duration-500 group-hover:opacity-100 blur-3xl',
        )}
        style={{
          background: `radial-gradient(circle, ${gradientFrom}18, transparent 70%)`,
        }}
      />

      <div className="relative flex items-start justify-between gap-4">
        {/* Left: label + value */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium tracking-wide text-gray-400">
            {title}
          </p>
          <p className="mt-3 truncate text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {value}
          </p>
          {change !== undefined && !Number.isNaN(change) && (
            <div className="mt-3 flex items-center gap-1.5">
              <div
                className={clsx(
                  'flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold',
                  isPositive
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-red-500/10 text-red-400',
                )}
              >
                {isPositive ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                {Math.abs(change).toFixed(2)}%
              </div>
              {/* Mini trend sparkline */}
              <div className="ml-2 flex items-end gap-px">
                {[0.4, 0.7, 0.5, 0.8, 0.6, 0.9, 1].map((h, i) => (
                  <div
                    key={i}
                    className={clsx(
                      'w-1 rounded-full transition-all',
                      isPositive ? 'bg-emerald-500/40' : 'bg-red-500/40',
                    )}
                    style={{ height: `${h * 20}px` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: icon in gradient container */}
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: `linear-gradient(135deg, ${gradientFrom}22, ${gradientTo}22)`,
          }}
        >
          <Icon className="h-6 w-6" style={{ color: gradientFrom }} />
        </div>
      </div>
    </div>
  );
}

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
// Quick action card for connected state
// ---------------------------------------------------------------------------

function QuickAction({
  icon: Icon,
  title,
  description,
  gradientFrom,
  gradientTo,
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  gradientFrom: string;
  gradientTo: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        GLASS,
        'group relative flex w-full items-center gap-5 overflow-hidden p-5 text-left sm:p-7',
        'hover:border-white/[0.12] hover:shadow-lg hover:shadow-black/20',
        'hover:-translate-y-0.5',
        'transition-all duration-300',
      )}
    >
      {/* Hover glow */}
      <div
        className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: `radial-gradient(ellipse at 0% 50%, ${gradientFrom}08, transparent 70%)`,
        }}
      />

      <div
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
        style={{
          background: `linear-gradient(135deg, ${gradientFrom}20, ${gradientTo}20)`,
        }}
      >
        <Icon className="h-5 w-5" style={{ color: gradientFrom }} />
      </div>

      <div className="relative min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-1 text-xs text-gray-500">{description}</p>
      </div>

      <ArrowRight
        className={clsx(
          'relative h-4 w-4 shrink-0 text-gray-600',
          'transition-all duration-300',
          'group-hover:translate-x-0.5 group-hover:text-gray-300',
        )}
      />
    </button>
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
  const navigate = useNavigate();
  const { isConnected, address } = useWallet();
  const wrappedAssets = useAppStore((s) => s.wrappedAssets);
  const tradeHistory = useAppStore((s) => s.tradeHistory);
  const userOrders = useAppStore((s) => s.userOrders);
  const setAssets = useAppStore((s) => s.setAssets);
  const setUserOrders = useAppStore((s) => s.setUserOrders);
  const setLoadingAssets = useAppStore((s) => s.setLoadingAssets);
  const chainId = useAppStore((s) => s.wallet.chainId);

  // ---- Data fetching -------------------------------------------------------

  // Use a ref for wrappedAssets to avoid dependency cycles in fetchData.
  const wrappedAssetsRef = useRef(wrappedAssets);
  useEffect(() => {
    wrappedAssetsRef.current = wrappedAssets;
  }, [wrappedAssets]);

  const fetchData = useCallback(async () => {
    if (!isConnected || !address || !chainId) return;

    const provider = getProvider();
    if (!provider) return;

    let service: ContractService;
    try {
      service = new ContractService(provider, chainId);
    } catch {
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
        } catch {
          // proceed with whatever we already know
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
            } catch {
              // skip assets that fail to load
            }
          }),
        );
        setAssets(assetList);
      }
    } catch {
      // silently fail -- dashboard still renders with empty data
    } finally {
      setLoadingAssets(false);
    }

    // Fetch user orders -- getUserOrders returns order IDs (bigint[]),
    // so we must fetch each order's details and map to ExchangeOrder.
    try {
      const orderIds = await service.getUserOrders(address);
      if (orderIds.length > 0) {
        const orderDetails = await Promise.all(
          orderIds.map((id) => service.getOrder(id).catch(() => null)),
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
    } catch {
      // non-critical
    }
  }, [isConnected, address, chainId, setAssets, setLoadingAssets, setUserOrders]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // ---- Derived stats -------------------------------------------------------

  const totalAssets = wrappedAssets.length;

  const totalValueLocked = useMemo(() => {
    return wrappedAssets.reduce((sum, asset) => {
      const v = parseFloat(asset.originalValue || '0');
      return sum + (Number.isNaN(v) ? 0 : v);
    }, 0);
  }, [wrappedAssets]);

  const activeOrders = useMemo(() => {
    return userOrders.filter((o) => !o.cancelled).length;
  }, [userOrders]);

  const totalTrades = tradeHistory.length;

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
      <div className="grid grid-cols-1 gap-6 pl-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-12 overflow-hidden">
        <StatCard
          title="Total Assets"
          value={String(totalAssets)}
          icon={Package}
          gradientFrom="#3B82F6"
          gradientTo="#6366F1"
        />
        <StatCard
          title="Total Value Locked"
          value={formatCurrency(totalValueLocked)}
          icon={DollarSign}
          gradientFrom="#10B981"
          gradientTo="#06B6D4"
        />
        <StatCard
          title="Active Orders"
          value={String(activeOrders)}
          icon={BarChart3}
          gradientFrom="#8B5CF6"
          gradientTo="#A855F7"
        />
        <StatCard
          title="Total Trades"
          value={String(totalTrades)}
          icon={Activity}
          gradientFrom="#F59E0B"
          gradientTo="#EF4444"
        />
      </div>

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
          <ActivityFeed trades={tradeHistory} />
        </div>

        {/* Quick actions sidebar */}
        <div className={clsx(GLASS, 'p-7 sm:p-9')}>
          <div className="mb-10 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
              <Zap className="h-5 w-5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold tracking-tight text-gray-100">
                Quick Actions
              </h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Common operations
              </p>
            </div>
          </div>

          <div className="space-y-5">
            <QuickAction
              icon={ArrowUpRight}
              title="Upload & Mint"
              description="Tokenize a new document"
              gradientFrom="#3B82F6"
              gradientTo="#6366F1"
              onClick={() => navigate('/mint')}
            />
            <QuickAction
              icon={TrendingUp}
              title="View Portfolio"
              description="Manage your wrapped assets"
              gradientFrom="#8B5CF6"
              gradientTo="#A855F7"
              onClick={() => navigate('/portfolio')}
            />
            <QuickAction
              icon={Repeat}
              title="Exchange"
              description="Trade wrapped assets"
              gradientFrom="#10B981"
              gradientTo="#06B6D4"
              onClick={() => navigate('/exchange')}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
