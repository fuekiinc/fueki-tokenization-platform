/**
 * LiquidityPanel -- Add/Remove liquidity for AMM pools.
 *
 * Two tabs:
 *   - Add: deposit token pair into a pool (or create a new pool)
 *   - Remove: burn LP tokens to withdraw proportional reserves
 *
 * Reuses TokenSelector, glass-morphism styling, and existing patterns.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  Plus,
  Minus,
  Loader2,
  Check,
  AlertCircle,
  Droplets,
  Fuel,
} from 'lucide-react';
import type { WrappedAsset } from '../../types';
import { ContractService, ETH_SENTINEL, isETH } from '../../lib/blockchain/contracts';
import type { Pool } from '../../lib/blockchain/contracts';
import { getNetworkConfig } from '../../contracts/addresses';
import { formatAddress, formatBalance } from '../../lib/utils/helpers';
import { formatPercent, formatPrice } from '../../lib/formatters';
import TokenSelector from './TokenSelector';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LiquidityTab = 'add' | 'remove';
type TxStatus = 'idle' | 'approving-a' | 'approving-b' | 'submitting' | 'confirmed';

interface LiquidityPanelProps {
  assets: WrappedAsset[];
  contractService: ContractService | null;
  userAddress: string;
  ethBalance: string;
  onLiquidityChanged: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LiquidityPanel({
  assets,
  contractService,
  userAddress,
  ethBalance,
  onLiquidityChanged,
}: LiquidityPanelProps) {
  const [tab, setTab] = useState<LiquidityTab>('add');
  const [tokenA, setTokenA] = useState<string | null>(null);
  const [tokenB, setTokenB] = useState<string | null>(null);
  const [amountA, setAmountA] = useState('');
  const [amountB, setAmountB] = useState('');
  const [removeAmount, setRemoveAmount] = useState('');
  const [txStatus, setTxStatus] = useState<TxStatus>('idle');
  const [pool, setPool] = useState<Pool | null>(null);
  const [lpBalance, setLpBalance] = useState<bigint>(0n);
  const [balanceA, setBalanceA] = useState<bigint>(0n);
  const [balanceB, setBalanceB] = useState<bigint>(0n);
  const [chainId, setChainId] = useState<number | null>(null);

  const tokenAIsETH = isETH(tokenA);
  const tokenBIsETH = isETH(tokenB);
  const sameTokenError = tokenA && tokenB && tokenA.toLowerCase() === tokenB.toLowerCase();
  const poolExists = pool !== null && pool.totalLiquidity > 0n;

  // ---- Resolve chainId on mount -------------------------------------------

  useEffect(() => {
    async function resolve() {
      if (!contractService) return;
      try {
        const signer = await contractService.getSigner();
        const provider = signer.provider;
        if (provider) {
          const network = await provider.getNetwork();
          setChainId(Number(network.chainId));
        }
      } catch { /* ignore */ }
    }
    void resolve();
  }, [contractService]);

  // ---- Load pool data + balances ------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!contractService || !tokenA || !tokenB || sameTokenError) {
        setPool(null);
        setLpBalance(0n);
        return;
      }

      try {
        const poolData = await contractService.getAMMPool(tokenA, tokenB);
        if (!cancelled) {
          // Pool exists if token0 is non-zero
          if (poolData.token0 === ethers.ZeroAddress) {
            setPool(null);
          } else {
            setPool(poolData);
          }
        }
      } catch {
        if (!cancelled) setPool(null);
      }

      if (userAddress) {
        try {
          const lp = await contractService.getAMMLiquidityBalance(tokenA, tokenB, userAddress);
          if (!cancelled) setLpBalance(lp);
        } catch {
          if (!cancelled) setLpBalance(0n);
        }

        // Token balances
        try {
          if (tokenAIsETH) {
            setBalanceA(BigInt(ethBalance));
          } else {
            const bal = await contractService.getAssetBalance(tokenA, userAddress);
            if (!cancelled) setBalanceA(bal);
          }
        } catch {
          if (!cancelled) setBalanceA(0n);
        }

        try {
          if (tokenBIsETH) {
            setBalanceB(BigInt(ethBalance));
          } else {
            const bal = await contractService.getAssetBalance(tokenB, userAddress);
            if (!cancelled) setBalanceB(bal);
          }
        } catch {
          if (!cancelled) setBalanceB(0n);
        }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [contractService, tokenA, tokenB, userAddress, sameTokenError, tokenAIsETH, tokenBIsETH, ethBalance, txStatus]);

  // ---- Parsed amounts -----------------------------------------------------

  const parsedAmountA = useMemo(() => {
    try {
      if (!amountA || Number(amountA) <= 0) return 0n;
      return ethers.parseUnits(amountA, 18);
    } catch { return 0n; }
  }, [amountA]);

  const parsedAmountB = useMemo(() => {
    try {
      if (!amountB || Number(amountB) <= 0) return 0n;
      return ethers.parseUnits(amountB, 18);
    } catch { return 0n; }
  }, [amountB]);

  const parsedRemoveAmount = useMemo(() => {
    try {
      if (!removeAmount || Number(removeAmount) <= 0) return 0n;
      return ethers.parseUnits(removeAmount, 18);
    } catch { return 0n; }
  }, [removeAmount]);

  // ---- Pool share preview -------------------------------------------------

  const sharePreview = useMemo(() => {
    if (!pool || pool.totalLiquidity === 0n || parsedAmountA === 0n) return null;
    // Estimated new LP tokens (proportional to smaller ratio)
    const lp0 = (parsedAmountA * pool.totalLiquidity) / pool.reserve0;
    const lp1 = (parsedAmountB * pool.totalLiquidity) / pool.reserve1;
    const newLp = lp0 < lp1 ? lp0 : lp1;
    const newTotal = pool.totalLiquidity + newLp;
    const share = Number(newLp) / Number(newTotal) * 100;
    return share;
  }, [pool, parsedAmountA, parsedAmountB]);

  // ---- Remove preview -----------------------------------------------------

  const removePreview = useMemo(() => {
    if (!pool || pool.totalLiquidity === 0n || parsedRemoveAmount === 0n) return null;
    const amount0 = (parsedRemoveAmount * pool.reserve0) / pool.totalLiquidity;
    const amount1 = (parsedRemoveAmount * pool.reserve1) / pool.totalLiquidity;
    return { amount0, amount1 };
  }, [pool, parsedRemoveAmount]);

  // Resolve token symbol from address
  const tokenLabel = useCallback((address: string | null): string => {
    if (!address) return '???';
    if (isETH(address)) return 'ETH';
    const found = assets.find((a) => a.address.toLowerCase() === address.toLowerCase());
    return found ? found.symbol : formatAddress(address);
  }, [assets]);

  // ---- Handlers -----------------------------------------------------------

  const handleCreatePool = useCallback(async () => {
    if (!contractService || !tokenA || !tokenB) return;
    setTxStatus('submitting');
    try {
      const tx = await contractService.createPool(tokenA, tokenB);
      toast.loading('Creating pool...', { id: 'create-pool' });
      await contractService.waitForTransaction(tx);
      toast.success('Pool created!', { id: 'create-pool' });
      setTxStatus('confirmed');
      setTimeout(() => { setTxStatus('idle'); onLiquidityChanged(); }, 2000);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create pool', { id: 'create-pool' });
      setTxStatus('idle');
    }
  }, [contractService, tokenA, tokenB, onLiquidityChanged]);

  const handleAddLiquidity = useCallback(async () => {
    if (!contractService || !tokenA || !tokenB || parsedAmountA === 0n || parsedAmountB === 0n) return;
    if (txStatus !== 'idle' && txStatus !== 'confirmed') return;

    const config = chainId ? getNetworkConfig(chainId) : null;
    const ammAddress = config?.ammAddress;

    // Approve tokenA if not ETH
    if (!tokenAIsETH && ammAddress) {
      setTxStatus('approving-a');
      try {
        const allowA = await contractService.getAssetAllowance(tokenA, userAddress, ammAddress);
        if (allowA < parsedAmountA) {
          const tx = await contractService.approveAMM(tokenA, parsedAmountA);
          toast.loading('Approving token A...', { id: 'approve-a' });
          await contractService.waitForTransaction(tx);
          toast.success('Token A approved', { id: 'approve-a' });
        }
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Approval failed', { id: 'approve-a' });
        setTxStatus('idle');
        return;
      }
    }

    // Approve tokenB if not ETH
    if (!tokenBIsETH && ammAddress) {
      setTxStatus('approving-b');
      try {
        const allowB = await contractService.getAssetAllowance(tokenB, userAddress, ammAddress);
        if (allowB < parsedAmountB) {
          const tx = await contractService.approveAMM(tokenB, parsedAmountB);
          toast.loading('Approving token B...', { id: 'approve-b' });
          await contractService.waitForTransaction(tx);
          toast.success('Token B approved', { id: 'approve-b' });
        }
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Approval failed', { id: 'approve-b' });
        setTxStatus('idle');
        return;
      }
    }

    // Add liquidity
    setTxStatus('submitting');
    try {
      let tx;
      if (tokenAIsETH) {
        tx = await contractService.addLiquidityETH(tokenB, parsedAmountB, 0n, parsedAmountA);
      } else if (tokenBIsETH) {
        tx = await contractService.addLiquidityETH(tokenA, parsedAmountA, 0n, parsedAmountB);
      } else {
        tx = await contractService.addLiquidity(tokenA, tokenB, parsedAmountA, parsedAmountB, 0n);
      }
      toast.loading('Adding liquidity...', { id: 'add-liq' });
      await contractService.waitForTransaction(tx);
      toast.success('Liquidity added!', { id: 'add-liq' });
      setTxStatus('confirmed');
      setAmountA('');
      setAmountB('');
      setTimeout(() => { setTxStatus('idle'); onLiquidityChanged(); }, 2000);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add liquidity', { id: 'add-liq' });
      setTxStatus('idle');
    }
  }, [contractService, tokenA, tokenB, parsedAmountA, parsedAmountB, tokenAIsETH, tokenBIsETH, userAddress, chainId, txStatus, onLiquidityChanged]);

  const handleRemoveLiquidity = useCallback(async () => {
    if (!contractService || !tokenA || !tokenB || parsedRemoveAmount === 0n) return;
    if (txStatus !== 'idle') return;

    setTxStatus('submitting');
    try {
      let tx;
      if (tokenAIsETH) {
        tx = await contractService.removeLiquidityETH(tokenB, parsedRemoveAmount, 0n, 0n);
      } else if (tokenBIsETH) {
        tx = await contractService.removeLiquidityETH(tokenA, parsedRemoveAmount, 0n, 0n);
      } else {
        tx = await contractService.removeLiquidity(tokenA, tokenB, parsedRemoveAmount, 0n, 0n);
      }
      toast.loading('Removing liquidity...', { id: 'remove-liq' });
      await contractService.waitForTransaction(tx);
      toast.success('Liquidity removed!', { id: 'remove-liq' });
      setTxStatus('confirmed');
      setRemoveAmount('');
      setTimeout(() => { setTxStatus('idle'); onLiquidityChanged(); }, 2000);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove liquidity', { id: 'remove-liq' });
      setTxStatus('idle');
    }
  }, [contractService, tokenA, tokenB, parsedRemoveAmount, tokenAIsETH, tokenBIsETH, txStatus, onLiquidityChanged]);

  // ---- Render -------------------------------------------------------------

  return (
    <div className="space-y-5">
      {/* Tab switcher */}
      <div role="tablist" aria-label="Liquidity action" className="flex gap-1 rounded-xl bg-[#0D0F14] p-1.5 border border-white/[0.06]">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'add'}
          aria-controls="liq-panel-add"
          id="liq-tab-add"
          onClick={() => setTab('add')}
          className={clsx(
            'flex-1 flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold transition-all duration-200',
            'min-h-[44px]',
            tab === 'add'
              ? 'bg-purple-500/15 text-purple-400 shadow-[inset_0_1px_0_rgba(168,85,247,0.2)]'
              : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]',
          )}
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'remove'}
          aria-controls="liq-panel-remove"
          id="liq-tab-remove"
          onClick={() => setTab('remove')}
          className={clsx(
            'flex-1 flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold transition-all duration-200',
            'min-h-[44px]',
            tab === 'remove'
              ? 'bg-teal-500/15 text-teal-400 shadow-[inset_0_1px_0_rgba(20,184,166,0.2)]'
              : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]',
          )}
        >
          <Minus className="h-3.5 w-3.5" />
          Remove
        </button>
      </div>

      {/* Token pair selectors */}
      <div className="space-y-3">
        <TokenSelector
          assets={assets}
          selectedToken={tokenA}
          onSelect={setTokenA}
          label="Token A"
          includeETH
          ethBalance={ethBalance}
        />
        <TokenSelector
          assets={assets}
          selectedToken={tokenB}
          onSelect={setTokenB}
          label="Token B"
          includeETH
          ethBalance={ethBalance}
        />
      </div>

      {sameTokenError && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 sm:px-4 sm:py-3 text-xs text-amber-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          Tokens must be different.
        </div>
      )}

      {/* Pool status */}
      {tokenA && tokenB && !sameTokenError && (
        <div className="rounded-lg bg-[#0D0F14]/80 border border-white/[0.06] px-3 py-2.5 sm:px-4 sm:py-3">
          {pool === null ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-gray-500">Pool does not exist</span>
              <button
                type="button"
                onClick={handleCreatePool}
                disabled={txStatus !== 'idle'}
                className="rounded-lg bg-purple-500/10 px-3 py-1.5 text-xs font-semibold text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-40 min-h-[44px] shrink-0"
              >
                {txStatus === 'submitting' ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Creating...
                  </span>
                ) : 'Create Pool'}
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-gray-500 shrink-0">Pool Reserves</span>
                <span className="font-mono text-gray-300 truncate text-right">
                  {formatBalance(pool.reserve0, 18, 4)} / {formatBalance(pool.reserve1, 18, 4)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-gray-500 shrink-0">Your LP Balance</span>
                <span className="font-mono text-gray-300 truncate text-right">
                  {formatBalance(lpBalance, 18, 6)}
                </span>
              </div>
              {pool.totalLiquidity > 0n && lpBalance > 0n && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Your Pool Share</span>
                  <span className="font-mono text-purple-400">
                    {formatPercent(Number(lpBalance) / Number(pool.totalLiquidity) * 100)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---- ADD TAB -------------------------------------------------------- */}
      {tab === 'add' && (
        <div role="tabpanel" id="liq-panel-add" aria-labelledby="liq-tab-add" className="space-y-4">
          {/* Amount A */}
          <div>
            <label className="mb-1.5 block text-xs text-gray-500">Amount A</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.0"
              value={amountA}
              onChange={(e) => {
                const val = e.target.value;
                if (/^[0-9]*\.?[0-9]*$/.test(val)) setAmountA(val);
              }}
              className={clsx(
                'w-full rounded-xl px-4 py-3 text-base font-semibold text-white font-mono',
                'bg-[#0D0F14] border border-white/[0.06]',
                'placeholder:text-gray-600',
                'focus:border-white/[0.12] focus:outline-none focus:ring-1 focus:ring-white/[0.08]',
                'transition-all',
              )}
            />
            {tokenA && (
              <div className="mt-1.5 text-[11px] text-gray-500">
                Balance: <span className="font-mono text-gray-400">{formatBalance(balanceA, 18, 6)}</span>
              </div>
            )}
          </div>

          {/* Amount B */}
          <div>
            <label className="mb-1.5 block text-xs text-gray-500">Amount B</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.0"
              value={amountB}
              onChange={(e) => {
                const val = e.target.value;
                if (/^[0-9]*\.?[0-9]*$/.test(val)) setAmountB(val);
              }}
              className={clsx(
                'w-full rounded-xl px-4 py-3 text-base font-semibold text-white font-mono',
                'bg-[#0D0F14] border border-white/[0.06]',
                'placeholder:text-gray-600',
                'focus:border-white/[0.12] focus:outline-none focus:ring-1 focus:ring-white/[0.08]',
                'transition-all',
              )}
            />
            {tokenB && (
              <div className="mt-1.5 text-[11px] text-gray-500">
                Balance: <span className="font-mono text-gray-400">{formatBalance(balanceB, 18, 6)}</span>
              </div>
            )}
          </div>

          {/* Pool share preview */}
          {sharePreview !== null && (
            <div className="flex items-center justify-between rounded-lg bg-purple-500/5 border border-purple-500/10 px-3 py-2 sm:px-4 sm:py-2.5 text-xs">
              <span className="text-gray-400">Estimated Pool Share</span>
              <span className="font-mono font-medium text-purple-400">{formatPercent(sharePreview)}</span>
            </div>
          )}

          {/* ETH note */}
          {(tokenAIsETH || tokenBIsETH) && (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-400/70">
              <Fuel className="h-3 w-3" />
              ETH is sent with the transaction
            </div>
          )}

          {/* Add liquidity button */}
          <button
            type="button"
            onClick={handleAddLiquidity}
            disabled={
              !contractService ||
              !tokenA ||
              !tokenB ||
              !!sameTokenError ||
              pool === null ||
              parsedAmountA === 0n ||
              parsedAmountB === 0n ||
              (txStatus !== 'idle' && txStatus !== 'confirmed')
            }
            className={clsx(
              'flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold transition-all min-h-[44px]',
              txStatus === 'confirmed'
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.15)] hover:shadow-[0_0_30px_rgba(168,85,247,0.25)]',
              'disabled:cursor-not-allowed disabled:opacity-40',
            )}
          >
            {txStatus === 'approving-a' ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Approving Token A...</>
            ) : txStatus === 'approving-b' ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Approving Token B...</>
            ) : txStatus === 'submitting' ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Adding Liquidity...</>
            ) : txStatus === 'confirmed' ? (
              <><Check className="h-4 w-4" /> Liquidity Added!</>
            ) : (
              <><Droplets className="h-4 w-4" /> Add Liquidity</>
            )}
          </button>
        </div>
      )}

      {/* ---- REMOVE TAB ----------------------------------------------------- */}
      {tab === 'remove' && (
        <div role="tabpanel" id="liq-panel-remove" aria-labelledby="liq-tab-remove" className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs text-gray-500">LP Tokens to Remove</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.0"
              value={removeAmount}
              onChange={(e) => {
                const val = e.target.value;
                if (/^[0-9]*\.?[0-9]*$/.test(val)) setRemoveAmount(val);
              }}
              className={clsx(
                'w-full rounded-xl px-4 py-3 text-base font-semibold text-white font-mono',
                'bg-[#0D0F14] border border-white/[0.06]',
                'placeholder:text-gray-600',
                'focus:border-white/[0.12] focus:outline-none focus:ring-1 focus:ring-white/[0.08]',
                'transition-all',
              )}
            />
            <div className="mt-1.5 flex items-center justify-between text-[11px]">
              <span className="text-gray-500">
                Your LP: <span className="font-mono text-gray-400">{formatBalance(lpBalance, 18, 6)}</span>
              </span>
              {lpBalance > 0n && (
                <button
                  type="button"
                  onClick={() => setRemoveAmount(ethers.formatUnits(lpBalance, 18))}
                  className="rounded bg-teal-500/10 px-2 py-1 sm:py-0.5 text-[10px] font-bold uppercase text-teal-400 hover:bg-teal-500/20 min-h-[44px] sm:min-h-0"
                >
                  Max
                </button>
              )}
            </div>
            {lpBalance > 0n && (
              <div className="mt-2 flex gap-1.5">
                {[25, 50, 75, 100].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setRemoveAmount(ethers.formatUnits((lpBalance * BigInt(pct)) / 100n, 18))}
                    className="flex-1 rounded-lg bg-white/[0.04] py-2 sm:py-1.5 text-[10px] font-semibold text-gray-500 hover:bg-teal-500/10 hover:text-teal-400 transition-colors min-h-[44px] sm:min-h-0"
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Remove preview */}
          {removePreview && pool && (
            <div className="space-y-1.5 rounded-lg bg-teal-500/5 border border-teal-500/10 px-3 py-2.5 sm:px-4 sm:py-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-400 shrink-0 text-[11px] sm:text-xs">Receive ({tokenLabel(pool?.token0 ?? tokenA)})</span>
                <span className="font-mono text-teal-400 truncate">
                  {formatPrice(Number(ethers.formatUnits(removePreview.amount0, 18)))}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-400 shrink-0 text-[11px] sm:text-xs">Receive ({tokenLabel(pool?.token1 ?? tokenB)})</span>
                <span className="font-mono text-teal-400 truncate">
                  {formatPrice(Number(ethers.formatUnits(removePreview.amount1, 18)))}
                </span>
              </div>
            </div>
          )}

          {/* Remove button */}
          <button
            type="button"
            onClick={handleRemoveLiquidity}
            disabled={
              !contractService ||
              !tokenA ||
              !tokenB ||
              !!sameTokenError ||
              parsedRemoveAmount === 0n ||
              parsedRemoveAmount > lpBalance ||
              txStatus !== 'idle'
            }
            className={clsx(
              'flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold transition-all min-h-[44px]',
              txStatus === 'confirmed'
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-gradient-to-r from-teal-600 to-teal-500 text-white shadow-[0_0_20px_rgba(20,184,166,0.15)] hover:shadow-[0_0_30px_rgba(20,184,166,0.25)]',
              'disabled:cursor-not-allowed disabled:opacity-40',
            )}
          >
            {txStatus === 'submitting' ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Removing...</>
            ) : txStatus === 'confirmed' ? (
              <><Check className="h-4 w-4" /> Removed!</>
            ) : (
              <><Minus className="h-4 w-4" /> Remove Liquidity</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
