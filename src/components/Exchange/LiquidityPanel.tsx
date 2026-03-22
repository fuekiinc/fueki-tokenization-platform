/**
 * LiquidityPanel -- Add/Remove liquidity for AMM pools.
 *
 * Two tabs:
 *   - Add: deposit token pair into a pool (or create a new pool)
 *   - Remove: burn LP tokens to withdraw proportional reserves
 *
 * Reuses TokenSelector, glass-morphism styling, and existing patterns.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  AlertCircle,
  Check,
  Droplets,
  Fuel,
  Loader2,
  Minus,
  Plus,
} from 'lucide-react';
import type { WrappedAsset } from '../../types';
import { ContractService, isETH, parseContractError } from '../../lib/blockchain/contracts';
import type { Pool } from '../../lib/blockchain/contracts';
import { getNetworkConfig } from '../../contracts/addresses';
import { formatAddress, formatBalance } from '../../lib/utils/helpers';
import { formatPercent, formatPrice } from '../../lib/formatters';
import { txConfirmedToast, txFailedToast, txSubmittedToast } from '../../lib/utils/txToast';
import { createAdaptivePollingLoop } from '../../lib/rpc/polling';
import { emitRpcRefetch, subscribeToRpcRefetch } from '../../lib/rpc/refetchEvents';
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

function parseEthBalance(value: string): bigint {
  if (!value) return 0n;
  try {
    if (value.includes('.')) {
      return ethers.parseUnits(value, 18);
    }
    return BigInt(value);
  } catch {
    return 0n;
  }
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
  const loadRequestIdRef = useRef(0);

  const tokenAIsETH = isETH(tokenA);
  const tokenBIsETH = isETH(tokenB);
  const sameTokenError = tokenA && tokenB && tokenA.toLowerCase() === tokenB.toLowerCase();
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

  const loadLiquidityState = useCallback(async () => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;

    if (!contractService || !tokenA || !tokenB || sameTokenError) {
      setPool(null);
      setLpBalance(0n);
      setBalanceA(tokenAIsETH ? parseEthBalance(ethBalance) : 0n);
      setBalanceB(tokenBIsETH ? parseEthBalance(ethBalance) : 0n);
      return;
    }

    try {
      const snapshot = await contractService.getAMMPoolSnapshot(tokenA, tokenB, userAddress);
      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      const nextPool =
        snapshot.pool.token0 === ethers.ZeroAddress ? null : snapshot.pool;
      setPool(nextPool);
      setLpBalance(snapshot.liquidityBalance);
    } catch {
      if (loadRequestIdRef.current === requestId) {
        setPool(null);
        setLpBalance(0n);
      }
    }

    try {
      const tokenAddresses = [tokenA, tokenB].filter((address) => !isETH(address));
      const balances = tokenAddresses.length > 0
        ? await contractService.getAssetBalances(tokenAddresses, userAddress)
        : {};
      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      setBalanceA(tokenAIsETH ? parseEthBalance(ethBalance) : (balances[tokenA] ?? 0n));
      setBalanceB(tokenBIsETH ? parseEthBalance(ethBalance) : (balances[tokenB] ?? 0n));
    } catch {
      if (loadRequestIdRef.current === requestId) {
        setBalanceA(tokenAIsETH ? parseEthBalance(ethBalance) : 0n);
        setBalanceB(tokenBIsETH ? parseEthBalance(ethBalance) : 0n);
      }
    }
  }, [
    contractService,
    tokenA,
    tokenB,
    userAddress,
    sameTokenError,
    tokenAIsETH,
    tokenBIsETH,
    ethBalance,
  ]);

  // ---- Load pool data + balances ------------------------------------------

  useEffect(() => {
    void loadLiquidityState();

    if (!contractService || !tokenA || !tokenB || sameTokenError) {
      return;
    }

    const poller = createAdaptivePollingLoop({
      tier: 'medium',
      poll: loadLiquidityState,
      immediate: false,
    });
    const unsubscribeRefetch = subscribeToRpcRefetch(['pool', 'balances', 'allowances'], () => {
      poller.triggerNow();
    });

    return () => {
      unsubscribeRefetch();
      poller.cancel();
    };
  }, [contractService, tokenA, tokenB, sameTokenError, loadLiquidityState]);

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

  // ---- Slippage tolerance (1% = 100 bps) ----------------------------------

  const SLIPPAGE_BPS = 100n; // 1%
  const [removePercent, setRemovePercent] = useState(0);

  // ---- Pool share preview -------------------------------------------------

  const sharePreview = useMemo(() => {
    if (!pool || pool.totalLiquidity === 0n || parsedAmountA === 0n) return null;
    // Guard against division by zero when reserves are empty (initial pool seeding)
    if (pool.reserve0 === 0n || pool.reserve1 === 0n) return null;
    // Estimated new LP tokens (proportional to smaller ratio)
    const lp0 = (parsedAmountA * pool.totalLiquidity) / pool.reserve0;
    const lp1 = (parsedAmountB * pool.totalLiquidity) / pool.reserve1;
    const newLp = lp0 < lp1 ? lp0 : lp1;
    const newTotal = pool.totalLiquidity + newLp;
    if (newTotal === 0n) return null;
    // Use BigInt-safe percentage: (newLp * 10000) / newTotal gives bps
    const share = Number((newLp * 10000n) / newTotal) / 100;
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
    if (!chainId) {
      toast.error('Unable to detect your network. Please reconnect your wallet.');
      return;
    }
    setTxStatus('submitting');
    const liqChainId = chainId;
    try {
      const tx = await contractService.createPool(tokenA, tokenB);
      txSubmittedToast(tx.hash, liqChainId, 'Creating pool...');
      await contractService.waitForTransaction(tx);
      emitRpcRefetch(['pool', 'balances', 'market-data']);
      txConfirmedToast(tx.hash, 'Pool created!');
      setTxStatus('confirmed');
      setTimeout(() => { setTxStatus('idle'); onLiquidityChanged(); }, 2000);
    } catch (err: unknown) {
      toast.error(parseContractError(err), { id: 'create-pool' });
      setTxStatus('idle');
    }
  }, [contractService, tokenA, tokenB, chainId, onLiquidityChanged]);

  const handleAddLiquidity = useCallback(async () => {
    if (!contractService || !tokenA || !tokenB || parsedAmountA === 0n || parsedAmountB === 0n) return;
    if (txStatus !== 'idle' && txStatus !== 'confirmed') return;

    if (!chainId) {
      toast.error('Unable to detect your network. Please reconnect your wallet.');
      return;
    }

    const config = getNetworkConfig(chainId);
    const ammAddress = config?.ammAddress;

    const liqChainId = chainId;

    // Approve tokenA if not ETH
    if (!tokenAIsETH && ammAddress) {
      setTxStatus('approving-a');
      try {
        const allowA = await contractService.getAssetAllowance(tokenA, userAddress, ammAddress);
        if (allowA < parsedAmountA) {
          const approveTxA = await contractService.approveAMM(tokenA, parsedAmountA);
          txSubmittedToast(approveTxA.hash, liqChainId, `Approving ${tokenLabel(tokenA)}...`);
          await contractService.waitForTransaction(approveTxA);
          emitRpcRefetch(['allowances']);
          txConfirmedToast(approveTxA.hash, `${tokenLabel(tokenA)} approved for pool`);
        }
      } catch (err: unknown) {
        toast.error(parseContractError(err));
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
          const approveTxB = await contractService.approveAMM(tokenB, parsedAmountB);
          txSubmittedToast(approveTxB.hash, liqChainId, `Approving ${tokenLabel(tokenB)}...`);
          await contractService.waitForTransaction(approveTxB);
          emitRpcRefetch(['allowances']);
          txConfirmedToast(approveTxB.hash, `${tokenLabel(tokenB)} approved for pool`);
        }
      } catch (err: unknown) {
        toast.error(parseContractError(err));
        setTxStatus('idle');
        return;
      }
    }

    // Add liquidity
    setTxStatus('submitting');
    let submittedAddHash: string | null = null;
    try {
      // Calculate minimum LP tokens with slippage protection
      let expectedLp = 0n;
      if (pool && pool.totalLiquidity > 0n && pool.reserve0 > 0n && pool.reserve1 > 0n) {
        const lp0 = (parsedAmountA * pool.totalLiquidity) / pool.reserve0;
        const lp1 = (parsedAmountB * pool.totalLiquidity) / pool.reserve1;
        expectedLp = lp0 < lp1 ? lp0 : lp1;
      }
      const minLiquidity = expectedLp - (expectedLp * SLIPPAGE_BPS) / 10000n;
      const minAmountA = parsedAmountA - (parsedAmountA * SLIPPAGE_BPS) / 10000n;
      const minAmountB = parsedAmountB - (parsedAmountB * SLIPPAGE_BPS) / 10000n;

      let tx;
      if (tokenAIsETH) {
        tx = await contractService.addLiquidityETH(
          tokenB,
          parsedAmountB,
          minLiquidity,
          parsedAmountA,
          minAmountB,
          minAmountA,
        );
      } else if (tokenBIsETH) {
        tx = await contractService.addLiquidityETH(
          tokenA,
          parsedAmountA,
          minLiquidity,
          parsedAmountB,
          minAmountA,
          minAmountB,
        );
      } else {
        tx = await contractService.addLiquidity(tokenA, tokenB, parsedAmountA, parsedAmountB, minLiquidity);
      }
      submittedAddHash = tx.hash;
      txSubmittedToast(tx.hash, liqChainId, 'Adding liquidity...');
      await contractService.waitForTransaction(tx);
      emitRpcRefetch(['pool', 'balances', 'allowances', 'market-data']);
      txConfirmedToast(tx.hash, 'Liquidity added!');
      setTxStatus('confirmed');
      setAmountA('');
      setAmountB('');
      setTimeout(() => { setTxStatus('idle'); onLiquidityChanged(); }, 2000);
    } catch (err: unknown) {
      if (submittedAddHash) {
        txFailedToast(submittedAddHash, parseContractError(err));
      } else {
        toast.error(parseContractError(err));
      }
      setTxStatus('idle');
    }
  }, [contractService, tokenA, tokenB, parsedAmountA, parsedAmountB, tokenAIsETH, tokenBIsETH, userAddress, chainId, txStatus, onLiquidityChanged, tokenLabel, pool]);

  const handleRemoveLiquidity = useCallback(async () => {
    if (!contractService || !tokenA || !tokenB || parsedRemoveAmount === 0n) return;
    if (txStatus !== 'idle') return;
    if (!chainId) {
      toast.error('Unable to detect your network. Please reconnect your wallet.');
      return;
    }

    const liqChainId = chainId;
    setTxStatus('submitting');
    let submittedRemoveHash: string | null = null;
    try {
      // Calculate minimum output amounts with slippage protection
      let expectedA = 0n;
      let expectedB = 0n;
      if (pool && pool.totalLiquidity > 0n) {
        expectedA = (parsedRemoveAmount * pool.reserve0) / pool.totalLiquidity;
        expectedB = (parsedRemoveAmount * pool.reserve1) / pool.totalLiquidity;
      }
      const minA = expectedA - (expectedA * SLIPPAGE_BPS) / 10000n;
      const minB = expectedB - (expectedB * SLIPPAGE_BPS) / 10000n;

      let tx;
      if (tokenAIsETH) {
        tx = await contractService.removeLiquidityETH(tokenB, parsedRemoveAmount, minB, minA);
      } else if (tokenBIsETH) {
        tx = await contractService.removeLiquidityETH(tokenA, parsedRemoveAmount, minA, minB);
      } else {
        tx = await contractService.removeLiquidity(tokenA, tokenB, parsedRemoveAmount, minA, minB);
      }
      submittedRemoveHash = tx.hash;
      txSubmittedToast(tx.hash, liqChainId, 'Removing liquidity...');
      await contractService.waitForTransaction(tx);
      emitRpcRefetch(['pool', 'balances', 'market-data']);
      txConfirmedToast(tx.hash, 'Liquidity removed!');
      setTxStatus('confirmed');
      setRemoveAmount('');
      setTimeout(() => { setTxStatus('idle'); onLiquidityChanged(); }, 2000);
    } catch (err: unknown) {
      if (submittedRemoveHash) {
        txFailedToast(submittedRemoveHash, parseContractError(err));
      } else {
        toast.error(parseContractError(err));
      }
      setTxStatus('idle');
    }
  }, [contractService, tokenA, tokenB, parsedRemoveAmount, tokenAIsETH, tokenBIsETH, txStatus, chainId, onLiquidityChanged]);

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
          Add Liquidity
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
          Remove Liquidity
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
                    {formatPercent(Number((lpBalance * 10000n) / pool.totalLiquidity) / 100)}
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
            <label className="mb-1.5 block text-xs text-gray-500">
              Amount A {tokenA ? `(${tokenLabel(tokenA)})` : ''}
            </label>
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
                parsedAmountA > 0n && parsedAmountA > balanceA && 'border-red-500/50 focus:border-red-500/70 focus:ring-red-500/20',
              )}
            />
            {tokenA && (
              <div className="mt-1.5 flex items-center justify-between text-[11px]">
                <span className="text-gray-500">
                  Balance: <span className="font-mono text-gray-400">{formatBalance(balanceA, 18, 6)}</span>
                </span>
                {parsedAmountA > 0n && parsedAmountA > balanceA && (
                  <span className="flex items-center gap-1 text-red-400">
                    <AlertCircle className="h-3 w-3" />
                    Insufficient balance
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Amount B */}
          <div>
            <label className="mb-1.5 block text-xs text-gray-500">
              Amount B {tokenB ? `(${tokenLabel(tokenB)})` : ''}
            </label>
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
                parsedAmountB > 0n && parsedAmountB > balanceB && 'border-red-500/50 focus:border-red-500/70 focus:ring-red-500/20',
              )}
            />
            {tokenB && (
              <div className="mt-1.5 flex items-center justify-between text-[11px]">
                <span className="text-gray-500">
                  Balance: <span className="font-mono text-gray-400">{formatBalance(balanceB, 18, 6)}</span>
                </span>
                {parsedAmountB > 0n && parsedAmountB > balanceB && (
                  <span className="flex items-center gap-1 text-red-400">
                    <AlertCircle className="h-3 w-3" />
                    Insufficient balance
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Pool ratio hint when adding to existing pool */}
          {pool && pool.reserve0 > 0n && pool.reserve1 > 0n && (
            <div className="flex items-center justify-between rounded-lg bg-indigo-500/5 border border-indigo-500/10 px-3 py-2 sm:px-4 sm:py-2.5 text-xs">
              <span className="text-gray-400">Current Pool Ratio</span>
              <span className="font-mono text-indigo-400">
                1 {tokenLabel(pool.token0)} = {formatPrice(Number(pool.reserve1) / Number(pool.reserve0))} {tokenLabel(pool.token1)}
              </span>
            </div>
          )}

          {/* Pool share preview */}
          {sharePreview !== null && (
            <div className="rounded-lg bg-purple-500/5 border border-purple-500/10 px-3 py-2 sm:px-4 sm:py-2.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">Estimated Pool Share</span>
                <span className="font-mono font-medium text-purple-400">{formatPercent(sharePreview)}</span>
              </div>
              {/* Impermanent loss estimate info */}
              <div className="flex items-start gap-2 pt-1.5 border-t border-purple-500/10">
                <AlertCircle className="h-3 w-3 shrink-0 mt-0.5 text-gray-500" />
                <p className="text-[10px] leading-relaxed text-gray-500">
                  Providing liquidity involves impermanent loss risk. If token prices diverge significantly
                  from the ratio at deposit time, you may receive fewer tokens than if you had simply held them.
                  Pool fees help offset this risk over time.
                </p>
              </div>
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
          {(() => {
            const insufficientA = parsedAmountA > 0n && parsedAmountA > balanceA;
            const insufficientB = parsedAmountB > 0n && parsedAmountB > balanceB;
            const isDisabled =
              !contractService ||
              !tokenA ||
              !tokenB ||
              !!sameTokenError ||
              pool === null ||
              parsedAmountA === 0n ||
              parsedAmountB === 0n ||
              insufficientA ||
              insufficientB ||
              (txStatus !== 'idle' && txStatus !== 'confirmed');

            // Determine button label with clear reason
            let addLabel = 'Add Liquidity';
            if (txStatus === 'approving-a') addLabel = 'Approving Token A...';
            else if (txStatus === 'approving-b') addLabel = 'Approving Token B...';
            else if (txStatus === 'submitting') addLabel = 'Adding Liquidity...';
            else if (txStatus === 'confirmed') addLabel = 'Liquidity Added!';
            else if (!tokenA || !tokenB) addLabel = 'Select both tokens';
            else if (pool === null) addLabel = 'Create pool first';
            else if (parsedAmountA === 0n || parsedAmountB === 0n) addLabel = 'Enter amounts';
            else if (insufficientA) addLabel = `Insufficient ${tokenLabel(tokenA)} balance`;
            else if (insufficientB) addLabel = `Insufficient ${tokenLabel(tokenB)} balance`;

            return (
              <button
                type="button"
                onClick={handleAddLiquidity}
                disabled={isDisabled}
                className={clsx(
                  'flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold transition-all min-h-[44px]',
                  txStatus === 'confirmed'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.15)] hover:shadow-[0_0_30px_rgba(168,85,247,0.25)]',
                  'disabled:cursor-not-allowed disabled:opacity-40',
                )}
              >
                {(txStatus === 'approving-a' || txStatus === 'approving-b' || txStatus === 'submitting') && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {txStatus === 'confirmed' && <Check className="h-4 w-4" />}
                {txStatus === 'idle' && <Droplets className="h-4 w-4" />}
                {addLabel}
              </button>
            );
          })()}
        </div>
      )}

      {/* ---- REMOVE TAB ----------------------------------------------------- */}
      {tab === 'remove' && (
        <div role="tabpanel" id="liq-panel-remove" aria-labelledby="liq-tab-remove" className="space-y-4">
          {/* Percentage slider */}
          {lpBalance > 0n && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs text-gray-500">Remove Amount</label>
                <span className="font-mono text-lg font-bold text-teal-400">{removePercent}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={removePercent}
                onChange={(e) => {
                  const pct = Number(e.target.value);
                  setRemovePercent(pct);
                  if (pct === 0) {
                    setRemoveAmount('');
                  } else {
                    setRemoveAmount(ethers.formatUnits((lpBalance * BigInt(pct)) / 100n, 18));
                  }
                }}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/[0.06] accent-teal-500"
                style={{
                  background: `linear-gradient(to right, rgb(20, 184, 166) 0%, rgb(20, 184, 166) ${removePercent}%, rgba(255,255,255,0.06) ${removePercent}%, rgba(255,255,255,0.06) 100%)`,
                }}
              />
              <div className="mt-2 flex gap-1.5">
                {[25, 50, 75, 100].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => {
                      setRemovePercent(pct);
                      setRemoveAmount(ethers.formatUnits((lpBalance * BigInt(pct)) / 100n, 18));
                    }}
                    className={clsx(
                      'flex-1 rounded-lg py-2 sm:py-1.5 text-[10px] font-semibold transition-colors min-h-[44px] sm:min-h-0',
                      removePercent === pct
                        ? 'bg-teal-500/15 text-teal-400 ring-1 ring-teal-500/30'
                        : 'bg-white/[0.04] text-gray-500 hover:bg-teal-500/10 hover:text-teal-400',
                    )}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs text-gray-500">LP Tokens to Remove</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.0"
              value={removeAmount}
              onChange={(e) => {
                const val = e.target.value;
                if (/^[0-9]*\.?[0-9]*$/.test(val)) {
                  setRemoveAmount(val);
                  // Sync percent slider
                  if (lpBalance > 0n) {
                    try {
                      const parsed = val ? ethers.parseUnits(val, 18) : 0n;
                      const pct = Number((parsed * 100n) / lpBalance);
                      setRemovePercent(Math.min(pct, 100));
                    } catch {
                      setRemovePercent(0);
                    }
                  }
                }
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
                  onClick={() => { setRemoveAmount(ethers.formatUnits(lpBalance, 18)); setRemovePercent(100); }}
                  className="rounded bg-teal-500/10 px-2 py-1 sm:py-0.5 text-[10px] font-bold uppercase text-teal-400 hover:bg-teal-500/20 min-h-[44px] sm:min-h-0"
                >
                  Max
                </button>
              )}
            </div>
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
            ) : parsedRemoveAmount === 0n ? (
              'Enter amount to remove'
            ) : parsedRemoveAmount > lpBalance ? (
              'Exceeds LP balance'
            ) : (
              <><Minus className="h-4 w-4" /> Remove Liquidity</>
            )}
          </button>

          {/* Exceeds LP balance inline warning */}
          {parsedRemoveAmount > 0n && parsedRemoveAmount > lpBalance && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-xs text-red-400" role="alert">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Amount exceeds your LP balance.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
