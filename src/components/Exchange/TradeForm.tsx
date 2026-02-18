/**
 * TradeForm -- professional DEX-style order entry form.
 *
 * Handles the full lifecycle of creating a limit order on the
 * AssetBackedExchange contract:
 *   1. Buy/Sell toggle tabs at top
 *   2. Select sell token + amount with MAX button (supports ETH)
 *   3. Select buy token + desired amount (supports ETH)
 *   4. Approve the sell token for the exchange contract (if needed; skipped for ETH)
 *   5. Order summary with price display
 *   6. Submit -- uses createExchangeOrder for ERC-20 or createExchangeOrderSellETH for ETH
 *
 * All token amounts use 18-decimal BigInt arithmetic via ethers.
 *
 * FIXES vs prior version:
 * - Targets AssetBackedExchange (not AssetExchange)
 * - Supports native ETH via sentinel address for both sell and buy sides
 * - Correct allowance check against assetBackedExchangeAddress
 * - Prevents selling ETH for ETH
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  ArrowDown,
  Check,
  Loader2,
  ExternalLink,
  AlertCircle,
  ArrowRightLeft,
  Fuel,
  Zap,
  BookOpen,
  Settings2,
} from 'lucide-react';
import type { WrappedAsset } from '../../types';
import { InfoTooltip } from '../Common/Tooltip';
import { TOOLTIPS } from '../../lib/tooltipContent';
import { useTradeStore } from '../../store/tradeStore.ts';
import { ContractService, ETH_SENTINEL, isETH } from '../../lib/blockchain/contracts';
import { getNetworkConfig } from '../../contracts/addresses';
import { formatAddress, formatBalance } from '../../lib/utils/helpers';
import { formatPrice, formatTokenAmount } from '../../lib/formatters';
import TokenSelector from './TokenSelector';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TxStatus = 'idle' | 'approving' | 'approved' | 'creating' | 'confirmed';
type TradeSide = 'buy' | 'sell';
type TradeMode = 'limit' | 'amm';

interface TradeFormProps {
  assets: WrappedAsset[];
  contractService: ContractService | null;
  onOrderCreated: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TradeForm({
  assets,
  contractService,
  onOrderCreated,
}: TradeFormProps) {
  const addTrade = useTradeStore((s) => s.addTrade);

  // ---- Local state --------------------------------------------------------

  const [tradeMode, setTradeMode] = useState<TradeMode>('limit');
  const [side, setSide] = useState<TradeSide>('buy');
  const [sellToken, setSellToken] = useState<string | null>(null);
  const [buyToken, setBuyToken] = useState<string | null>(null);
  const [sellAmount, setSellAmount] = useState('');
  const [buyAmount, setBuyAmount] = useState('');
  const [txStatus, setTxStatus] = useState<TxStatus>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [sellBalance, setSellBalance] = useState<bigint>(0n);
  const [allowance, setAllowance] = useState<bigint>(0n);
  const [chainId, setChainId] = useState<number | null>(null);
  const [ethBalance, setEthBalance] = useState<bigint>(0n);

  // AMM-specific state
  const [ammQuote, setAmmQuote] = useState<bigint>(0n);
  const [ammQuoteLoading, setAmmQuoteLoading] = useState(false);
  const [slippage, setSlippage] = useState(1); // percentage
  const [showSlippageSettings, setShowSlippageSettings] = useState(false);

  // ---- Derived ------------------------------------------------------------

  const isBuy = side === 'buy';
  const sellIsETH = isETH(sellToken);
  const buyIsETH = isETH(buyToken);

  const sellAsset = useMemo(() => {
    if (sellIsETH) {
      return {
        address: ETH_SENTINEL,
        name: 'Ether',
        symbol: 'ETH',
        totalSupply: '0',
        balance: ethBalance.toString(),
        documentHash: '',
        documentType: '',
        originalValue: '0',
      } as WrappedAsset;
    }
    return assets.find((a) => a.address === sellToken) ?? null;
  }, [assets, sellToken, sellIsETH, ethBalance]);

  const buyAsset = useMemo(() => {
    if (buyIsETH) {
      return {
        address: ETH_SENTINEL,
        name: 'Ether',
        symbol: 'ETH',
        totalSupply: '0',
        balance: ethBalance.toString(),
        documentHash: '',
        documentType: '',
        originalValue: '0',
      } as WrappedAsset;
    }
    return assets.find((a) => a.address === buyToken) ?? null;
  }, [assets, buyToken, buyIsETH, ethBalance]);

  const parsedSellAmount = useMemo(() => {
    try {
      if (!sellAmount || Number(sellAmount) <= 0) return 0n;
      return ethers.parseUnits(sellAmount, 18);
    } catch {
      return 0n;
    }
  }, [sellAmount]);

  const parsedBuyAmount = useMemo(() => {
    try {
      if (!buyAmount || Number(buyAmount) <= 0) return 0n;
      return ethers.parseUnits(buyAmount, 18);
    } catch {
      return 0n;
    }
  }, [buyAmount]);

  // ETH does not need approval -- tokens transferred with msg.value
  const needsApproval = !sellIsETH && parsedSellAmount > 0n && allowance < parsedSellAmount;

  const price = useMemo(() => {
    if (parsedSellAmount === 0n || parsedBuyAmount === 0n) return null;
    // price = sellAmount / buyAmount  (how much of sell token per 1 buy token)
    const priceNum =
      Number(ethers.formatUnits(parsedSellAmount, 18)) /
      Number(ethers.formatUnits(parsedBuyAmount, 18));
    return priceNum;
  }, [parsedSellAmount, parsedBuyAmount]);

  const networkConfig = useMemo(() => {
    if (!chainId) return null;
    return getNetworkConfig(chainId) ?? null;
  }, [chainId]);

  const explorerTxUrl = useMemo(() => {
    if (!txHash || !networkConfig?.blockExplorer) return null;
    return `${networkConfig.blockExplorer}/tx/${txHash}`;
  }, [txHash, networkConfig]);

  const sameTokenError = sellToken && buyToken && sellToken.toLowerCase() === buyToken.toLowerCase();

  const insufficientBalance = parsedSellAmount > 0n && parsedSellAmount > sellBalance;

  const canSubmit =
    contractService &&
    sellToken &&
    buyToken &&
    !sameTokenError &&
    parsedSellAmount > 0n &&
    parsedBuyAmount > 0n &&
    !insufficientBalance &&
    !needsApproval &&
    (txStatus === 'idle' || txStatus === 'approved');

  const canApprove =
    contractService &&
    sellToken &&
    !sellIsETH &&
    needsApproval &&
    parsedSellAmount > 0n &&
    txStatus === 'idle';

  // ---- Effects: load balance & allowance ----------------------------------

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!contractService || !sellToken) {
        setSellBalance(0n);
        setAllowance(0n);
        return;
      }

      try {
        const signer = await contractService.getSigner();
        const userAddress = await signer.getAddress();
        const provider = signer.provider;

        // Resolve chainId
        if (provider) {
          const network = await provider.getNetwork();
          if (!cancelled) setChainId(Number(network.chainId));
        }

        if (sellIsETH) {
          // For ETH, balance = native balance; no approval needed
          if (provider) {
            const nativeBal = await provider.getBalance(userAddress);
            if (!cancelled) {
              setSellBalance(nativeBal);
              setEthBalance(nativeBal);
              setAllowance(ethers.MaxUint256); // ETH never needs approval
            }
          }
        } else {
          // ERC-20: fetch balance + allowance against AssetBackedExchange
          const currentChainId = chainId ?? 31337;
          const config = getNetworkConfig(currentChainId);
          const spender = config?.assetBackedExchangeAddress;

          const [bal, allow] = await Promise.all([
            contractService.getAssetBalance(sellToken, userAddress),
            spender
              ? contractService.getAssetAllowance(sellToken, userAddress, spender)
              : Promise.resolve(0n),
          ]);

          // Also fetch ETH balance for the ETH entry in selectors
          if (provider) {
            const nativeBal = await provider.getBalance(userAddress);
            if (!cancelled) setEthBalance(nativeBal);
          }

          if (!cancelled) {
            setSellBalance(bal);
            setAllowance(allow);
          }
        }
      } catch (err) {
        console.error('Failed to load token balances:', err);
        toast.error('Failed to load token balances');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [contractService, sellToken, sellIsETH, txStatus, chainId]);

  // ---- Set chainId on mount -----------------------------------------------

  useEffect(() => {
    async function resolveChain() {
      if (!contractService) return;
      try {
        const signer = await contractService.getSigner();
        const provider = signer.provider;
        if (provider) {
          const network = await provider.getNetwork();
          setChainId(Number(network.chainId));

          // Also preload ETH balance
          const userAddress = await signer.getAddress();
          const nativeBal = await provider.getBalance(userAddress);
          setEthBalance(nativeBal);
        }
      } catch (error) {
        console.error('Failed to resolve chain info:', error);
        toast.error('Failed to load chain info');
      }
    }
    void resolveChain();
  }, [contractService]);

  // ---- Handlers -----------------------------------------------------------

  const handleMaxSell = useCallback(() => {
    if (sellBalance > 0n) {
      if (sellIsETH) {
        // Reserve a small amount for gas (0.005 ETH)
        const gasReserve = ethers.parseUnits('0.005', 18);
        const maxUsable = sellBalance > gasReserve ? sellBalance - gasReserve : 0n;
        setSellAmount(ethers.formatUnits(maxUsable, 18));
      } else {
        setSellAmount(ethers.formatUnits(sellBalance, 18));
      }
    }
  }, [sellBalance, sellIsETH]);

  const handleApprove = useCallback(async () => {
    if (!contractService || !sellToken || parsedSellAmount === 0n || sellIsETH) return;
    if (txStatus !== 'idle') return;

    setTxStatus('approving');
    setTxHash(null);

    try {
      // Use the AssetBackedExchange approval method
      const tx = await contractService.approveAssetBackedExchange(
        sellToken,
        parsedSellAmount,
      );
      setTxHash(tx.hash);
      toast.loading('Approving token spend...', { id: 'approve' });

      await contractService.waitForTransaction(tx);
      setTxStatus('approved');
      toast.success('Token approved for exchange', { id: 'approve' });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Approval transaction failed';
      console.error('Approve failed:', err);
      toast.error(message, { id: 'approve' });
      setTxStatus('idle');
    }
  }, [contractService, sellToken, parsedSellAmount, txStatus, sellIsETH]);

  const handleCreateOrder = useCallback(async () => {
    if (
      !contractService ||
      !sellToken ||
      !buyToken ||
      parsedSellAmount === 0n ||
      parsedBuyAmount === 0n
    ) {
      return;
    }

    if (sameTokenError) {
      toast.error('Sell and buy tokens must be different');
      return;
    }

    if (needsApproval) {
      toast.error('Please approve the sell token first');
      return;
    }

    if (insufficientBalance) {
      toast.error('Insufficient balance');
      return;
    }

    // Prevent double-click or re-entry while a tx is in flight
    if (txStatus !== 'idle' && txStatus !== 'approved') return;

    setTxStatus('creating');
    setTxHash(null);

    try {
      let tx: ethers.ContractTransactionResponse;

      if (sellIsETH) {
        // Sell ETH for an ERC-20 token
        tx = await contractService.createExchangeOrderSellETH(
          buyToken,
          parsedBuyAmount,
          parsedSellAmount, // msg.value
        );
      } else {
        // Sell ERC-20 for ERC-20 (or for ETH -- tokenBuy can be ETH_SENTINEL)
        tx = await contractService.createExchangeOrder(
          sellToken,
          buyToken,
          parsedSellAmount,
          parsedBuyAmount,
        );
      }

      setTxHash(tx.hash);
      toast.loading('Creating order...', { id: 'create-order' });

      await contractService.waitForTransaction(tx);
      setTxStatus('confirmed');
      toast.success('Order created successfully!', { id: 'create-order' });

      // Record trade in store so dashboard updates immediately
      const sellSym = sellIsETH ? 'ETH' : (assets.find((a) => a.address === sellToken)?.symbol ?? formatAddress(sellToken!));
      const buySym = buyIsETH ? 'ETH' : (assets.find((a) => a.address === buyToken)?.symbol ?? formatAddress(buyToken!));
      addTrade({
        id: `order-${tx.hash}`,
        type: 'exchange',
        asset: `${sellSym} → ${buySym}`,
        assetSymbol: sellSym,
        amount: sellAmount,
        txHash: tx.hash,
        timestamp: Date.now(),
        from: sellToken!,
        to: buyToken!,
        status: 'confirmed',
      });

      // Reset form after short delay
      setTimeout(() => {
        setSellAmount('');
        setBuyAmount('');
        setTxStatus('idle');
        setTxHash(null);
        onOrderCreated();
      }, 2000);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to create order';
      console.error('Create order failed:', err);
      toast.error(message, { id: 'create-order' });
      setTxStatus('idle');
    }
  }, [
    contractService,
    sellToken,
    buyToken,
    parsedSellAmount,
    parsedBuyAmount,
    needsApproval,
    insufficientBalance,
    sameTokenError,
    txStatus,
    sellIsETH,
    buyIsETH,
    onOrderCreated,
    addTrade,
    assets,
    sellAmount,
  ]);

  // ---- AMM: fetch quote when sell amount changes ---------------------------

  useEffect(() => {
    if (tradeMode !== 'amm') return;

    let cancelled = false;

    async function fetchQuote() {
      if (!contractService || !sellToken || !buyToken || parsedSellAmount === 0n) {
        setAmmQuote(0n);
        return;
      }
      if (sellToken.toLowerCase() === buyToken.toLowerCase()) {
        setAmmQuote(0n);
        return;
      }

      setAmmQuoteLoading(true);
      try {
        const q = await contractService.getAMMQuote(sellToken, buyToken, parsedSellAmount);
        if (!cancelled) setAmmQuote(q);
      } catch {
        if (!cancelled) setAmmQuote(0n);
      } finally {
        if (!cancelled) setAmmQuoteLoading(false);
      }
    }

    const timer = setTimeout(() => void fetchQuote(), 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tradeMode, contractService, sellToken, buyToken, parsedSellAmount]);

  // AMM swap handler
  const handleAMMSwap = useCallback(async () => {
    if (!contractService || !sellToken || !buyToken || parsedSellAmount === 0n || ammQuote === 0n) return;
    if (txStatus !== 'idle' && txStatus !== 'approved') return;

    // Check approval for non-ETH tokens
    if (!sellIsETH) {
      const currentChainId = chainId ?? 31337;
      const config = getNetworkConfig(currentChainId);
      const ammAddress = config?.ammAddress;

      if (ammAddress) {
        const signer = await contractService.getSigner();
        const userAddr = await signer.getAddress();
        const currentAllowance = await contractService.getAssetAllowance(sellToken, userAddr, ammAddress);

        if (currentAllowance < parsedSellAmount) {
          setTxStatus('approving');
          setTxHash(null);
          try {
            const approveTx = await contractService.approveAMM(sellToken, parsedSellAmount);
            setTxHash(approveTx.hash);
            toast.loading('Approving token for AMM...', { id: 'amm-approve' });
            await contractService.waitForTransaction(approveTx);
            toast.success('Token approved for AMM', { id: 'amm-approve' });
            setTxStatus('approved');
          } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Approval failed', { id: 'amm-approve' });
            setTxStatus('idle');
            return;
          }
        }
      }
    }

    setTxStatus('creating');
    setTxHash(null);

    // Calculate min output with slippage
    const minOut = ammQuote - (ammQuote * BigInt(Math.round(slippage * 10)) / 1000n);

    try {
      let tx: ethers.ContractTransactionResponse;

      if (sellIsETH) {
        tx = await contractService.swapETHForToken(buyToken, minOut, parsedSellAmount);
      } else if (buyIsETH) {
        tx = await contractService.swapTokenForETH(sellToken, parsedSellAmount, minOut);
      } else {
        tx = await contractService.swapAMM(sellToken, buyToken, parsedSellAmount, minOut);
      }

      setTxHash(tx.hash);
      toast.loading('Swapping via AMM...', { id: 'amm-swap' });
      await contractService.waitForTransaction(tx);
      setTxStatus('confirmed');
      toast.success('Swap completed!', { id: 'amm-swap' });

      // Record AMM swap in store so dashboard updates immediately
      const swapSellSym = sellIsETH ? 'ETH' : (assets.find((a) => a.address === sellToken)?.symbol ?? formatAddress(sellToken!));
      const swapBuySym = buyIsETH ? 'ETH' : (assets.find((a) => a.address === buyToken)?.symbol ?? formatAddress(buyToken!));
      addTrade({
        id: `swap-${tx.hash}`,
        type: sellIsETH ? 'swap-eth' : buyIsETH ? 'swap-eth' : 'swap-erc20',
        asset: `${swapSellSym} → ${swapBuySym}`,
        assetSymbol: swapSellSym,
        amount: sellAmount,
        txHash: tx.hash,
        timestamp: Date.now(),
        from: sellToken!,
        to: buyToken!,
        status: 'confirmed',
      });

      setTimeout(() => {
        setSellAmount('');
        setAmmQuote(0n);
        setTxStatus('idle');
        setTxHash(null);
        onOrderCreated();
      }, 2000);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Swap failed', { id: 'amm-swap' });
      setTxStatus('idle');
    }
  }, [contractService, sellToken, buyToken, parsedSellAmount, ammQuote, slippage, txStatus, sellIsETH, buyIsETH, chainId, onOrderCreated, addTrade, assets, sellAmount]);

  // ---- Render -------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* ---- Mode toggle: Limit Order vs Instant Swap (AMM) --------------- */}
      <div className="flex gap-1 rounded-xl bg-[#0D0F14] p-1 border border-white/[0.06]" role="tablist" aria-label="Trade mode">
        <button
          type="button"
          role="tab"
          aria-selected={tradeMode === 'limit'}
          onClick={() => { setTradeMode('limit'); setTxStatus('idle'); setTxHash(null); }}
          className={clsx(
            'flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold transition-all duration-200',
            'min-h-[44px]',
            tradeMode === 'limit'
              ? 'bg-indigo-500/15 text-indigo-400 shadow-[inset_0_1px_0_rgba(99,102,241,0.2)]'
              : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]',
          )}
        >
          <BookOpen className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Limit Order</span>
          <span className="sm:hidden">Limit</span>
          <InfoTooltip content={TOOLTIPS.limitOrder} />
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tradeMode === 'amm'}
          onClick={() => { setTradeMode('amm'); setTxStatus('idle'); setTxHash(null); }}
          className={clsx(
            'flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold transition-all duration-200',
            'min-h-[44px]',
            tradeMode === 'amm'
              ? 'bg-purple-500/15 text-purple-400 shadow-[inset_0_1px_0_rgba(168,85,247,0.2)]'
              : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]',
          )}
        >
          <Zap className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Instant Swap (AMM)</span>
          <span className="sm:hidden">Swap</span>
        </button>
      </div>

      {/* ---- Buy/Sell segmented control (Limit mode only) ---------------- */}
      {tradeMode === 'limit' && (
      <div className="flex gap-1 rounded-xl bg-[#0D0F14] p-1.5 border border-white/[0.06]">
        <button
          type="button"
          onClick={() => setSide('buy')}
          className={clsx(
            'flex-1 flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold transition-all duration-200',
            'min-h-[44px]',
            isBuy
              ? 'bg-emerald-500/15 text-emerald-400 shadow-[inset_0_1px_0_rgba(16,185,129,0.2)]'
              : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]',
          )}
        >
          Buy
        </button>
        <button
          type="button"
          onClick={() => setSide('sell')}
          className={clsx(
            'flex-1 flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold transition-all duration-200',
            'min-h-[44px]',
            !isBuy
              ? 'bg-red-500/15 text-red-400 shadow-[inset_0_1px_0_rgba(239,68,68,0.2)]'
              : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]',
          )}
        >
          Sell
        </button>
      </div>
      )}

      {/* ================================================================= */}
      {/* LIMIT ORDER MODE                                                 */}
      {/* ================================================================= */}
      {tradeMode === 'limit' && (
      <>
      {/* ---- Sell section -------------------------------------------------- */}
      <div className="rounded-xl bg-[#0D0F14]/80 border border-white/[0.06] p-5 sm:p-7 lg:p-8">
        <TokenSelector
          assets={assets}
          selectedToken={sellToken}
          onSelect={setSellToken}
          label="You Pay"
          includeETH
          ethBalance={ethBalance.toString()}
        />

        <div className="mt-5">
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.0"
              value={sellAmount}
              onChange={(e) => {
                const val = e.target.value;
                if (/^[0-9]*\.?[0-9]*$/.test(val)) setSellAmount(val);
              }}
              className={clsx(
                'w-full rounded-xl px-5 py-4 pr-28 text-xl font-semibold text-white',
                'bg-[#0D0F14] border border-white/[0.06]',
                'placeholder:text-gray-600',
                'focus:border-white/[0.12] focus:outline-none focus:ring-1 focus:ring-white/[0.08]',
                'font-mono transition-all',
              )}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              {sellAsset && (
                <span className="rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-xs font-semibold text-gray-300 border border-white/[0.04]">
                  {sellAsset.symbol}
                </span>
              )}
              <button
                type="button"
                onClick={handleMaxSell}
                disabled={sellBalance === 0n}
                className={clsx(
                  'rounded-lg px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-all',
                  isBuy
                    ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                    : 'bg-red-500/10 text-red-400 hover:bg-red-500/20',
                  'disabled:cursor-not-allowed disabled:opacity-30',
                )}
              >
                Max
              </button>
            </div>
          </div>

          {/* Balance display */}
          {sellAsset && (
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-gray-500">
                Balance:{' '}
                <span className="font-mono text-gray-400">
                  {formatTokenAmount(formatBalance(sellBalance, 18, 6), 6)}
                </span>{' '}
                {sellAsset.symbol}
              </span>
              {insufficientBalance && parsedSellAmount > 0n && (
                <span className="flex items-center gap-1 text-red-400">
                  <AlertCircle className="h-3 w-3" />
                  Insufficient balance
                </span>
              )}
            </div>
          )}

          {/* ETH gas reserve note */}
          {sellIsETH && parsedSellAmount > 0n && (
            <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-amber-400/70">
              <Fuel className="h-3 w-3" />
              Reserve some ETH for gas fees
            </div>
          )}
        </div>
      </div>

      {/* ---- Arrow separator ------------------------------------------------ */}
      <div className="flex justify-center -my-3 relative z-10">
        <button
          type="button"
          onClick={() => {
            const tmpToken = sellToken;
            const tmpAmount = sellAmount;
            setSellToken(buyToken);
            setBuyToken(tmpToken);
            setSellAmount(buyAmount);
            setBuyAmount(tmpAmount);
          }}
          className={clsx(
            'flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200',
            'bg-[#0D0F14] border border-white/[0.06]',
            'hover:border-indigo-500/30 hover:bg-indigo-500/5 hover:rotate-180 shadow-lg shadow-black/20',
          )}
          title="Swap tokens"
        >
          <ArrowDown className="h-4 w-4 text-gray-400" />
        </button>
      </div>

      {/* ---- Buy section --------------------------------------------------- */}
      <div className="rounded-xl bg-[#0D0F14]/80 border border-white/[0.06] p-5 sm:p-7 lg:p-8">
        <TokenSelector
          assets={assets}
          selectedToken={buyToken}
          onSelect={setBuyToken}
          label="You Receive"
          includeETH
          ethBalance={ethBalance.toString()}
        />

        <div className="mt-5">
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.0"
              value={buyAmount}
              onChange={(e) => {
                const val = e.target.value;
                if (/^[0-9]*\.?[0-9]*$/.test(val)) setBuyAmount(val);
              }}
              className={clsx(
                'w-full rounded-xl px-5 py-4 pr-20 text-xl font-semibold text-white',
                'bg-[#0D0F14] border border-white/[0.06]',
                'placeholder:text-gray-600',
                'focus:border-white/[0.12] focus:outline-none focus:ring-1 focus:ring-white/[0.08]',
                'font-mono transition-all',
              )}
            />
            {buyAsset && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-xs font-semibold text-gray-300 border border-white/[0.04]">
                {buyAsset.symbol}
              </span>
            )}
          </div>

          {buyAsset && (
            <div className="mt-3 text-xs text-gray-500">
              {isETH(buyAsset.address) ? (
                <>Native ETH</>
              ) : (
                <>
                  Token:{' '}
                  <span className="font-mono text-gray-400">
                    {formatAddress(buyAsset.address)}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ---- Order summary / Price display --------------------------------- */}
      {price !== null && sellAsset && buyAsset && (
        <div className="rounded-xl bg-[#0D0F14]/80 border border-white/[0.06] p-5 sm:p-7 lg:p-8">
          <div className="space-y-0 divide-y divide-white/[0.06]">
            <div className="flex items-center justify-between py-3 first:pt-0">
              <span className="flex items-center gap-2 text-sm text-gray-500">
                <ArrowRightLeft className="h-3.5 w-3.5" />
                Price
              </span>
              <span className="font-mono text-sm font-medium text-white">
                1 {buyAsset.symbol} = {formatPrice(price)} {sellAsset.symbol}
              </span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-gray-500">Inverse</span>
              <span className="font-mono text-sm text-gray-400">
                1 {sellAsset.symbol} ={' '}
                {price === 0 ? '0.000000' : formatPrice(1 / price)}{' '}
                {buyAsset.symbol}
              </span>
            </div>
            {parsedSellAmount > 0n && parsedBuyAmount > 0n && (
              <div className="flex items-center justify-between py-3 last:pb-0">
                <span className="text-sm text-gray-500">You will pay</span>
                <span className="font-mono text-sm font-medium text-white">
                  {formatTokenAmount(Number(ethers.formatUnits(parsedSellAmount, 18)))}{' '}
                  {sellAsset.symbol}
                </span>
              </div>
            )}
          </div>
          {sellIsETH && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-blue-500/5 border border-blue-500/10 px-4 py-3 text-[11px] text-blue-400/70">
              <Fuel className="h-3 w-3 shrink-0" />
              ETH will be sent with the transaction (no approval needed)
            </div>
          )}
        </div>
      )}

      {/* ---- Same-token warning --------------------------------------------- */}
      {sameTokenError && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-4 text-sm text-amber-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Sell and buy tokens must be different.
        </div>
      )}

      {/* ---- Approval step indicator --------------------------------------- */}
      {needsApproval && !sellIsETH &&
        (txStatus === 'idle' ||
          txStatus === 'approving' ||
          txStatus === 'approved') && (
          <div className="space-y-4">
            {/* Step indicator */}
            <div className="flex items-center gap-3 px-1">
              <div
                className={clsx(
                  'flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold transition-colors',
                  txStatus === 'approved'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-white/[0.08] text-gray-400',
                )}
              >
                {txStatus === 'approved' ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  '1'
                )}
              </div>
              <div className="h-px flex-1 bg-white/[0.06]" />
              <div
                className={clsx(
                  'flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold',
                  'bg-white/[0.08] text-gray-400',
                )}
              >
                2
              </div>
            </div>

            <button
              type="button"
              onClick={handleApprove}
              disabled={!canApprove}
              className={clsx(
                'flex w-full items-center justify-center gap-2 rounded-xl py-4 text-base font-semibold transition-all',
                txStatus === 'approving'
                  ? 'cursor-not-allowed border border-amber-500/20 bg-amber-500/5 text-amber-400'
                  : txStatus === 'approved'
                    ? 'border border-emerald-500/20 bg-emerald-500/5 text-emerald-400'
                    : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40',
              )}
            >
              {txStatus === 'approving' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Approving {sellAsset?.symbol}...
                </>
              ) : txStatus === 'approved' ? (
                <>
                  <Check className="h-4 w-4" />
                  {sellAsset?.symbol} Approved
                </>
              ) : (
                <>Approve {sellAsset?.symbol} for Exchange</>
              )}
            </button>
          </div>
        )}

      {/* ---- Create order button ------------------------------------------- */}
      {(() => {
        const status = txStatus as TxStatus;
        return (
          <button
            type="button"
            onClick={handleCreateOrder}
            disabled={
              !canSubmit || status === 'creating' || status === 'confirmed'
            }
            className={clsx(
              'flex w-full items-center justify-center gap-2 rounded-xl py-4 text-base font-semibold transition-all',
              status === 'creating'
                ? 'cursor-not-allowed opacity-70'
                : status === 'confirmed'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'disabled:cursor-not-allowed disabled:opacity-40',
              // Gradient button for active state
              status !== 'creating' &&
                status !== 'confirmed' &&
                (isBuy
                  ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.15)] hover:shadow-[0_0_30px_rgba(16,185,129,0.25)]'
                  : 'bg-gradient-to-r from-red-600 to-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.15)] hover:shadow-[0_0_30px_rgba(239,68,68,0.25)]'),
              status === 'creating' &&
                (isBuy
                  ? 'bg-gradient-to-r from-emerald-600/50 to-emerald-500/50 text-emerald-300'
                  : 'bg-gradient-to-r from-red-600/50 to-red-500/50 text-red-300'),
            )}
          >
            {status === 'creating' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating Order...
              </>
            ) : status === 'confirmed' ? (
              <>
                <Check className="h-4 w-4" />
                Order Created!
              </>
            ) : (
              <>
                {isBuy ? 'Place Buy Order' : 'Place Sell Order'}
                {sellIsETH && ' (ETH)'}
              </>
            )}
          </button>
        );
      })()}
      </>
      )}

      {/* ================================================================= */}
      {/* AMM INSTANT SWAP MODE                                            */}
      {/* ================================================================= */}
      {tradeMode === 'amm' && (
      <>
      {/* ---- Sell token + amount ------------------------------------------- */}
      <div className="rounded-xl bg-[#0D0F14]/80 border border-white/[0.06] p-5 sm:p-7 lg:p-8">
        <TokenSelector
          assets={assets}
          selectedToken={sellToken}
          onSelect={setSellToken}
          label="You Sell"
          includeETH
          ethBalance={ethBalance.toString()}
        />
        <div className="mt-5">
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.0"
              value={sellAmount}
              onChange={(e) => {
                const val = e.target.value;
                if (/^[0-9]*\.?[0-9]*$/.test(val)) setSellAmount(val);
              }}
              className={clsx(
                'w-full rounded-xl px-5 py-4 pr-28 text-xl font-semibold text-white',
                'bg-[#0D0F14] border border-white/[0.06]',
                'placeholder:text-gray-600',
                'focus:border-white/[0.12] focus:outline-none focus:ring-1 focus:ring-white/[0.08]',
                'font-mono transition-all',
              )}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              {sellAsset && (
                <span className="rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-xs font-semibold text-gray-300 border border-white/[0.04]">
                  {sellAsset.symbol}
                </span>
              )}
              <button
                type="button"
                onClick={handleMaxSell}
                disabled={sellBalance === 0n}
                className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-all bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 disabled:cursor-not-allowed disabled:opacity-30"
              >
                Max
              </button>
            </div>
          </div>
          {sellAsset && (
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-gray-500">
                Balance:{' '}
                <span className="font-mono text-gray-400">
                  {formatTokenAmount(formatBalance(sellBalance, 18, 6), 6)}
                </span>{' '}
                {sellAsset.symbol}
              </span>
              {insufficientBalance && parsedSellAmount > 0n && (
                <span className="flex items-center gap-1 text-red-400">
                  <AlertCircle className="h-3 w-3" />
                  Insufficient balance
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ---- Arrow separator ------------------------------------------------ */}
      <div className="flex justify-center -my-3 relative z-10">
        <button
          type="button"
          onClick={() => {
            const tmpToken = sellToken;
            setSellToken(buyToken);
            setBuyToken(tmpToken);
            setSellAmount('');
            setAmmQuote(0n);
          }}
          className={clsx(
            'flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200',
            'bg-[#0D0F14] border border-white/[0.06]',
            'hover:border-purple-500/30 hover:bg-purple-500/5 hover:rotate-180 shadow-lg shadow-black/20',
          )}
          title="Swap tokens"
        >
          <Zap className="h-4 w-4 text-purple-400" />
        </button>
      </div>

      {/* ---- Buy token + auto-calculated output ----------------------------- */}
      <div className="rounded-xl bg-[#0D0F14]/80 border border-white/[0.06] p-5 sm:p-7 lg:p-8">
        <TokenSelector
          assets={assets}
          selectedToken={buyToken}
          onSelect={setBuyToken}
          label="You Receive"
          includeETH
          ethBalance={ethBalance.toString()}
        />
        <div className="mt-5">
          <div className="relative">
            <div
              className={clsx(
                'w-full rounded-xl px-5 py-4 pr-20 text-xl font-semibold font-mono',
                'bg-[#0D0F14] border border-white/[0.06]',
                'min-h-[60px] flex items-center',
                ammQuote > 0n ? 'text-white' : 'text-gray-600',
              )}
            >
              {ammQuoteLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-purple-400/60" />
              ) : ammQuote > 0n ? (
                formatPrice(Number(ethers.formatUnits(ammQuote, 18)))
              ) : (
                '0.0'
              )}
            </div>
            {buyAsset && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-xs font-semibold text-gray-300 border border-white/[0.04]">
                {buyAsset.symbol}
              </span>
            )}
          </div>
          {buyAsset && (
            <div className="mt-3 text-xs text-gray-500">
              {isETH(buyAsset.address) ? 'Native ETH' : (
                <>Token: <span className="font-mono text-gray-400">{formatAddress(buyAsset.address)}</span></>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ---- AMM Quote details ---------------------------------------------- */}
      {ammQuote > 0n && sellAsset && buyAsset && parsedSellAmount > 0n && (
        <div className="rounded-xl bg-[#0D0F14]/80 border border-white/[0.06] p-5 sm:p-6">
          <div className="space-y-0 divide-y divide-white/[0.06]">
            <div className="flex items-center justify-between py-2.5 first:pt-0">
              <span className="flex items-center gap-2 text-xs text-gray-500">
                <ArrowRightLeft className="h-3 w-3" />
                Rate
              </span>
              <span className="font-mono text-xs font-medium text-white">
                1 {sellAsset.symbol} ={' '}
                {formatPrice(Number(ethers.formatUnits(ammQuote, 18)) / Number(ethers.formatUnits(parsedSellAmount, 18)))}{' '}
                {buyAsset.symbol}
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <span className="text-xs text-gray-500">Min. received</span>
              <span className="font-mono text-xs text-gray-400">
                {formatPrice(Number(ethers.formatUnits(ammQuote - (ammQuote * BigInt(Math.round(slippage * 10)) / 1000n), 18)))}{' '}
                {buyAsset.symbol}
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <span className="text-xs text-gray-500">Fee</span>
              <span className="font-mono text-xs text-gray-400">0.3%</span>
            </div>
            <div className="flex items-center justify-between py-2.5 last:pb-0">
              <button
                type="button"
                onClick={() => setShowSlippageSettings(!showSlippageSettings)}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                <Settings2 className="h-3 w-3" />
                Slippage Tolerance
                <InfoTooltip content={TOOLTIPS.slippage} />
              </button>
              <span className="font-mono text-xs text-purple-400">{slippage}%</span>
            </div>
          </div>

          {/* Slippage settings */}
          {showSlippageSettings && (
            <div className="mt-3 flex gap-2 pt-3 border-t border-white/[0.04]">
              {[0.5, 1, 2, 5].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => { setSlippage(pct); setShowSlippageSettings(false); }}
                  className={clsx(
                    'flex-1 rounded-lg py-2 text-xs font-semibold transition-all',
                    slippage === pct
                      ? 'bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/30'
                      : 'bg-white/[0.04] text-gray-500 hover:text-gray-300',
                  )}
                >
                  {pct}%
                </button>
              ))}
            </div>
          )}

          {sellIsETH && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-blue-500/5 border border-blue-500/10 px-4 py-2.5 text-[11px] text-blue-400/70">
              <Fuel className="h-3 w-3 shrink-0" />
              ETH sent with the transaction (no approval needed)
            </div>
          )}
        </div>
      )}

      {/* ---- Same-token warning --------------------------------------------- */}
      {sameTokenError && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-4 text-sm text-amber-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Sell and buy tokens must be different.
        </div>
      )}

      {/* ---- Swap button ---------------------------------------------------- */}
      {(() => {
        const status = txStatus as TxStatus;
        const canSwap = contractService &&
          sellToken && buyToken && !sameTokenError &&
          parsedSellAmount > 0n && ammQuote > 0n &&
          !insufficientBalance &&
          (status === 'idle' || status === 'approved');
        return (
          <button
            type="button"
            onClick={handleAMMSwap}
            disabled={!canSwap || (status as string) === 'creating' || (status as string) === 'confirmed'}
            className={clsx(
              'flex w-full items-center justify-center gap-2 rounded-xl py-4 text-base font-semibold transition-all',
              status === 'creating' || status === 'approving'
                ? 'cursor-not-allowed opacity-70 bg-gradient-to-r from-purple-600/50 to-purple-500/50 text-purple-300'
                : status === 'confirmed'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.15)] hover:shadow-[0_0_30px_rgba(168,85,247,0.25)]',
              'disabled:cursor-not-allowed disabled:opacity-40',
            )}
          >
            {status === 'approving' ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Approving...</>
            ) : status === 'creating' ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Swapping...</>
            ) : status === 'confirmed' ? (
              <><Check className="h-4 w-4" /> Swap Complete!</>
            ) : (
              <><Zap className="h-4 w-4" /> Swap via AMM</>
            )}
          </button>
        );
      })()}
      </>
      )}

      {/* ---- Transaction hash link (shared) --------------------------------- */}
      {txHash && (
        <div className="flex items-center justify-center gap-2 pt-2 text-xs text-gray-500">
          <span className="font-mono">{formatAddress(txHash)}</span>
          {explorerTxUrl && (
            <a
              href={explorerTxUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-400 transition-colors hover:text-blue-300"
            >
              View
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
