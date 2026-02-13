/**
 * LiquidityPanel -- Add/Remove liquidity for Orbital AMM multi-token pools.
 *
 * Two sub-tabs:
 *   - Add: deposit tokens proportionally (or bootstrap initial liquidity)
 *   - Remove: burn LP tokens to withdraw proportional reserves
 *
 * Handles approval flows for each token, shows pool composition, LP balance,
 * slippage settings, and receive-preview for removals.
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
  ChevronDown,
  Info,
  Settings,
  Wallet,
} from 'lucide-react';
import { OrbitalContractService } from '../../lib/blockchain/orbitalContracts';
import { formatAddress, formatBalance } from '../../lib/utils/helpers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LiquidityTab = 'add' | 'remove';
type TxStatus = 'idle' | 'approving' | 'submitting' | 'confirmed';

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
  reserves: bigint[];
  totalSupply: bigint;
  concentration: number;
  swapFeeBps: number; // Converted from bigint for display
}

interface LiquidityPanelProps {
  contractService: OrbitalContractService | null;
  userAddress: string;
  selectedPoolAddress?: string | null;
  onLiquidityChanged?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WAD = 10n ** 18n;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LiquidityPanel({
  contractService,
  userAddress,
  selectedPoolAddress,
  onLiquidityChanged,
}: LiquidityPanelProps) {
  // ---- Tab state ------------------------------------------------------------

  const [tab, setTab] = useState<LiquidityTab>('add');

  // ---- Pool state -----------------------------------------------------------

  const [pools, setPools] = useState<PoolMeta[]>([]);
  const [loadingPools, setLoadingPools] = useState(false);
  const [selectedPool, setSelectedPool] = useState<PoolMeta | null>(null);
  const [poolDropdownOpen, setPoolDropdownOpen] = useState(false);

  // ---- Balances & LP --------------------------------------------------------

  const [tokenBalances, setTokenBalances] = useState<bigint[]>([]);
  const [lpBalance, setLpBalance] = useState<bigint>(0n);

  // ---- Add state ------------------------------------------------------------

  const [addAmounts, setAddAmounts] = useState<string[]>([]);

  // ---- Remove state ---------------------------------------------------------

  const [removeAmount, setRemoveAmount] = useState('');

  // ---- Slippage / TX --------------------------------------------------------

  const [slippageBps, setSlippageBps] = useState(50);
  const [showSlippage, setShowSlippage] = useState(false);
  const [txStatus, setTxStatus] = useState<TxStatus>('idle');

  // ---- Load pools -----------------------------------------------------------

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
              reserves: info.reserves,
              totalSupply: info.totalSupply,
              concentration: info.concentration,
              swapFeeBps: Number(info.swapFeeBps),
            });
          } catch (err) {
            console.error(`Failed to load pool ${addr}:`, err);
          }
        }),
      );

      setPools(poolList);

      if (selectedPoolAddress) {
        const match = poolList.find(
          (p) => p.address.toLowerCase() === selectedPoolAddress.toLowerCase(),
        );
        if (match) {
          setSelectedPool(match);
          setAddAmounts(match.tokens.map(() => ''));
        }
      }
    } catch (err) {
      console.error('Failed to load pools:', err);
    } finally {
      setLoadingPools(false);
    }
  }, [contractService, selectedPoolAddress]);

  useEffect(() => {
    void fetchPools();
  }, [fetchPools]);

  // ---- Fetch balances + LP --------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function loadBalances() {
      if (!contractService || !userAddress || !selectedPool) {
        setTokenBalances([]);
        setLpBalance(0n);
        return;
      }

      // LP balance
      try {
        const lp = await contractService.getLPBalance(selectedPool.address, userAddress);
        if (!cancelled) setLpBalance(lp);
      } catch {
        if (!cancelled) setLpBalance(0n);
      }

      // Token balances
      const bals: bigint[] = [];
      for (const token of selectedPool.tokens) {
        try {
          const bal = await contractService.getTokenBalance(token.address, userAddress);
          bals.push(bal);
        } catch {
          bals.push(0n);
        }
      }
      if (!cancelled) setTokenBalances(bals);
    }

    void loadBalances();
    return () => {
      cancelled = true;
    };
  }, [contractService, userAddress, selectedPool, txStatus]);

  // ---- Parsed add amounts ---------------------------------------------------

  const parsedAddAmounts = useMemo(() => {
    return addAmounts.map((a) => {
      try {
        if (!a || Number(a) <= 0) return 0n;
        return ethers.parseUnits(a, 18);
      } catch {
        return 0n;
      }
    });
  }, [addAmounts]);

  const parsedRemoveAmount = useMemo(() => {
    try {
      if (!removeAmount || Number(removeAmount) <= 0) return 0n;
      return ethers.parseUnits(removeAmount, 18);
    } catch {
      return 0n;
    }
  }, [removeAmount]);

  const anyAddAmount = parsedAddAmounts.some((a) => a > 0n);

  // ---- Pool share preview ---------------------------------------------------

  const sharePreview = useMemo(() => {
    if (!selectedPool || selectedPool.totalSupply === 0n || !anyAddAmount) return null;

    // Estimate LP tokens from the minimum ratio
    let minRatio: bigint | null = null;
    for (let i = 0; i < selectedPool.tokens.length; i++) {
      const reserve = selectedPool.reserves[i];
      const amount = parsedAddAmounts[i] ?? 0n;
      if (reserve > 0n && amount > 0n) {
        const ratio = (amount * WAD) / reserve;
        if (minRatio === null || ratio < minRatio) {
          minRatio = ratio;
        }
      }
    }

    if (minRatio === null || minRatio === 0n) return null;

    const newLp = (minRatio * selectedPool.totalSupply) / WAD;
    const newTotal = selectedPool.totalSupply + newLp;
    const share = (Number(newLp) / Number(newTotal)) * 100;
    return share;
  }, [selectedPool, parsedAddAmounts, anyAddAmount]);

  // ---- Remove preview -------------------------------------------------------

  const removePreview = useMemo(() => {
    if (!selectedPool || selectedPool.totalSupply === 0n || parsedRemoveAmount === 0n) {
      return null;
    }

    return selectedPool.tokens.map((_, i) => {
      const reserve = selectedPool.reserves[i] ?? 0n;
      return (parsedRemoveAmount * reserve) / selectedPool.totalSupply;
    });
  }, [selectedPool, parsedRemoveAmount]);

  // ---- Pool selection -------------------------------------------------------

  const handleSelectPool = useCallback((pool: PoolMeta) => {
    setSelectedPool(pool);
    setPoolDropdownOpen(false);
    setAddAmounts(pool.tokens.map(() => ''));
    setRemoveAmount('');
    setTxStatus('idle');
  }, []);

  // ---- Add liquidity --------------------------------------------------------

  const handleAddLiquidity = useCallback(async () => {
    if (!contractService || !selectedPool || !anyAddAmount) return;
    if (txStatus !== 'idle' && txStatus !== 'confirmed') return;

    // 1. Approve all tokens for the ROUTER (which does transferFrom)
    setTxStatus('approving');
    const routerAddress = contractService.getRouterAddress();
    for (let i = 0; i < selectedPool.tokens.length; i++) {
      const amount = parsedAddAmounts[i];
      if (amount <= 0n) continue;

      const token = selectedPool.tokens[i];
      try {
        const allowance = await contractService.getTokenAllowance(
          token.address,
          userAddress,
          routerAddress,
        );
        if (allowance < amount) {
          const toastId = `approve-${token.symbol}`;
          toast.loading(`Approving ${token.symbol}...`, { id: toastId });
          const tx = await contractService.approveRouter(
            token.address,
            amount,
          );
          await contractService.waitForTransaction(tx);
          toast.success(`${token.symbol} approved`, { id: toastId });
        }
      } catch (err: unknown) {
        toast.error(
          err instanceof Error ? err.message : `Failed to approve ${token.symbol}`,
        );
        setTxStatus('idle');
        return;
      }
    }

    // 2. Add liquidity
    setTxStatus('submitting');
    try {
      const amounts = parsedAddAmounts.map((a) => (a > 0n ? a : 0n));

      // Compute minLiquidity using slippage setting.
      // For initial deposits (totalSupply == 0) there is no reference, so minLiquidity stays 0.
      // For subsequent deposits, estimate LP tokens via the minimum ratio approach
      // and apply the user's slippage tolerance.
      let minLiquidity = 0n;
      if (selectedPool.totalSupply > 0n) {
        let minRatio: bigint | null = null;
        for (let i = 0; i < selectedPool.tokens.length; i++) {
          const reserve = selectedPool.reserves[i];
          const amount = amounts[i];
          if (reserve > 0n && amount > 0n) {
            const ratio = (amount * WAD) / reserve;
            if (minRatio === null || ratio < minRatio) {
              minRatio = ratio;
            }
          }
        }
        if (minRatio !== null && minRatio > 0n) {
          const estimatedLp = (minRatio * selectedPool.totalSupply) / WAD;
          minLiquidity = estimatedLp - (estimatedLp * BigInt(slippageBps)) / 10000n;
          if (minLiquidity < 0n) minLiquidity = 0n;
        }
      }

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

      toast.loading('Adding liquidity...', { id: 'add-orbital-liq' });
      const tx = await contractService.addLiquidity(
        selectedPool.address,
        amounts,
        minLiquidity,
        deadline,
      );
      await contractService.waitForTransaction(tx);
      toast.success('Liquidity added!', { id: 'add-orbital-liq' });
      setTxStatus('confirmed');
      setAddAmounts(selectedPool.tokens.map(() => ''));
      onLiquidityChanged?.();
      // Refresh pool data
      void fetchPools();
      setTimeout(() => setTxStatus('idle'), 2500);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to add liquidity',
        { id: 'add-orbital-liq' },
      );
      setTxStatus('idle');
    }
  }, [
    contractService,
    selectedPool,
    parsedAddAmounts,
    anyAddAmount,
    sharePreview,
    slippageBps,
    userAddress,
    txStatus,
    onLiquidityChanged,
    fetchPools,
  ]);

  // ---- Remove liquidity -----------------------------------------------------

  const handleRemoveLiquidity = useCallback(async () => {
    if (!contractService || !selectedPool || parsedRemoveAmount === 0n) return;
    if (txStatus !== 'idle' && txStatus !== 'confirmed') return;

    // Approve router to spend LP tokens (pool IS the LP token contract)
    setTxStatus('approving');
    try {
      const routerAddress = contractService.getRouterAddress();
      const lpAllowance = await contractService.getTokenAllowance(
        selectedPool.address,
        userAddress,
        routerAddress,
      );
      if (lpAllowance < parsedRemoveAmount) {
        toast.loading('Approving LP tokens...', { id: 'approve-lp' });
        const approveTx = await contractService.approveRouter(
          selectedPool.address,
          parsedRemoveAmount,
        );
        await contractService.waitForTransaction(approveTx);
        toast.success('LP tokens approved', { id: 'approve-lp' });
      }
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to approve LP tokens',
        { id: 'approve-lp' },
      );
      setTxStatus('idle');
      return;
    }

    setTxStatus('submitting');
    try {
      // Compute minAmounts using slippage tolerance applied to pro-rata share of reserves.
      const minAmounts = selectedPool.tokens.map((_, i) => {
        const reserve = selectedPool.reserves[i] ?? 0n;
        if (selectedPool.totalSupply === 0n || reserve === 0n) return 0n;
        const expectedOut = (parsedRemoveAmount * reserve) / selectedPool.totalSupply;
        const minOut = expectedOut - (expectedOut * BigInt(slippageBps)) / 10000n;
        return minOut > 0n ? minOut : 0n;
      });
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

      toast.loading('Removing liquidity...', { id: 'remove-orbital-liq' });
      const tx = await contractService.removeLiquidity(
        selectedPool.address,
        parsedRemoveAmount,
        minAmounts,
        deadline,
      );
      await contractService.waitForTransaction(tx);
      toast.success('Liquidity removed!', { id: 'remove-orbital-liq' });
      setTxStatus('confirmed');
      setRemoveAmount('');
      onLiquidityChanged?.();
      void fetchPools();
      setTimeout(() => setTxStatus('idle'), 2500);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to remove liquidity',
        { id: 'remove-orbital-liq' },
      );
      setTxStatus('idle');
    }
  }, [contractService, selectedPool, parsedRemoveAmount, slippageBps, txStatus, userAddress, onLiquidityChanged, fetchPools]);

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
                        <span key={t.index} className="text-[10px] text-gray-500">
                          {t.symbol}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-gray-600">
                    {formatAddress(pool.address)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedPool && (
        <>
          {/* Tab switcher */}
          <div className="flex gap-1 rounded-xl bg-[#0D0F14] p-1.5 border border-white/[0.06]">
            <button
              type="button"
              onClick={() => setTab('add')}
              className={clsx(
                'flex-1 flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold transition-all duration-200',
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
              onClick={() => setTab('remove')}
              className={clsx(
                'flex-1 flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold transition-all duration-200',
                tab === 'remove'
                  ? 'bg-teal-500/15 text-teal-400 shadow-[inset_0_1px_0_rgba(20,184,166,0.2)]'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]',
              )}
            >
              <Minus className="h-3.5 w-3.5" />
              Remove
            </button>
          </div>

          {/* Pool composition */}
          <div className="rounded-xl bg-[#0D0F14]/80 border border-white/[0.06] p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400">Pool Composition</span>
              <span className="font-mono text-[10px] text-gray-600">
                {formatAddress(selectedPool.address)}
              </span>
            </div>
            {selectedPool.tokens.map((token, i) => (
              <div key={token.index} className="flex items-center justify-between text-xs">
                <span className="text-gray-500">{token.symbol} Reserve</span>
                <span className="font-mono text-gray-300">
                  {formatBalance(selectedPool.reserves[i] ?? 0n, 18, 4)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between text-xs pt-1 border-t border-white/[0.04]">
              <span className="text-gray-500">Total LP Supply</span>
              <span className="font-mono text-gray-300">
                {formatBalance(selectedPool.totalSupply, 18, 4)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-gray-500">
                <Wallet className="h-3 w-3" />
                Your LP Balance
              </span>
              <span className="font-mono text-indigo-400">
                {formatBalance(lpBalance, 18, 6)}
              </span>
            </div>
            {selectedPool.totalSupply > 0n && lpBalance > 0n && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Your Pool Share</span>
                <span className="font-mono text-purple-400">
                  {((Number(lpBalance) / Number(selectedPool.totalSupply)) * 100).toFixed(4)}%
                </span>
              </div>
            )}
          </div>

          {/* ---- ADD TAB ------------------------------------------------------- */}
          {tab === 'add' && (
            <div className="space-y-4">
              {/* Token amount inputs */}
              {selectedPool.tokens.map((token, i) => (
                <div key={token.index}>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-gray-500">{token.symbol}</label>
                    <span className="text-[11px] text-gray-500">
                      Balance:{' '}
                      <span className="font-mono text-gray-400">
                        {formatBalance(tokenBalances[i] ?? 0n, 18, 6)}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0.0"
                      value={addAmounts[i] ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (/^[0-9]*\.?[0-9]*$/.test(val)) {
                          setAddAmounts((prev) => {
                            const next = [...prev];
                            next[i] = val;
                            return next;
                          });
                        }
                      }}
                      className={clsx(
                        'flex-1 rounded-xl px-4 py-3 text-base font-semibold text-white font-mono',
                        'bg-[#0D0F14] border border-white/[0.06]',
                        'placeholder:text-gray-600',
                        'focus:border-white/[0.12] focus:outline-none focus:ring-1 focus:ring-white/[0.08]',
                        'transition-all',
                      )}
                    />
                    {(tokenBalances[i] ?? 0n) > 0n && (
                      <button
                        type="button"
                        onClick={() => {
                          setAddAmounts((prev) => {
                            const next = [...prev];
                            next[i] = ethers.formatUnits(tokenBalances[i], 18);
                            return next;
                          });
                        }}
                        className="rounded bg-purple-500/10 px-2.5 py-1.5 text-[10px] font-bold uppercase text-purple-400 hover:bg-purple-500/20 transition-colors"
                      >
                        Max
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Share preview */}
              {sharePreview !== null && (
                <div className="flex items-center justify-between rounded-lg bg-purple-500/5 border border-purple-500/10 px-4 py-2.5 text-xs">
                  <span className="text-gray-400">Estimated Pool Share</span>
                  <span className="font-mono font-medium text-purple-400">
                    {sharePreview.toFixed(4)}%
                  </span>
                </div>
              )}

              {/* Slippage toggle */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowSlippage(!showSlippage)}
                  className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <Settings className="h-3 w-3" />
                  Slippage: {(slippageBps / 100).toFixed(1)}%
                </button>
              </div>

              {showSlippage && (
                <div className="flex gap-2">
                  {[10, 50, 100, 200, 500].map((bps) => (
                    <button
                      key={bps}
                      type="button"
                      onClick={() => setSlippageBps(bps)}
                      className={clsx(
                        'flex-1 rounded-lg py-2 text-xs font-semibold transition-all',
                        slippageBps === bps
                          ? 'bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/30'
                          : 'bg-white/[0.03] text-gray-500 hover:text-gray-300 hover:bg-white/[0.06]',
                      )}
                    >
                      {(bps / 100).toFixed(1)}%
                    </button>
                  ))}
                </div>
              )}

              {/* Add button */}
              <button
                type="button"
                onClick={handleAddLiquidity}
                disabled={
                  !contractService ||
                  !selectedPool ||
                  !anyAddAmount ||
                  (txStatus !== 'idle' && txStatus !== 'confirmed')
                }
                className={clsx(
                  'flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold transition-all',
                  txStatus === 'confirmed'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.15)] hover:shadow-[0_0_30px_rgba(168,85,247,0.25)]',
                  'disabled:cursor-not-allowed disabled:opacity-40',
                )}
              >
                {txStatus === 'approving' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Approving Tokens...
                  </>
                ) : txStatus === 'submitting' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Adding Liquidity...
                  </>
                ) : txStatus === 'confirmed' ? (
                  <>
                    <Check className="h-4 w-4" />
                    Liquidity Added!
                  </>
                ) : (
                  <>
                    <Droplets className="h-4 w-4" />
                    Add Liquidity
                  </>
                )}
              </button>
            </div>
          )}

          {/* ---- REMOVE TAB ---------------------------------------------------- */}
          {tab === 'remove' && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-gray-500">LP Tokens to Burn</label>
                  <span className="text-[11px] text-gray-500">
                    Your LP:{' '}
                    <span className="font-mono text-gray-400">
                      {formatBalance(lpBalance, 18, 6)}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
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
                      'flex-1 rounded-xl px-4 py-3 text-base font-semibold text-white font-mono',
                      'bg-[#0D0F14] border border-white/[0.06]',
                      'placeholder:text-gray-600',
                      'focus:border-white/[0.12] focus:outline-none focus:ring-1 focus:ring-white/[0.08]',
                      'transition-all',
                    )}
                  />
                  {lpBalance > 0n && (
                    <button
                      type="button"
                      onClick={() => setRemoveAmount(ethers.formatUnits(lpBalance, 18))}
                      className="rounded bg-teal-500/10 px-2.5 py-1.5 text-[10px] font-bold uppercase text-teal-400 hover:bg-teal-500/20 transition-colors"
                    >
                      Max
                    </button>
                  )}
                </div>
              </div>

              {/* Percentage shortcuts */}
              {lpBalance > 0n && (
                <div className="flex gap-2">
                  {[25, 50, 75, 100].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => {
                        const amount = (lpBalance * BigInt(pct)) / 100n;
                        setRemoveAmount(ethers.formatUnits(amount, 18));
                      }}
                      className={clsx(
                        'flex-1 rounded-lg py-2 text-xs font-semibold transition-all',
                        'bg-white/[0.03] text-gray-500 hover:text-gray-300 hover:bg-white/[0.06]',
                      )}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              )}

              {/* Remove preview */}
              {removePreview && (
                <div className="space-y-2 rounded-xl bg-teal-500/5 border border-teal-500/10 px-4 py-3.5">
                  <span className="text-xs font-semibold text-gray-400">You Will Receive</span>
                  {selectedPool.tokens.map((token, i) => (
                    <div
                      key={token.index}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="text-gray-400">{token.symbol}</span>
                      <span className="font-mono text-teal-400">
                        {formatBalance(removePreview[i] ?? 0n, 18, 6)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Slippage toggle for remove */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowSlippage(!showSlippage)}
                  className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <Settings className="h-3 w-3" />
                  Slippage: {(slippageBps / 100).toFixed(1)}%
                </button>
              </div>

              {showSlippage && (
                <div className="flex gap-2">
                  {[10, 50, 100, 200, 500].map((bps) => (
                    <button
                      key={bps}
                      type="button"
                      onClick={() => setSlippageBps(bps)}
                      className={clsx(
                        'flex-1 rounded-lg py-2 text-xs font-semibold transition-all',
                        slippageBps === bps
                          ? 'bg-teal-500/20 text-teal-400 ring-1 ring-teal-500/30'
                          : 'bg-white/[0.03] text-gray-500 hover:text-gray-300 hover:bg-white/[0.06]',
                      )}
                    >
                      {(bps / 100).toFixed(1)}%
                    </button>
                  ))}
                </div>
              )}

              {/* Over-balance warning */}
              {parsedRemoveAmount > lpBalance && parsedRemoveAmount > 0n && (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-400">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  Amount exceeds your LP balance.
                </div>
              )}

              {/* Remove button */}
              <button
                type="button"
                onClick={handleRemoveLiquidity}
                disabled={
                  !contractService ||
                  !selectedPool ||
                  parsedRemoveAmount === 0n ||
                  parsedRemoveAmount > lpBalance ||
                  (txStatus !== 'idle' && txStatus !== 'confirmed')
                }
                className={clsx(
                  'flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold transition-all',
                  txStatus === 'confirmed'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-gradient-to-r from-teal-600 to-teal-500 text-white shadow-[0_0_20px_rgba(20,184,166,0.15)] hover:shadow-[0_0_30px_rgba(20,184,166,0.25)]',
                  'disabled:cursor-not-allowed disabled:opacity-40',
                )}
              >
                {txStatus === 'submitting' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Removing...
                  </>
                ) : txStatus === 'confirmed' ? (
                  <>
                    <Check className="h-4 w-4" />
                    Removed!
                  </>
                ) : (
                  <>
                    <Minus className="h-4 w-4" />
                    Remove Liquidity
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}

      {/* No pool selected prompt */}
      {!selectedPool && !loadingPools && pools.length > 0 && (
        <div className="flex flex-col items-center py-10 text-center">
          <Info className="mb-3 h-6 w-6 text-gray-600" />
          <p className="text-sm text-gray-400">Select a pool to manage liquidity</p>
        </div>
      )}

      {!loadingPools && pools.length === 0 && (
        <div className="flex flex-col items-center py-10 text-center">
          <AlertCircle className="mb-3 h-6 w-6 text-gray-600" />
          <p className="text-sm text-gray-400">No Orbital pools available</p>
          <p className="mt-1 text-xs text-gray-600">
            Create a pool first, then return here to provide liquidity
          </p>
        </div>
      )}
    </div>
  );
}
