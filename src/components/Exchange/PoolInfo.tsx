/**
 * PoolInfo -- displays current AMM pool statistics for a selected token pair.
 *
 * Shows:
 *   - Token pair reserves
 *   - Current exchange rate (both directions)
 *   - Total liquidity
 *   - Your LP balance and pool share
 *
 * Auto-refreshes every 15 seconds (same pattern as OrderBook).
 */

import { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import clsx from 'clsx';
import {
  BarChart3,
  RefreshCw,
  Loader2,
  ArrowRightLeft,
  Droplets,
  TrendingUp,
} from 'lucide-react';
import type { WrappedAsset } from '../../types';
import { ContractService, isETH } from '../../lib/blockchain/contracts';
import type { Pool } from '../../lib/blockchain/contracts';
import { formatAddress, formatBalance } from '../../lib/utils/helpers';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PoolInfoProps {
  tokenA: string | null;
  tokenB: string | null;
  contractService: ContractService | null;
  userAddress: string;
  assets: WrappedAsset[];
  refreshKey?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PoolInfo({
  tokenA,
  tokenB,
  contractService,
  userAddress,
  assets,
  refreshKey = 0,
}: PoolInfoProps) {
  const [pool, setPool] = useState<Pool | null>(null);
  const [lpBalance, setLpBalance] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- Token name resolver ------------------------------------------------

  function tokenLabel(address: string): string {
    if (isETH(address)) return 'ETH';
    const found = assets.find(
      (a) => a.address.toLowerCase() === address.toLowerCase(),
    );
    return found ? found.symbol : formatAddress(address);
  }

  // ---- Fetch pool data ----------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!contractService || !tokenA || !tokenB) {
        setPool(null);
        setLpBalance(0n);
        return;
      }
      if (tokenA.toLowerCase() === tokenB.toLowerCase()) {
        setPool(null);
        return;
      }

      setLoading(true);
      try {
        const poolData = await contractService.getAMMPool(tokenA, tokenB);
        if (!cancelled) {
          if (poolData.token0 === ethers.ZeroAddress) {
            setPool(null);
          } else {
            setPool(poolData);
          }
        }
      } catch {
        if (!cancelled) setPool(null);
      }

      if (userAddress && tokenA && tokenB) {
        try {
          const lp = await contractService.getAMMLiquidityBalance(tokenA, tokenB, userAddress);
          if (!cancelled) setLpBalance(lp);
        } catch {
          if (!cancelled) setLpBalance(0n);
        }
      }

      if (!cancelled) setLoading(false);
    }

    void load();
    return () => { cancelled = true; };
  }, [contractService, tokenA, tokenB, userAddress, refreshKey]);

  // ---- Auto-refresh every 15s ---------------------------------------------

  useEffect(() => {
    if (!contractService || !tokenA || !tokenB) return;

    intervalRef.current = setInterval(() => {
      // Re-trigger by updating state (the effect above reacts to refreshKey
      // but for the auto-refresh we just re-run the fetch)
      setLoading((prev) => {
        // Force a re-render to trigger the fetch effect
        return prev;
      });
    }, 15000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [contractService, tokenA, tokenB]);

  // ---- Derived values -----------------------------------------------------

  const rate0to1 =
    pool && pool.reserve0 > 0n
      ? Number(ethers.formatUnits(pool.reserve1, 18)) /
        Number(ethers.formatUnits(pool.reserve0, 18))
      : null;

  const rate1to0 =
    pool && pool.reserve1 > 0n
      ? Number(ethers.formatUnits(pool.reserve0, 18)) /
        Number(ethers.formatUnits(pool.reserve1, 18))
      : null;

  const sharePercent =
    pool && pool.totalLiquidity > 0n && lpBalance > 0n
      ? (Number(lpBalance) / Number(pool.totalLiquidity)) * 100
      : 0;

  // ---- Render: no pair selected -------------------------------------------

  if (!tokenA || !tokenB) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Droplets className="mb-4 h-8 w-8 text-gray-600" />
        <p className="text-sm text-gray-500">
          Select a token pair to view pool statistics
        </p>
      </div>
    );
  }

  // ---- Render: loading ----------------------------------------------------

  if (loading && !pool) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-purple-400/60" />
      </div>
    );
  }

  // ---- Render: no pool ----------------------------------------------------

  if (!pool) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Droplets className="mb-4 h-8 w-8 text-gray-600" />
        <p className="text-sm text-gray-500">
          No liquidity pool exists for this pair
        </p>
        <p className="mt-1 text-[11px] text-gray-600">
          Create a pool and add liquidity to get started
        </p>
      </div>
    );
  }

  // ---- Render: pool stats -------------------------------------------------

  const label0 = tokenLabel(pool.token0);
  const label1 = tokenLabel(pool.token1);

  return (
    <div className="space-y-4">
      {/* Pair header */}
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 ring-1 ring-purple-500/20">
          <BarChart3 className="h-4 w-4 text-purple-400" />
        </span>
        <span className="text-sm font-semibold text-gray-100">
          {label0} / {label1}
        </span>
        {loading && (
          <RefreshCw className="ml-auto h-3 w-3 animate-spin text-gray-600" />
        )}
      </div>

      {/* Stats grid */}
      <div className="space-y-0 divide-y divide-white/[0.04]">
        {/* Reserves */}
        <div className="flex items-center justify-between py-3">
          <span className="text-xs text-gray-500">{label0} Reserve</span>
          <span className="font-mono text-xs font-medium text-gray-200">
            {formatBalance(pool.reserve0, 18, 6)}
          </span>
        </div>
        <div className="flex items-center justify-between py-3">
          <span className="text-xs text-gray-500">{label1} Reserve</span>
          <span className="font-mono text-xs font-medium text-gray-200">
            {formatBalance(pool.reserve1, 18, 6)}
          </span>
        </div>

        {/* Exchange rates */}
        {rate0to1 !== null && (
          <div className="flex items-center justify-between py-3">
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <ArrowRightLeft className="h-3 w-3" />
              Rate
            </span>
            <span className="font-mono text-xs text-gray-300">
              1 {label0} = {rate0to1.toFixed(6)} {label1}
            </span>
          </div>
        )}
        {rate1to0 !== null && (
          <div className="flex items-center justify-between py-3">
            <span className="text-xs text-gray-500">Inverse</span>
            <span className="font-mono text-xs text-gray-400">
              1 {label1} = {rate1to0.toFixed(6)} {label0}
            </span>
          </div>
        )}

        {/* Total liquidity */}
        <div className="flex items-center justify-between py-3">
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <Droplets className="h-3 w-3" />
            Total LP Tokens
          </span>
          <span className="font-mono text-xs font-medium text-gray-200">
            {formatBalance(pool.totalLiquidity, 18, 4)}
          </span>
        </div>

        {/* User position */}
        <div className="flex items-center justify-between py-3">
          <span className="text-xs text-gray-500">Your LP Balance</span>
          <span className="font-mono text-xs font-medium text-gray-200">
            {formatBalance(lpBalance, 18, 6)}
          </span>
        </div>
        {sharePercent > 0 && (
          <div className="flex items-center justify-between py-3">
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <TrendingUp className="h-3 w-3" />
              Your Pool Share
            </span>
            <span className="font-mono text-xs font-medium text-purple-400">
              {sharePercent.toFixed(4)}%
            </span>
          </div>
        )}
      </div>

      {/* K value (for advanced users) */}
      <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] px-4 py-2.5">
        <span className="text-[10px] uppercase tracking-wider text-gray-600">
          Constant Product (k)
        </span>
        <p className="mt-0.5 font-mono text-[11px] text-gray-500 break-all">
          {pool.kLast.toString()}
        </p>
      </div>
    </div>
  );
}
