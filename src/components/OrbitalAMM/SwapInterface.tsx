/**
 * SwapInterface -- Token swap form for Orbital AMM pools.
 *
 * Allows the user to:
 *   1. Select a pool
 *   2. Choose input and output tokens from that pool
 *   3. Enter an amount and see a live price quote (getAmountOut)
 *   4. Execute the swap with an approval flow and slippage protection
 *
 * Follows the glass-morphism styling of the existing platform.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  AlertCircle,
  ArrowDownUp,
  Check,
  ChevronDown,
  Info,
  Loader2,
  Zap,
} from 'lucide-react';
import { OrbitalContractService } from '../../lib/blockchain/orbitalContracts';
import { parseContractError } from '../../lib/blockchain/contracts';
import { formatAddress, formatBalance } from '../../lib/utils/helpers';
import { formatPercent, formatPrice } from '../../lib/formatters';
import HelpTooltip from '../Common/HelpTooltip';
import logger from '../../lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TxStatus = 'idle' | 'quoting' | 'approving' | 'swapping' | 'confirmed';

interface TokenInfo {
  address: string;
  symbol: string;
  index: number;
}

interface PoolMeta {
  address: string;
  name: string;
  symbol: string;
  tokens: TokenInfo[];
  concentration: number;
  swapFeeBps: number; // Converted from bigint for display
}

interface SwapInterfaceProps {
  contractService: OrbitalContractService | null;
  userAddress: string;
  selectedPoolAddress?: string | null;
  onSwapComplete?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WAD = 10n ** 18n;

function formatFeeBps(bps: number): string {
  return formatPercent(bps / 100);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SwapInterface({
  contractService,
  userAddress,
  selectedPoolAddress,
  onSwapComplete,
}: SwapInterfaceProps) {
  // ---- Pool state -----------------------------------------------------------

  const [pools, setPools] = useState<PoolMeta[]>([]);
  const [loadingPools, setLoadingPools] = useState(false);
  const [selectedPool, setSelectedPool] = useState<PoolMeta | null>(null);
  const [poolDropdownOpen, setPoolDropdownOpen] = useState(false);

  // ---- Swap state -----------------------------------------------------------

  const [tokenIn, setTokenIn] = useState<TokenInfo | null>(null);
  const [tokenOut, setTokenOut] = useState<TokenInfo | null>(null);
  const [amountIn, setAmountIn] = useState('');
  const [quoteOut, setQuoteOut] = useState<bigint>(0n);
  const [feeAmount, setFeeAmount] = useState<bigint>(0n);
  const [balanceIn, setBalanceIn] = useState<bigint>(0n);
  const [balanceOut, setBalanceOut] = useState<bigint>(0n);
  const [slippageBps, setSlippageBps] = useState(50); // 0.5%
  const [txStatus, setTxStatus] = useState<TxStatus>('idle');
  const [showSlippageSettings, setShowSlippageSettings] = useState(false);
  const [showSwapReview, setShowSwapReview] = useState(false);
  const [quoteCountdown, setQuoteCountdown] = useState(15);
  const [customSlippage, setCustomSlippage] = useState('');

  // ---- Timer ref for status reset -------------------------------------------

  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    return () => {
      clearTimeout(statusTimerRef.current);
      clearInterval(refreshIntervalRef.current);
    };
  }, []);

  // ---- Derived values -------------------------------------------------------

  const parsedAmountIn = useMemo(() => {
    try {
      if (!amountIn || Number(amountIn) <= 0) return 0n;
      return ethers.parseUnits(amountIn, 18);
    } catch {
      return 0n;
    }
  }, [amountIn]);

  const minAmountOut = useMemo(() => {
    if (quoteOut === 0n) return 0n;
    return quoteOut - (quoteOut * BigInt(slippageBps)) / 10000n;
  }, [quoteOut, slippageBps]);

  // ---- Spot price for accurate price impact ----------------------------------

  const [spotPrice, setSpotPrice] = useState<bigint>(0n);

  useEffect(() => {
    let cancelled = false;

    async function fetchSpotPrice() {
      if (!contractService || !selectedPool || !tokenIn || !tokenOut) {
        setSpotPrice(0n);
        return;
      }
      try {
        const sp = await contractService.getSpotPrice(
          selectedPool.address,
          tokenIn.index,
          tokenOut.index,
        );
        if (!cancelled) setSpotPrice(sp);
      } catch {
        if (!cancelled) setSpotPrice(0n);
      }
    }

    void fetchSpotPrice();
    return () => { cancelled = true; };
  }, [contractService, selectedPool, tokenIn, tokenOut, txStatus]);

  const priceImpact = useMemo(() => {
    if (parsedAmountIn === 0n || quoteOut === 0n) return null;

    if (spotPrice > 0n) {
      // Accurate: compare execution price vs spot price
      // spotPrice is WAD-scaled (1e18). executionPrice = quoteOut / amountIn (also WAD-scaled).
      const executionPrice = (quoteOut * WAD) / parsedAmountIn;
      const impact = Number(spotPrice - executionPrice) / Number(spotPrice) * 100;
      return Math.max(0, impact);
    }

    // Fallback: rough estimate when spot price unavailable
    const ratio = Number(quoteOut) / Number(parsedAmountIn);
    return Math.max(0, (1 - ratio) * 100);
  }, [parsedAmountIn, quoteOut, spotPrice]);

  // ---- Load pool list -------------------------------------------------------

  const fetchPools = useCallback(async () => {
    if (!contractService) return;

    setLoadingPools(true);
    try {
      const poolAddresses = await contractService.getAllPools();
      const poolList: PoolMeta[] = [];

      await Promise.all(
        poolAddresses.map(async (addr) => {
          try {
            const info = await contractService.getPoolInfo(addr);
            const tokenInfos: TokenInfo[] = await Promise.all(
              info.tokens.map(async (tokenAddr, idx) => {
                let sym: string;
                try {
                  const ti = await contractService.getTokenInfo(tokenAddr);
                  sym = ti.symbol;
                } catch {
                  sym = formatAddress(tokenAddr);
                }
                return { address: tokenAddr, symbol: sym, index: idx };
              }),
            );

            poolList.push({
              address: addr,
              name: info.name,
              symbol: info.symbol,
              tokens: tokenInfos,
              concentration: info.concentration,
              swapFeeBps: Number(info.swapFeeBps),
            });
          } catch (err) {
            logger.error(`Failed to load pool ${addr}:`, err);
          }
        }),
      );

      setPools(poolList);

      // Auto-select pool if specified
      if (selectedPoolAddress) {
        const match = poolList.find(
          (p) => p.address.toLowerCase() === selectedPoolAddress.toLowerCase(),
        );
        if (match) {
          setSelectedPool(match);
          if (match.tokens.length >= 2) {
            setTokenIn(match.tokens[0]);
            setTokenOut(match.tokens[1]);
          }
        }
      }
    } catch (err) {
      logger.error('Failed to fetch pools:', err);
      toast.error('Unable to load liquidity pools. Check your connection and try again.');
    } finally {
      setLoadingPools(false);
    }
  }, [contractService, selectedPoolAddress]);

  useEffect(() => {
    void fetchPools();
  }, [fetchPools]);

  // ---- Fetch balances -------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function loadBalances() {
      if (!contractService || !userAddress) return;

      if (tokenIn) {
        try {
          const bal = await contractService.getTokenBalance(tokenIn.address, userAddress);
          if (!cancelled) setBalanceIn(bal);
        } catch {
          if (!cancelled) setBalanceIn(0n);
        }
      }

      if (tokenOut) {
        try {
          const bal = await contractService.getTokenBalance(tokenOut.address, userAddress);
          if (!cancelled) setBalanceOut(bal);
        } catch {
          if (!cancelled) setBalanceOut(0n);
        }
      }
    }

    void loadBalances();
    return () => {
      cancelled = true;
    };
  }, [contractService, userAddress, tokenIn, tokenOut, txStatus]);

  // ---- Fetch quote ----------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function fetchQuote() {
      if (
        !contractService ||
        !selectedPool ||
        !tokenIn ||
        !tokenOut ||
        parsedAmountIn === 0n
      ) {
        setQuoteOut(0n);
        setFeeAmount(0n);
        return;
      }

      try {
        const result = await contractService.getPoolAmountOut(
          selectedPool.address,
          tokenIn.index,
          tokenOut.index,
          parsedAmountIn,
        );
        if (!cancelled) {
          setQuoteOut(result.amountOut);
          setFeeAmount(result.feeAmount);
        }
      } catch {
        if (!cancelled) {
          setQuoteOut(0n);
          setFeeAmount(0n);
        }
      }
    }

    const timer = setTimeout(() => {
      void fetchQuote();
    }, 300); // Debounce

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [contractService, selectedPool, tokenIn, tokenOut, parsedAmountIn]);

  // ---- Auto-refresh quotes every 15 seconds ---------------------------------

  useEffect(() => {
    if (!contractService || !selectedPool || !tokenIn || !tokenOut || parsedAmountIn === 0n) {
      setQuoteCountdown(15);
      clearInterval(refreshIntervalRef.current);
      return;
    }

    setQuoteCountdown(15);
    refreshIntervalRef.current = setInterval(() => {
      setQuoteCountdown((prev) => {
        if (prev <= 1) {
          // Re-fetch quote
          void (async () => {
            try {
              const result = await contractService.getPoolAmountOut(
                selectedPool.address,
                tokenIn.index,
                tokenOut.index,
                parsedAmountIn,
              );
              setQuoteOut(result.amountOut);
              setFeeAmount(result.feeAmount);
            } catch {
              // keep existing quote
            }
          })();
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(refreshIntervalRef.current);
  }, [contractService, selectedPool, tokenIn, tokenOut, parsedAmountIn]);

  // ---- Price impact severity classification ---------------------------------

  const priceImpactSeverity = useMemo(() => {
    if (priceImpact === null) return 'none' as const;
    if (priceImpact >= 10) return 'blocking' as const;
    if (priceImpact >= 5) return 'high' as const;
    if (priceImpact >= 1) return 'medium' as const;
    return 'low' as const;
  }, [priceImpact]);

  // ---- Pool selection -------------------------------------------------------

  const handleSelectPool = useCallback(
    (pool: PoolMeta) => {
      setSelectedPool(pool);
      setPoolDropdownOpen(false);
      setAmountIn('');
      setQuoteOut(0n);
      setFeeAmount(0n);
      if (pool.tokens.length >= 2) {
        setTokenIn(pool.tokens[0]);
        setTokenOut(pool.tokens[1]);
      } else {
        setTokenIn(null);
        setTokenOut(null);
      }
    },
    [],
  );

  // ---- Flip tokens ----------------------------------------------------------

  const handleFlipTokens = useCallback(() => {
    const prevIn = tokenIn;
    const prevOut = tokenOut;
    setTokenIn(prevOut);
    setTokenOut(prevIn);
    setAmountIn('');
    setQuoteOut(0n);
    setFeeAmount(0n);
  }, [tokenIn, tokenOut]);

  // ---- Max amount -----------------------------------------------------------

  const handleMax = useCallback(() => {
    if (balanceIn > 0n) {
      setAmountIn(ethers.formatUnits(balanceIn, 18));
    }
  }, [balanceIn]);

  // ---- Execute swap ---------------------------------------------------------

  const handleSwap = useCallback(async () => {
    if (
      !contractService ||
      !selectedPool ||
      !tokenIn ||
      !tokenOut ||
      parsedAmountIn === 0n ||
      quoteOut === 0n
    ) {
      return;
    }

    // 1. Check & approve (approve the ROUTER, which does transferFrom)
    setTxStatus('approving');
    try {
      const routerAddress = contractService.getRouterAddress();
      const allowance = await contractService.getTokenAllowance(
        tokenIn.address,
        userAddress,
        routerAddress,
      );
      if (allowance < parsedAmountIn) {
        toast.loading('Approving token spend...', { id: 'orbital-approve' });
        const approveTx = await contractService.approveRouter(
          tokenIn.address,
          parsedAmountIn,
        );
        await contractService.waitForTransaction(approveTx);
        toast.success('Token approved', { id: 'orbital-approve' });
      }
    } catch (err: unknown) {
      toast.error(parseContractError(err), { id: 'orbital-approve' });
      setTxStatus('idle');
      return;
    }

    // 2. Execute swap
    setTxStatus('swapping');
    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 minutes
      toast.loading('Executing swap...', { id: 'orbital-swap' });
      const tx = await contractService.swap(
        selectedPool.address,
        tokenIn.address,
        tokenOut.address,
        parsedAmountIn,
        minAmountOut,
        deadline,
      );
      await contractService.waitForTransaction(tx);
      toast.success('Swap successful!', { id: 'orbital-swap' });
      setTxStatus('confirmed');
      setAmountIn('');
      setQuoteOut(0n);
      setFeeAmount(0n);
      onSwapComplete?.();
      clearTimeout(statusTimerRef.current);
      statusTimerRef.current = setTimeout(() => setTxStatus('idle'), 2500);
    } catch (err: unknown) {
      toast.error(parseContractError(err), { id: 'orbital-swap' });
      setTxStatus('idle');
    }
  }, [
    contractService,
    selectedPool,
    tokenIn,
    tokenOut,
    parsedAmountIn,
    quoteOut,
    minAmountOut,
    userAddress,
    onSwapComplete,
  ]);

  // ---- Validation -----------------------------------------------------------

  const sameTokenError = tokenIn && tokenOut && tokenIn.address === tokenOut.address;
  const insufficientBalance = parsedAmountIn > 0n && parsedAmountIn > balanceIn;

  const swapDisabled =
    !contractService ||
    !selectedPool ||
    !tokenIn ||
    !tokenOut ||
    !!sameTokenError ||
    parsedAmountIn === 0n ||
    quoteOut === 0n ||
    !!insufficientBalance ||
    priceImpactSeverity === 'blocking' ||
    (txStatus !== 'idle' && txStatus !== 'confirmed');

  // ---- Render ---------------------------------------------------------------

  return (
    <div className="space-y-5">
      {/* Pool selector */}
      <div>
        <label className="mb-1.5 block text-xs text-gray-500">Select Pool</label>
        <div className="relative">
          <button
            type="button"
            onClick={() => setPoolDropdownOpen(!poolDropdownOpen)}
            className={clsx(
              'flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm',
              'bg-[#0D0F14] border border-white/[0.06]',
              'hover:border-white/[0.12] transition-all',
              selectedPool ? 'text-white' : 'text-gray-500',
            )}
          >
            {loadingPools ? (
              <span className="flex items-center gap-2 text-gray-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading pools...
              </span>
            ) : selectedPool ? (
              <span className="flex items-center gap-2">
                <span className="font-semibold">{selectedPool.name}</span>
                <span className="text-xs text-gray-500">
                  ({selectedPool.tokens.map((t) => t.symbol).join(' / ')})
                </span>
              </span>
            ) : (
              'Choose a pool...'
            )}
            <ChevronDown
              className={clsx(
                'h-4 w-4 text-gray-500 transition-transform',
                poolDropdownOpen && 'rotate-180',
              )}
            />
          </button>

          {/* Pool dropdown */}
          {poolDropdownOpen && pools.length > 0 && (
            <div
              className={clsx(
                'absolute z-50 mt-1 w-full rounded-xl py-1.5',
                'bg-[#12141A] border border-white/[0.08]',
                'shadow-2xl shadow-black/50',
                'max-h-60 overflow-y-auto',
              )}
            >
              {pools.map((pool) => (
                <button
                  key={pool.address}
                  type="button"
                  onClick={() => handleSelectPool(pool)}
                  className={clsx(
                    'flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors',
                    'hover:bg-white/[0.04]',
                    selectedPool?.address === pool.address
                      ? 'text-indigo-400'
                      : 'text-gray-300',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{pool.name}</div>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {pool.tokens.map((t) => (
                        <span
                          key={t.index}
                          className="text-[10px] text-gray-500"
                        >
                          {t.symbol}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] text-gray-600">
                    {formatFeeBps(pool.swapFeeBps)} fee
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedPool && (
        <>
          {/* Token In */}
          <div className="rounded-xl bg-[#0D0F14] border border-white/[0.06] p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-500">You Pay</label>
              <span className="text-[11px] text-gray-500">
                Balance:{' '}
                <span className="font-mono text-gray-400">
                  {formatBalance(balanceIn, 18, 6)}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.0"
                value={amountIn}
                onChange={(e) => {
                  const val = e.target.value;
                  if (/^[0-9]*\.?[0-9]*$/.test(val)) setAmountIn(val);
                }}
                className={clsx(
                  'flex-1 bg-transparent text-xl font-semibold text-white font-mono',
                  'placeholder:text-gray-600',
                  'focus:outline-none',
                )}
              />
              <div className="flex items-center gap-2">
                {balanceIn > 0n && (
                  <button
                    type="button"
                    onClick={handleMax}
                    className="rounded bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-400 hover:bg-indigo-500/20 transition-colors"
                  >
                    Max
                  </button>
                )}
                <select
                  value={tokenIn?.index ?? ''}
                  onChange={(e) => {
                    const idx = Number(e.target.value);
                    const token = selectedPool.tokens.find((t) => t.index === idx);
                    if (token) setTokenIn(token);
                  }}
                  className={clsx(
                    'rounded-lg bg-white/[0.06] px-3 py-2 text-sm font-semibold text-white',
                    'border-none outline-none cursor-pointer',
                    'appearance-none',
                  )}
                >
                  {selectedPool.tokens.map((t) => (
                    <option key={t.index} value={t.index}>
                      {t.symbol}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Flip button */}
          <div className="flex justify-center -my-2 relative z-10">
            <button
              type="button"
              onClick={handleFlipTokens}
              title="Swap input and output tokens"
              className={clsx(
                'group flex h-10 w-10 items-center justify-center rounded-xl',
                'bg-[#0D0F14] border border-white/[0.08]',
                'text-gray-400 hover:text-white hover:border-indigo-500/30 hover:bg-indigo-500/10',
                'transition-all duration-200',
              )}
            >
              <ArrowDownUp className="h-4 w-4 transition-transform duration-300 group-hover:rotate-180" />
            </button>
          </div>

          {/* Token Out */}
          <div className="rounded-xl bg-[#0D0F14] border border-white/[0.06] p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-500">You Receive</label>
              <span className="text-[11px] text-gray-500">
                Balance:{' '}
                <span className="font-mono text-gray-400">
                  {formatBalance(balanceOut, 18, 6)}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 text-xl font-semibold font-mono text-white">
                {quoteOut > 0n
                  ? formatBalance(quoteOut, 18, 6)
                  : <span className="text-gray-600">0.0</span>}
              </div>
              <select
                value={tokenOut?.index ?? ''}
                onChange={(e) => {
                  const idx = Number(e.target.value);
                  const token = selectedPool.tokens.find((t) => t.index === idx);
                  if (token) setTokenOut(token);
                }}
                className={clsx(
                  'rounded-lg bg-white/[0.06] px-3 py-2 text-sm font-semibold text-white',
                  'border-none outline-none cursor-pointer',
                  'appearance-none',
                )}
              >
                {selectedPool.tokens.map((t) => (
                  <option key={t.index} value={t.index}>
                    {t.symbol}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Errors */}
          {sameTokenError && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Select two different tokens to swap. Input and output cannot be the same.
            </div>
          )}

          {insufficientBalance && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Insufficient balance. You need{' '}
              {formatBalance(parsedAmountIn, 18, 6)} but have{' '}
              {formatBalance(balanceIn, 18, 6)}.
            </div>
          )}

          {/* Swap details */}
          {parsedAmountIn > 0n && quoteOut > 0n && !sameTokenError && (
            <div className="space-y-2 rounded-xl bg-[#0D0F14]/80 border border-white/[0.06] px-4 py-3.5">
              {/* Rate */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Rate</span>
                <span className="font-mono text-gray-300">
                  1 {tokenIn?.symbol} ={' '}
                  {parsedAmountIn > 0n
                    ? formatPrice(Number(quoteOut) / Number(parsedAmountIn))
                    : '0'}{' '}
                  {tokenOut?.symbol}
                </span>
              </div>

              {/* Fee */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">
                  Fee ({formatFeeBps(selectedPool.swapFeeBps)})
                </span>
                <span className="font-mono text-gray-400">
                  {formatBalance(feeAmount, 18, 6)} {tokenIn?.symbol}
                </span>
              </div>

              {/* Price impact with severity styling */}
              {priceImpact !== null && (
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-gray-500">
                    Price Impact
                    <HelpTooltip
                      tooltipId="orbital.priceImpact"
                      flow="orbital"
                      component="SwapInterface.Details"
                    />
                  </span>
                  <span
                    className={clsx(
                      'font-mono font-medium',
                      priceImpactSeverity === 'low' ? 'text-emerald-400' :
                      priceImpactSeverity === 'medium' ? 'text-amber-400' :
                      priceImpactSeverity === 'high' ? 'text-red-400' :
                      priceImpactSeverity === 'blocking' ? 'text-red-500 font-bold' :
                      'text-gray-400',
                    )}
                  >
                    ~{formatPercent(priceImpact)}
                  </span>
                </div>
              )}

              {/* Price impact warning banners */}
              {priceImpactSeverity === 'blocking' && (
                <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5 text-[11px] text-red-400 font-medium">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  Price impact exceeds 10%. This swap would result in a significant loss.
                </div>
              )}
              {priceImpactSeverity === 'high' && (
                <div className="flex items-center gap-2 rounded-lg bg-red-500/5 border border-red-500/15 px-3 py-2 text-[11px] text-red-400">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  High price impact. Consider a smaller trade.
                </div>
              )}

              {/* Min received */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Min. Received</span>
                <span className="font-mono text-gray-300">
                  {formatBalance(minAmountOut, 18, 6)} {tokenOut?.symbol}
                </span>
              </div>

              {/* Slippage */}
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => setShowSlippageSettings(!showSlippageSettings)}
                  className="flex items-center gap-1 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <Info className="h-3 w-3" />
                  Slippage Tolerance
                  <HelpTooltip
                    tooltipId="orbital.slippage"
                    flow="orbital"
                    component="SwapInterface.Details"
                  />
                </button>
                <span className="font-mono text-gray-400">
                  {formatPercent(slippageBps / 100)}
                </span>
              </div>

              {/* Slippage settings */}
              {showSlippageSettings && (
                <div className="mt-2 space-y-2 pt-2 border-t border-white/[0.04]">
                  <div className="flex gap-2">
                    {[10, 50, 100, 200].map((bps) => (
                      <button
                        key={bps}
                        type="button"
                        onClick={() => {
                          setSlippageBps(bps);
                          setCustomSlippage('');
                        }}
                        className={clsx(
                          'flex-1 rounded-lg py-2 text-xs font-semibold transition-all',
                          slippageBps === bps && !customSlippage
                            ? 'bg-indigo-500/20 text-indigo-400 ring-1 ring-indigo-500/30'
                            : 'bg-white/[0.03] text-gray-500 hover:text-gray-300 hover:bg-white/[0.06]',
                        )}
                      >
                        {formatPercent(bps / 100)}
                      </button>
                    ))}
                  </div>
                  {/* Custom slippage input */}
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500">Custom:</span>
                    <div className="relative flex-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="e.g. 0.3"
                        value={customSlippage}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (/^[0-9]*\.?[0-9]*$/.test(val)) {
                            setCustomSlippage(val);
                            const parsed = parseFloat(val);
                            if (!isNaN(parsed) && parsed > 0 && parsed <= 50) {
                              setSlippageBps(Math.round(parsed * 100));
                            }
                          }
                        }}
                        className={clsx(
                          'w-full rounded-lg px-3 py-1.5 pr-7 text-xs font-mono text-white',
                          'bg-white/[0.03] border border-white/[0.06]',
                          'placeholder:text-gray-600',
                          'focus:border-white/[0.12] focus:outline-none',
                          'transition-all',
                        )}
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-500">%</span>
                    </div>
                  </div>
                  {slippageBps >= 200 && (
                    <div className="flex items-center gap-1.5 text-[10px] text-amber-400/80">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      High slippage may result in an unfavorable trade.
                    </div>
                  )}
                </div>
              )}

              {/* Auto-refresh countdown */}
              <div className="flex items-center justify-between text-[10px] text-gray-600 pt-1">
                <span className="inline-flex items-center gap-1.5">
                  Quote auto-refreshes
                  <HelpTooltip
                    tooltipId="orbital.quoteRefresh"
                    flow="orbital"
                    component="SwapInterface.Details"
                  />
                </span>
                <span className="font-mono tabular-nums">
                  {quoteCountdown}s
                </span>
              </div>
            </div>
          )}

          {/* Concentration info */}
          <div className="flex items-center gap-2 px-1 text-[11px] text-gray-500">
            <Zap className="h-3 w-3 text-indigo-400/50" />
            <span>
              Orbital {selectedPool.concentration}x concentration
              -- liquidity focused near equilibrium
            </span>
          </div>

          {/* Swap review panel */}
          {showSwapReview && parsedAmountIn > 0n && quoteOut > 0n && tokenIn && tokenOut && (
            <div className="rounded-xl bg-indigo-500/5 border border-indigo-500/15 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-300">Swap Review</span>
                <button
                  type="button"
                  onClick={() => setShowSwapReview(false)}
                  className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Edit
                </button>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">You pay</span>
                <span className="font-mono text-white">
                  {amountIn} {tokenIn.symbol}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">You receive</span>
                <span className="font-mono text-emerald-400">
                  {formatBalance(quoteOut, 18, 6)} {tokenOut.symbol}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Min. received</span>
                <span className="font-mono text-gray-400">
                  {formatBalance(minAmountOut, 18, 6)} {tokenOut.symbol}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Slippage tolerance</span>
                <span className="font-mono text-gray-400">
                  {formatPercent(slippageBps / 100)}
                </span>
              </div>
              {priceImpact !== null && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Price impact</span>
                  <span
                    className={clsx(
                      'font-mono font-medium',
                      priceImpactSeverity === 'low' ? 'text-emerald-400' :
                      priceImpactSeverity === 'medium' ? 'text-amber-400' :
                      'text-red-400',
                    )}
                  >
                    ~{formatPercent(priceImpact)}
                  </span>
                </div>
              )}
              <p className="text-[10px] text-gray-600 leading-relaxed pt-1 border-t border-white/[0.04]">
                Output is estimated. You will receive at least the minimum amount or the transaction will revert.
              </p>
            </div>
          )}

          {/* Swap button */}
          <button
            type="button"
            onClick={() => {
              if (!showSwapReview && !swapDisabled && parsedAmountIn > 0n && quoteOut > 0n) {
                setShowSwapReview(true);
              } else if (showSwapReview) {
                void handleSwap();
                setShowSwapReview(false);
              }
            }}
            disabled={swapDisabled}
            className={clsx(
              'flex w-full items-center justify-center gap-2 rounded-xl py-4 text-sm font-semibold transition-all',
              txStatus === 'confirmed'
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-[0_0_24px_rgba(99,102,241,0.15)] hover:shadow-[0_0_36px_rgba(99,102,241,0.25)]',
              'disabled:cursor-not-allowed disabled:opacity-40',
            )}
          >
            {txStatus === 'approving' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Approving...
              </>
            ) : txStatus === 'swapping' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Swapping...
              </>
            ) : txStatus === 'confirmed' ? (
              <>
                <Check className="h-4 w-4" />
                Swap Complete!
              </>
            ) : priceImpactSeverity === 'blocking' ? (
              'Price Impact Too High'
            ) : insufficientBalance ? (
              'Insufficient Balance'
            ) : parsedAmountIn === 0n ? (
              'Enter an Amount'
            ) : (
              <>
                <ArrowDownUp className="h-4 w-4" />
                {showSwapReview ? 'Confirm Swap' : 'Review Swap'}
              </>
            )}
          </button>
        </>
      )}

      {/* No pool selected */}
      {!selectedPool && !loadingPools && pools.length > 0 && (
        <div className="flex flex-col items-center py-10 text-center">
          <Info className="mb-3 h-6 w-6 text-gray-600" />
          <p className="text-sm text-gray-400">Select a pool to start swapping</p>
          <p className="mt-1 text-xs text-gray-600">
            Choose from {pools.length} available Orbital pool{pools.length !== 1 ? 's' : ''} above
          </p>
        </div>
      )}

      {/* No pools at all */}
      {!loadingPools && pools.length === 0 && (
        <div className="flex flex-col items-center py-10 text-center">
          <AlertCircle className="mb-3 h-6 w-6 text-gray-600" />
          <p className="text-sm text-gray-400">No Orbital pools available yet</p>
          <p className="mt-1 text-xs text-gray-600">
            Create a new pool to enable token swapping on this network
          </p>
        </div>
      )}
    </div>
  );
}
