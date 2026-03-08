import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import logger from '../lib/logger';
import { showError } from '../lib/errorUtils';
import { mapInBatches } from '../lib/utils/asyncBatch';
import clsx from 'clsx';
import { useAuthStore } from '../store/authStore';
import { useDemoWalletStore } from '../components/DemoMode/DemoWalletProvider';
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Copy,
  DollarSign,
  ExternalLink,
  FileText,
  Filter,
  Flame,
  Layers,
  LayoutGrid,
  List,
  Lock,
  Package,
  Search,
  Send,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ethers } from 'ethers';
import { ContractService, parseContractError } from '../lib/blockchain/contracts.ts';
import { useWallet } from '../hooks/useWallet.ts';
import { getProvider } from '../store/walletStore.ts';
import { getAssetFetchGeneration, nextAssetFetchGeneration, useAssetStore } from '../store/assetStore.ts';
import { useTradeStore } from '../store/tradeStore.ts';
import { Button, EmptyState, Modal } from '../components/Common/index.ts';
import {
  copyToClipboard,
  formatAddress,
  formatBalance,
  parseTokenAmount,
} from '../lib/utils/helpers.ts';
import { formatCurrency, formatTokenAmount } from '../lib/formatters.ts';
import { getNetworkConfig, SUPPORTED_NETWORKS } from '../contracts/addresses.ts';
import {
  calculateAssetPerformance,
  formatPnLPercent,
} from '../lib/portfolioMetrics.ts';
import type { AssetPerformance } from '../lib/portfolioMetrics.ts';
import type { TradeHistory, WrappedAsset } from '../types/index.ts';

// Sub-components extracted from this file
import AssetAllocationChart from '../components/Charts/AssetAllocationChart.tsx';
import PortfolioValueChart from '../components/Charts/PortfolioValueChart.tsx';
import HoldingsTable from '../components/DataViz/HoldingsTable.tsx';
import TransactionHistory from '../components/DataViz/TransactionHistory.tsx';
import PerformanceMetrics from '../components/DataViz/PerformanceMetrics.tsx';
import { ComponentErrorBoundary } from '../components/ErrorBoundary';
import { ErrorState } from '../components/Common/StateDisplays';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortField = 'name' | 'balance' | 'value';
type SortDir = 'asc' | 'desc';
type ViewMode = 'grid' | 'list';

interface TransferForm {
  recipient: string;
  amount: string;
}

interface BurnForm {
  amount: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GRID_CARD_HEIGHT = 420; // estimated card height for virtualizer
const GRID_OVERSCAN = 3;
const GRID_SCROLL_HEIGHT = 1200;
const GRID_COLS = 3; // lg breakpoint column count

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GRADIENT_PALETTES = [
  'from-indigo-500 to-violet-400',
  'from-violet-500 to-purple-400',
  'from-emerald-500 to-teal-400',
  'from-amber-500 to-orange-400',
  'from-rose-500 to-pink-400',
  'from-cyan-500 to-blue-400',
  'from-fuchsia-500 to-purple-400',
  'from-blue-500 to-indigo-400',
];

function getTokenGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return GRADIENT_PALETTES[Math.abs(hash) % GRADIENT_PALETTES.length];
}

function getDocBadgeClasses(docType: string): string {
  const lower = (docType ?? '').toLowerCase();
  if (lower === 'json')
    return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
  if (lower === 'csv')
    return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  if (lower === 'xml')
    return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
}

function computePortfolioValue(assets: WrappedAsset[]): string {
  const total = assets.reduce(
    (sum, a) => sum + parseTokenAmount(a.originalValue || '0'),
    0,
  );
  return formatCurrency(total);
}

function computeTotalLocked(assets: WrappedAsset[]): string {
  const total = assets.reduce(
    (sum, a) => sum + parseTokenAmount(a.balance || '0'),
    0,
  );
  return formatTokenAmount(total);
}

function computeUniqueDocTypes(assets: WrappedAsset[]): number {
  const types = new Set(
    assets.map((a) => (a.documentType ?? '').toLowerCase()).filter(Boolean),
  );
  return types.size;
}

function pnlColorClass(value: number): string {
  if (value > 0) return 'text-emerald-400';
  if (value < 0) return 'text-red-400';
  return 'text-gray-500';
}

function hasPositiveBalance(asset: WrappedAsset): boolean {
  const balance = parseTokenAmount(asset.balance ?? '0');
  return Number.isFinite(balance) && balance > 0;
}

// ---------------------------------------------------------------------------
// Skeleton Loaders
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div
      role="status"
      aria-label="Loading asset card"
      className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0D0F14]/80 p-4 sm:p-7 md:p-9"
    >
      <span className="sr-only">Loading asset...</span>
      <div className="flex items-start gap-4">
        <div className="shimmer h-12 w-12 rounded-full" />
        <div className="flex-1 space-y-3">
          <div className="shimmer h-4 w-28 rounded" />
          <div className="shimmer h-3 w-16 rounded" />
        </div>
        <div className="shimmer h-5 w-14 rounded-full" />
      </div>
      <div className="mt-8 space-y-4">
        <div className="flex justify-between">
          <div className="shimmer h-3 w-16 rounded" />
          <div className="shimmer h-3 w-24 rounded" />
        </div>
        <div className="flex justify-between">
          <div className="shimmer h-3 w-24 rounded" />
          <div className="shimmer h-3 w-20 rounded" />
        </div>
      </div>
      <div className="mt-8 flex gap-3">
        <div className="shimmer h-11 flex-1 rounded-xl" />
        <div className="shimmer h-11 flex-1 rounded-xl" />
        <div className="shimmer h-11 w-11 rounded-xl" />
      </div>
    </div>
  );
}

function SkeletonStatCard() {
  return (
    <div
      role="status"
      aria-label="Loading stat"
      className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0D0F14]/80 p-4 sm:p-7 md:p-9"
    >
      <span className="sr-only">Loading...</span>
      <div className="flex items-center gap-3">
        <div className="shimmer h-10 w-10 rounded-xl" />
        <div className="shimmer h-3 w-20 rounded" />
      </div>
      <div className="shimmer mt-5 h-8 w-32 rounded" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Detail Row (expandable card detail)
// ---------------------------------------------------------------------------

function DetailRow({
  label,
  value,
  mono = false,
  copiable = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copiable?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      {copiable ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            copyToClipboard(value);
          }}
          className={clsx(
            'flex max-w-[220px] items-center gap-2 truncate text-gray-400 transition-colors hover:text-white',
            'focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0D0F14]',
            mono && 'font-mono',
          )}
          aria-label={`Copy ${label}: ${value}`}
          title={value}
        >
          <span className="truncate">{value}</span>
          <Copy className="h-3.5 w-3.5 shrink-0 text-gray-600" aria-hidden="true" />
        </button>
      ) : (
        <span
          className={clsx(
            'max-w-[220px] truncate text-gray-400',
            mono && 'font-mono',
          )}
          title={value}
        >
          {value}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Asset Grid Card
// ---------------------------------------------------------------------------

function AssetGridCard({
  asset,
  isExpanded,
  onToggleExpand,
  onTransfer,
  onBurn,
  onViewExplorer,
  performance,
  hasTrades,
}: {
  asset: WrappedAsset;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onTransfer: (asset: WrappedAsset) => void;
  onBurn: (asset: WrappedAsset) => void;
  onViewExplorer: (asset: WrappedAsset) => void;
  performance: AssetPerformance | undefined;
  hasTrades: boolean;
}) {
  const tokenInitials = (asset.name ?? '')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('') || '??';
  const gradient = getTokenGradient(asset.name ?? '');
  const balanceFormatted = formatTokenAmount(formatBalance(asset.balance ?? '0'));
  const valueFormatted = formatCurrency(formatBalance(asset.originalValue ?? '0'));
  const docType = (asset.documentType ?? '').toUpperCase();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggleExpand}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggleExpand();
        }
      }}
      aria-expanded={isExpanded}
      aria-label={`${asset.name} (${asset.symbol}). Balance: ${balanceFormatted}. Value: ${valueFormatted}. ${isExpanded ? 'Collapse' : 'Expand'} details.`}
      className={clsx(
        'group relative cursor-pointer overflow-hidden rounded-2xl',
        'border border-white/[0.06]',
        'bg-[#0D0F14]/80 backdrop-blur-xl',
        'transition-all duration-300 ease-out',
        'hover:-translate-y-0.5 hover:border-white/[0.10]',
        'hover:shadow-[0_8px_40px_-8px_rgba(99,102,241,0.10)]',
        'focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06070A]',
      )}
    >
      {/* Top gradient hover line */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" aria-hidden="true" />

      <div className="p-4 sm:p-7 md:p-9">
        {/* Header row */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div
              className={clsx(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br',
                gradient,
                'text-sm font-bold text-white shadow-lg',
              )}
              aria-hidden="true"
            >
              {tokenInitials}
            </div>

            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-white">
                {asset.name}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {asset.symbol}
              </p>
            </div>
          </div>

          {docType && (
            <span
              className={clsx(
                'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide',
                getDocBadgeClasses(asset.documentType ?? ''),
              )}
            >
              {docType}
            </span>
          )}
        </div>

        {/* Balance / Value / P&L rows */}
        <div className="mt-9 space-y-5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-gray-500">Balance</span>
            <span className="text-base font-semibold text-white">
              {balanceFormatted}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-gray-500">
              Original Value
            </span>
            <span className="text-sm text-gray-400">
              {valueFormatted}
            </span>
          </div>
          {/* P&L row */}
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-gray-500">P&L</span>
            {performance && hasTrades && performance.hasCostData ? (
              <span
                className={clsx(
                  'inline-flex items-center gap-1.5 text-sm font-medium',
                  pnlColorClass(performance.percentageChange),
                )}
              >
                {performance.percentageChange > 0 && (
                  <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {performance.percentageChange < 0 && (
                  <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {formatPnLPercent(performance.percentageChange)}
              </span>
            ) : (
              <span className="text-xs text-gray-600">--</span>
            )}
          </div>
        </div>

        {/* Document hash preview */}
        {asset.documentHash && (
          <div className="mt-7 rounded-xl border border-white/[0.04] bg-white/[0.02] px-5 py-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600">Doc Hash</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  copyToClipboard(asset.documentHash);
                }}
                aria-label={`Copy document hash for ${asset.name}`}
                className="flex items-center gap-1.5 font-mono text-xs text-gray-500 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0D0F14]"
              >
                <span className="max-w-[160px] truncate">
                  {asset.documentHash}
                </span>
                <Copy className="h-3 w-3 shrink-0 text-gray-600" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-8 flex gap-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTransfer(asset);
            }}
            aria-label={`Transfer ${asset.name}`}
            className={clsx(
              'flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3',
              'border border-indigo-500/10 bg-indigo-500/[0.06] text-sm font-medium text-indigo-400',
              'transition-all duration-200 hover:border-indigo-500/25 hover:bg-indigo-500/[0.12] hover:shadow-sm hover:shadow-indigo-500/10',
              'focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0D0F14]',
            )}
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            Transfer
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onBurn(asset);
            }}
            aria-label={`Burn ${asset.name}`}
            className={clsx(
              'flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3',
              'border border-red-500/10 bg-red-500/[0.06] text-sm font-medium text-red-400',
              'transition-all duration-200 hover:border-red-500/25 hover:bg-red-500/[0.12] hover:shadow-sm hover:shadow-red-500/10',
              'focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0D0F14]',
            )}
          >
            <Flame className="h-3.5 w-3.5" aria-hidden="true" />
            Burn
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewExplorer(asset);
            }}
            aria-label={`View ${asset.name} on block explorer`}
            className={clsx(
              'flex items-center justify-center rounded-xl px-3.5 py-3 min-h-[44px] min-w-[44px]',
              'border border-white/[0.06] bg-white/[0.03] text-gray-500',
              'transition-all duration-200 hover:border-white/[0.10] hover:bg-white/[0.06] hover:text-gray-300',
              'focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0D0F14]',
            )}
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Expandable details */}
        {isExpanded && (
          <div className="mt-8 space-y-4 border-t border-white/[0.06] pt-8">
            <DetailRow
              label="Contract"
              value={asset.address}
              mono
              copiable
            />
            <DetailRow
              label="Document Hash"
              value={asset.documentHash}
              mono
              copiable
            />
            <DetailRow
              label="Total Supply"
              value={formatBalance(asset.totalSupply)}
            />
            <DetailRow
              label="Original Value"
              value={valueFormatted}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function PortfolioPage() {
  const navigate = useNavigate();
  const { isConnected, address, chainId, connectWallet, error: walletError } = useWallet();
  const isDemoActive = useAuthStore((s) => s.user?.demoActive === true);
  const demoWalletSettingUp = useDemoWalletStore((s) => s.isSettingUp);
  const demoWalletError = useDemoWalletStore((s) => s.setupError);
  const demoWalletReady = useDemoWalletStore((s) => s.isReady);
  const wrappedAssets = useAssetStore((s) => s.wrappedAssets);
  const isLoadingAssets = useAssetStore((s) => s.isLoadingAssets);
  const setAssets = useAssetStore((s) => s.setAssets);
  const setLoadingAssets = useAssetStore((s) => s.setLoadingAssets);
  const updateAsset = useAssetStore((s) => s.updateAsset);
  const addTrade = useTradeStore((s) => s.addTrade);
  const tradeHistory = useTradeStore((s) => s.tradeHistory);

  // ---- UI state ------------------------------------------------------------

  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [expandedAsset, setExpandedAsset] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [fetchError, setFetchError] = useState<string | null>(null);

  // ---- Grid virtualizer ref ------------------------------------------------

  const gridParentRef = useRef<HTMLDivElement>(null);

  // ---- Transfer modal state ------------------------------------------------

  const [transferAsset, setTransferAsset] = useState<WrappedAsset | null>(null);
  const [transferForm, setTransferForm] = useState<TransferForm>({
    recipient: '',
    amount: '',
  });
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  // ---- Burn modal state ----------------------------------------------------

  const [burnAsset, setBurnAsset] = useState<WrappedAsset | null>(null);
  const [burnForm, setBurnForm] = useState<BurnForm>({ amount: '' });
  const [burnLoading, setBurnLoading] = useState(false);
  const [burnError, setBurnError] = useState<string | null>(null);

  // ---- Fetch assets on wallet connect --------------------------------------

  const fetchAssets = useCallback(async () => {
    if (!isConnected || !address || !chainId) return;

    const provider = getProvider();
    if (!provider) {
      setFetchError('Please connect your wallet to view your portfolio.');
      return;
    }

    setFetchError(null);
    const gen = nextAssetFetchGeneration();
    setLoadingAssets(true);
    try {
      const service = new ContractService(provider, chainId);

      // Gather asset addresses from multiple sources:
      //   1. Assets the user created (factory.getUserAssets)
      //   2. ALL platform assets (factory.getAssetAtIndex) — catches assets
      //      the user holds but didn't create
      let userAddresses: string[] = [];
      try {
        userAddresses = await service.getUserAssets(address);
      } catch {
        logger.warn('Portfolio: unable to fetch user-created assets');
      }

      const allAddresses: string[] = [];
      try {
        const total = await service.getTotalAssets();
        const count = Number(total);
        const maxScan = Math.min(count, 500);
        const startIndex = Math.max(0, count - maxScan);
        const BATCH = 5;
        for (let s = startIndex; s < count; s += BATCH) {
          if (gen !== getAssetFetchGeneration()) return;
          const end = Math.min(s + BATCH, count);
          const batch = [];
          for (let i = s; i < end; i++) {
            batch.push(service.getAssetAtIndex(i).catch(() => null));
          }
          const results = await Promise.all(batch);
          for (const r of results) {
            if (r) allAddresses.push(r);
          }
        }
      } catch {
        logger.warn('Portfolio: unable to enumerate all platform assets');
      }

      const uniqueAddresses = Array.from(
        new Set([...userAddresses, ...allAddresses]),
      );
      if (gen !== getAssetFetchGeneration()) return; // stale fetch, discard

      const assets = (
        await mapInBatches(uniqueAddresses, 8, async (addr) => {
          try {
            const details = await service.getAssetDetails(addr);
            const balanceWei = await service.getAssetBalance(addr, address);
            return {
              address: addr,
              name: details.name,
              symbol: details.symbol,
              totalSupply: details.totalSupply.toString(),
              balance: balanceWei.toString(),
              documentHash: details.documentHash,
              documentType: details.documentType,
              originalValue: details.originalValue.toString(),
            } satisfies WrappedAsset;
          } catch (err) {
            logger.warn(`Portfolio: skipping asset ${addr}:`, err);
            return null;
          }
        })
      ).filter((asset): asset is WrappedAsset => asset !== null);

      if (gen !== getAssetFetchGeneration()) return; // stale fetch, discard

      setAssets(assets);
    } catch (err) {
      logger.warn('Failed to fetch portfolio assets:', err);
      // Only show error UI if this is a genuine connectivity problem,
      // not a missing-contract / unsupported-network situation.
      const msg = err instanceof Error ? err.message : String(err);
      const isContractMissing =
        msg.includes('not deployed') ||
        msg.includes('CALL_EXCEPTION') ||
        msg.includes('could not decode result') ||
        msg.includes('BAD_DATA');
      if (!isContractMissing) {
        showError(err, 'Failed to load portfolio');
        setFetchError('Failed to load portfolio data. Please try again.');
      }
    } finally {
      setLoadingAssets(false);
    }
  }, [isConnected, address, chainId, setAssets, setLoadingAssets]);

  useEffect(() => {
    void fetchAssets();
  }, [fetchAssets]);

  // ---- Derived data --------------------------------------------------------

  const visibleWrappedAssets = useMemo(
    () => wrappedAssets.filter(hasPositiveBalance),
    [wrappedAssets],
  );

  const filteredAssets = useMemo(() => {
    let result = [...visibleWrappedAssets];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.symbol.toLowerCase().includes(q) ||
          a.address.toLowerCase().includes(q),
      );
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'balance':
          cmp =
            parseTokenAmount(a.balance || '0') -
            parseTokenAmount(b.balance || '0');
          break;
        case 'value':
          cmp =
            parseTokenAmount(a.originalValue || '0') -
            parseTokenAmount(b.originalValue || '0');
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [visibleWrappedAssets, searchQuery, sortField, sortDir]);

  // Pre-compute performance data for each filtered asset
  const performanceMap = useMemo(() => {
    const map = new Map<string, AssetPerformance>();
    for (const asset of filteredAssets) {
      map.set(asset.address, calculateAssetPerformance(asset, tradeHistory));
    }
    return map;
  }, [filteredAssets, tradeHistory]);

  const explorerBaseUrl = useMemo(() => {
    const network = chainId ? SUPPORTED_NETWORKS[chainId] : null;
    return network?.blockExplorer ?? null;
  }, [chainId]);

  // ---- Grid virtualizer (rows of 3) ----------------------------------------

  const gridRowCount = Math.ceil(filteredAssets.length / GRID_COLS);

  const gridVirtualizer = useVirtualizer({
    count: gridRowCount,
    getScrollElement: () => gridParentRef.current,
    estimateSize: () => GRID_CARD_HEIGHT,
    overscan: GRID_OVERSCAN,
  });

  // ---- Handlers ------------------------------------------------------------

  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDir('asc');
      }
    },
    [sortField],
  );

  const handleViewExplorer = useCallback(
    (asset: WrappedAsset) => {
      if (explorerBaseUrl) {
        window.open(
          `${explorerBaseUrl}/address/${asset.address}`,
          '_blank',
          'noopener,noreferrer',
        );
      }
    },
    [explorerBaseUrl],
  );

  const handleOpenTransfer = useCallback((asset: WrappedAsset) => {
    setTransferAsset(asset);
    setTransferForm({ recipient: '', amount: '' });
    setTransferError(null);
  }, []);

  const handleOpenBurn = useCallback((asset: WrappedAsset) => {
    setBurnAsset(asset);
    setBurnForm({ amount: '' });
    setBurnError(null);
  }, []);

  const handleTransferSubmit = useCallback(async () => {
    if (!transferAsset || !address || !chainId) return;

    const provider = getProvider();
    if (!provider) {
      setTransferError('Please connect your wallet before transferring.');
      return;
    }

    if (!getNetworkConfig(chainId)) {
      setTransferError(`This network is not supported for transfers. Please switch to a supported network.`);
      return;
    }

    if (!ethers.isAddress(transferForm.recipient)) {
      setTransferError('Invalid recipient address');
      return;
    }

    const parsedAmount = parseFloat(transferForm.amount);
    if (
      !transferForm.amount ||
      isNaN(parsedAmount) ||
      parsedAmount <= 0 ||
      !/^\d+(\.\d+)?$/.test(transferForm.amount.trim())
    ) {
      setTransferError('Enter a valid positive number');
      return;
    }

    const availableBalance = parseFloat(transferAsset.balance || '0');
    if (parsedAmount > availableBalance) {
      setTransferError(
        `Insufficient balance. You have ${availableBalance} ${transferAsset.symbol}`,
      );
      return;
    }

    setTransferLoading(true);
    setTransferError(null);

    try {
      const service = new ContractService(provider, chainId);

      let amountWei: bigint;
      try {
        amountWei = ethers.parseEther(transferForm.amount.trim());
      } catch {
        setTransferError('Invalid amount format');
        setTransferLoading(false);
        return;
      }
      const tx = await service.transferAsset(
        transferAsset.address,
        transferForm.recipient,
        amountWei,
      );
      await service.waitForTransaction(tx);

      const trade: TradeHistory = {
        id: `transfer-${Date.now()}`,
        type: 'transfer',
        asset: transferAsset.address,
        assetSymbol: transferAsset.symbol,
        amount: transferForm.amount,
        txHash: tx.hash,
        timestamp: Date.now(),
        from: address,
        to: transferForm.recipient,
        status: 'confirmed',
      };
      addTrade(trade);

      const currentBalance = parseFloat(transferAsset.balance || '0');
      const newBalance = Math.max(
        0,
        currentBalance - parseFloat(transferForm.amount),
      );
      updateAsset(transferAsset.address, {
        balance: newBalance.toString(),
      });

      setTransferAsset(null);
      setTransferForm({ recipient: '', amount: '' });
      setTransferError(null);

      void fetchAssets();
    } catch (err: unknown) {
      logger.error('[PortfolioPage] Transfer failed:', err);
      setTransferError(parseContractError(err));
    } finally {
      setTransferLoading(false);
    }
  }, [
    transferAsset,
    transferForm,
    address,
    chainId,
    addTrade,
    updateAsset,
    fetchAssets,
  ]);

  const handleBurnSubmit = useCallback(async () => {
    if (!burnAsset || !address || !chainId) return;

    const provider = getProvider();
    if (!provider) {
      setBurnError('Please connect your wallet before burning.');
      return;
    }

    if (!getNetworkConfig(chainId)) {
      setBurnError(`This network is not supported for burning. Please switch to a supported network.`);
      return;
    }

    const parsedBurnAmount = parseFloat(burnForm.amount);
    if (
      !burnForm.amount ||
      isNaN(parsedBurnAmount) ||
      parsedBurnAmount <= 0 ||
      !/^\d+(\.\d+)?$/.test(burnForm.amount.trim())
    ) {
      setBurnError('Enter a valid positive number');
      return;
    }

    const availableBurnBalance = parseFloat(burnAsset.balance || '0');
    if (parsedBurnAmount > availableBurnBalance) {
      setBurnError(
        `Insufficient balance. You have ${availableBurnBalance} ${burnAsset.symbol}`,
      );
      return;
    }

    setBurnLoading(true);
    setBurnError(null);

    try {
      const service = new ContractService(provider, chainId);

      let amountWei: bigint;
      try {
        amountWei = ethers.parseEther(burnForm.amount.trim());
      } catch {
        setBurnError('Invalid amount format');
        setBurnLoading(false);
        return;
      }
      const tx = await service.burnAsset(burnAsset.address, amountWei);
      await service.waitForTransaction(tx);

      const trade: TradeHistory = {
        id: `burn-${Date.now()}`,
        type: 'burn',
        asset: burnAsset.address,
        assetSymbol: burnAsset.symbol,
        amount: burnForm.amount,
        txHash: tx.hash,
        timestamp: Date.now(),
        from: address,
        to: '0x0000000000000000000000000000000000000000',
        status: 'confirmed',
      };
      addTrade(trade);

      const currentBalance = parseFloat(burnAsset.balance || '0');
      const newBalance = Math.max(
        0,
        currentBalance - parseFloat(burnForm.amount),
      );
      updateAsset(burnAsset.address, {
        balance: newBalance.toString(),
      });

      setBurnAsset(null);
      setBurnForm({ amount: '' });
      setBurnError(null);

      void fetchAssets();
    } catch (err: unknown) {
      logger.error('[PortfolioPage] Burn failed:', err);
      setBurnError(parseContractError(err));
    } finally {
      setBurnLoading(false);
    }
  }, [burnAsset, burnForm, address, chainId, addTrade, updateAsset, fetchAssets]);

  // ---- Demo mode: wallet still initialising --------------------------------

  if (isDemoActive && !isConnected) {
    if (demoWalletSettingUp || (!demoWalletReady && !demoWalletError)) {
      return (
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            <p className="text-sm text-gray-400">Setting up demo wallet…</p>
          </div>
        </div>
      );
    }

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

  // ---- Not connected -------------------------------------------------------

  if (!isConnected) {
    return (
      <div className="flex min-h-[75vh] items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 backdrop-blur-xl">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/25">
              <Wallet className="h-8 w-8 text-white" aria-hidden="true" />
            </div>
          </div>

          <h2 className="text-3xl font-bold tracking-tight text-white">
            Connect Your Wallet
          </h2>
          <p className="mx-auto mt-4 max-w-sm text-base leading-relaxed text-gray-400">
            Your tokenized assets and portfolio management tools will appear here
            once your wallet is connected.
          </p>

          <Button
            variant="primary"
            size="lg"
            icon={<Wallet className="h-4.5 w-4.5" />}
            onClick={() => void connectWallet()}
            className="mt-10"
          >
            Connect Wallet
          </Button>

          {walletError && (
            <div role="alert" className="mx-auto mt-8 max-w-sm rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-4 backdrop-blur-sm">
              <p className="text-sm text-red-400">{walletError}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---- Error state (failed to load portfolio) ------------------------------

  if (fetchError && !isLoadingAssets && wrappedAssets.length === 0) {
    return (
      <div className="w-full pt-12">
        <ErrorState
          message={fetchError}
          onRetry={() => void fetchAssets()}
        />
      </div>
    );
  }

  // ---- Connected -----------------------------------------------------------

  const portfolioValue = computePortfolioValue(visibleWrappedAssets);
  const totalLocked = computeTotalLocked(visibleWrappedAssets);
  const uniqueDocTypes = computeUniqueDocTypes(visibleWrappedAssets);
  const hasTrades = tradeHistory.length > 0;

  return (
    <div className="w-full">
      {/* ================================================================== */}
      {/* Page Header                                                        */}
      {/* ================================================================== */}
      <div className="mb-12 sm:mb-16">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Portfolio
            </h1>
            <p className="mt-3 text-base leading-relaxed text-gray-500">
              Manage your tokenized assets and track performance
            </p>
          </div>

          <div className="flex items-center gap-3">
            {address && (
              <button
                onClick={() => copyToClipboard(address)}
                className={clsx(
                  'group/badge inline-flex items-center gap-2.5 rounded-full',
                  'border border-white/[0.06] bg-[#0D0F14]/80 backdrop-blur-xl',
                  'px-4 py-2.5',
                  'transition-all duration-200',
                  'hover:border-white/[0.12] hover:bg-white/[0.04]',
                  'focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06070A]',
                )}
                aria-label={`Copy wallet address ${formatAddress(address)}`}
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500" aria-hidden="true">
                  <Wallet className="h-3 w-3 text-white" />
                </div>
                <span className="font-mono text-sm text-gray-400 transition-colors group-hover/badge:text-white">
                  {formatAddress(address)}
                </span>
                <Copy className="h-3.5 w-3.5 text-gray-600 transition-colors group-hover/badge:text-gray-400" aria-hidden="true" />
              </button>
            )}

            <Button
              variant="primary"
              size="lg"
              icon={<ArrowUpRight className="h-4 w-4" />}
              onClick={() => navigate('/mint')}
            >
              Mint New Asset
            </Button>
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* Performance Metrics                                                */}
      {/* ================================================================== */}
      {!isLoadingAssets && visibleWrappedAssets.length > 0 && (
        <div className="mb-12 sm:mb-16">
          <PerformanceMetrics
            assets={visibleWrappedAssets}
            trades={tradeHistory}
          />
        </div>
      )}

      {/* ================================================================== */}
      {/* Summary Stats Row                                                  */}
      {/* ================================================================== */}
      <div className="mb-12 sm:mb-16">
        {isLoadingAssets ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-4 lg:gap-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonStatCard key={i} />
            ))}
          </div>
        ) : (
          <div
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-4 lg:gap-8"
            role="group"
            aria-label="Portfolio summary statistics"
          >
            {/* Portfolio Value */}
            <div
              className={clsx(
                'relative overflow-hidden rounded-2xl',
                'bg-[#0D0F14]/80 backdrop-blur-xl',
                'border border-white/[0.06]',
                'p-4 sm:p-7 md:p-9',
                'transition-all duration-300 ease-out',
                'hover:-translate-y-0.5 hover:border-white/[0.10] hover:shadow-lg hover:shadow-black/20',
              )}
              role="group"
              aria-label={`Portfolio Value: ${portfolioValue}`}
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 ring-1 ring-white/[0.06]">
                  <DollarSign className="h-4.5 w-4.5 text-indigo-400" aria-hidden="true" />
                </div>
                <p className="truncate text-xs font-medium uppercase tracking-wider text-gray-500">
                  Portfolio Value
                </p>
              </div>
              <p className="mt-6 text-3xl font-bold tracking-tight text-white">
                {portfolioValue}
              </p>
            </div>

            {/* Total Assets */}
            <div
              className={clsx(
                'relative overflow-hidden rounded-2xl',
                'bg-[#0D0F14]/80 backdrop-blur-xl',
                'border border-white/[0.06]',
                'p-4 sm:p-7 md:p-9',
                'transition-all duration-300 ease-out',
                'hover:-translate-y-0.5 hover:border-white/[0.10] hover:shadow-lg hover:shadow-black/20',
              )}
              role="group"
              aria-label={`Total Assets: ${visibleWrappedAssets.length}`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 ring-1 ring-white/[0.06]">
                  <Layers className="h-4.5 w-4.5 text-violet-400" aria-hidden="true" />
                </div>
                <p className="truncate text-xs font-medium uppercase tracking-wider text-gray-500">
                  Total Assets
                </p>
              </div>
              <p className="mt-6 text-3xl font-bold tracking-tight text-white">
                {visibleWrappedAssets.length}
              </p>
            </div>

            {/* Total Locked */}
            <div
              className={clsx(
                'relative overflow-hidden rounded-2xl',
                'bg-[#0D0F14]/80 backdrop-blur-xl',
                'border border-white/[0.06]',
                'p-4 sm:p-7 md:p-9',
                'transition-all duration-300 ease-out',
                'hover:-translate-y-0.5 hover:border-white/[0.10] hover:shadow-lg hover:shadow-black/20',
              )}
              role="group"
              aria-label={`Total Locked: ${totalLocked}`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 ring-1 ring-white/[0.06]">
                  <Lock className="h-4.5 w-4.5 text-emerald-400" aria-hidden="true" />
                </div>
                <p className="truncate text-xs font-medium uppercase tracking-wider text-gray-500">
                  Total Locked
                </p>
              </div>
              <p className="mt-6 text-3xl font-bold tracking-tight text-white">
                {totalLocked}
              </p>
            </div>

            {/* Document Types */}
            <div
              className={clsx(
                'relative overflow-hidden rounded-2xl',
                'bg-[#0D0F14]/80 backdrop-blur-xl',
                'border border-white/[0.06]',
                'p-4 sm:p-7 md:p-9',
                'transition-all duration-300 ease-out',
                'hover:-translate-y-0.5 hover:border-white/[0.10] hover:shadow-lg hover:shadow-black/20',
              )}
              role="group"
              aria-label={`Document Types: ${uniqueDocTypes}`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 ring-1 ring-white/[0.06]">
                  <FileText className="h-4.5 w-4.5 text-amber-400" aria-hidden="true" />
                </div>
                <p className="truncate text-xs font-medium uppercase tracking-wider text-gray-500">
                  Document Types
                </p>
              </div>
              <p className="mt-6 text-3xl font-bold tracking-tight text-white">
                {uniqueDocTypes}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================== */}
      {/* Charts Section                                                     */}
      {/* ================================================================== */}
      {(visibleWrappedAssets.length > 0 || isLoadingAssets) && (
        <div className="mb-12 sm:mb-16 grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-2">
          <PortfolioValueChart
            assets={visibleWrappedAssets}
            isLoading={isLoadingAssets}
          />
          <AssetAllocationChart
            assets={visibleWrappedAssets}
            isLoading={isLoadingAssets}
          />
        </div>
      )}

      {/* ================================================================== */}
      {/* Search / Filter / Sort Bar                                         */}
      {/* ================================================================== */}
      <div className="mb-12 sm:mb-16">
        <div
          className={clsx(
            'rounded-2xl border border-white/[0.06] bg-[#0D0F14]/80 backdrop-blur-xl',
            'p-4 sm:p-7 md:p-9',
          )}
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            {/* Search */}
            <div className="relative flex-1">
              <label htmlFor="asset-search" className="sr-only">Search assets</label>
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
              <input
                id="asset-search"
                type="search"
                placeholder="Search by name, symbol, or address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search assets"
                className={clsx(
                  'w-full rounded-xl border border-white/[0.06] bg-white/[0.03] py-3.5 pl-12 pr-4',
                  'text-sm text-white placeholder-gray-500',
                  'transition-all duration-200',
                  'focus:border-indigo-500/40 focus:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-indigo-500/40',
                )}
              />
            </div>

            {/* Sort pills + view toggle */}
            <div className="flex items-center gap-2.5">
              <Filter className="hidden h-4 w-4 text-gray-600 sm:block" aria-hidden="true" />
              {(['name', 'balance', 'value'] as SortField[]).map((field) => (
                <button
                  key={field}
                  onClick={() => toggleSort(field)}
                  aria-label={`Sort by ${field}${sortField === field ? (sortDir === 'asc' ? ', ascending' : ', descending') : ''}`}
                  aria-pressed={sortField === field}
                  className={clsx(
                    'inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-medium capitalize transition-all duration-200',
                    sortField === field
                      ? 'bg-gradient-to-r from-indigo-500/20 to-violet-500/20 text-indigo-400 shadow-sm shadow-indigo-500/10'
                      : 'bg-white/[0.03] text-gray-500 hover:bg-white/[0.06] hover:text-gray-300',
                    'focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0D0F14]',
                  )}
                >
                  {field}
                  {sortField === field && (
                    <span className="inline-flex">
                      {sortDir === 'asc' ? (
                        <ChevronUp className="inline h-3 w-3" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="inline h-3 w-3" aria-hidden="true" />
                      )}
                    </span>
                  )}
                </button>
              ))}

              <div className="mx-2 h-5 w-px bg-white/[0.06]" aria-hidden="true" />

              {/* View toggle */}
              <button
                onClick={() => setViewMode('grid')}
                className={clsx(
                  'rounded-lg p-2.5 transition-all duration-200',
                  viewMode === 'grid'
                    ? 'bg-white/[0.08] text-white'
                    : 'text-gray-600 hover:text-gray-400',
                  'focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0D0F14]',
                )}
                aria-label="Grid view"
                aria-pressed={viewMode === 'grid'}
              >
                <LayoutGrid className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={clsx(
                  'rounded-lg p-2.5 transition-all duration-200',
                  viewMode === 'list'
                    ? 'bg-white/[0.08] text-white'
                    : 'text-gray-600 hover:text-gray-400',
                  'focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0D0F14]',
                )}
                aria-label="List view"
                aria-pressed={viewMode === 'list'}
              >
                <List className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* Asset Display -- Grid or Table                                     */}
      {/* ================================================================== */}
      <ComponentErrorBoundary name="AssetList">
      {viewMode === 'list' ? (
        /* Table view using the HoldingsTable sub-component */
        <div className="mb-12 sm:mb-16">
          <HoldingsTable
            assets={filteredAssets}
            trades={tradeHistory}
            isLoading={isLoadingAssets}
            onTransfer={handleOpenTransfer}
            onBurn={handleOpenBurn}
            onViewExplorer={handleViewExplorer}
            onMintNew={() => navigate('/mint')}
          />
        </div>
      ) : isLoadingAssets ? (
        /* Skeleton loaders for grid view */
        <div
          className={clsx(
            'grid mb-12 sm:mb-16',
            'gap-6 sm:gap-8 lg:gap-8',
            'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
          )}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : filteredAssets.length === 0 ? (
        /* Empty state */
        <div className="py-6 mb-12 sm:mb-16">
          <EmptyState
            icon={<Package className="h-8 w-8" />}
            title={
              searchQuery
                ? 'No assets match your search'
                : wrappedAssets.length > 0
                  ? 'No assets with a non-zero balance'
                  : 'No tokenized assets yet'
            }
            description={
              searchQuery
                ? 'Try adjusting your search query or clearing filters.'
                : wrappedAssets.length > 0
                  ? 'Your wallet currently holds zero units of all tracked assets. Mint or receive tokens to populate this view.'
                  : 'Upload a document and mint your first wrapped asset to get started.'
            }
            action={
              !searchQuery ? (
                <Button
                  variant="primary"
                  size="lg"
                  icon={<ArrowUpRight className="h-4 w-4" />}
                  onClick={() => navigate('/mint')}
                >
                  Mint Your First Asset
                </Button>
              ) : undefined
            }
            className="min-h-[340px]"
          />
        </div>
      ) : (
        /* Virtualized grid view */
        <div className="mb-12 sm:mb-16">
          <div
            ref={gridParentRef}
            className="overflow-y-auto"
            style={{ maxHeight: GRID_SCROLL_HEIGHT }}
          >
            <div
              style={{
                height: `${gridVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {gridVirtualizer.getVirtualItems().map((virtualRow) => {
                const rowStart = virtualRow.index * GRID_COLS;
                const rowAssets = filteredAssets.slice(rowStart, rowStart + GRID_COLS);

                return (
                  <div
                    key={virtualRow.index}
                    className="absolute left-0 top-0 w-full"
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div
                      className={clsx(
                        'grid h-full',
                        'gap-6 sm:gap-8 lg:gap-8',
                        'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
                        'pb-6 sm:pb-8',
                      )}
                    >
                      {rowAssets.map((asset) => (
                        <AssetGridCard
                          key={asset.address}
                          asset={asset}
                          isExpanded={expandedAsset === asset.address}
                          onToggleExpand={() =>
                            setExpandedAsset(
                              expandedAsset === asset.address ? null : asset.address,
                            )
                          }
                          onTransfer={handleOpenTransfer}
                          onBurn={handleOpenBurn}
                          onViewExplorer={handleViewExplorer}
                          performance={performanceMap.get(asset.address)}
                          hasTrades={hasTrades}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      </ComponentErrorBoundary>

      {/* ================================================================== */}
      {/* Transaction History Section                                        */}
      {/* ================================================================== */}
      <div className="mb-12 sm:mb-16">
        <TransactionHistory
          trades={tradeHistory}
          isLoading={isLoadingAssets && tradeHistory.length === 0}
          explorerBaseUrl={explorerBaseUrl ?? undefined}
          onMintNew={() => navigate('/mint')}
        />
      </div>

      {/* ================================================================== */}
      {/* Transfer Modal                                                     */}
      {/* ================================================================== */}
      <Modal
        isOpen={transferAsset !== null}
        onClose={() => {
          if (!transferLoading) {
            setTransferAsset(null);
            setTransferError(null);
          }
        }}
        title={`Transfer ${transferAsset?.symbol ?? ''}`}
        size="md"
      >
        {transferAsset && (
          <div className="space-y-6">
            <div className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent" />
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
                Available Balance
              </p>
              <p className="mt-2 text-2xl font-bold text-white">
                {formatBalance(transferAsset.balance)}{' '}
                <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-sm font-semibold text-transparent">
                  {transferAsset.symbol}
                </span>
              </p>
            </div>

            <div>
              <label htmlFor="transfer-recipient" className="mb-3 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                Recipient Address
              </label>
              <input
                id="transfer-recipient"
                type="text"
                placeholder="0x..."
                value={transferForm.recipient}
                onChange={(e) =>
                  setTransferForm((f) => ({
                    ...f,
                    recipient: e.target.value,
                  }))
                }
                disabled={transferLoading}
                aria-invalid={transferError?.includes('recipient') || transferError?.includes('address') ? true : undefined}
                className={clsx(
                  'w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3.5',
                  'font-mono text-sm text-white placeholder-gray-500',
                  'transition-all duration-200',
                  'focus:border-indigo-500/40 focus:bg-white/[0.05] focus:outline-none focus:ring-1 focus:ring-indigo-500/40',
                  'disabled:cursor-not-allowed disabled:opacity-40',
                )}
              />
            </div>

            <div>
              <label htmlFor="transfer-amount" className="mb-3 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                Amount
              </label>
              <div className="relative">
                <input
                  id="transfer-amount"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0.0"
                  value={transferForm.amount}
                  onChange={(e) =>
                    setTransferForm((f) => ({
                      ...f,
                      amount: e.target.value,
                    }))
                  }
                  disabled={transferLoading}
                  className={clsx(
                    'w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3.5 pr-20',
                    'text-sm text-white placeholder-gray-500',
                    'transition-all duration-200',
                    'focus:border-indigo-500/40 focus:bg-white/[0.05] focus:outline-none focus:ring-1 focus:ring-indigo-500/40',
                    'disabled:cursor-not-allowed disabled:opacity-40',
                  )}
                />
                <button
                  type="button"
                  onClick={() =>
                    setTransferForm((f) => ({
                      ...f,
                      amount: transferAsset.balance || '0',
                    }))
                  }
                  disabled={transferLoading}
                  aria-label="Set maximum transfer amount"
                  className={clsx(
                    'absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-3 py-1.5',
                    'bg-gradient-to-r from-indigo-500/20 to-violet-500/20',
                    'text-xs font-bold tracking-wide text-indigo-400',
                    'transition-all duration-200 hover:from-indigo-500/30 hover:to-violet-500/30',
                    'disabled:opacity-40',
                  )}
                >
                  MAX
                </button>
              </div>
            </div>

            {transferError && (
              <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/[0.08] px-5 py-4">
                <p className="text-sm text-red-400">{transferError}</p>
              </div>
            )}

            <Button
              variant="primary"
              fullWidth
              loading={transferLoading}
              disabled={!transferForm.recipient || !transferForm.amount || transferLoading}
              onClick={handleTransferSubmit}
              className="mt-2"
            >
              Send Tokens
            </Button>
          </div>
        )}
      </Modal>

      {/* ================================================================== */}
      {/* Burn Modal                                                         */}
      {/* ================================================================== */}
      <Modal
        isOpen={burnAsset !== null}
        onClose={() => {
          if (!burnLoading) {
            setBurnAsset(null);
            setBurnError(null);
          }
        }}
        title={`Burn ${burnAsset?.symbol ?? ''}`}
        size="sm"
      >
        {burnAsset && (
          <div className="space-y-6">
            <div className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/30 to-transparent" />
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
                Available Balance
              </p>
              <p className="mt-2 text-2xl font-bold text-white">
                {formatBalance(burnAsset.balance)}{' '}
                <span className="text-sm font-semibold text-red-400">
                  {burnAsset.symbol}
                </span>
              </p>
            </div>

            <div role="alert" className="flex items-start gap-4 rounded-xl border border-red-500/20 bg-red-500/[0.06] p-5">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-500/20">
                <AlertTriangle className="h-4 w-4 text-red-400" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-red-400">
                  Irreversible Action
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-red-400/70">
                  Burning tokens permanently removes them from circulation.
                  This action cannot be undone.
                </p>
              </div>
            </div>

            <div>
              <label htmlFor="burn-amount" className="mb-3 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                Amount to Burn
              </label>
              <div className="relative">
                <input
                  id="burn-amount"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0.0"
                  value={burnForm.amount}
                  onChange={(e) =>
                    setBurnForm({ amount: e.target.value })
                  }
                  disabled={burnLoading}
                  className={clsx(
                    'w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3.5 pr-20',
                    'text-sm text-white placeholder-gray-500',
                    'transition-all duration-200',
                    'focus:border-red-500/40 focus:bg-white/[0.05] focus:outline-none focus:ring-1 focus:ring-red-500/40',
                    'disabled:cursor-not-allowed disabled:opacity-40',
                  )}
                />
                <button
                  type="button"
                  onClick={() =>
                    setBurnForm({
                      amount: burnAsset.balance || '0',
                    })
                  }
                  disabled={burnLoading}
                  aria-label="Set maximum burn amount"
                  className={clsx(
                    'absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-3 py-1.5',
                    'bg-red-500/15 text-xs font-bold tracking-wide text-red-400',
                    'transition-all duration-200 hover:bg-red-500/25',
                    'disabled:opacity-40',
                  )}
                >
                  MAX
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-4">
              <span className="text-sm text-gray-500">Contract</span>
              <button
                onClick={() => copyToClipboard(burnAsset.address)}
                aria-label={`Copy contract address ${formatAddress(burnAsset.address)}`}
                className="flex items-center gap-2 font-mono text-sm text-gray-400 transition-colors hover:text-white"
              >
                {formatAddress(burnAsset.address)}
                <Copy className="h-3.5 w-3.5 text-gray-600" aria-hidden="true" />
              </button>
            </div>

            {burnError && (
              <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/[0.08] px-5 py-4">
                <p className="text-sm text-red-400">{burnError}</p>
              </div>
            )}

            <Button
              variant="danger"
              fullWidth
              loading={burnLoading}
              disabled={!burnForm.amount || burnLoading}
              onClick={handleBurnSubmit}
              className="mt-2"
            >
              Confirm Burn
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
