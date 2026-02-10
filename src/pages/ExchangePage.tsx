/**
 * ExchangePage -- main exchange / trading page for the tokenization platform.
 *
 * Three-column responsive layout:
 *   Left   -- Order book (asks & bids for the selected pair)
 *   Center -- Trade form (create a new limit order)
 *   Right  -- User's active orders & trade history
 *
 * On medium screens the layout collapses to a single column with tabs.
 * All data flows through real ContractService calls against the connected
 * blockchain network.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { useWallet } from '../hooks/useWallet';
import { useAppStore, getProvider } from '../store/useAppStore';
import { ContractService } from '../lib/blockchain/contracts';
import { getNetworkConfig } from '../contracts/addresses';
import { formatAddress } from '../lib/utils/helpers';
// Card is available in Common but not needed in this layout
import OrderBook from '../components/Exchange/OrderBook';
import TradeForm from '../components/Exchange/TradeForm';
import UserOrders from '../components/Exchange/UserOrders';
import TokenSelector from '../components/Exchange/TokenSelector';
import {
  ArrowLeftRight,
  TrendingUp,
  BookOpen,
  Clock,
  Loader2,
  AlertCircle,
  RefreshCw,
  Zap,
  Shield,
  Globe,
  Wallet,
  Activity,
  BarChart3,
} from 'lucide-react';
import type { WrappedAsset } from '../types';

// ---------------------------------------------------------------------------
// Mobile tab identifiers
// ---------------------------------------------------------------------------

type MobileTab = 'book' | 'trade' | 'orders';

const MOBILE_TABS: { id: MobileTab; label: string; icon: React.ReactNode }[] = [
  { id: 'book', label: 'Order Book', icon: <BookOpen className="h-4 w-4" /> },
  { id: 'trade', label: 'Trade', icon: <ArrowLeftRight className="h-4 w-4" /> },
  { id: 'orders', label: 'My Orders', icon: <Clock className="h-4 w-4" /> },
];

// ---------------------------------------------------------------------------
// Reusable glass card wrapper
// NOTE: Do NOT add overflow-hidden -- TokenSelector renders a portal dropdown
// that must escape the card boundaries.
// ---------------------------------------------------------------------------

function GlassCard({
  children,
  className,
  gradientFrom = 'from-indigo-500',
  gradientTo = 'to-cyan-500',
}: {
  children: React.ReactNode;
  className?: string;
  gradientFrom?: string;
  gradientTo?: string;
}) {
  return (
    <div
      className={clsx(
        'relative rounded-2xl',
        'bg-[#0D0F14]/80 backdrop-blur-xl',
        'border border-white/[0.06]',
        'transition-all duration-300',
        className,
      )}
    >
      {/* Gradient top border accent */}
      <div
        className={clsx(
          'absolute inset-x-0 top-0 h-[1px] rounded-t-2xl',
          'bg-gradient-to-r',
          gradientFrom,
          gradientTo,
          'opacity-60',
        )}
      />
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ExchangePage() {
  // ---- Wallet & store -----------------------------------------------------

  const {
    address,
    isConnected,
    connectWallet,
    isConnecting,
  } = useWallet();
  const { wallet, wrappedAssets, setAssets, setLoadingAssets } = useAppStore();

  // ---- Local state --------------------------------------------------------

  const [contractService, setContractService] = useState<ContractService | null>(null);
  const [assets, setLocalAssets] = useState<WrappedAsset[]>([]);
  const [loadingAssets, setLocalLoadingAssets] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('trade');
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [ethBalance, setEthBalance] = useState<string>('0');

  // Pair selection for order book -- derived from TradeForm selections
  const [selectedSellToken, setSelectedSellToken] = useState<string | null>(null);
  const [selectedBuyToken, setSelectedBuyToken] = useState<string | null>(null);

  // ---- Derived state ------------------------------------------------------

  const networkConfig = useMemo(
    () => (wallet.chainId ? getNetworkConfig(wallet.chainId) ?? null : null),
    [wallet.chainId],
  );

  const isNetworkReady = useMemo(
    () =>
      networkConfig !== null &&
      !!networkConfig.factoryAddress &&
      (!!networkConfig.exchangeAddress || !!networkConfig.assetBackedExchangeAddress),
    [networkConfig],
  );

  // ---- Initialize ContractService -----------------------------------------

  useEffect(() => {
    if (!isConnected || !wallet.chainId) {
      setContractService(null);
      return;
    }

    const provider = getProvider();
    if (!provider) {
      setContractService(null);
      return;
    }

    try {
      const service = new ContractService(provider, wallet.chainId);
      setContractService(service);
    } catch (err) {
      console.error('Failed to initialize ContractService:', err);
      setContractService(null);
    }
  }, [isConnected, wallet.chainId]);

  // ---- Fetch all wrapped assets -------------------------------------------

  // Capture a ref of wrappedAssets to avoid including it as a dependency
  // (which would cause an infinite re-render loop since fetchAssets updates wrappedAssets).
  const wrappedAssetsRef = useRef(wrappedAssets);
  useEffect(() => {
    wrappedAssetsRef.current = wrappedAssets;
  }, [wrappedAssets]);

  const fetchAssets = useCallback(async () => {
    if (!contractService || !address) return;

    setLocalLoadingAssets(true);
    setLoadingAssets(true);

    try {
      // Get total number of assets from factory
      const totalAssets = await contractService.getTotalAssets();
      if (totalAssets === 0n) {
        setLocalAssets([]);
        setAssets([]);
        return;
      }

      // Get user's own assets
      let userAssetAddresses: string[] = [];
      try {
        userAssetAddresses = await contractService.getUserAssets(address);
      } catch (err) {
        console.error('Failed to fetch user assets:', err);
        toast.error('Failed to load your asset list');
      }

      // Build a unique set of known asset addresses.
      // Read from the ref to avoid the dependency cycle.
      const knownAddresses = new Set<string>([
        ...userAssetAddresses,
        ...wrappedAssetsRef.current.map((a) => a.address),
      ]);

      // Fetch details and balances for every known asset
      const assetList: WrappedAsset[] = [];
      let failedCount = 0;

      await Promise.all(
        Array.from(knownAddresses).map(async (addr) => {
          try {
            const [details, balance] = await Promise.all([
              contractService.getAssetDetails(addr),
              contractService.getAssetBalance(addr, address),
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
          } catch (err) {
            failedCount++;
            console.error(`Failed to load asset ${addr}:`, err);
          }
        }),
      );

      if (failedCount > 0) {
        toast.error(`Failed to load ${failedCount} asset(s). Some assets may be missing.`);
      }

      // Sort by balance descending
      assetList.sort((a, b) => {
        const balA = BigInt(a.balance);
        const balB = BigInt(b.balance);
        if (balB > balA) return 1;
        if (balB < balA) return -1;
        return 0;
      });

      setLocalAssets(assetList);
      setAssets(assetList);
    } catch (err) {
      console.error('Failed to fetch assets:', err);
      toast.error('Failed to load wrapped assets');
    } finally {
      setLocalLoadingAssets(false);
      setLoadingAssets(false);
    }
  }, [contractService, address, setAssets, setLoadingAssets]);

  useEffect(() => {
    void fetchAssets();
  }, [fetchAssets]);

  // ---- Fetch native ETH balance for token selectors ----------------------

  useEffect(() => {
    async function loadEthBalance() {
      if (!contractService || !address) return;
      try {
        const signer = await contractService.getSigner();
        const provider = signer.provider;
        if (provider) {
          const bal = await provider.getBalance(address);
          setEthBalance(bal.toString());
        }
      } catch {
        // Non-critical
      }
    }
    void loadEthBalance();
  }, [contractService, address, refreshKey]);

  // ---- Refresh handler (shared across child components) -------------------

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setIsRefreshing(true);
    void fetchAssets().finally(() => {
      setTimeout(() => setIsRefreshing(false), 600);
    });
  }, [fetchAssets]);

  // =========================================================================
  // Render: not connected
  // =========================================================================

  if (!isConnected) {
    return (
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        {/* Background glow effects */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-0 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/[0.07] blur-[140px]" />
          <div className="absolute bottom-0 right-0 h-[400px] w-[600px] translate-x-1/4 translate-y-1/4 rounded-full bg-cyan-600/[0.05] blur-[120px]" />
        </div>

        <div className="relative">
          <GlassCard className="mx-auto max-w-2xl px-8 sm:px-12 py-20 sm:py-24 text-center">
            {/* Icon with animated ring */}
            <div className="mx-auto mb-10 flex h-24 w-24 items-center justify-center">
              <div className="absolute h-24 w-24 animate-ping rounded-2xl bg-indigo-500/10" />
              <div className="relative flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600/20 to-cyan-600/20 ring-1 ring-white/[0.08]">
                <ArrowLeftRight className="h-11 w-11 text-indigo-400" />
              </div>
            </div>

            <h2 className="mb-4 text-3xl sm:text-4xl font-bold tracking-tight text-white">
              Decentralized Asset Exchange
            </h2>
            <p className="mx-auto mb-14 max-w-lg text-base sm:text-lg leading-relaxed text-gray-400">
              Trade tokenized real-world assets peer-to-peer with on-chain limit
              orders. Zero intermediaries, full transparency.
            </p>

            {/* Feature bullets */}
            <div className="mx-auto grid max-w-md grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-8">
              {[
                { icon: Zap, label: 'Instant Settlement' },
                { icon: Shield, label: 'Non-Custodial' },
                { icon: Globe, label: 'Permissionless' },
              ].map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex flex-col items-center gap-4 rounded-xl bg-white/[0.03] p-6 ring-1 ring-white/[0.05]"
                >
                  <Icon className="h-5 w-5 text-indigo-400/80" />
                  <span className="text-xs font-medium tracking-wide text-gray-300">
                    {label}
                  </span>
                </div>
              ))}
            </div>

            {/* Connect wallet button with glow */}
            <button
              type="button"
              onClick={() => void connectWallet()}
              disabled={isConnecting}
              className={clsx(
                'group relative mt-14 inline-flex items-center gap-3 rounded-xl px-10 py-4.5 text-sm font-semibold transition-all duration-300',
                'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white',
                'hover:from-indigo-500 hover:to-indigo-400 hover:shadow-lg hover:shadow-indigo-500/25',
                'focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:ring-offset-2 focus:ring-offset-[#0D0F14]',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {/* Glow behind button */}
              <span className="absolute inset-0 -z-10 rounded-xl bg-indigo-500/20 blur-xl transition-opacity duration-300 group-hover:opacity-100 opacity-0" />
              {isConnecting ? (
                <>
                  <Loader2 className="h-4.5 w-4.5 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Wallet className="h-4.5 w-4.5" />
                  Connect Wallet
                </>
              )}
            </button>
          </GlassCard>
        </div>
      </div>
    );
  }

  // =========================================================================
  // Render: network not configured
  // =========================================================================

  if (!isNetworkReady) {
    return (
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-1/4 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-amber-600/[0.06] blur-[140px]" />
        </div>

        <div className="relative mx-auto max-w-xl">
          <GlassCard
            className="px-8 sm:px-12 py-16 sm:py-20 text-center"
            gradientFrom="from-amber-500"
            gradientTo="to-orange-500"
          >
            {/* Amber warning icon */}
            <div className="mx-auto mb-8 flex h-18 w-18 items-center justify-center rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/20">
              <AlertCircle className="h-9 w-9 text-amber-400" />
            </div>

            <h2 className="mb-4 text-2xl font-bold text-white">
              Network Not Supported
            </h2>
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-gray-400">
              The exchange contracts are not deployed on the current network
              {networkConfig ? ` (${networkConfig.name})` : ''}. Please switch to
              a supported network such as Hardhat Local (31337).
            </p>

            {/* Network badge */}
            {networkConfig && (
              <div className="mt-8 inline-flex items-center gap-2.5 rounded-full bg-amber-500/10 px-5 py-2 text-xs font-medium text-amber-400 ring-1 ring-amber-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                {networkConfig.name}
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    );
  }

  // =========================================================================
  // Render: main exchange layout
  // =========================================================================

  return (
    <div className="relative mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* Subtle background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[600px] w-[1000px] -translate-x-1/2 rounded-full bg-indigo-600/[0.04] blur-[140px]" />
        <div className="absolute bottom-0 right-1/4 h-[300px] w-[500px] rounded-full bg-cyan-600/[0.03] blur-[120px]" />
      </div>

      <div className="relative">
        {/* ================================================================= */}
        {/* Page header                                                       */}
        {/* ================================================================= */}
        <div className="mb-8 sm:mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          {/* Left: Title + subtitle */}
          <div className="flex flex-col gap-2.5">
            <h1 className="flex items-center gap-3.5 text-2xl sm:text-3xl font-bold tracking-tight text-white">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600/20 to-cyan-600/20 ring-1 ring-white/[0.08]">
                <ArrowLeftRight className="h-5 w-5 text-indigo-400" />
              </span>
              <span>
                Exchange
                <span className="ml-2 bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
                  Pro
                </span>
              </span>
            </h1>
            <p className="text-sm text-gray-500 pl-0.5">
              Trade wrapped assets with on-chain limit orders
            </p>
          </div>

          {/* Right: pair selectors + refresh + network badge */}
          <div className="flex items-end gap-4">
            {/* Pair selectors */}
            <div className="flex items-end gap-3">
              <div className="w-52">
                <TokenSelector
                  assets={assets}
                  selectedToken={selectedSellToken}
                  onSelect={setSelectedSellToken}
                  label="Base"
                  includeETH
                  ethBalance={ethBalance}
                />
              </div>

              <span className="mb-2.5 text-lg font-light text-gray-600 select-none">/</span>

              <div className="w-52">
                <TokenSelector
                  assets={assets}
                  selectedToken={selectedBuyToken}
                  onSelect={setSelectedBuyToken}
                  label="Quote"
                  includeETH
                  ethBalance={ethBalance}
                />
              </div>
            </div>

            {/* Refresh button */}
            <button
              type="button"
              onClick={handleRefresh}
              className={clsx(
                'mb-0.5 flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl',
                'bg-[#0D0F14]/80 backdrop-blur-xl',
                'border border-white/[0.06]',
                'text-gray-400 transition-all duration-200',
                'hover:border-white/[0.12] hover:text-white hover:bg-white/[0.04]',
              )}
              title="Refresh data"
            >
              <RefreshCw
                className={clsx(
                  'h-4 w-4 transition-transform duration-500',
                  isRefreshing && 'animate-spin',
                )}
              />
            </button>

            {/* Network badge */}
            {networkConfig && (
              <div className="mb-0.5 hidden items-center gap-2 rounded-xl bg-[#0D0F14]/80 px-4 py-2.5 text-xs text-gray-500 ring-1 ring-white/[0.06] backdrop-blur-xl xl:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {networkConfig.name}
              </div>
            )}
          </div>
        </div>

        {/* ================================================================= */}
        {/* Loading assets spinner                                            */}
        {/* ================================================================= */}
        {loadingAssets && assets.length === 0 && (
          <GlassCard className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-400/60" />
              <span className="text-sm text-gray-500">
                Loading wrapped assets...
              </span>
            </div>
          </GlassCard>
        )}

        {/* ================================================================= */}
        {/* No assets warning                                                 */}
        {/* ================================================================= */}
        {!loadingAssets && assets.length === 0 && (
          <GlassCard className="flex flex-col items-center justify-center px-8 py-24 text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-500/10 ring-1 ring-white/[0.06]">
              <AlertCircle className="h-8 w-8 text-gray-600" />
            </div>
            <p className="text-sm font-medium text-gray-400">
              No wrapped assets found
            </p>
            <p className="mt-2 max-w-xs text-xs leading-relaxed text-gray-600">
              Mint some wrapped assets first, then return here to trade them.
            </p>
          </GlassCard>
        )}

        {/* ================================================================= */}
        {/* Mobile tab bar (segmented control)                                */}
        {/* ================================================================= */}
        {assets.length > 0 && (
          <div
            className={clsx(
              'mb-6 flex gap-1.5 rounded-2xl p-2 lg:hidden',
              'bg-[#0D0F14]/80 backdrop-blur-xl',
              'border border-white/[0.06]',
            )}
          >
            {MOBILE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMobileTab(tab.id)}
                className={clsx(
                  'relative flex flex-1 items-center justify-center gap-2.5 rounded-xl py-3.5 text-xs font-medium transition-all duration-200',
                  mobileTab === tab.id
                    ? 'text-white'
                    : 'text-gray-500 hover:text-gray-300',
                )}
              >
                {/* Active indicator background */}
                {mobileTab === tab.id && (
                  <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-600/20 to-cyan-600/20 ring-1 ring-white/[0.08]" />
                )}
                <span className="relative flex items-center gap-2.5">
                  {tab.icon}
                  {tab.label}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* ================================================================= */}
        {/* Three-column desktop / tabbed mobile layout                       */}
        {/* ================================================================= */}
        {assets.length > 0 && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
            {/* ---- Left: Order Book ---------------------------------------- */}
            <div
              className={clsx(
                'lg:col-span-3',
                mobileTab !== 'book' && 'hidden lg:block',
              )}
            >
              <GlassCard
                gradientFrom="from-rose-500"
                gradientTo="to-indigo-500"
              >
                {/* Card header */}
                <div className="flex items-center justify-between border-b border-white/[0.04] p-6">
                  <div className="flex items-center gap-3.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500/10 ring-1 ring-rose-500/20">
                      <BookOpen className="h-4 w-4 text-rose-400" />
                    </span>
                    <div className="flex flex-col gap-1">
                      <h3 className="text-sm font-semibold text-gray-100">
                        Order Book
                      </h3>
                      <p className="text-[11px] text-gray-500">
                        {selectedSellToken && selectedBuyToken
                          ? `${formatAddress(selectedSellToken)} / ${formatAddress(selectedBuyToken)}`
                          : 'Select a trading pair'}
                      </p>
                    </div>
                  </div>
                  <Activity className="h-4 w-4 text-gray-600" />
                </div>
                {/* Card body */}
                <div className="p-6">
                  <OrderBook
                    key={`orderbook-${refreshKey}`}
                    tokenSell={selectedSellToken ?? ''}
                    tokenBuy={selectedBuyToken ?? ''}
                    contractService={contractService}
                    onOrderFilled={handleRefresh}
                  />
                </div>
              </GlassCard>
            </div>

            {/* ---- Center: Trade Form -------------------------------------- */}
            <div
              className={clsx(
                'lg:col-span-6',
                mobileTab !== 'trade' && 'hidden lg:block',
              )}
            >
              <GlassCard
                gradientFrom="from-indigo-500"
                gradientTo="to-cyan-500"
              >
                {/* Card header */}
                <div className="flex items-center justify-between border-b border-white/[0.04] p-6">
                  <div className="flex items-center gap-3.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 ring-1 ring-indigo-500/20">
                      <TrendingUp className="h-4 w-4 text-indigo-400" />
                    </span>
                    <div className="flex flex-col gap-1">
                      <h3 className="text-sm font-semibold text-gray-100">
                        Create Order
                      </h3>
                      <p className="text-[11px] text-gray-500">
                        Place a limit order on the exchange
                      </p>
                    </div>
                  </div>
                  <BarChart3 className="h-4 w-4 text-gray-600" />
                </div>
                {/* Card body -- extra padding for the trade form */}
                <div className="p-6 sm:p-8">
                  <TradeForm
                    assets={assets}
                    contractService={contractService}
                    onOrderCreated={handleRefresh}
                  />
                </div>
              </GlassCard>
            </div>

            {/* ---- Right: User Orders -------------------------------------- */}
            <div
              className={clsx(
                'lg:col-span-3',
                mobileTab !== 'orders' && 'hidden lg:block',
              )}
            >
              <GlassCard
                gradientFrom="from-cyan-500"
                gradientTo="to-emerald-500"
              >
                {/* Card header */}
                <div className="flex items-center justify-between border-b border-white/[0.04] p-6">
                  <div className="flex items-center gap-3.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 ring-1 ring-cyan-500/20">
                      <Clock className="h-4 w-4 text-cyan-400" />
                    </span>
                    <div className="flex flex-col gap-1">
                      <h3 className="text-sm font-semibold text-gray-100">
                        My Orders
                      </h3>
                      <p className="text-[11px] text-gray-500">
                        {formatAddress(address ?? '')}
                      </p>
                    </div>
                  </div>
                  <Wallet className="h-4 w-4 text-gray-600" />
                </div>
                {/* Card body */}
                <div className="p-6">
                  <UserOrders
                    key={`userorders-${refreshKey}`}
                    contractService={contractService}
                    userAddress={address ?? ''}
                    onOrderCancelled={handleRefresh}
                  />
                </div>
              </GlassCard>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* Footer stats bar                                                  */}
        {/* ================================================================= */}
        {networkConfig && (
          <div
            className={clsx(
              'mt-10 sm:mt-12 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 rounded-2xl px-8 py-5',
              'bg-[#0D0F14]/80 backdrop-blur-xl',
              'border border-white/[0.06]',
            )}
          >
            {/* Network */}
            <span className="flex items-center gap-2 text-[11px] text-gray-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {networkConfig.name}
            </span>

            {/* Separator */}
            <span className="hidden sm:block h-3.5 w-px bg-white/[0.06]" />

            {/* Exchange address */}
            <span className="text-[11px] text-gray-600">
              Exchange{' '}
              <span className="font-mono text-gray-500">
                {networkConfig.assetBackedExchangeAddress
                  ? formatAddress(networkConfig.assetBackedExchangeAddress)
                  : networkConfig.exchangeAddress
                    ? formatAddress(networkConfig.exchangeAddress)
                    : 'Not deployed'}
              </span>
            </span>

            {/* Separator */}
            <span className="hidden sm:block h-3.5 w-px bg-white/[0.06]" />

            {/* Factory address */}
            <span className="text-[11px] text-gray-600">
              Factory{' '}
              <span className="font-mono text-gray-500">
                {networkConfig.factoryAddress
                  ? formatAddress(networkConfig.factoryAddress)
                  : 'Not deployed'}
              </span>
            </span>

            {/* Separator */}
            <span className="hidden sm:block h-3.5 w-px bg-white/[0.06]" />

            {/* Asset count */}
            <span className="text-[11px] text-gray-600">
              Assets{' '}
              <span className="font-medium text-gray-400">{assets.length}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
