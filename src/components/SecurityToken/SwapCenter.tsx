/**
 * SwapCenter -- Manages OTC swaps via the RestrictedSwap mechanism built
 * into the ERC-1404 security token.
 *
 * Sections:
 *   A) Configure Sell  -- sell restricted tokens for a quote token
 *   B) Configure Buy   -- buy restricted tokens with a quote token
 *   C) Active Swaps    -- browse all swaps and their status
 *   D) Swap Actions    -- complete or cancel swaps
 *   E) Swap History    -- real-time event log of swap activity
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  AlertCircle,
  ArrowRightLeft,
  Ban,
  Check,
  ExternalLink,
  History,
  List,
  Loader2,
  RefreshCw,
  ShoppingCart,
  Tag,
} from 'lucide-react';
import {
  SecurityTokenABI,
  SWAP_STATUS,
  SWAP_STATUS_LABELS,
} from '../../contracts/abis/SecurityToken';
import { getProvider, useWalletStore } from '../../store/walletStore';
import { getReadOnlyProvider, parseContractError } from '../../lib/blockchain/contracts';
import { buildBufferedTransactionOverrides } from '../../lib/blockchain/transactionOverrides';
import {
  sendTransactionWithRetry,
  waitForTransactionReceipt,
} from '../../lib/blockchain/txExecution';
import { getExplorerTxUrl } from '../../contracts/addresses';
import { formatAddress, formatBalance } from '../../lib/utils/helpers';
import { getCurrentNav } from '../../lib/api/nav';
import { calculateQuotedNavAmount, computePremiumDiscount, isUsdStableSymbol } from '../../lib/navUtils';
import { queryKeys } from '../../lib/queryClient';
import Card from '../Common/Card';
import Badge from '../Common/Badge';
import Spinner from '../Common/Spinner';
import EmptyState from '../Common/EmptyState';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SwapCenterProps {
  tokenAddress: string;
}

interface SwapDetail {
  id: number;
  status: number;
  restrictedTokenSender: string;
  restrictedTokenAmount: bigint;
  quoteToken: string;
  quoteTokenSymbol: string;
  quoteTokenDecimals: number;
  quoteTokenSender: string;
  quoteTokenAmount: bigint;
}

interface SwapEvent {
  type: 'configured' | 'complete' | 'canceled';
  swapNumber: bigint;
  restrictedTokenSender: string;
  restrictedTokenAmount: bigint;
  quoteToken: string;
  quoteTokenSender: string;
  quoteTokenAmount: bigint;
  blockNumber: number;
  timestamp: number;
  txHash: string;
}

type ActiveTab = 'sell' | 'buy' | 'active' | 'history';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INPUT_CLASS =
  'bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors w-full';

const BTN_PRIMARY =
  'bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl px-6 py-3 font-medium transition-colors';

/** Minimal ERC-20 ABI for payment token interactions. */
const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusToBadgeVariant(
  status: number,
): 'warning' | 'info' | 'success' | 'danger' | 'default' {
  switch (status) {
    case SWAP_STATUS.SellConfigured:
      return 'warning';
    case SWAP_STATUS.BuyConfigured:
      return 'info';
    case SWAP_STATUS.Complete:
      return 'success';
    case SWAP_STATUS.Canceled:
      return 'danger';
    default:
      return 'default';
  }
}

function formatTimestamp(ts: number): string {
  if (ts === 0) return '--';
  const d = new Date(ts * 1000);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function getTokenMeta(
  tokenAddress: string,
): Promise<{ symbol: string; decimals: number }> {
  const { chainId } = useWalletStore.getState().wallet;
  if (!chainId) return { symbol: '???', decimals: 18 };
  try {
    const readProvider = getReadOnlyProvider(chainId);
    const erc20 = new ethers.Contract(tokenAddress, ERC20_ABI, readProvider);
    const [symbol, decimals] = await Promise.all([
      erc20.symbol() as Promise<string>,
      erc20.decimals() as Promise<bigint>,
    ]);
    return { symbol, decimals: Number(decimals) };
  } catch {
    return { symbol: '???', decimals: 18 };
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function SwapCenter({ tokenAddress }: SwapCenterProps) {
  const { wallet } = useWalletStore();
  const connectedAddress = wallet.address;
  const chainId = wallet.chainId;

  // ---- Tab state ----------------------------------------------------------
  const [activeTab, setActiveTab] = useState<ActiveTab>('active');

  // ---- Token info ---------------------------------------------------------
  const [tokenSymbol, setTokenSymbol] = useState('TOKEN');
  const [tokenDecimals, setTokenDecimals] = useState(18);
  const [userBalance, setUserBalance] = useState<bigint>(0n);

  // ---- Sell config state --------------------------------------------------
  const [sellAmount, setSellAmount] = useState('');
  const [sellQuoteToken, setSellQuoteToken] = useState('');
  const [sellQuoteTokenSender, setSellQuoteTokenSender] = useState('');
  const [sellQuoteAmount, setSellQuoteAmount] = useState('');
  const [sellQuoteTokenMeta, setSellQuoteTokenMeta] = useState<{
    symbol: string;
    decimals: number;
  } | null>(null);
  const [configuringSell, setConfiguringSell] = useState(false);

  // ---- Buy config state ---------------------------------------------------
  const [buyAmount, setBuyAmount] = useState('');
  const [buyRestrictedTokenSender, setBuyRestrictedTokenSender] =
    useState('');
  const [buyQuoteToken, setBuyQuoteToken] = useState('');
  const [buyQuoteAmount, setBuyQuoteAmount] = useState('');
  const [buyQuoteTokenMeta, setBuyQuoteTokenMeta] = useState<{
    symbol: string;
    decimals: number;
  } | null>(null);
  const [configuringBuy, setConfiguringBuy] = useState(false);
  const [buyApprovalNeeded, setBuyApprovalNeeded] = useState(false);
  const [approvingBuy, setApprovingBuy] = useState(false);

  // ---- Active swaps state -------------------------------------------------
  const [swaps, setSwaps] = useState<SwapDetail[]>([]);
  const [swapsLoading, setSwapsLoading] = useState(false);
  const [totalSwaps, setTotalSwaps] = useState(0);
  const [statusFilter, setStatusFilter] = useState<number | 'all'>('all');

  // ---- Swap actions state -------------------------------------------------
  const [completingSwap, setCompletingSwap] = useState<number | null>(
    null,
  );
  const [cancelingSwap, setCancelingSwap] = useState<number | null>(null);
  const [approvingSwap, setApprovingSwap] = useState<number | null>(null);

  // ---- History state ------------------------------------------------------
  const [swapEvents, setSwapEvents] = useState<SwapEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const eventListenerRef = useRef<ethers.Contract | null>(null);

  const navQuery = useQuery({
    queryKey: queryKeys.navCurrent(tokenAddress, chainId),
    enabled: Boolean(chainId),
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!chainId) {
        return null;
      }
      return getCurrentNav(tokenAddress, chainId);
    },
  });

  // ---- Helper: get contract -----------------------------------------------

  const getContract = useCallback(
    async (withSigner: boolean = false) => {
      if (withSigner) {
        const provider = getProvider();
        if (!provider) throw new Error('Wallet not connected');
        const signer = await provider.getSigner();
        return new ethers.Contract(
          tokenAddress,
          SecurityTokenABI,
          signer,
        );
      }
      const { chainId } = useWalletStore.getState().wallet;
      if (!chainId) throw new Error('Wallet not connected');
      const readProvider = getReadOnlyProvider(chainId);
      return new ethers.Contract(
        tokenAddress,
        SecurityTokenABI,
        readProvider,
      );
    },
    [tokenAddress],
  );

  // ---- Load token info ----------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function loadTokenInfo() {
      try {
        const contract = await getContract();
        const [sym, dec] = await Promise.all([
          contract.symbol() as Promise<string>,
          contract.decimals() as Promise<bigint>,
        ]);
        if (!cancelled) {
          setTokenSymbol(sym);
          setTokenDecimals(Number(dec));
        }

        if (connectedAddress) {
          const bal: bigint = await contract.balanceOf(connectedAddress);
          if (!cancelled) setUserBalance(bal);
        }
      } catch {
        // Non-critical
      }
    }

    void loadTokenInfo();
    return () => {
      cancelled = true;
    };
  }, [getContract, connectedAddress]);

  // ---- Load quote token meta for sell form --------------------------------

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!sellQuoteToken || !ethers.isAddress(sellQuoteToken)) {
        setSellQuoteTokenMeta(null);
        return;
      }
      const meta = await getTokenMeta(sellQuoteToken);
      if (!cancelled) setSellQuoteTokenMeta(meta);
    }

    const timer = setTimeout(() => void load(), 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sellQuoteToken]);

  // ---- Load quote token meta for buy form ---------------------------------

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!buyQuoteToken || !ethers.isAddress(buyQuoteToken)) {
        setBuyQuoteTokenMeta(null);
        return;
      }
      const meta = await getTokenMeta(buyQuoteToken);
      if (!cancelled) setBuyQuoteTokenMeta(meta);
    }

    const timer = setTimeout(() => void load(), 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [buyQuoteToken]);

  // ---- Check buy approval -------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function checkApproval() {
      if (
        !buyQuoteToken ||
        !ethers.isAddress(buyQuoteToken) ||
        !buyQuoteAmount ||
        !buyQuoteTokenMeta ||
        !connectedAddress
      ) {
        setBuyApprovalNeeded(false);
        return;
      }

      try {
        const { chainId } = useWalletStore.getState().wallet;
        if (!chainId) return;
        const readProvider = getReadOnlyProvider(chainId);
        const erc20 = new ethers.Contract(
          buyQuoteToken,
          ERC20_ABI,
          readProvider,
        );
        const allowance: bigint = await erc20.allowance(
          connectedAddress,
          tokenAddress,
        );
        const amount = ethers.parseUnits(
          buyQuoteAmount,
          buyQuoteTokenMeta.decimals,
        );
        if (!cancelled) setBuyApprovalNeeded(allowance < amount);
      } catch {
        if (!cancelled) setBuyApprovalNeeded(false);
      }
    }

    void checkApproval();
    return () => {
      cancelled = true;
    };
  }, [
    buyQuoteToken,
    buyQuoteAmount,
    buyQuoteTokenMeta,
    connectedAddress,
    tokenAddress,
  ]);

  // ---- Load all swaps -----------------------------------------------------

  const loadSwaps = useCallback(async () => {
    setSwapsLoading(true);
    try {
      const contract = await getContract();
      const total: bigint = await contract.swapNumber();
      setTotalSwaps(Number(total));

      const loaded: SwapDetail[] = [];

      // Load swap statuses and event data
      // Swaps are 1-indexed
      for (let i = 1; i <= Number(total); i++) {
        try {
          const status: bigint = await contract.swapStatus(i);

          // Get swap details from SwapConfigured events
          let detail: Partial<SwapDetail> = {
            id: i,
            status: Number(status),
            restrictedTokenSender: '',
            restrictedTokenAmount: 0n,
            quoteToken: '',
            quoteTokenSymbol: '???',
            quoteTokenDecimals: 18,
            quoteTokenSender: '',
            quoteTokenAmount: 0n,
          };

          try {
            const filter = contract.filters.SwapConfigured(i);
            const events = await contract.queryFilter(filter);
            if (events.length > 0) {
              const log = events[0] as ethers.EventLog;
              const args = log.args;

              const quoteTokenAddr = args[3] as string;
              const meta = await getTokenMeta(quoteTokenAddr);

              detail = {
                ...detail,
                restrictedTokenSender: args[1] as string,
                restrictedTokenAmount: args[2] as bigint,
                quoteToken: quoteTokenAddr,
                quoteTokenSymbol: meta.symbol,
                quoteTokenDecimals: meta.decimals,
                quoteTokenSender: args[4] as string,
                quoteTokenAmount: args[5] as bigint,
              };
            }
          } catch {
            // Event data unavailable
          }

          loaded.push(detail as SwapDetail);
        } catch {
          // Skip failed entries
        }
      }

      setSwaps(loaded);
    } catch (err) {
      toast.error(`Failed to load swaps: ${parseContractError(err)}`);
    } finally {
      setSwapsLoading(false);
    }
  }, [getContract]);

  useEffect(() => {
    void loadSwaps();
  }, [loadSwaps]);

  // ---- Configure Sell -----------------------------------------------------

  const handleConfigureSell = useCallback(async () => {
    if (configuringSell) return;
    setConfiguringSell(true);

    try {
      if (!ethers.isAddress(sellQuoteToken)) {
        toast.error('Invalid quote token address');
        return;
      }
      if (!ethers.isAddress(sellQuoteTokenSender)) {
        toast.error('Invalid quote token sender address');
        return;
      }

      if (!sellAmount || isNaN(Number(sellAmount)) || Number(sellAmount) <= 0) {
        toast.error('Enter a valid sell amount');
        return;
      }
      const restrictedAmount = ethers.parseUnits(
        sellAmount,
        tokenDecimals,
      );
      if (!sellQuoteTokenMeta) {
        toast.error('Quote token info not loaded');
        return;
      }
      const quoteAmount = ethers.parseUnits(
        sellQuoteAmount,
        sellQuoteTokenMeta.decimals,
      );

      // Validate balance
      if (restrictedAmount > userBalance) {
        toast.error(
          `Insufficient ${tokenSymbol} balance. You have ${formatBalance(userBalance, tokenDecimals, 6)}`,
        );
        return;
      }

      toast.loading('Configuring sell...', { id: 'configure-sell' });

      const provider = getProvider();
      if (!provider) throw new Error('Wallet not connected');
      const contract = await getContract(true);
      const gasEstimate = await contract.configureSell.estimateGas(
        restrictedAmount,
        sellQuoteToken,
        sellQuoteTokenSender,
        quoteAmount,
      );
      const txOverrides = await buildBufferedTransactionOverrides(provider, gasEstimate);
      const tx = await sendTransactionWithRetry(
        () =>
          contract.configureSell(
            restrictedAmount,
            sellQuoteToken,
            sellQuoteTokenSender,
            quoteAmount,
            txOverrides,
          ),
        { label: 'SwapCenter.configureSell' },
      );
      await waitForTransactionReceipt(tx, { label: 'SwapCenter.configureSell' });

      toast.success('Sell configured successfully', {
        id: 'configure-sell',
      });
      setSellAmount('');
      setSellQuoteToken('');
      setSellQuoteTokenSender('');
      setSellQuoteAmount('');
      await loadSwaps();
    } catch (err) {
      toast.error(parseContractError(err), { id: 'configure-sell' });
    } finally {
      setConfiguringSell(false);
    }
  }, [
    getContract,
    sellAmount,
    sellQuoteToken,
    sellQuoteTokenSender,
    sellQuoteAmount,
    sellQuoteTokenMeta,
    tokenDecimals,
    userBalance,
    tokenSymbol,
    configuringSell,
    loadSwaps,
  ]);

  // ---- Approve buy quote token --------------------------------------------

  const handleApproveBuyQuoteToken = useCallback(async () => {
    if (approvingBuy || !buyQuoteTokenMeta) return;
    setApprovingBuy(true);

    try {
      const amount = ethers.parseUnits(
        buyQuoteAmount,
        buyQuoteTokenMeta.decimals,
      );

      toast.loading('Approving quote token...', {
        id: 'approve-buy-quote',
      });

      const provider = getProvider();
      if (!provider) throw new Error('Wallet not connected');
      const signer = await provider.getSigner();
      const erc20 = new ethers.Contract(
        buyQuoteToken,
        ERC20_ABI,
        signer,
      );

      const gasEstimate = await erc20.approve.estimateGas(
        tokenAddress,
        amount,
      );
      const txOverrides = await buildBufferedTransactionOverrides(provider, gasEstimate);
      const tx = await sendTransactionWithRetry(
        () => erc20.approve(tokenAddress, amount, txOverrides),
        { label: 'SwapCenter.approveBuyQuoteToken' },
      );
      await waitForTransactionReceipt(tx, { label: 'SwapCenter.approveBuyQuoteToken' });

      toast.success('Quote token approved', {
        id: 'approve-buy-quote',
      });
      setBuyApprovalNeeded(false);
    } catch (err) {
      toast.error(parseContractError(err), {
        id: 'approve-buy-quote',
      });
    } finally {
      setApprovingBuy(false);
    }
  }, [
    approvingBuy,
    buyQuoteToken,
    buyQuoteAmount,
    buyQuoteTokenMeta,
    tokenAddress,
  ]);

  // ---- Configure Buy ------------------------------------------------------

  const handleConfigureBuy = useCallback(async () => {
    if (configuringBuy) return;
    setConfiguringBuy(true);

    try {
      if (!ethers.isAddress(buyRestrictedTokenSender)) {
        toast.error('Invalid restricted token sender address');
        return;
      }
      if (!ethers.isAddress(buyQuoteToken)) {
        toast.error('Invalid quote token address');
        return;
      }

      const restrictedAmount = ethers.parseUnits(
        buyAmount,
        tokenDecimals,
      );
      if (!buyQuoteTokenMeta) {
        toast.error('Quote token info not loaded');
        return;
      }
      const quoteAmount = ethers.parseUnits(
        buyQuoteAmount,
        buyQuoteTokenMeta.decimals,
      );

      toast.loading('Configuring buy...', { id: 'configure-buy' });

      const provider = getProvider();
      if (!provider) throw new Error('Wallet not connected');
      const contract = await getContract(true);
      const gasEstimate = await contract.configureBuy.estimateGas(
        restrictedAmount,
        buyRestrictedTokenSender,
        buyQuoteToken,
        quoteAmount,
      );
      const txOverrides = await buildBufferedTransactionOverrides(provider, gasEstimate);
      const tx = await sendTransactionWithRetry(
        () =>
          contract.configureBuy(
            restrictedAmount,
            buyRestrictedTokenSender,
            buyQuoteToken,
            quoteAmount,
            txOverrides,
          ),
        { label: 'SwapCenter.configureBuy' },
      );
      await waitForTransactionReceipt(tx, { label: 'SwapCenter.configureBuy' });

      toast.success('Buy configured successfully', {
        id: 'configure-buy',
      });
      setBuyAmount('');
      setBuyRestrictedTokenSender('');
      setBuyQuoteToken('');
      setBuyQuoteAmount('');
      await loadSwaps();
    } catch (err) {
      toast.error(parseContractError(err), { id: 'configure-buy' });
    } finally {
      setConfiguringBuy(false);
    }
  }, [
    getContract,
    buyAmount,
    buyRestrictedTokenSender,
    buyQuoteToken,
    buyQuoteAmount,
    buyQuoteTokenMeta,
    tokenDecimals,
    configuringBuy,
    loadSwaps,
  ]);

  // ---- Complete swap with payment token -----------------------------------

  const handleCompleteWithPayment = useCallback(
    async (swap: SwapDetail) => {
      if (completingSwap !== null) return;
      setCompletingSwap(swap.id);

      try {
        // Check and approve quote token
        const provider = getProvider();
        if (!provider) throw new Error('Wallet not connected');
        const signer = await provider.getSigner();

        const erc20 = new ethers.Contract(
          swap.quoteToken,
          ERC20_ABI,
          signer,
        );
        const allowance: bigint = await erc20.allowance(
          connectedAddress,
          tokenAddress,
        );

        if (allowance < swap.quoteTokenAmount) {
          setApprovingSwap(swap.id);
          toast.loading('Approving quote token...', {
            id: 'approve-swap-payment',
          });

          const approveGas = await erc20.approve.estimateGas(
            tokenAddress,
            swap.quoteTokenAmount,
          );
          const approveOverrides = await buildBufferedTransactionOverrides(provider, approveGas);
          const approveTx = await sendTransactionWithRetry(
            () =>
              erc20.approve(tokenAddress, swap.quoteTokenAmount, approveOverrides),
            { label: 'SwapCenter.approveSwapPayment' },
          );
          await waitForTransactionReceipt(approveTx, { label: 'SwapCenter.approveSwapPayment' });
          toast.success('Quote token approved', {
            id: 'approve-swap-payment',
          });
          setApprovingSwap(null);
        }

        toast.loading('Completing swap...', {
          id: 'complete-swap',
        });

        const contract = await getContract(true);
        const gasEstimate =
          await contract.completeSwapWithPaymentToken.estimateGas(
            swap.id,
          );
        const txOverrides = await buildBufferedTransactionOverrides(provider, gasEstimate);
        const tx = await sendTransactionWithRetry(
          () => contract.completeSwapWithPaymentToken(swap.id, txOverrides),
          { label: 'SwapCenter.completeSwapWithPayment' },
        );
        await waitForTransactionReceipt(tx, { label: 'SwapCenter.completeSwapWithPayment' });

        toast.success('Swap completed!', { id: 'complete-swap' });
        await loadSwaps();
      } catch (err) {
        toast.error(parseContractError(err), {
          id: 'complete-swap',
        });
      } finally {
        setCompletingSwap(null);
        setApprovingSwap(null);
      }
    },
    [
      getContract,
      connectedAddress,
      tokenAddress,
      completingSwap,
      loadSwaps,
    ],
  );

  // ---- Complete swap with restricted token --------------------------------

  const handleCompleteWithRestricted = useCallback(
    async (swap: SwapDetail) => {
      if (completingSwap !== null) return;
      setCompletingSwap(swap.id);

      try {
        toast.loading('Completing swap with restricted token...', {
          id: 'complete-swap-restricted',
        });

        const provider = getProvider();
        if (!provider) throw new Error('Wallet not connected');
        const contract = await getContract(true);
        const gasEstimate =
          await contract.completeSwapWithRestrictedToken.estimateGas(
            swap.id,
          );
        const txOverrides = await buildBufferedTransactionOverrides(provider, gasEstimate);
        const tx = await sendTransactionWithRetry(
          () => contract.completeSwapWithRestrictedToken(swap.id, txOverrides),
          { label: 'SwapCenter.completeSwapWithRestricted' },
        );
        await waitForTransactionReceipt(tx, { label: 'SwapCenter.completeSwapWithRestricted' });

        toast.success('Swap completed!', {
          id: 'complete-swap-restricted',
        });
        await loadSwaps();
      } catch (err) {
        toast.error(parseContractError(err), {
          id: 'complete-swap-restricted',
        });
      } finally {
        setCompletingSwap(null);
      }
    },
    [getContract, completingSwap, loadSwaps],
  );

  // ---- Cancel swap --------------------------------------------------------

  const handleCancelSwap = useCallback(
    async (swapId: number) => {
      if (cancelingSwap !== null) return;
      setCancelingSwap(swapId);

      try {
        toast.loading('Canceling swap...', { id: 'cancel-swap' });

        const provider = getProvider();
        if (!provider) throw new Error('Wallet not connected');
        const contract = await getContract(true);
        const gasEstimate = await contract.cancelSell.estimateGas(
          swapId,
        );
        const txOverrides = await buildBufferedTransactionOverrides(provider, gasEstimate);
        const tx = await sendTransactionWithRetry(
          () => contract.cancelSell(swapId, txOverrides),
          { label: 'SwapCenter.cancelSwap' },
        );
        await waitForTransactionReceipt(tx, { label: 'SwapCenter.cancelSwap' });

        toast.success('Swap canceled', { id: 'cancel-swap' });
        await loadSwaps();
      } catch (err) {
        toast.error(parseContractError(err), { id: 'cancel-swap' });
      } finally {
        setCancelingSwap(null);
      }
    },
    [getContract, cancelingSwap, loadSwaps],
  );

  // ---- Load swap history --------------------------------------------------

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const contract = await getContract();
      const { chainId } = useWalletStore.getState().wallet;
      if (!chainId) return;
      const readProvider = getReadOnlyProvider(chainId);

      const latestBlock = await readProvider.getBlockNumber();
      const fromBlock = Math.max(0, latestBlock - 50000);

      const [configuredEvents, completeEvents, canceledEvents] =
        await Promise.all([
          contract.queryFilter(
            contract.filters.SwapConfigured(),
            fromBlock,
          ),
          contract.queryFilter(
            contract.filters.SwapComplete(),
            fromBlock,
          ),
          contract.queryFilter(
            contract.filters.SwapCanceled(),
            fromBlock,
          ),
        ]);

      const events: SwapEvent[] = [];

      for (const event of configuredEvents) {
        const log = event as ethers.EventLog;
        const block = await log.getBlock();
        events.push({
          type: 'configured',
          swapNumber: log.args[0] as bigint,
          restrictedTokenSender: log.args[1] as string,
          restrictedTokenAmount: log.args[2] as bigint,
          quoteToken: log.args[3] as string,
          quoteTokenSender: log.args[4] as string,
          quoteTokenAmount: log.args[5] as bigint,
          blockNumber: log.blockNumber,
          timestamp: block?.timestamp ?? 0,
          txHash: log.transactionHash,
        });
      }

      for (const event of completeEvents) {
        const log = event as ethers.EventLog;
        const block = await log.getBlock();
        events.push({
          type: 'complete',
          swapNumber: log.args[0] as bigint,
          restrictedTokenSender: log.args[1] as string,
          restrictedTokenAmount: log.args[2] as bigint,
          quoteToken: log.args[4] as string,
          quoteTokenSender: log.args[3] as string,
          quoteTokenAmount: log.args[5] as bigint,
          blockNumber: log.blockNumber,
          timestamp: block?.timestamp ?? 0,
          txHash: log.transactionHash,
        });
      }

      for (const event of canceledEvents) {
        const log = event as ethers.EventLog;
        const block = await log.getBlock();
        events.push({
          type: 'canceled',
          swapNumber: log.args[1] as bigint,
          restrictedTokenSender: log.args[0] as string,
          restrictedTokenAmount: 0n,
          quoteToken: '',
          quoteTokenSender: '',
          quoteTokenAmount: 0n,
          blockNumber: log.blockNumber,
          timestamp: block?.timestamp ?? 0,
          txHash: log.transactionHash,
        });
      }

      // Sort by block number descending
      events.sort((a, b) => b.blockNumber - a.blockNumber);
      setSwapEvents(events);
    } catch (err) {
      toast.error(
        `Failed to load swap history: ${parseContractError(err)}`,
      );
    } finally {
      setHistoryLoading(false);
    }
  }, [getContract]);

  useEffect(() => {
    if (activeTab === 'history') {
      void loadHistory();
    }
  }, [activeTab, loadHistory]);

  // ---- Set up real-time event listeners -----------------------------------

  useEffect(() => {
    let contract: ethers.Contract | null = null;

    async function setup() {
      try {
        contract = await getContract();
        eventListenerRef.current = contract;

        const onSwapConfigured = () => {
          void loadSwaps();
          if (activeTab === 'history') void loadHistory();
        };

        const onSwapComplete = () => {
          void loadSwaps();
          if (activeTab === 'history') void loadHistory();
        };

        const onSwapCanceled = () => {
          void loadSwaps();
          if (activeTab === 'history') void loadHistory();
        };

        contract.on('SwapConfigured', onSwapConfigured);
        contract.on('SwapComplete', onSwapComplete);
        contract.on('SwapCanceled', onSwapCanceled);
      } catch {
        // Event listener setup is best-effort
      }
    }

    void setup();

    return () => {
      if (eventListenerRef.current) {
        eventListenerRef.current.removeAllListeners();
        eventListenerRef.current = null;
      }
    };
  }, [getContract, loadSwaps, loadHistory, activeTab]);

  // ---- Filtered swaps -----------------------------------------------------

  const filteredSwaps = useMemo(() => {
    if (statusFilter === 'all') return swaps;
    return swaps.filter((s) => s.status === statusFilter);
  }, [swaps, statusFilter]);

  const sellNavPremiumDiscount = useMemo(() => {
    if (
      !navQuery.data ||
      !sellAmount ||
      !sellQuoteAmount ||
      !sellQuoteTokenMeta ||
      !isUsdStableSymbol(sellQuoteTokenMeta.symbol)
    ) {
      return null;
    }

    const tokenAmount = Number.parseFloat(sellAmount);
    const quoteAmount = Number.parseFloat(sellQuoteAmount);
    if (!Number.isFinite(tokenAmount) || tokenAmount <= 0 || !Number.isFinite(quoteAmount) || quoteAmount <= 0) {
      return null;
    }

    return computePremiumDiscount(navQuery.data.navPerToken, quoteAmount / tokenAmount);
  }, [navQuery.data, sellAmount, sellQuoteAmount, sellQuoteTokenMeta]);

  const buyNavPremiumDiscount = useMemo(() => {
    if (
      !navQuery.data ||
      !buyAmount ||
      !buyQuoteAmount ||
      !buyQuoteTokenMeta ||
      !isUsdStableSymbol(buyQuoteTokenMeta.symbol)
    ) {
      return null;
    }

    const tokenAmount = Number.parseFloat(buyAmount);
    const quoteAmount = Number.parseFloat(buyQuoteAmount);
    if (!Number.isFinite(tokenAmount) || tokenAmount <= 0 || !Number.isFinite(quoteAmount) || quoteAmount <= 0) {
      return null;
    }

    return computePremiumDiscount(navQuery.data.navPerToken, quoteAmount / tokenAmount);
  }, [buyAmount, buyQuoteAmount, buyQuoteTokenMeta, navQuery.data]);

  // ---- Balance check for sell form ----------------------------------------

  const sellBalanceInsufficient = useMemo(() => {
    if (!sellAmount) return false;
    try {
      const amt = ethers.parseUnits(sellAmount, tokenDecimals);
      return amt > userBalance;
    } catch {
      return false;
    }
  }, [sellAmount, tokenDecimals, userBalance]);

  // ---- Render: Tab buttons ------------------------------------------------

  const tabs: { key: ActiveTab; label: string; icon: typeof Tag }[] = [
    { key: 'sell', label: 'Sell', icon: Tag },
    { key: 'buy', label: 'Buy', icon: ShoppingCart },
    { key: 'active', label: 'Active Swaps', icon: List },
    { key: 'history', label: 'History', icon: History },
  ];

  // ---- Render -------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={clsx(
              'flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
              activeTab === key
                ? 'bg-indigo-600/20 text-indigo-400 shadow-sm'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]',
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Balance info */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span>
          Your {tokenSymbol} Balance:{' '}
          <span className="text-gray-400 font-mono">
            {formatBalance(userBalance, tokenDecimals, 6)}
          </span>
        </span>
        <span>
          Total Swaps:{' '}
          <span className="text-gray-400 font-mono">{totalSwaps}</span>
        </span>
      </div>

      {/* ================================================================= */}
      {/* A) CONFIGURE SELL                                                 */}
      {/* ================================================================= */}

      {activeTab === 'sell' && (
        <Card
          title="Configure Sell"
          subtitle={`Sell ${tokenSymbol} for a quote token. Tokens are transferred to the contract on configuration.`}
          gradientBorder
        >
          <div className="space-y-4">
            {/* Restricted token amount */}
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">
                {tokenSymbol} Amount to Sell
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={sellAmount}
                onChange={(e) => {
                  const val = e.target.value;
                  if (/^[0-9]*\.?[0-9]*$/.test(val))
                    setSellAmount(val);
                }}
                placeholder="0.0"
                className={INPUT_CLASS}
              />
              {sellBalanceInsufficient && (
                <p className="mt-1 text-xs text-red-400">
                  Insufficient balance
                </p>
              )}
            </div>

            {/* Quote token address */}
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">
                Quote Token Address
              </label>
              <input
                type="text"
                value={sellQuoteToken}
                onChange={(e) => setSellQuoteToken(e.target.value)}
                placeholder="0x..."
                className={INPUT_CLASS}
              />
              {sellQuoteTokenMeta && (
                <p className="mt-1 text-[10px] text-gray-600">
                  Token: {sellQuoteTokenMeta.symbol}
                </p>
              )}
            </div>

            {/* Quote token sender */}
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">
                Quote Token Sender (buyer address)
              </label>
              <input
                type="text"
                value={sellQuoteTokenSender}
                onChange={(e) =>
                  setSellQuoteTokenSender(e.target.value)
                }
                placeholder="0x..."
                className={INPUT_CLASS}
              />
            </div>

            {navQuery.data && (
              <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 p-3 text-xs text-indigo-100">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-indigo-200">
                      NAV reference: {tokenSymbol} is currently valued at ${Number.parseFloat(navQuery.data.navPerToken).toFixed(2)} per token
                    </p>
                    <p className="mt-1 text-indigo-100/70">
                      Effective {formatTimestamp(Math.floor(new Date(navQuery.data.effectiveDate).getTime() / 1000))}
                    </p>
                  </div>
                  {sellQuoteTokenMeta && isUsdStableSymbol(sellQuoteTokenMeta.symbol) && sellAmount && (
                    <button
                      type="button"
                      className="rounded-lg border border-indigo-400/20 bg-indigo-500/15 px-3 py-2 font-medium text-indigo-100 transition-colors hover:bg-indigo-500/25"
                      onClick={() =>
                        setSellQuoteAmount(
                          calculateQuotedNavAmount(
                            sellAmount,
                            navQuery.data?.navPerToken ?? '',
                          ),
                        )
                      }
                    >
                      Use NAV Reference
                    </button>
                  )}
                </div>
                {sellQuoteTokenMeta && !isUsdStableSymbol(sellQuoteTokenMeta.symbol) && (
                  <p className="mt-2 text-indigo-100/70">
                    Premium/discount guidance appears when the quote token is USD-pegged.
                  </p>
                )}
                {sellNavPremiumDiscount && (
                  <p className="mt-2 font-medium">
                    Listing is {Math.abs(sellNavPremiumDiscount.percent).toFixed(2)}%{' '}
                    {sellNavPremiumDiscount.direction === 'at-nav'
                      ? 'at NAV'
                      : sellNavPremiumDiscount.direction === 'premium'
                        ? 'premium to NAV'
                        : 'discount to NAV'}
                  </p>
                )}
              </div>
            )}

            {/* Quote token amount */}
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">
                Quote Token Amount (price)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={sellQuoteAmount}
                onChange={(e) => {
                  const val = e.target.value;
                  if (/^[0-9]*\.?[0-9]*$/.test(val))
                    setSellQuoteAmount(val);
                }}
                placeholder="0.0"
                className={INPUT_CLASS}
              />
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Your {tokenSymbol} tokens will be transferred to the swap
              contract upon configuration.
            </div>

            <button
              type="button"
              onClick={handleConfigureSell}
              disabled={
                configuringSell ||
                !sellAmount ||
                !sellQuoteToken ||
                !sellQuoteTokenSender ||
                !sellQuoteAmount ||
                sellBalanceInsufficient
              }
              className={BTN_PRIMARY}
            >
              {configuringSell ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Configuring...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Configure Sell
                </span>
              )}
            </button>
          </div>
        </Card>
      )}

      {/* ================================================================= */}
      {/* B) CONFIGURE BUY                                                  */}
      {/* ================================================================= */}

      {activeTab === 'buy' && (
        <Card
          title="Configure Buy"
          subtitle={`Buy ${tokenSymbol} from a specific seller using a quote token`}
          gradientBorder
        >
          <div className="space-y-4">
            {/* Restricted token amount */}
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">
                {tokenSymbol} Amount to Buy
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={buyAmount}
                onChange={(e) => {
                  const val = e.target.value;
                  if (/^[0-9]*\.?[0-9]*$/.test(val))
                    setBuyAmount(val);
                }}
                placeholder="0.0"
                className={INPUT_CLASS}
              />
            </div>

            {/* Restricted token sender */}
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">
                Restricted Token Sender (seller address)
              </label>
              <input
                type="text"
                value={buyRestrictedTokenSender}
                onChange={(e) =>
                  setBuyRestrictedTokenSender(e.target.value)
                }
                placeholder="0x..."
                className={INPUT_CLASS}
              />
            </div>

            {/* Quote token address */}
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">
                Quote Token Address
              </label>
              <input
                type="text"
                value={buyQuoteToken}
                onChange={(e) => setBuyQuoteToken(e.target.value)}
                placeholder="0x..."
                className={INPUT_CLASS}
              />
              {buyQuoteTokenMeta && (
                <p className="mt-1 text-[10px] text-gray-600">
                  Token: {buyQuoteTokenMeta.symbol}
                </p>
              )}
            </div>

            {navQuery.data && (
              <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 p-3 text-xs text-indigo-100">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-indigo-200">
                      NAV reference: {tokenSymbol} is currently valued at ${Number.parseFloat(navQuery.data.navPerToken).toFixed(2)} per token
                    </p>
                    <p className="mt-1 text-indigo-100/70">
                      Use this as a fair-value reference before accepting an OTC quote.
                    </p>
                  </div>
                  {buyQuoteTokenMeta && isUsdStableSymbol(buyQuoteTokenMeta.symbol) && buyAmount && (
                    <button
                      type="button"
                      className="rounded-lg border border-indigo-400/20 bg-indigo-500/15 px-3 py-2 font-medium text-indigo-100 transition-colors hover:bg-indigo-500/25"
                      onClick={() =>
                        setBuyQuoteAmount(
                          calculateQuotedNavAmount(
                            buyAmount,
                            navQuery.data?.navPerToken ?? '',
                          ),
                        )
                      }
                    >
                      Use NAV Reference
                    </button>
                  )}
                </div>
                {buyQuoteTokenMeta && !isUsdStableSymbol(buyQuoteTokenMeta.symbol) && (
                  <p className="mt-2 text-indigo-100/70">
                    Premium/discount guidance appears when the quote token is USD-pegged.
                  </p>
                )}
                {buyNavPremiumDiscount && (
                  <p className="mt-2 font-medium">
                    Quote is {Math.abs(buyNavPremiumDiscount.percent).toFixed(2)}%{' '}
                    {buyNavPremiumDiscount.direction === 'at-nav'
                      ? 'at NAV'
                      : buyNavPremiumDiscount.direction === 'premium'
                        ? 'premium to NAV'
                        : 'discount to NAV'}
                  </p>
                )}
              </div>
            )}

            {/* Quote token amount */}
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">
                Quote Token Amount (payment)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={buyQuoteAmount}
                onChange={(e) => {
                  const val = e.target.value;
                  if (/^[0-9]*\.?[0-9]*$/.test(val))
                    setBuyQuoteAmount(val);
                }}
                placeholder="0.0"
                className={INPUT_CLASS}
              />
            </div>

            {/* Approval + Configure flow */}
            {buyApprovalNeeded ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-400">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  Approval required. Approve the security token contract
                  to spend your quote tokens first.
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleApproveBuyQuoteToken}
                    disabled={approvingBuy}
                    className={clsx(BTN_PRIMARY, 'flex-1')}
                  >
                    {approvingBuy ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Approving...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <Check className="h-4 w-4" />
                        Approve Quote Token
                      </span>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleConfigureBuy}
                disabled={
                  configuringBuy ||
                  !buyAmount ||
                  !buyRestrictedTokenSender ||
                  !buyQuoteToken ||
                  !buyQuoteAmount
                }
                className={BTN_PRIMARY}
              >
                {configuringBuy ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Configuring...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4" />
                    Configure Buy
                  </span>
                )}
              </button>
            )}
          </div>
        </Card>
      )}

      {/* ================================================================= */}
      {/* C) ACTIVE SWAPS                                                   */}
      {/* ================================================================= */}

      {activeTab === 'active' && (
        <Card
          title="Active Swaps"
          subtitle={`${filteredSwaps.length} of ${swaps.length} swaps shown`}
          gradientBorder
          action={
            <div className="flex items-center gap-2">
              {/* Status filter */}
              <select
                value={statusFilter === 'all' ? 'all' : statusFilter}
                onChange={(e) => {
                  const val = e.target.value;
                  setStatusFilter(
                    val === 'all' ? 'all' : Number(val),
                  );
                }}
                className="bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-indigo-500"
              >
                <option value="all">All Status</option>
                {Object.entries(SWAP_STATUS_LABELS).map(
                  ([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ),
                )}
              </select>

              <button
                type="button"
                onClick={loadSwaps}
                disabled={swapsLoading}
                className="p-2 rounded-lg hover:bg-white/[0.05] text-gray-500 hover:text-gray-300 transition-colors"
                title="Refresh swaps"
              >
                <RefreshCw
                  className={clsx(
                    'h-4 w-4',
                    swapsLoading && 'animate-spin',
                  )}
                />
              </button>
            </div>
          }
        >
          {swapsLoading ? (
            <div className="flex justify-center py-10">
              <Spinner label="Loading swaps..." />
            </div>
          ) : filteredSwaps.length === 0 ? (
            <EmptyState
              icon={<ArrowRightLeft />}
              title="No Swaps Found"
              description={
                statusFilter === 'all'
                  ? 'No OTC swaps have been configured yet. Use the Sell or Buy tabs to create one.'
                  : `No swaps with status "${SWAP_STATUS_LABELS[statusFilter as number] ?? 'Unknown'}".`
              }
            />
          ) : (
            <div className="space-y-3">
              {filteredSwaps.map((swap) => {
                const isQuoteTokenSender =
                  connectedAddress &&
                  swap.quoteTokenSender.toLowerCase() ===
                    connectedAddress.toLowerCase();
                const isRestrictedTokenSender =
                  connectedAddress &&
                  swap.restrictedTokenSender.toLowerCase() ===
                    connectedAddress.toLowerCase();

                const canCompleteWithPayment =
                  swap.status === SWAP_STATUS.SellConfigured &&
                  isQuoteTokenSender;
                const canCompleteWithRestricted =
                  swap.status === SWAP_STATUS.BuyConfigured &&
                  isRestrictedTokenSender;
                const canCancel =
                  (swap.status === SWAP_STATUS.SellConfigured &&
                    isRestrictedTokenSender) ||
                  (swap.status === SWAP_STATUS.BuyConfigured &&
                    isQuoteTokenSender);

                return (
                  <div
                    key={swap.id}
                    className="rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.08] p-5 transition-colors"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-mono text-indigo-400">
                          Swap #{swap.id}
                        </span>
                        <Badge
                          variant={statusToBadgeVariant(swap.status)}
                          size="sm"
                          dot={
                            swap.status ===
                              SWAP_STATUS.SellConfigured ||
                            swap.status ===
                              SWAP_STATUS.BuyConfigured
                          }
                        >
                          {SWAP_STATUS_LABELS[swap.status] ??
                            'Unknown'}
                        </Badge>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2">
                        {canCompleteWithPayment && (
                          <button
                            type="button"
                            onClick={() =>
                              handleCompleteWithPayment(swap)
                            }
                            disabled={completingSwap !== null}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                          >
                            {completingSwap === swap.id ? (
                              approvingSwap === swap.id ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  Approving...
                                </>
                              ) : (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  Completing...
                                </>
                              )
                            ) : (
                              <>
                                <Check className="h-3.5 w-3.5" />
                                Complete with Payment
                              </>
                            )}
                          </button>
                        )}

                        {canCompleteWithRestricted && (
                          <button
                            type="button"
                            onClick={() =>
                              handleCompleteWithRestricted(swap)
                            }
                            disabled={completingSwap !== null}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                          >
                            {completingSwap === swap.id ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Completing...
                              </>
                            ) : (
                              <>
                                <Check className="h-3.5 w-3.5" />
                                Complete with {tokenSymbol}
                              </>
                            )}
                          </button>
                        )}

                        {canCancel && (
                          <button
                            type="button"
                            onClick={() =>
                              handleCancelSwap(swap.id)
                            }
                            disabled={cancelingSwap !== null}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                          >
                            {cancelingSwap === swap.id ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Canceling...
                              </>
                            ) : (
                              <>
                                <Ban className="h-3.5 w-3.5" />
                                Cancel
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Swap details */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Restricted token side */}
                      <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-3">
                        <p className="text-[10px] text-gray-600 mb-2">
                          Restricted Token
                        </p>
                        <p className="text-sm font-semibold font-mono text-white mb-1">
                          {formatBalance(
                            swap.restrictedTokenAmount,
                            tokenDecimals,
                            6,
                          )}{' '}
                          {tokenSymbol}
                        </p>
                        <p className="text-[10px] text-gray-600">
                          Sender:{' '}
                          <span
                            className={clsx(
                              'font-mono',
                              isRestrictedTokenSender
                                ? 'text-indigo-400'
                                : 'text-gray-500',
                            )}
                          >
                            {formatAddress(
                              swap.restrictedTokenSender,
                            )}
                            {isRestrictedTokenSender && ' (you)'}
                          </span>
                        </p>
                      </div>

                      {/* Quote token side */}
                      <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-3">
                        <p className="text-[10px] text-gray-600 mb-2">
                          Quote Token
                        </p>
                        <p className="text-sm font-semibold font-mono text-white mb-1">
                          {formatBalance(
                            swap.quoteTokenAmount,
                            swap.quoteTokenDecimals,
                            6,
                          )}{' '}
                          {swap.quoteTokenSymbol}
                        </p>
                        <p className="text-[10px] text-gray-600">
                          Sender:{' '}
                          <span
                            className={clsx(
                              'font-mono',
                              isQuoteTokenSender
                                ? 'text-indigo-400'
                                : 'text-gray-500',
                            )}
                          >
                            {formatAddress(swap.quoteTokenSender)}
                            {isQuoteTokenSender && ' (you)'}
                          </span>
                        </p>
                        <p className="text-[10px] text-gray-600 mt-0.5">
                          Token:{' '}
                          <span className="font-mono text-gray-500">
                            {formatAddress(swap.quoteToken)}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* ================================================================= */}
      {/* E) SWAP HISTORY                                                   */}
      {/* ================================================================= */}

      {activeTab === 'history' && (
        <Card
          title="Swap History"
          subtitle="Recent swap events from the blockchain"
          gradientBorder
          action={
            <button
              type="button"
              onClick={loadHistory}
              disabled={historyLoading}
              className="p-2 rounded-lg hover:bg-white/[0.05] text-gray-500 hover:text-gray-300 transition-colors"
              title="Refresh history"
            >
              <RefreshCw
                className={clsx(
                  'h-4 w-4',
                  historyLoading && 'animate-spin',
                )}
              />
            </button>
          }
        >
          {historyLoading ? (
            <div className="flex justify-center py-10">
              <Spinner label="Loading swap history..." />
            </div>
          ) : swapEvents.length === 0 ? (
            <EmptyState
              icon={<History />}
              title="No Swap History"
              description="No swap events found in recent blocks."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-left text-xs text-gray-500">
                    <th className="pb-3 pr-4">Event</th>
                    <th className="pb-3 pr-4">Swap #</th>
                    <th className="pb-3 pr-4">Restricted Sender</th>
                    <th className="pb-3 pr-4">Amount</th>
                    <th className="pb-3 pr-4">Quote Sender</th>
                    <th className="pb-3 pr-4">Time</th>
                    <th className="pb-3">Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {swapEvents.map((event, i) => (
                    <tr
                      key={`${event.txHash}-${i}`}
                      className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="py-3 pr-4">
                        <Badge
                          variant={
                            event.type === 'configured'
                              ? 'info'
                              : event.type === 'complete'
                                ? 'success'
                                : 'danger'
                          }
                          size="sm"
                        >
                          {event.type === 'configured'
                            ? 'Configured'
                            : event.type === 'complete'
                              ? 'Complete'
                              : 'Canceled'}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 font-mono text-indigo-400">
                        #{event.swapNumber.toString()}
                      </td>
                      <td className="py-3 pr-4 font-mono text-gray-400 text-xs">
                        {formatAddress(event.restrictedTokenSender)}
                      </td>
                      <td className="py-3 pr-4 font-mono text-white text-xs">
                        {event.restrictedTokenAmount > 0n
                          ? formatBalance(
                              event.restrictedTokenAmount,
                              tokenDecimals,
                              4,
                            )
                          : '--'}
                      </td>
                      <td className="py-3 pr-4 font-mono text-gray-400 text-xs">
                        {event.quoteTokenSender
                          ? formatAddress(event.quoteTokenSender)
                          : '--'}
                      </td>
                      <td className="py-3 pr-4 text-gray-500 text-xs whitespace-nowrap">
                        {formatTimestamp(event.timestamp)}
                      </td>
                      <td className="py-3">
                        <a
                          href={getExplorerTxUrl(useWalletStore.getState().wallet.chainId ?? 1, event.txHash) || `#tx-${event.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={event.txHash}
                          className="text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
