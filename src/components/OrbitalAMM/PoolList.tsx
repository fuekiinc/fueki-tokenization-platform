/**
 * PoolList -- Displays all Orbital AMM pools in a card/table layout.
 *
 * Fetches every pool address from the OrbitalFactory, then loads each
 * pool's on-chain data (tokens, reserves, concentration, fee tier, TVL).
 * Clicking a pool emits `onSelectPool` so the parent can navigate the
 * user into the swap or liquidity tab pre-configured for that pool.
 */

import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  Loader2,
  Search,
  Droplets,
  TrendingUp,
  Layers,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Orbit,
} from 'lucide-react';
import { OrbitalContractService } from '../../lib/blockchain/orbitalContracts';
import { formatAddress, formatBalance } from '../../lib/utils/helpers';
import { formatCompact, formatPercent, formatTokenAmount } from '../../lib/formatters';
import { InfoTooltip } from '../Common/Tooltip';
import { TOOLTIPS } from '../../lib/tooltipContent';

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
  userAddress,
  onSelectPool,
}: PoolListProps) {
  const [pools, setPools] = useState<PoolData[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ---- Fetch all pools -----------------------------------------------------

  const fetchPools = useCallback(async () => {
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
            console.error(`Failed to load pool ${addr}:`, err);
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

      setPools(poolDataList);
    } catch (err) {
      console.error('Failed to fetch pools:', err);
      toast.error('Failed to load Orbital pools');
    } finally {
      setLoading(false);
    }
  }, [contractService]);

  useEffect(() => {
    void fetchPools();
  }, [fetchPools]);

  // ---- Refresh handler -----------------------------------------------------

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    void fetchPools().finally(() => {
      setTimeout(() => setIsRefreshing(false), 600);
    });
  }, [fetchPools]);

  // ---- Filtered pools ------------------------------------------------------

  const filteredPools = pools.filter((pool) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      pool.name.toLowerCase().includes(q) ||
      pool.symbol.toLowerCase().includes(q) ||
      pool.tokenSymbols.some((s) => s.toLowerCase().includes(q)) ||
      pool.address.toLowerCase().includes(q)
    );
  });

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

      {/* Pool count */}
      <div className="flex items-center justify-between px-1">
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
              {/* Total Reserves */}
              <div className="rounded-lg bg-white/[0.02] px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase tracking-wider">
                  <TrendingUp className="h-3 w-3" />
                  Reserves
                  <InfoTooltip content={TOOLTIPS.tvl} />
                </div>
                <div className="mt-1 text-sm font-semibold font-mono text-gray-200">
                  {estimateTVL(pool.reserves)}
                </div>
              </div>

              {/* Tokens */}
              <div className="rounded-lg bg-white/[0.02] px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase tracking-wider">
                  <Layers className="h-3 w-3" />
                  Tokens
                </div>
                <div className="mt-1 text-sm font-semibold font-mono text-gray-200">
                  {pool.numTokens}
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
                  <span className="text-[10px] text-gray-500">
                    {CONCENTRATION_LABELS[pool.concentration] ?? ''}
                  </span>
                </div>
              </div>

              {/* Fee */}
              <div className="rounded-lg bg-white/[0.02] px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase tracking-wider">
                  <TrendingUp className="h-3 w-3" />
                  Fee
                </div>
                <div className="mt-1 text-sm font-semibold font-mono text-gray-200">
                  {formatFeeBps(pool.swapFeeBps)}
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
          <p className="mt-1 text-xs text-gray-600">Try a different name, symbol, or address</p>
        </div>
      )}
    </div>
  );
}
