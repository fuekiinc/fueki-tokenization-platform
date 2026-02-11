import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  Search,
  Filter,
  Wallet,
  Package,
  ArrowUpRight,
  Copy,
  Send,
  Flame,
  ExternalLink,
  LayoutGrid,
  List,
  AlertTriangle,
  Lock,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Layers,
  FileText,
} from 'lucide-react';
import { ethers } from 'ethers';
import { ContractService } from '../lib/blockchain/contracts';
import { useWallet } from '../hooks/useWallet';
import { useAppStore, getProvider } from '../store/useAppStore';
import { Modal, Button, EmptyState } from '../components/Common';
import { formatBalance, formatAddress, copyToClipboard } from '../lib/utils/helpers';
import { SUPPORTED_NETWORKS } from '../contracts/addresses';
import type { WrappedAsset, TradeHistory } from '../types/index';

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
    (sum, a) => sum + parseFloat(a.originalValue || '0'),
    0,
  );
  return total.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function computeTotalLocked(assets: WrappedAsset[]): string {
  const total = assets.reduce(
    (sum, a) => sum + parseFloat(a.balance || '0'),
    0,
  );
  return total.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

function computeUniqueDocTypes(assets: WrappedAsset[]): number {
  const types = new Set(
    assets.map((a) => (a.documentType ?? '').toLowerCase()).filter(Boolean),
  );
  return types.size;
}

// ---------------------------------------------------------------------------
// Skeleton Loader
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0D0F14]/80 p-7 sm:p-9">
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
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0D0F14]/80 p-7 sm:p-9">
      <div className="flex items-center gap-3">
        <div className="shimmer h-10 w-10 rounded-xl" />
        <div className="shimmer h-3 w-20 rounded" />
      </div>
      <div className="shimmer mt-5 h-8 w-32 rounded" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PortfolioPage() {
  const navigate = useNavigate();
  const { isConnected, address, chainId, connectWallet, error: walletError } = useWallet();
  const wrappedAssets = useAppStore((s) => s.wrappedAssets);
  const isLoadingAssets = useAppStore((s) => s.isLoadingAssets);
  const setAssets = useAppStore((s) => s.setAssets);
  const setLoadingAssets = useAppStore((s) => s.setLoadingAssets);
  const addTrade = useAppStore((s) => s.addTrade);
  const updateAsset = useAppStore((s) => s.updateAsset);

  // ---- UI state ------------------------------------------------------------

  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [expandedAsset, setExpandedAsset] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

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
    if (!provider) return;

    setLoadingAssets(true);
    try {
      const service = new ContractService(provider, chainId);
      const assetAddresses = await service.getUserAssets(address);

      const assets: WrappedAsset[] = await Promise.all(
        assetAddresses.map(async (addr) => {
          const details = await service.getAssetDetails(addr);
          const balanceWei = await service.getAssetBalance(addr, address);
          return {
            address: addr,
            name: details.name,
            symbol: details.symbol,
            totalSupply: ethers.formatEther(details.totalSupply),
            balance: ethers.formatEther(balanceWei),
            documentHash: details.documentHash,
            documentType: details.documentType,
            originalValue: ethers.formatEther(details.originalValue),
          };
        }),
      );

      setAssets(assets);
    } catch (err) {
      console.error('Failed to fetch portfolio assets:', err);
    } finally {
      setLoadingAssets(false);
    }
  }, [isConnected, address, chainId, setAssets, setLoadingAssets]);

  useEffect(() => {
    void fetchAssets();
  }, [fetchAssets]);

  // ---- Derived data --------------------------------------------------------

  const filteredAssets = useMemo(() => {
    let result = [...wrappedAssets];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.symbol.toLowerCase().includes(q) ||
          a.address.toLowerCase().includes(q),
      );
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'balance':
          cmp = parseFloat(a.balance || '0') - parseFloat(b.balance || '0');
          break;
        case 'value':
          cmp =
            parseFloat(a.originalValue || '0') -
            parseFloat(b.originalValue || '0');
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [wrappedAssets, searchQuery, sortField, sortDir]);

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
      const network = chainId ? SUPPORTED_NETWORKS[chainId] : null;
      if (network?.blockExplorer) {
        window.open(
          `${network.blockExplorer}/address/${asset.address}`,
          '_blank',
        );
      }
    },
    [chainId],
  );

  const handleTransferSubmit = useCallback(async () => {
    if (!transferAsset || !address || !chainId) return;

    const provider = getProvider();
    if (!provider) {
      setTransferError('Wallet provider not available');
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

      // Record trade in store
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

      // Optimistic local balance update
      const currentBalance = parseFloat(transferAsset.balance || '0');
      const newBalance = Math.max(
        0,
        currentBalance - parseFloat(transferForm.amount),
      );
      updateAsset(transferAsset.address, {
        balance: newBalance.toString(),
      });

      // Close modal and reset form
      setTransferAsset(null);
      setTransferForm({ recipient: '', amount: '' });
      setTransferError(null);

      // Refresh on-chain balances in the background
      void fetchAssets();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Transfer failed';
      setTransferError(message);
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
      setBurnError('Wallet provider not available');
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

      // Record trade in store
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

      // Optimistic local balance update
      const currentBalance = parseFloat(burnAsset.balance || '0');
      const newBalance = Math.max(
        0,
        currentBalance - parseFloat(burnForm.amount),
      );
      updateAsset(burnAsset.address, {
        balance: newBalance.toString(),
      });

      // Close modal and reset form
      setBurnAsset(null);
      setBurnForm({ amount: '' });
      setBurnError(null);

      // Refresh on-chain balances in the background
      void fetchAssets();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Burn failed';
      setBurnError(message);
    } finally {
      setBurnLoading(false);
    }
  }, [burnAsset, burnForm, address, chainId, addTrade, updateAsset, fetchAssets]);

  // ---- Not connected -------------------------------------------------------

  if (!isConnected) {
    return (
      <div className="flex min-h-[75vh] items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          {/* Gradient icon */}
          <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 backdrop-blur-xl">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/25">
              <Wallet className="h-8 w-8 text-white" />
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
            <div className="mx-auto mt-8 max-w-sm rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-4 backdrop-blur-sm">
              <p className="text-sm text-red-400">{walletError}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---- Connected -----------------------------------------------------------

  const portfolioValue = computePortfolioValue(wrappedAssets);
  const totalLocked = computeTotalLocked(wrappedAssets);
  const uniqueDocTypes = computeUniqueDocTypes(wrappedAssets);

  return (
    <div className="w-full">
      {/* ================================================================== */}
      {/* Page Header                                                        */}
      {/* ================================================================== */}
      <div className="mb-12 sm:mb-16">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          {/* Left: Title and subtitle */}
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Portfolio
            </h1>
            <p className="mt-3 text-base leading-relaxed text-gray-500">
              Manage your tokenized assets and track performance
            </p>
          </div>

          {/* Right: Wallet address badge and mint CTA */}
          <div className="flex items-center gap-3">
            {/* Wallet badge */}
            {address && (
              <button
                onClick={() => copyToClipboard(address)}
                className={clsx(
                  'group/badge inline-flex items-center gap-2.5 rounded-full',
                  'border border-white/[0.06] bg-[#0D0F14]/80 backdrop-blur-xl',
                  'px-4 py-2.5',
                  'transition-all duration-200',
                  'hover:border-white/[0.12] hover:bg-white/[0.04]',
                )}
                title="Click to copy address"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500">
                  <Wallet className="h-3 w-3 text-white" />
                </div>
                <span className="font-mono text-sm text-gray-400 transition-colors group-hover/badge:text-white">
                  {formatAddress(address)}
                </span>
                <Copy className="h-3.5 w-3.5 text-gray-600 transition-colors group-hover/badge:text-gray-400" />
              </button>
            )}

            {/* Mint new asset button */}
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
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-4 lg:gap-8">
            {/* Portfolio Value */}
            <div
              className={clsx(
                'relative overflow-hidden rounded-2xl',
                'bg-[#0D0F14]/80 backdrop-blur-xl',
                'border border-white/[0.06]',
                'p-7 sm:p-9',
                'transition-all duration-300 ease-out',
                'hover:-translate-y-0.5 hover:border-white/[0.10] hover:shadow-lg hover:shadow-black/20',
              )}
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 ring-1 ring-white/[0.06]">
                  <DollarSign className="h-4.5 w-4.5 text-indigo-400" />
                </div>
                <p className="truncate text-xs font-medium uppercase tracking-wider text-gray-500">
                  Portfolio Value
                </p>
              </div>
              <p className="mt-6 text-3xl font-bold tracking-tight text-white">
                ${portfolioValue}
              </p>
            </div>

            {/* Total Assets */}
            <div
              className={clsx(
                'relative overflow-hidden rounded-2xl',
                'bg-[#0D0F14]/80 backdrop-blur-xl',
                'border border-white/[0.06]',
                'p-7 sm:p-9',
                'transition-all duration-300 ease-out',
                'hover:-translate-y-0.5 hover:border-white/[0.10] hover:shadow-lg hover:shadow-black/20',
              )}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 ring-1 ring-white/[0.06]">
                  <Layers className="h-4.5 w-4.5 text-violet-400" />
                </div>
                <p className="truncate text-xs font-medium uppercase tracking-wider text-gray-500">
                  Total Assets
                </p>
              </div>
              <p className="mt-6 text-3xl font-bold tracking-tight text-white">
                {wrappedAssets.length}
              </p>
            </div>

            {/* Total Locked */}
            <div
              className={clsx(
                'relative overflow-hidden rounded-2xl',
                'bg-[#0D0F14]/80 backdrop-blur-xl',
                'border border-white/[0.06]',
                'p-7 sm:p-9',
                'transition-all duration-300 ease-out',
                'hover:-translate-y-0.5 hover:border-white/[0.10] hover:shadow-lg hover:shadow-black/20',
              )}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 ring-1 ring-white/[0.06]">
                  <Lock className="h-4.5 w-4.5 text-emerald-400" />
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
                'p-7 sm:p-9',
                'transition-all duration-300 ease-out',
                'hover:-translate-y-0.5 hover:border-white/[0.10] hover:shadow-lg hover:shadow-black/20',
              )}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 ring-1 ring-white/[0.06]">
                  <FileText className="h-4.5 w-4.5 text-amber-400" />
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
      {/* Search / Filter / Sort Bar                                         */}
      {/* ================================================================== */}
      <div className="mb-12 sm:mb-16">
        <div
          className={clsx(
            'rounded-2xl border border-white/[0.06] bg-[#0D0F14]/80 backdrop-blur-xl',
            'p-7 sm:p-9',
          )}
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                placeholder="Search by name, symbol, or address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={clsx(
                  'w-full rounded-xl border border-white/[0.06] bg-white/[0.03] py-3.5 pl-12 pr-4',
                  'text-sm text-white placeholder-gray-600',
                  'transition-all duration-200',
                  'focus:border-indigo-500/40 focus:bg-white/[0.05] focus:outline-none focus:ring-1 focus:ring-indigo-500/40',
                )}
              />
            </div>

            {/* Sort pills + view toggle */}
            <div className="flex items-center gap-2.5">
              <Filter className="hidden h-4 w-4 text-gray-600 sm:block" />
              {(['name', 'balance', 'value'] as SortField[]).map((field) => (
                <button
                  key={field}
                  onClick={() => toggleSort(field)}
                  className={clsx(
                    'inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-medium capitalize transition-all duration-200',
                    sortField === field
                      ? 'bg-gradient-to-r from-indigo-500/20 to-violet-500/20 text-indigo-400 shadow-sm shadow-indigo-500/10'
                      : 'bg-white/[0.03] text-gray-500 hover:bg-white/[0.06] hover:text-gray-300',
                  )}
                >
                  {field}
                  {sortField === field && (
                    <span className="inline-flex">
                      {sortDir === 'asc' ? (
                        <ChevronUp className="inline h-3 w-3" />
                      ) : (
                        <ChevronDown className="inline h-3 w-3" />
                      )}
                    </span>
                  )}
                </button>
              ))}

              {/* Divider */}
              <div className="mx-2 h-5 w-px bg-white/[0.06]" />

              {/* View toggle */}
              <button
                onClick={() => setViewMode('grid')}
                className={clsx(
                  'rounded-lg p-2.5 transition-all duration-200',
                  viewMode === 'grid'
                    ? 'bg-white/[0.08] text-white'
                    : 'text-gray-600 hover:text-gray-400',
                )}
                title="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={clsx(
                  'rounded-lg p-2.5 transition-all duration-200',
                  viewMode === 'list'
                    ? 'bg-white/[0.08] text-white'
                    : 'text-gray-600 hover:text-gray-400',
                )}
                title="List view"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* Asset Grid                                                         */}
      {/* ================================================================== */}
      {isLoadingAssets ? (
        /* Skeleton loaders */
        <div
          className={clsx(
            'grid',
            'gap-6 sm:gap-8 lg:gap-8',
            viewMode === 'grid'
              ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
              : 'grid-cols-1',
          )}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : filteredAssets.length === 0 ? (
        /* Empty state -- spacious with generous vertical padding */
        <div className="py-6">
          <EmptyState
            icon={<Package className="h-8 w-8" />}
            title={
              searchQuery
                ? 'No assets match your search'
                : 'No tokenized assets yet'
            }
            description={
              searchQuery
                ? 'Try adjusting your search query or clearing filters.'
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
        <div
          className={clsx(
            'grid',
            'gap-6 sm:gap-8 lg:gap-8',
            viewMode === 'grid'
              ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
              : 'grid-cols-1',
          )}
        >
          {filteredAssets.map((asset) => {
            const isExpanded = expandedAsset === asset.address;
            const tokenInitials = (asset.name ?? '')
              .split(/\s+/)
              .slice(0, 2)
              .map((w) => w.charAt(0).toUpperCase())
              .join('') || '??';
            const gradient = getTokenGradient(asset.name ?? '');
            const balanceFormatted = formatBalance(asset.balance ?? '0');
            const valueFormatted = formatBalance(asset.originalValue ?? '0');
            const docType = (asset.documentType ?? '').toUpperCase();

            return (
              <div
                key={asset.address}
                onClick={() =>
                  setExpandedAsset(isExpanded ? null : asset.address)
                }
                className={clsx(
                  'group relative cursor-pointer overflow-hidden rounded-2xl',
                  'border border-white/[0.06]',
                  'bg-[#0D0F14]/80 backdrop-blur-xl',
                  'transition-all duration-300 ease-out',
                  'hover:-translate-y-0.5 hover:border-white/[0.10]',
                  'hover:shadow-[0_8px_40px_-8px_rgba(99,102,241,0.10)]',
                )}
              >
                {/* Top gradient hover line */}
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                <div className="p-7 sm:p-9">
                  {/* Header row */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      {/* Token gradient circle */}
                      <div
                        className={clsx(
                          'flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br',
                          gradient,
                          'text-sm font-bold text-white shadow-lg',
                        )}
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

                    {/* Document type badge */}
                    {docType && (
                      <span
                        className={clsx(
                          'inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide',
                          getDocBadgeClasses(asset.documentType ?? ''),
                        )}
                      >
                        {docType}
                      </span>
                    )}
                  </div>

                  {/* Balance / Value rows */}
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
                        ${valueFormatted}
                      </span>
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
                          className="flex items-center gap-1.5 font-mono text-xs text-gray-500 transition-colors hover:text-white"
                        >
                          <span className="max-w-[160px] truncate">
                            {asset.documentHash}
                          </span>
                          <Copy className="h-3 w-3 shrink-0 text-gray-600" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="mt-8 flex gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setTransferAsset(asset);
                        setTransferForm({ recipient: '', amount: '' });
                        setTransferError(null);
                      }}
                      className={clsx(
                        'flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3',
                        'border border-indigo-500/10 bg-indigo-500/[0.06] text-sm font-medium text-indigo-400',
                        'transition-all duration-200 hover:border-indigo-500/25 hover:bg-indigo-500/[0.12] hover:shadow-sm hover:shadow-indigo-500/10',
                      )}
                    >
                      <Send className="h-3.5 w-3.5" />
                      Transfer
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setBurnAsset(asset);
                        setBurnForm({ amount: '' });
                        setBurnError(null);
                      }}
                      className={clsx(
                        'flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3',
                        'border border-red-500/10 bg-red-500/[0.06] text-sm font-medium text-red-400',
                        'transition-all duration-200 hover:border-red-500/25 hover:bg-red-500/[0.12] hover:shadow-sm hover:shadow-red-500/10',
                      )}
                    >
                      <Flame className="h-3.5 w-3.5" />
                      Burn
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewExplorer(asset);
                      }}
                      className={clsx(
                        'flex items-center justify-center rounded-xl px-3.5 py-3',
                        'border border-white/[0.06] bg-white/[0.03] text-gray-500',
                        'transition-all duration-200 hover:border-white/[0.10] hover:bg-white/[0.06] hover:text-gray-300',
                      )}
                      title="View on Explorer"
                    >
                      <ExternalLink className="h-4 w-4" />
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
                        value={`$${valueFormatted}`}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
            {/* Balance display */}
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

            {/* Recipient */}
            <div>
              <label className="mb-3 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                Recipient Address
              </label>
              <input
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
                className={clsx(
                  'w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3.5',
                  'font-mono text-sm text-white placeholder-gray-600',
                  'transition-all duration-200',
                  'focus:border-indigo-500/40 focus:bg-white/[0.05] focus:outline-none focus:ring-1 focus:ring-indigo-500/40',
                  'disabled:cursor-not-allowed disabled:opacity-40',
                )}
              />
            </div>

            {/* Amount */}
            <div>
              <label className="mb-3 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                Amount
              </label>
              <div className="relative">
                <input
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
                    'text-sm text-white placeholder-gray-600',
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

            {/* Error */}
            {transferError && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/[0.08] px-5 py-4">
                <p className="text-sm text-red-400">{transferError}</p>
              </div>
            )}

            {/* Submit */}
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
            {/* Balance display (red accent) */}
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

            {/* Warning banner */}
            <div className="flex items-start gap-4 rounded-xl border border-red-500/20 bg-red-500/[0.06] p-5">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-500/20">
                <AlertTriangle className="h-4 w-4 text-red-400" />
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

            {/* Amount */}
            <div>
              <label className="mb-3 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                Amount to Burn
              </label>
              <div className="relative">
                <input
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
                    'text-sm text-white placeholder-gray-600',
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

            {/* Contract reference */}
            <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-4">
              <span className="text-sm text-gray-500">Contract</span>
              <button
                onClick={() => copyToClipboard(burnAsset.address)}
                className="flex items-center gap-2 font-mono text-sm text-gray-400 transition-colors hover:text-white"
              >
                {formatAddress(burnAsset.address)}
                <Copy className="h-3.5 w-3.5 text-gray-600" />
              </button>
            </div>

            {/* Error */}
            {burnError && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/[0.08] px-5 py-4">
                <p className="text-sm text-red-400">{burnError}</p>
              </div>
            )}

            {/* Submit */}
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

// ---------------------------------------------------------------------------
// Sub-component: Detail Row
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
            mono && 'font-mono',
          )}
          title={value}
        >
          <span className="truncate">{value}</span>
          <Copy className="h-3.5 w-3.5 shrink-0 text-gray-600" />
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
