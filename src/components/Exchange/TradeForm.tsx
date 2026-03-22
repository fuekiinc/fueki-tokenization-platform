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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowDown,
  ArrowRightLeft,
  BookOpen,
  Check,
  ExternalLink,
  Fuel,
  Loader2,
  RefreshCw,
  Settings2,
  Zap,
} from 'lucide-react';
import type { WrappedAsset } from '../../types';
import HelpTooltip from '../Common/HelpTooltip';
import { useTradeStore } from '../../store/tradeStore.ts';
import { ContractService, ETH_SENTINEL, isETH, parseContractError } from '../../lib/blockchain/contracts';
import { getNetworkConfig } from '../../contracts/addresses';
import { formatAddress, formatBalance } from '../../lib/utils/helpers';
import { formatPrice, formatTokenAmount } from '../../lib/formatters';
import { txConfirmedToast, txFailedToast, txSubmittedToast } from '../../lib/utils/txToast';
import { createAdaptivePollingLoop, getPollingIntervalMs, subscribeToVisibilityChange } from '../../lib/rpc/polling';
import { emitRpcRefetch } from '../../lib/rpc/refetchEvents';
import TokenSelector from './TokenSelector';
import logger from '../../lib/logger';

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
  /** Current page-level selected sell token (used to sync chart/orderbook pair). */
  selectedSellToken?: string | null;
  /** Current page-level selected buy token (used to sync chart/orderbook pair). */
  selectedBuyToken?: string | null;
  /** Notify parent when the selected token pair changes. */
  onPairChange?: (sellToken: string | null, buyToken: string | null) => void;
  /** Disable AMM mode when AMM contracts are not deployed on the active chain. */
  enableAMM?: boolean;
  /** Show Orbital AMM fallback when the legacy AMM is unavailable. */
  orbitalFallbackEnabled?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TradeForm({
  assets,
  contractService,
  onOrderCreated,
  selectedSellToken,
  selectedBuyToken,
  onPairChange,
  enableAMM = true,
  orbitalFallbackEnabled = false,
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
  const [slippage, setSlippage] = useState(0.5); // percentage
  const [customSlippage, setCustomSlippage] = useState('');
  const [showSlippageSettings, setShowSlippageSettings] = useState(false);
  const [quoteRefreshTimer, setQuoteRefreshTimer] = useState(
    Math.ceil(getPollingIntervalMs('medium') / 1000),
  );

  useEffect(() => {
    if (!enableAMM && tradeMode === 'amm') {
      setTradeMode('limit');
    }
  }, [enableAMM, tradeMode]);

  // Keep local token selectors in sync with page-level pair state.
  useEffect(() => {
    if (selectedSellToken !== undefined) {
      setSellToken(selectedSellToken);
    }
  }, [selectedSellToken]);

  useEffect(() => {
    if (selectedBuyToken !== undefined) {
      setBuyToken(selectedBuyToken);
    }
  }, [selectedBuyToken]);

  // Notify parent shell (chart/orderbook) whenever the pair changes in-form.
  useEffect(() => {
    onPairChange?.(sellToken, buyToken);
  }, [sellToken, buyToken, onPairChange]);

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

  // Price impact for AMM mode
  const priceImpact = useMemo(() => {
    if (tradeMode !== 'amm' || parsedSellAmount === 0n || ammQuote === 0n) return null;
    // Rough estimate: compare sell/buy ratio against 1:1 as baseline
    const sellNum = Number(ethers.formatUnits(parsedSellAmount, 18));
    const buyNum = Number(ethers.formatUnits(ammQuote, 18));
    if (sellNum === 0 || buyNum === 0) return null;
    // For AMM, price impact grows with order size relative to pool depth
    // The fee-adjusted ratio deviation from spot gives us the impact
    const feeAdjusted = buyNum / sellNum;
    // Use a simple model: impact = 1 - (actual_rate / expected_rate)
    // Since we do not have a separate spot price here, approximate it
    // by computing with a tiny amount (the quote already includes impact)
    return Math.max(0, (1 - feeAdjusted) * 100);
  }, [tradeMode, parsedSellAmount, ammQuote]);

  const priceImpactSeverity = useMemo(() => {
    if (priceImpact === null) return 'none';
    if (priceImpact >= 10) return 'blocking';
    if (priceImpact >= 5) return 'high';
    if (priceImpact >= 1) return 'medium';
    return 'low';
  }, [priceImpact]);

  const SLIPPAGE_PRESETS = [0.1, 0.5, 1, 2] as const;

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
        let resolvedChainId: number | null = null;

        // Resolve chainId
        if (provider) {
          const network = await provider.getNetwork();
          resolvedChainId = Number(network.chainId);
          if (!cancelled) setChainId(resolvedChainId);
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
          const effectiveChainId = resolvedChainId ?? chainId;
          const config = effectiveChainId ? getNetworkConfig(effectiveChainId) : null;
          const spender = config?.assetBackedExchangeAddress;

          const [balances, allowances] = await Promise.all([
            contractService.getAssetBalances([sellToken], userAddress),
            spender
              ? contractService.getAssetAllowances([sellToken], userAddress, spender)
              : Promise.resolve<Record<string, bigint>>({}),
          ]);
          const bal = balances[sellToken] ?? 0n;
          const allow = spender ? (allowances[sellToken] ?? 0n) : 0n;

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
        logger.error('Failed to load token balances:', err);
        toast.error('Unable to load token balances. Check your connection and try again.');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  // NOTE: chainId intentionally excluded -- it is resolved inside the effect
  // and including it would cause a re-fetch loop (setChainId -> dep change ->
  // re-run -> setChainId ...).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractService, sellToken, sellIsETH, txStatus]);

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
        logger.error('Failed to resolve chain info:', error);
        toast.error('Unable to detect your network. Please check your wallet connection.');
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

    if (!chainId) {
      toast.error('Unable to detect your network. Please reconnect your wallet.');
      return;
    }

    const currentChainId = chainId;

    setTxStatus('approving');
    setTxHash(null);

    try {
      // Use the AssetBackedExchange approval method
      const tx = await contractService.approveAssetBackedExchange(
        sellToken,
        parsedSellAmount,
      );
      setTxHash(tx.hash);
      txSubmittedToast(tx.hash, currentChainId, 'Approving token spend...');

      await contractService.waitForTransaction(tx);
      setTxStatus('approved');
      emitRpcRefetch(['allowances', 'balances']);
      txConfirmedToast(tx.hash, 'Token approved for exchange');
    } catch (err: unknown) {
      logger.error('Approve failed:', err);
      const errMsg = parseContractError(err);
      if (txHash) {
        txFailedToast(txHash, errMsg);
      } else {
        toast.error(errMsg);
      }
      setTxStatus('idle');
    }
  }, [contractService, sellToken, parsedSellAmount, txStatus, sellIsETH, chainId]);

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
      toast.error('You cannot swap a token for itself. Please select a different buy token.');
      return;
    }

    if (needsApproval) {
      toast.error('Token approval required. Please approve your sell token before placing the order.');
      return;
    }

    if (insufficientBalance) {
      toast.error('Insufficient balance to complete this order. Try a smaller amount.');
      return;
    }

    // Prevent double-click or re-entry while a tx is in flight
    if (txStatus !== 'idle' && txStatus !== 'approved') return;

    setTxStatus('creating');
    setTxHash(null);

    if (!chainId) {
      toast.error('Unable to detect your network. Please reconnect your wallet.');
      setTxStatus('idle');
      return;
    }

    // Track tx hash locally so the catch block can reference it even though
    // React state updates are asynchronous.
    let submittedHash: string | null = null;
    const currentChainId = chainId;

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

      submittedHash = tx.hash;
      setTxHash(tx.hash);
      txSubmittedToast(tx.hash, currentChainId, 'Creating order...');

      await contractService.waitForTransaction(tx);
      setTxStatus('confirmed');
      emitRpcRefetch(['orders', 'balances']);
      txConfirmedToast(tx.hash, 'Order created successfully!');

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
      logger.error('Create order failed:', err);
      const errMsg = parseContractError(err);
      if (submittedHash) {
        txFailedToast(submittedHash, errMsg);
      } else {
        toast.error(errMsg);
      }
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
    chainId,
    onOrderCreated,
    addTrade,
    assets,
    sellAmount,
  ]);

  // ---- AMM: fetch quote when sell amount changes ---------------------------

  const fetchAmmQuote = useCallback(async () => {
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
      setAmmQuote(q);
    } catch {
      setAmmQuote(0n);
    } finally {
      setAmmQuoteLoading(false);
    }
  }, [buyToken, contractService, parsedSellAmount, sellToken]);

  useEffect(() => {
    if (tradeMode !== 'amm') return;

    let cancelled = false;

    const timer = setTimeout(() => {
      if (!cancelled) {
        void fetchAmmQuote();
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fetchAmmQuote, tradeMode]);

  // Auto-refresh AMM quotes on the medium polling tier with background backoff.
  useEffect(() => {
    if (tradeMode !== 'amm' || !contractService || !sellToken || !buyToken || parsedSellAmount === 0n) {
      setQuoteRefreshTimer(Math.ceil(getPollingIntervalMs('medium') / 1000));
      return;
    }

    const resetCountdown = () => {
      setQuoteRefreshTimer(Math.ceil(getPollingIntervalMs('medium') / 1000));
    };

    const poller = createAdaptivePollingLoop({
      tier: 'medium',
      poll: async () => {
        resetCountdown();
        await fetchAmmQuote();
      },
      immediate: false,
    });

    resetCountdown();
    const countdown = setInterval(() => {
      setQuoteRefreshTimer((prev) => {
        if (prev <= 1) return 1;
        return prev - 1;
      });
    }, 1000);
    const unsubscribeVisibility = subscribeToVisibilityChange(() => {
      resetCountdown();
    });

    return () => {
      unsubscribeVisibility();
      clearInterval(countdown);
      poller.cancel();
    };
  }, [buyToken, contractService, fetchAmmQuote, parsedSellAmount, sellToken, tradeMode]);

  // AMM swap handler
  const handleAMMSwap = useCallback(async () => {
    if (!enableAMM) {
      toast.error('AMM swaps are not available on this network.');
      return;
    }
    if (!contractService || !sellToken || !buyToken || parsedSellAmount === 0n || ammQuote === 0n) return;
    if (txStatus !== 'idle' && txStatus !== 'approved') return;
    if (!chainId) {
      toast.error('Unable to detect your network. Please reconnect your wallet.');
      return;
    }

    // Check approval for non-ETH tokens
    if (!sellIsETH) {
      const currentChainId = chainId;
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
            txSubmittedToast(approveTx.hash, currentChainId, 'Approving token for AMM...');
            await contractService.waitForTransaction(approveTx);
            txConfirmedToast(approveTx.hash, 'Token approved for AMM');
            emitRpcRefetch(['allowances', 'balances']);
            setTxStatus('approved');
          } catch (err: unknown) {
            toast.error(parseContractError(err), { id: 'amm-approve' });
            setTxStatus('idle');
            return;
          }
        }
      }
    }

    setTxStatus('creating');
    setTxHash(null);

    // Calculate min output with slippage (basis points for exact precision)
    const slippageBps = BigInt(Math.round(slippage * 100));
    const minOut = ammQuote - (ammQuote * slippageBps) / 10000n;

    // Deadline: 20 minutes from now (matches ContractService._defaultDeadline)
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

    const swapChainId = chainId;
    let submittedSwapHash: string | null = null;

    try {
      let tx: ethers.ContractTransactionResponse;

      if (sellIsETH) {
        tx = await contractService.swapETHForToken(buyToken, minOut, parsedSellAmount, deadline);
      } else if (buyIsETH) {
        tx = await contractService.swapTokenForETH(sellToken, parsedSellAmount, minOut, deadline);
      } else {
        tx = await contractService.swapAMM(sellToken, buyToken, parsedSellAmount, minOut, deadline);
      }

      submittedSwapHash = tx.hash;
      setTxHash(tx.hash);
      txSubmittedToast(tx.hash, swapChainId, 'Swapping via AMM...');
      await contractService.waitForTransaction(tx);
      setTxStatus('confirmed');
      emitRpcRefetch(['pool', 'market-data', 'balances']);
      txConfirmedToast(tx.hash, 'Swap completed!');

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
      const errMsg = parseContractError(err);
      if (submittedSwapHash) {
        txFailedToast(submittedSwapHash, errMsg);
      } else {
        toast.error(errMsg);
      }
      setTxStatus('idle');
    }
  }, [contractService, sellToken, buyToken, parsedSellAmount, ammQuote, slippage, txStatus, sellIsETH, buyIsETH, chainId, enableAMM, onOrderCreated, addTrade, assets, sellAmount]);

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
          <HelpTooltip
            tooltipId="swap.routing"
            flow="swap"
            component="TradeForm.ModeToggle"
          />
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tradeMode === 'amm'}
          onClick={() => {
            if (!enableAMM) return;
            setTradeMode('amm');
            setTxStatus('idle');
            setTxHash(null);
          }}
          disabled={!enableAMM}
          className={clsx(
            'flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold transition-all duration-200',
            'min-h-[44px]',
            tradeMode === 'amm'
              ? 'bg-purple-500/15 text-purple-400 shadow-[inset_0_1px_0_rgba(168,85,247,0.2)]'
              : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]',
            !enableAMM && 'cursor-not-allowed opacity-50 hover:bg-transparent hover:text-gray-500',
          )}
        >
          <Zap className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Instant Swap (AMM)</span>
          <span className="sm:hidden">Swap</span>
        </button>
      </div>

      {!enableAMM && (
        <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.05] px-4 py-3 text-xs text-amber-300">
          <p>
            {orbitalFallbackEnabled
              ? 'Legacy AMM is not deployed on this network. Limit orders remain fully available.'
              : 'AMM unavailable on this network. Limit orders remain fully available.'}
          </p>
          {orbitalFallbackEnabled && (
            <Link
              to="/advanced"
              className={clsx(
                'mt-3 inline-flex items-center rounded-lg border border-cyan-400/30',
                'bg-cyan-500/10 px-3 py-1.5 text-[11px] font-semibold text-cyan-300',
                'transition-colors hover:bg-cyan-500/20 hover:text-cyan-200',
              )}
            >
              Open Orbital AMM
            </Link>
          )}
        </div>
      )}

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
            <label htmlFor="sell-amount" className="sr-only">Sell amount</label>
            <input
              id="sell-amount"
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
                'placeholder:text-gray-500',
                'focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/20',
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
                aria-label="Set maximum sell amount"
                className={clsx(
                  'rounded-lg px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-all',
                  'focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06070A]',
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
          aria-label="Swap sell and buy tokens"
          className={clsx(
            'flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200',
            'bg-[#0D0F14] border border-white/[0.06]',
            'hover:border-indigo-500/30 hover:bg-indigo-500/5 hover:rotate-180 shadow-lg shadow-black/20',
            'focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06070A]',
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
            <label htmlFor="buy-amount" className="sr-only">Buy amount</label>
            <input
              id="buy-amount"
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
                'placeholder:text-gray-500',
                'focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/20',
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
            <div className="flex items-center gap-1.5 px-1 text-xs text-gray-500">
              Approval required
              <HelpTooltip
                tooltipId="swap.approval"
                flow="swap"
                component="TradeForm.Approval"
              />
            </div>
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
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
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

        // Determine the button label with a clear reason when disabled
        let buttonLabel = isBuy ? 'Place Buy Order' : 'Place Sell Order';
        if (sellIsETH) buttonLabel += ' (ETH)';

        if (status === 'creating') {
          buttonLabel = 'Creating Order...';
        } else if (status === 'confirmed') {
          buttonLabel = 'Order Created!';
        } else if (!sellToken) {
          buttonLabel = 'Select sell token';
        } else if (!buyToken) {
          buttonLabel = 'Select buy token';
        } else if (parsedSellAmount === 0n) {
          buttonLabel = 'Enter sell amount';
        } else if (insufficientBalance) {
          buttonLabel = 'Insufficient balance';
        } else if (parsedBuyAmount === 0n) {
          buttonLabel = 'Enter buy amount';
        } else if (needsApproval) {
          buttonLabel = `Approve ${sellAsset?.symbol ?? 'token'} first`;
        }

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
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                {buttonLabel}
              </>
            ) : status === 'confirmed' ? (
              <>
                <Check className="h-4 w-4" />
                {buttonLabel}
              </>
            ) : (
              buttonLabel
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
          <label htmlFor="amm-sell-amount" className="sr-only">Sell amount</label>
          <div className="relative">
            <input
              id="amm-sell-amount"
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
                'placeholder:text-gray-500',
                'focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:ring-offset-2 focus:ring-offset-[#06070A]',
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
                aria-label="Set maximum sell amount"
                className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-all bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06070A]"
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
          aria-label="Swap sell and buy tokens"
          className={clsx(
            'flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200',
            'bg-[#0D0F14] border border-white/[0.06]',
            'hover:border-purple-500/30 hover:bg-purple-500/5 hover:rotate-180 shadow-lg shadow-black/20',
            'focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06070A]',
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
                <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none text-purple-400/60" />
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
        <div className={clsx(
          'rounded-xl border p-5 sm:p-6',
          priceImpactSeverity === 'blocking' ? 'bg-red-500/5 border-red-500/20' :
          priceImpactSeverity === 'high' ? 'bg-red-500/5 border-red-500/15' :
          priceImpactSeverity === 'medium' ? 'bg-amber-500/5 border-amber-500/15' :
          'bg-[#0D0F14]/80 border-white/[0.06]',
        )}>
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

            {/* Price impact with color-coded warnings */}
            {priceImpact !== null && (
              <div className="flex items-center justify-between py-2.5">
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  Price Impact
                  <HelpTooltip
                    tooltipId="swap.priceImpact"
                    flow="swap"
                    component="TradeForm.AMMQuote"
                  />
                </span>
                <span className={clsx(
                  'font-mono text-xs font-medium',
                  priceImpactSeverity === 'low' ? 'text-emerald-400' :
                  priceImpactSeverity === 'medium' ? 'text-amber-400' :
                  priceImpactSeverity === 'high' ? 'text-red-400' :
                  'text-red-500 font-bold',
                )}>
                  ~{formatPrice(priceImpact, 2)}%
                </span>
              </div>
            )}

            <div className="flex items-center justify-between py-2.5">
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                Min. received
                <HelpTooltip
                  tooltipId="swap.minReceived"
                  flow="swap"
                  component="TradeForm.AMMQuote"
                />
              </span>
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
                <HelpTooltip
                  tooltipId="swap.slippage"
                  flow="swap"
                  component="TradeForm.AMMQuote"
                />
              </button>
              <span className="font-mono text-xs text-purple-400">{slippage}%</span>
            </div>
          </div>

          {/* Price impact warning banners */}
          {priceImpactSeverity === 'blocking' && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-xs text-red-400 font-medium">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Very high price impact ({formatPrice(priceImpact ?? 0, 2)}%). You can still proceed, but expected output may be significantly lower.
            </div>
          )}
          {priceImpactSeverity === 'high' && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-500/5 border border-red-500/15 px-4 py-2.5 text-[11px] text-red-400">
              <AlertCircle className="h-3 w-3 shrink-0" />
              High price impact. Consider reducing your trade size.
            </div>
          )}
          {priceImpactSeverity === 'medium' && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-500/5 border border-amber-500/15 px-4 py-2.5 text-[11px] text-amber-400">
              <AlertCircle className="h-3 w-3 shrink-0" />
              Moderate price impact. You may receive less than expected.
            </div>
          )}

          {/* Auto-refresh countdown */}
          <div className="mt-3 flex items-center justify-between text-[11px] text-gray-600">
            <span className="flex items-center gap-1.5">
              <RefreshCw className="h-3 w-3" />
              Quote auto-refreshes
            </span>
            <span className="font-mono">{quoteRefreshTimer}s</span>
          </div>

          {/* Slippage settings */}
          {showSlippageSettings && (
            <div className="mt-3 space-y-2.5 pt-3 border-t border-white/[0.04]">
              <div className="flex gap-2">
                {SLIPPAGE_PRESETS.map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => { setSlippage(pct); setCustomSlippage(''); setShowSlippageSettings(false); }}
                    className={clsx(
                      'flex-1 rounded-lg py-2 text-xs font-semibold transition-all',
                      slippage === pct && !customSlippage
                        ? 'bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/30'
                        : 'bg-white/[0.04] text-gray-500 hover:text-gray-300',
                    )}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Custom"
                  value={customSlippage}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^[0-9]*\.?[0-9]*$/.test(val)) {
                      setCustomSlippage(val);
                      const parsed = parseFloat(val);
                      if (parsed > 0 && parsed <= 50) setSlippage(parsed);
                    }
                  }}
                  className={clsx(
                    'flex-1 rounded-lg px-3 py-2 text-xs font-mono text-white',
                    'bg-[#0D0F14] border border-white/[0.06]',
                    'placeholder:text-gray-600',
                    'focus:border-purple-500/40 focus:outline-none',
                  )}
                />
                <span className="text-xs text-gray-500">%</span>
              </div>
              {slippage > 5 && (
                <div className="flex items-center gap-1.5 text-[11px] text-amber-400">
                  <AlertCircle className="h-3 w-3" />
                  High slippage tolerance may result in unfavorable trades
                </div>
              )}
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

        // Determine button label with clear reason when disabled
        let swapLabel = 'Swap Tokens';
        if (status === 'approving') {
          swapLabel = 'Approving...';
        } else if (status === 'creating') {
          swapLabel = 'Swapping...';
        } else if (status === 'confirmed') {
          swapLabel = 'Swap Complete!';
        } else if (!sellToken) {
          swapLabel = 'Select sell token';
        } else if (!buyToken) {
          swapLabel = 'Select buy token';
        } else if (parsedSellAmount === 0n) {
          swapLabel = 'Enter an amount';
        } else if (insufficientBalance) {
          swapLabel = 'Insufficient balance';
        } else if (ammQuote === 0n && !ammQuoteLoading) {
          swapLabel = 'No liquidity available';
        }

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
            {(status === 'approving' || status === 'creating') && (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            )}
            {status === 'confirmed' && <Check className="h-4 w-4" />}
            {status !== 'approving' && status !== 'creating' && status !== 'confirmed' && (
              <Zap className="h-4 w-4" />
            )}
            {swapLabel}
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
