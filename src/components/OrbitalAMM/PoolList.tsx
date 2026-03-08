/**
 * PoolList -- Displays all Orbital AMM pools in a card/table layout.
 *
 * Fetches every pool address from the OrbitalFactory, then loads each
 * pool's on-chain data (tokens, reserves, concentration, fee tier, TVL).
 * Clicking a pool emits `onSelectPool` so the parent can navigate the
 * user into the swap or liquidity tab pre-configured for that pool.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  AlertCircle,
  ArrowUpDown,
  ChevronRight,
  Droplets,
  Layers,
  Loader2,
  Orbit,
  RefreshCw,
  Search,
  TrendingUp,
} from 'lucide-react';
import { OrbitalContractService } from '../../lib/blockchain/orbitalContracts';
import { formatAddress, formatBalance } from '../../lib/utils/helpers';
import { formatCompact, formatPercent, formatTokenAmount } from '../../lib/formatters';
import { InfoTooltip } from '../Common/Tooltip';
import { TOOLTIPS } from '../../lib/tooltipContent';
import logger from '../../lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PoolData {
  address: string;
  tokens: string[];
  tokenSymbols: string[];
  reserves: bigint[];
  numTokens: number;
  concentration: number;
  swapFeeBps: number; // Converted from bigint to number for display
  totalSupply: bigint;
  name: string;
  symbol: string;
}

interface PoolListProps {
  contractService: OrbitalContractService | null;
  userAddress: string;
  onSelectPool: (poolAddress: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WAD = 10n ** 18n;

const CONCENTRATION_LABELS: Record<number, string> = {
  2: 'Broad',
  4: 'Standard',
  8: 'Focused',
  16: 'Tight',
  32: 'Ultra-Tight',
};

function formatFeeBps(bps: number): string {
  return formatPercent(bps / 100);
}

function estimateTVL(reserves: bigint[]): string {
  let total = 0n;
  for (const r of reserves) {
    total += r;
  }
  const tvl = Number(total) / Number(WAD);
  return formatCompact(tvl);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PoolList({
  contractService,
  userAddress: _userAddress,
  onSelectPool,
}: PoolListProps) {
  const [pools, setPools] = useState<PoolData[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<'tvl' | 'concentration' | 'fee' | 'tokens'>('tvl');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const fetchRequestRef = useRef(0);

  // ---- Fetch all pools -----------------------------------------------------

  const fetchPools = useCallback(async () => {
    const requestId = ++fetchRequestRef.current;

    if (!contractService) return;

    setLoading(true);
    try {
      const poolAddresses = await contractService.getAllPools();

      const poolDataList: PoolData[] = [];

      await Promise.all(
        poolAddresses.map(async (addr) => {
          try {
            const info = await contractService.getPoolInfo(addr);

            // Resolve token symbols in parallel
            const symbols = await Promise.all(
              info.tokens.map(async (tokenAddr) => {
                try {
                  const tokenInfo = await contractService.getTokenInfo(tokenAddr);
                  return tokenInfo.symbol;
                } catch {
                  return formatAddress(tokenAddr);
                }
              }),
            );

            poolDataList.push({
              address: addr,
              tokens: info.tokens,
              tokenSymbols: symbols,
              reserves: info.reserves,
              numTokens: info.tokens.length,
              concentration: info.concentration,
              swapFeeBps: Number(info.swapFeeBps),
              totalSupply: info.totalSupply,
              name: info.name,
              symbol: info.symbol,
            });
          } catch (err) {
            logger.error(`Failed to load pool ${addr}:`, err);
          }
        }),
      );

      // Sort by TVL descending (sum of reserves as proxy)
      poolDataList.sort((a, b) => {
        const tvlA = a.reserves.reduce((sum, r) => sum + r, 0n);
        const tvlB = b.reserves.reduce((sum, r) => sum + r, 0n);
        if (tvlB > tvlA) return 1;
        if (tvlB < tvlA) return -1;
        return 0;
      });

      if (fetchRequestRef.current !== requestId) return;
      setPools(poolDataList);
    } catch (err) {
      if (fetchRequestRef.current !== requestId) return;
      logger.error('Failed to fetch pools:', err);
      toast.error('Unable to load Orbital pools. Check your connection and try again.');
    } finally {
      if (fetchRequestRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [contractService]);

  useEffect(() => {
    void fetchPools();
    return () => {
      fetchRequestRef.current += 1;
    };
  }, [fetchPools]);

  // ---- Refresh handler -----------------------------------------------------

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    void fetchPools().finally(() => {
      setTimeout(() => setIsRefreshing(false), 600);
    });
  }, [fetchPools]);

  // ---- Sort toggle handler --------------------------------------------------

  const handleSortToggle = useCallback((field: typeof sortBy) => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  }, [sortBy]);

  // ---- Filtered & sorted pools --------------------------------------------

  const filteredPools = useMemo(() => {
    // 1. Filter
    const filtered = pools.filter((pool) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        pool.name.toLowerCase().includes(q) ||
        pool.symbol.toLowerCase().includes(q) ||
        pool.tokenSymbols.some((s) => s.toLowerCase().includes(q)) ||
        pool.address.toLowerCase().includes(q)
      );
    });

    // 2. Sort
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'tvl': {
          const tvlA = a.reserves.reduce((sum, r) => sum + r, 0n);
          const tvlB = b.reserves.reduce((sum, r) => sum + r, 0n);
          cmp = tvlA > tvlB ? 1 : tvlA < tvlB ? -1 : 0;
          break;
        }
        case 'concentration':
          cmp = a.concentration - b.concentration;
          break;
        case 'fee':
          cmp = a.swapFeeBps - b.swapFeeBps;
          break;
        case 'tokens':
          cmp = a.numTokens - b.numTokens;
          break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return sorted;
  }, [pools, searchQuery, sortBy, sortDir]);

  // ---- Loading state -------------------------------------------------------

  if (loading && pools.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400/60" />
        <span className="mt-4 text-sm text-gray-500">Loading Orbital pools...</span>
      </div>
    );
  }

  // ---- Empty state ---------------------------------------------------------

  if (!loading && pools.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-500/10 ring-1 ring-white/[0.06]">
          <Orbit className="h-8 w-8 text-gray-600" />
        </div>
        <p className="text-sm font-medium text-gray-400">No pools found</p>
        <p className="mt-2 max-w-xs text-xs leading-relaxed text-gray-600">
          No Orbital pools have been created yet. Switch to the{' '}
          <span className="font-semibold text-indigo-400">Create Pool</span>{' '}
          tab to deploy a new multi-asset pool with concentrated liquidity.
        </p>
        <p className="mt-3 max-w-xs text-[11px] leading-relaxed text-gray-600">
          Once a pool is created and funded, it will appear here for swapping and liquidity management.
        </p>
      </div>
    );
  }

  // ---- Render --------------------------------------------------------------

  return (
    <div className="space-y-5">
      {/* Search + Refresh bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search pools by name, symbol, or address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={clsx(
              'w-full rounded-xl py-3 pl-10 pr-4 text-sm text-white',
              'bg-[#0D0F14] border border-white/[0.06]',
              'placeholder:text-gray-600',
              'focus:border-white/[0.12] focus:outline-none focus:ring-1 focus:ring-white/[0.08]',
              'transition-all',
            )}
          />
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          className={clsx(
            'flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl',
            'bg-[#0D0F14] border border-white/[0.06]',
            'text-gray-400 transition-all duration-200',
            'hover:border-white/[0.12] hover:text-white hover:bg-white/[0.04]',
          )}
          title="Refresh pools"
        >
          <RefreshCw
            className={clsx(
              'h-4 w-4 transition-transform duration-500',
              isRefreshing && 'animate-spin',
            )}
          />
        </button>
      </div>

      {/* Pool count + sort controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-1">
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            {filteredPools.length} pool{filteredPools.length !== 1 ? 's' : ''}
          </span>
          {searchQuery && filteredPools.length !== pools.length && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Clear filter
            </button>
          )}
        </div>

        {/* Sort controls */}
        <div className="flex items-center gap-1.5">
          <span className="mr-1 text-[10px] text-gray-600 uppercase tracking-wider">Sort:</span>
          {([
            { key: 'tvl' as const, label: 'TVL' },
            { key: 'concentration' as const, label: 'Focus' },
            { key: 'fee' as const, label: 'Fee' },
            { key: 'tokens' as const, label: 'Tokens' },
          ]).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => handleSortToggle(key)}
              className={clsx(
                'flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-medium transition-all',
                sortBy === key
                  ? 'bg-indigo-500/15 text-indigo-400 ring-1 ring-indigo-500/20'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]',
              )}
            >
              {label}
              {sortBy === key && (
                <ArrowUpDown className={clsx(
                  'h-2.5 w-2.5',
                  sortDir === 'asc' && 'rotate-180',
                )} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Pool cards */}
      <div className="space-y-3">
        {filteredPools.map((pool) => (
          <button
            key={pool.address}
            type="button"
            onClick={() => onSelectPool(pool.address)}
            className={clsx(
              'group w-full rounded-xl p-5',
              'bg-[#0D0F14]/80 border border-white/[0.06]',
              'hover:border-white/[0.12] hover:bg-white/[0.02]',
              'transition-all duration-200',
              'text-left',
            )}
          >
            {/* Top row: pool name + tokens */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                {/* Token orbitals icon */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600/20 to-cyan-600/20 ring-1 ring-white/[0.08]">
                  <Orbit className="h-5 w-5 text-indigo-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-100 truncate">
                      {pool.name}
                    </span>
                    <span className="shrink-0 rounded-md bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-gray-400 ring-1 ring-white/[0.06]">
                      {pool.symbol}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {pool.tokenSymbols.map((sym, i) => (
                      <span
                        key={i}
                        className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-300 ring-1 ring-indigo-500/20"
                      >
                        {sym}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-gray-600 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-400" />
            </div>

            {/* Stats row */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {/* Total Reserves (TVL proxy) */}
              <div className="rounded-lg bg-white/[0.02] px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase tracking-wider">
                  <TrendingUp className="h-3 w-3" />
                  TVL
                  <InfoTooltip content={TOOLTIPS.tvl} />
                </div>
                <div className="mt-1 text-sm font-semibold font-mono text-gray-200">
                  {estimateTVL(pool.reserves)}
                </div>
                <div className="mt-0.5 text-[10px] text-gray-600">
                  {pool.numTokens} token{pool.numTokens !== 1 ? 's' : ''}
                </div>
              </div>

              {/* Concentration */}
              <div className="rounded-lg bg-white/[0.02] px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase tracking-wider">
                  <Droplets className="h-3 w-3" />
                  Focus
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="text-sm font-semibold font-mono text-gray-200">
                    {pool.concentration}x
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] text-gray-500">
                  {CONCENTRATION_LABELS[pool.concentration] ?? 'Custom'}
                </div>
              </div>

              {/* Fee */}
              <div className="rounded-lg bg-white/[0.02] px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase tracking-wider">
                  <TrendingUp className="h-3 w-3" />
                  Swap Fee
                </div>
                <div className="mt-1 text-sm font-semibold font-mono text-gray-200">
                  {formatFeeBps(pool.swapFeeBps)}
                </div>
                <div className="mt-0.5 text-[10px] text-gray-600">
                  per trade
                </div>
              </div>

              {/* LP Supply */}
              <div className="rounded-lg bg-white/[0.02] px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase tracking-wider">
                  <Layers className="h-3 w-3" />
                  LP Supply
                </div>
                <div className="mt-1 text-sm font-semibold font-mono text-gray-200">
                  {formatTokenAmount(formatBalance(pool.totalSupply, 18, 2))}
                </div>
                <div className="mt-0.5 text-[10px] text-gray-600">
                  {pool.symbol}
                </div>
              </div>
            </div>

            {/* Reserves row */}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-0.5">
              {pool.tokenSymbols.map((sym, i) => (
                <span key={i} className="text-[11px] text-gray-500">
                  {sym}:{' '}
                  <span className="font-mono text-gray-400">
                    {formatTokenAmount(formatBalance(pool.reserves[i], 18, 4))}
                  </span>
                </span>
              ))}
            </div>

            {/* Pool address */}
            <div className="mt-2 px-0.5">
              <span className="font-mono text-[10px] text-gray-600">
                {formatAddress(pool.address)}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* No results from search */}
      {filteredPools.length === 0 && pools.length > 0 && (
        <div className="flex flex-col items-center py-12 text-center">
          <AlertCircle className="mb-3 h-6 w-6 text-gray-600" />
          <p className="text-sm text-gray-400">No pools match your search</p>
          <p className="mt-1 text-xs text-gray-600">Try a different name, symbol, or token address</p>
        </div>
      )}
    </div>
  );
}
