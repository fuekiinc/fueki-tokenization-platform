/**
 * OrbitalAMMPage -- Main page for the Orbital AMM section.
 *
 * Layout:
 *   - Hero section when wallet is NOT connected (matches ExchangePage pattern)
 *   - When connected: tabbed interface with Pools, Swap, Liquidity, Create Pool
 *   - Uses glass-morphism cards, gradient accents, and the platform dark theme
 *
 * Initializes the OrbitalContractService from the wallet provider and passes
 * it to each child component.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { useWallet } from '../hooks/useWallet';
import { getProvider, useWalletStore } from '../store/walletStore.ts';
import { useAssetStore } from '../store/assetStore.ts';
import { OrbitalContractService } from '../lib/blockchain/orbitalContracts';
import logger from '../lib/logger';
import { DEFAULT_SWITCH_CHAIN_IDS, getNetworkMetadata } from '../contracts/addresses';
import { getNetworkCapabilities, getSupportedChainIdsForCapability } from '../contracts/networkCapabilities';
import { formatAddress } from '../lib/utils/helpers';
import HelpTooltip from '../components/Common/HelpTooltip';
import { ErrorState } from '../components/Common/StateDisplays';
import NetworkCapabilityGuard from '../components/Common/NetworkCapabilityGuard';

import PoolList from '../components/OrbitalAMM/PoolList';
import SwapInterface from '../components/OrbitalAMM/SwapInterface';
import LiquidityPanel from '../components/OrbitalAMM/LiquidityPanel';
import CreatePoolForm from '../components/OrbitalAMM/CreatePoolForm';

import {
  Activity,
  ArrowDownUp,
  BarChart3,
  Droplets,
  Globe,
  Layers,
  Loader2,
  Orbit,
  PlusCircle,
  RefreshCw,
  Shield,
  Wallet,
  Zap,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

type OrbitalTab = 'pools' | 'swap' | 'liquidity' | 'create';

const TABS: { id: OrbitalTab; label: string; icon: React.ReactNode }[] = [
  { id: 'pools', label: 'Pools', icon: <Layers className="h-4 w-4" /> },
  { id: 'swap', label: 'Swap', icon: <ArrowDownUp className="h-4 w-4" /> },
  { id: 'liquidity', label: 'Liquidity', icon: <Droplets className="h-4 w-4" /> },
  { id: 'create', label: 'Create Pool', icon: <PlusCircle className="h-4 w-4" /> },
];

// ---------------------------------------------------------------------------
// Reusable glass card wrapper (matches ExchangePage exactly)
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

export default function OrbitalAMMPage() {
  // ---- Wallet & store -------------------------------------------------------

  const {
    address,
    isConnected,
    connectWallet,
    isConnecting,
    switchNetwork,
  } = useWallet();
  const wallet = useWalletStore((s) => s.wallet);
  const wrappedAssets = useAssetStore((s) => s.wrappedAssets);

  // ---- Local state ----------------------------------------------------------

  const [activeTab, setActiveTab] = useState<OrbitalTab>('pools');
  const [selectedPoolAddress, setSelectedPoolAddress] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const initErrorToastRef = useRef<string | null>(null);

  // ---- Timer refs for cleanup -----------------------------------------------

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tabTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      clearTimeout(refreshTimerRef.current);
      clearTimeout(tabTimerRef.current);
    };
  }, []);

  // ---- Derived state --------------------------------------------------------

  const networkConfig = useMemo(
    () => (wallet.chainId ? getNetworkMetadata(wallet.chainId) ?? null : null),
    [wallet.chainId],
  );
  const isMainnetOrbitalAddressConfigured = useMemo(() => {
    if (wallet.chainId !== 1) return true;
    return Boolean(networkConfig?.orbitalFactoryAddress && networkConfig?.orbitalRouterAddress);
  }, [wallet.chainId, networkConfig]);

  const capabilities = useMemo(
    () => getNetworkCapabilities(wallet.chainId),
    [wallet.chainId],
  );

  const isOrbitalReady = capabilities?.orbitalAMM ?? false;
  const orbitalSupportedChainIds = useMemo(() => {
    const supported = getSupportedChainIdsForCapability('orbitalAMM');
    return supported.length > 0 ? supported : DEFAULT_SWITCH_CHAIN_IDS;
  }, []);
  const orbitalSupportedNetworkList = useMemo(
    () =>
      orbitalSupportedChainIds
        .map((id) => getNetworkMetadata(id)?.name ?? `Chain ${id}`)
        .join(', '),
    [orbitalSupportedChainIds],
  );

  // ---- Initialize OrbitalContractService ------------------------------------

  const contractInit = useMemo(() => {
    if (!isConnected || !wallet.chainId || !isOrbitalReady) {
      return {
        service: null as OrbitalContractService | null,
        error: null as string | null,
      };
    }

    const provider = getProvider();
    if (!provider) {
      return {
        service: null as OrbitalContractService | null,
        error: null as string | null,
      };
    }

    try {
      return {
        service: new OrbitalContractService(provider, wallet.chainId),
        error: null as string | null,
      };
    } catch (err) {
      logger.error('Failed to initialize OrbitalContractService:', err);
      return {
        service: null as OrbitalContractService | null,
        error: 'Failed to initialize AMM contracts. Please check your network connection and try again.',
      };
    }
  }, [isConnected, isOrbitalReady, wallet.chainId]);

  const contractService = contractInit.service;
  const initError = contractInit.error;

  useEffect(() => {
    if (!initError) {
      initErrorToastRef.current = null;
      return;
    }
    if (initErrorToastRef.current === initError) {
      return;
    }
    initErrorToastRef.current = initError;
    toast.error('Failed to initialize AMM contracts');
  }, [initError]);

  // ---- Collect known token addresses from wrapped assets --------------------

  const tokenAddresses = useMemo(
    () => wrappedAssets.map((asset) => asset.address),
    [wrappedAssets],
  );

  // ---- Pool selection handler (navigates to swap tab) -----------------------

  const handleSelectPool = useCallback((poolAddress: string) => {
    setSelectedPoolAddress(poolAddress);
    setActiveTab('swap');
  }, []);

  // ---- Refresh handler ------------------------------------------------------

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setIsRefreshing(true);
    clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => setIsRefreshing(false), 600);
  }, []);

  // ---- Pool created handler -------------------------------------------------

  const handlePoolCreated = useCallback(() => {
    handleRefresh();
    // Navigate to pools list to see the new pool
    clearTimeout(tabTimerRef.current);
    tabTimerRef.current = setTimeout(() => setActiveTab('pools'), 1000);
  }, [handleRefresh]);

  // =========================================================================
  // Render: not connected
  // =========================================================================

  if (!isConnected) {
    return (
      <div className="relative mx-auto max-w-7xl py-20 sm:py-28">
        {/* Background glow effects */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-0 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/[0.07] blur-[140px]" />
          <div className="absolute bottom-0 right-0 h-[400px] w-[600px] translate-x-1/4 translate-y-1/4 rounded-full bg-cyan-600/[0.05] blur-[120px]" />
        </div>

        <div className="relative">
          <GlassCard className="mx-auto max-w-2xl px-10 sm:px-14 py-20 sm:py-28 text-center">
            {/* Icon with animated ring */}
            <div className="mx-auto mb-10 flex h-24 w-24 items-center justify-center">
              <div className="absolute h-24 w-24 animate-ping motion-reduce:animate-none rounded-2xl bg-indigo-500/10" />
              <div className="relative flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600/20 to-cyan-600/20 ring-1 ring-white/[0.08]">
                <Orbit className="h-11 w-11 text-indigo-400" />
              </div>
            </div>

            <h2 className="mb-4 text-3xl sm:text-4xl font-bold tracking-tight text-white">
              Orbital{' '}
              <span className="bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
                AMM
              </span>
            </h2>
            <p className="mx-auto mb-16 max-w-lg text-base sm:text-lg leading-relaxed text-gray-400">
              Concentrated multi-token liquidity with power-mean invariants.
              Trade, provide liquidity, and create custom pools with up to 8 tokens.
            </p>

            {/* Feature bullets */}
            <div className="mx-auto grid max-w-lg grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-8">
              {[
                { icon: Zap, label: 'Concentrated Liquidity' },
                { icon: Shield, label: 'Multi-Token Pools' },
                { icon: Globe, label: 'Capital Efficient' },
              ].map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex flex-col items-center gap-4 rounded-xl bg-white/[0.03] p-7 ring-1 ring-white/[0.05]"
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
                  <Loader2 className="h-4.5 w-4.5 animate-spin motion-reduce:animate-none" />
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

  if (!isOrbitalReady) {
    return (
      <div className="relative mx-auto max-w-7xl py-20 sm:py-28">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-1/4 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-amber-600/[0.06] blur-[140px]" />
        </div>

        <div className="relative mx-auto max-w-xl">
          <NetworkCapabilityGuard
            chainId={wallet.chainId}
            requiredCapability="orbitalAMM"
            switchNetwork={switchNetwork}
            title={
              wallet.chainId === 1
                ? 'Orbital AMM Unavailable on Ethereum Mainnet'
                : 'Orbital AMM Unavailable on This Network'
            }
            description={
              wallet.chainId === 1
                ? isMainnetOrbitalAddressConfigured
                  ? `Orbital AMM contracts are unavailable on Ethereum Mainnet in this session. Switch to ${orbitalSupportedNetworkList} to continue.`
                  : `Orbital AMM mainnet contract addresses are not configured in this frontend build. Set VITE_ORBITAL_FACTORY_1 and VITE_ORBITAL_ROUTER_1, then redeploy.`
                : `Orbital AMM contracts are not deployed on ${networkConfig?.name ?? 'your current network'}. Switch to ${orbitalSupportedNetworkList} to continue.`
            }
            switchChainIds={orbitalSupportedChainIds}
          />
        </div>
      </div>
    );
  }

  // =========================================================================
  // Render: main Orbital AMM layout
  // =========================================================================

  return (
    <div className="relative w-full">
      {/* Subtle background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[600px] w-[1000px] -translate-x-1/2 rounded-full bg-indigo-600/[0.04] blur-[140px]" />
        <div className="absolute bottom-0 right-1/4 h-[300px] w-[500px] rounded-full bg-cyan-600/[0.03] blur-[120px]" />
      </div>

      <div className="relative">
        {/* ================================================================= */}
        {/* Page header                                                       */}
        {/* ================================================================= */}
        <div className="mb-10 sm:mb-14 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          {/* Left: Title + subtitle */}
          <div className="flex flex-col gap-2.5 min-w-0">
            <h1 className="flex items-center gap-3.5 text-2xl sm:text-3xl font-bold tracking-tight text-white">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600/20 to-cyan-600/20 ring-1 ring-white/[0.08]">
                <Orbit className="h-5 w-5 text-indigo-400" />
              </span>
              <span>
                Orbital
                <span className="ml-2 bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
                  AMM
                </span>
              </span>
            </h1>
            <p className="flex items-center gap-1.5 text-sm text-gray-500 pl-0.5">
              Concentrated multi-token liquidity pools with power-mean invariants
              <HelpTooltip
                tooltipId="orbital.invariant"
                flow="orbital"
                component="OrbitalAMMPage.Header"
              />
            </p>
          </div>

          {/* Right: Refresh + network badge */}
          <div className="flex items-end gap-4">
            {/* Refresh button -- 44px touch target */}
            <button
              type="button"
              onClick={handleRefresh}
              aria-label="Refresh data"
              className={clsx(
                'mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                'bg-[#0D0F14]/80 backdrop-blur-xl',
                'border border-white/[0.06]',
                'text-gray-400 transition-all duration-200',
                'hover:border-white/[0.12] hover:text-white hover:bg-white/[0.04]',
              )}
            >
              <RefreshCw
                className={clsx(
                  'h-4 w-4 transition-transform duration-500',
                  isRefreshing && 'animate-spin motion-reduce:animate-none',
                )}
              />
            </button>

            {/* Network badge */}
            {networkConfig && (
              <div className="mb-0.5 hidden items-center gap-2 rounded-xl bg-[#0D0F14]/80 px-4 py-2.5 text-xs text-gray-500 ring-1 ring-white/[0.06] backdrop-blur-xl xl:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse motion-reduce:animate-none" />
                {networkConfig.name}
              </div>
            )}
          </div>
        </div>

        {/* ================================================================= */}
        {/* Tab navigation (segmented control)                                */}
        {/* ================================================================= */}
        <div
          role="tablist"
          aria-label="Orbital AMM sections"
          className={clsx(
            'mb-8 flex gap-1 sm:gap-1.5 rounded-2xl p-1.5 sm:p-2',
            'bg-[#0D0F14]/80 backdrop-blur-xl',
            'border border-white/[0.06]',
          )}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`orbital-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`orbital-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'relative flex flex-1 items-center justify-center gap-1.5 sm:gap-2.5 rounded-xl py-3 sm:py-3.5 text-[11px] sm:text-xs font-medium transition-all duration-200',
                'min-h-[44px]',
                activeTab === tab.id
                  ? 'text-white'
                  : 'text-gray-500 hover:text-gray-300',
              )}
            >
              {/* Active indicator background */}
              {activeTab === tab.id && (
                <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-600/20 to-cyan-600/20 ring-1 ring-white/[0.08]" />
              )}
              <span className="relative flex items-center gap-1.5 sm:gap-2.5">
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
              </span>
            </button>
          ))}
        </div>

        {/* ================================================================= */}
        {/* Contract init error                                               */}
        {/* ================================================================= */}

        {initError && !contractService && (
          <div className="mb-8">
            <GlassCard className="p-8">
              <ErrorState
                message={initError}
                onRetry={() => window.location.reload()}
              />
            </GlassCard>
          </div>
        )}

        {/* ================================================================= */}
        {/* Tab content                                                       */}
        {/* ================================================================= */}

        {/* ---- Pools Tab ---- */}
        {activeTab === 'pools' && (
          <div role="tabpanel" id="orbital-panel-pools" aria-labelledby="orbital-tab-pools">
          <GlassCard gradientFrom="from-indigo-500" gradientTo="to-cyan-500">
            {/* Card header */}
            <div className="flex items-center justify-between border-b border-white/[0.04] p-5 sm:p-7">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 ring-1 ring-indigo-500/20">
                  <Layers className="h-4 w-4 text-indigo-400" />
                </span>
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-semibold text-gray-100">
                    Orbital Pools
                  </h3>
                  <p className="text-[11px] text-gray-500 hidden sm:block">
                    Browse all concentrated multi-token liquidity pools
                  </p>
                </div>
              </div>
              <Activity className="h-4 w-4 text-gray-600" />
            </div>
            {/* Card body */}
            <div className="p-5 sm:p-7">
              <PoolList
                key={`pools-${refreshKey}`}
                contractService={contractService}
                userAddress={address ?? ''}
                onSelectPool={handleSelectPool}
              />
            </div>
          </GlassCard>
          </div>
        )}

        {/* ---- Swap Tab ---- */}
        {activeTab === 'swap' && (
          <div role="tabpanel" id="orbital-panel-swap" aria-labelledby="orbital-tab-swap" className="mx-auto max-w-xl">
            <GlassCard gradientFrom="from-cyan-500" gradientTo="to-indigo-500">
              {/* Card header */}
              <div className="flex items-center justify-between border-b border-white/[0.04] p-5 sm:p-7">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 ring-1 ring-cyan-500/20">
                    <ArrowDownUp className="h-4 w-4 text-cyan-400" />
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3 className="text-sm font-semibold text-gray-100">
                      Orbital Swap
                    </h3>
                    <p className="text-[11px] text-gray-500 hidden sm:block">
                      Swap tokens through concentrated liquidity pools
                    </p>
                  </div>
                </div>
                <BarChart3 className="h-4 w-4 text-gray-600" />
              </div>
              {/* Card body */}
              <div className="p-5 sm:p-7 lg:p-9">
                <SwapInterface
                  key={`swap-${refreshKey}`}
                  contractService={contractService}
                  userAddress={address ?? ''}
                  selectedPoolAddress={selectedPoolAddress}
                  onSwapComplete={handleRefresh}
                />
              </div>
            </GlassCard>
          </div>
        )}

        {/* ---- Liquidity Tab ---- */}
        {activeTab === 'liquidity' && (
          <div role="tabpanel" id="orbital-panel-liquidity" aria-labelledby="orbital-tab-liquidity" className="mx-auto max-w-xl">
            <GlassCard gradientFrom="from-purple-500" gradientTo="to-teal-500">
              {/* Card header */}
              <div className="flex items-center justify-between border-b border-white/[0.04] p-5 sm:p-7">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10 ring-1 ring-purple-500/20">
                    <Droplets className="h-4 w-4 text-purple-400" />
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3 className="text-sm font-semibold text-gray-100">
                      Manage Liquidity
                    </h3>
                    <p className="text-[11px] text-gray-500 hidden sm:block">
                      Add or remove liquidity from Orbital pools
                    </p>
                  </div>
                </div>
                <Droplets className="h-4 w-4 text-gray-600" />
              </div>
              {/* Card body */}
              <div className="p-5 sm:p-7 lg:p-9">
                <LiquidityPanel
                  key={`liquidity-${refreshKey}`}
                  contractService={contractService}
                  userAddress={address ?? ''}
                  selectedPoolAddress={selectedPoolAddress}
                  onLiquidityChanged={handleRefresh}
                />
              </div>
            </GlassCard>
          </div>
        )}

        {/* ---- Create Pool Tab ---- */}
        {activeTab === 'create' && (
          <div role="tabpanel" id="orbital-panel-create" aria-labelledby="orbital-tab-create" className="mx-auto max-w-2xl">
            <GlassCard gradientFrom="from-emerald-500" gradientTo="to-indigo-500">
              {/* Card header */}
              <div className="flex items-center justify-between border-b border-white/[0.04] p-5 sm:p-7">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20">
                    <PlusCircle className="h-4 w-4 text-emerald-400" />
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3 className="text-sm font-semibold text-gray-100">
                      Create Orbital Pool
                    </h3>
                    <p className="text-[11px] text-gray-500 hidden sm:block">
                      Launch a new multi-token concentrated liquidity pool
                    </p>
                  </div>
                </div>
                <Orbit className="h-4 w-4 text-gray-600" />
              </div>
              {/* Card body */}
              <div className="p-5 sm:p-7 lg:p-9">
                <CreatePoolForm
                  key={`create-${refreshKey}`}
                  contractService={contractService}
                  userAddress={address ?? ''}
                  tokenAddresses={tokenAddresses}
                  onPoolCreated={handlePoolCreated}
                />
              </div>
            </GlassCard>
          </div>
        )}

        {/* ================================================================= */}
        {/* Footer stats bar                                                  */}
        {/* ================================================================= */}
        {networkConfig && (
          <div
            className={clsx(
              'mt-12 sm:mt-16 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 rounded-2xl px-5 py-5 sm:gap-x-10 sm:px-8 sm:py-6',
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

            {/* Wallet */}
            <span className="text-[11px] text-gray-600">
              Wallet{' '}
              <span className="font-mono text-gray-500">
                {address ? formatAddress(address) : '---'}
              </span>
            </span>

            {/* Separator */}
            <span className="hidden sm:block h-3.5 w-px bg-white/[0.06]" />

            {/* AMM Type */}
            <span className="text-[11px] text-gray-600">
              Protocol{' '}
              <span className="font-medium text-gray-400">
                Orbital AMM
              </span>
            </span>

            {/* Separator */}
            <span className="hidden sm:block h-3.5 w-px bg-white/[0.06]" />

            {/* Known tokens */}
            <span className="text-[11px] text-gray-600">
              Known Tokens{' '}
              <span className="font-medium text-gray-400">
                {tokenAddresses.length}
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
