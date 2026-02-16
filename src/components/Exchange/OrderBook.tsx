/**
 * OrderBook -- professional DEX-style order book display.
 *
 * Sell orders (asks) are shown in red on top, buy orders (bids) in green on
 * bottom. Each row displays price, amount, and total with colored depth bars
 * showing relative size. Rows are clickable to fill orders. A spread
 * indicator sits between asks and bids.
 *
 * Refreshes automatically on an interval.
 *
 * FIXES vs prior version:
 * - Uses AssetBackedExchange methods (getExchangeActiveOrders, fillExchangeOrder,
 *   fillExchangeOrderWithETH) instead of AssetExchange methods
 * - Handles ETH sentinel address -- fills with msg.value when tokenBuy is ETH
 * - Approval targets AssetBackedExchange via approveAssetBackedExchange
 * - Shows "(ETH)" label for orders involving native ETH
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  Loader2,
  ExternalLink,
  AlertCircle,
  BookOpen,
} from 'lucide-react';
import { InfoTooltip } from '../Common/Tooltip';
import { TOOLTIPS } from '../../lib/tooltipContent';
import { ContractService, isETH, type Order } from '../../lib/blockchain/contracts';
import { getNetworkConfig } from '../../contracts/addresses';
import { formatAddress } from '../../lib/utils/helpers';
import { formatPrice, formatTokenAmount, formatPercent } from '../../lib/formatters';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL_MS = 15_000;
const SKELETON_ROWS = 8;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** An order is "open" when it has not been cancelled and still has unfilled capacity. */
function isOrderOpen(order: Order): boolean {
  return !order.cancelled && order.filledBuy < order.amountBuy;
}

/** Remaining buy-side amount that can still be filled. */
function remainingBuy(order: Order): bigint {
  return order.amountBuy - order.filledBuy;
}

/** Remaining sell-side amount proportional to the remaining buy side. */
function remainingSell(order: Order): bigint {
  if (order.amountBuy === 0n) return 0n;
  const remaining = order.amountSell - order.filledSell;
  return remaining;
}

/** Format a token address -- show "ETH" for the sentinel address. */
function formatTokenLabel(address: string): string {
  if (isETH(address)) return 'ETH';
  return formatAddress(address);
}

/** Compute price and formatted values for an order row. */
function computeRowData(order: Order, side: 'sell' | 'buy') {
  let priceDisplay: number;
  let amount: number;
  let total: number;

  if (side === 'sell') {
    const denominator = Number(ethers.formatUnits(order.amountBuy, 18));
    priceDisplay =
      denominator === 0
        ? 0
        : Number(ethers.formatUnits(order.amountSell, 18)) / denominator;
    amount = Number(ethers.formatUnits(remainingSell(order), 18));
    total = Number(ethers.formatUnits(remainingBuy(order), 18));
  } else {
    const denominator = Number(ethers.formatUnits(order.amountSell, 18));
    priceDisplay =
      denominator === 0
        ? 0
        : Number(ethers.formatUnits(order.amountBuy, 18)) / denominator;
    amount = Number(ethers.formatUnits(remainingBuy(order), 18));
    total = Number(ethers.formatUnits(remainingSell(order), 18));
  }

  return { priceDisplay, amount, total };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface OrderBookProps {
  tokenSell: string;
  tokenBuy: string;
  contractService: ContractService | null;
  onOrderFilled: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OrderBook({
  tokenSell,
  tokenBuy,
  contractService,
  onOrderFilled,
}: OrderBookProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [fillingId, setFillingId] = useState<bigint | null>(null);
  const [fillTxHash, setFillTxHash] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- Derived state ------------------------------------------------------

  const networkConfig = useMemo(
    () => (chainId ? getNetworkConfig(chainId) ?? null : null),
    [chainId],
  );

  const explorerTxUrl = useMemo(() => {
    if (!fillTxHash || !networkConfig?.blockExplorer) return null;
    return `${networkConfig.blockExplorer}/tx/${fillTxHash}`;
  }, [fillTxHash, networkConfig]);

  /**
   * Separate open orders into two sides:
   * - "sell" orders: maker is selling tokenSell for tokenBuy (asks)
   * - "buy" orders: maker is selling tokenBuy for tokenSell (bids)
   */
  const { sellOrders, buyOrders } = useMemo(() => {
    const open = orders.filter(isOrderOpen);

    const sell = open.filter(
      (o) =>
        o.tokenSell.toLowerCase() === tokenSell.toLowerCase() &&
        o.tokenBuy.toLowerCase() === tokenBuy.toLowerCase(),
    );

    const buy = open.filter(
      (o) =>
        o.tokenSell.toLowerCase() === tokenBuy.toLowerCase() &&
        o.tokenBuy.toLowerCase() === tokenSell.toLowerCase(),
    );

    // Sort sells ascending by price (cheapest first)
    sell.sort((a, b) => {
      const divA = Number(ethers.formatUnits(a.amountBuy, 18));
      const divB = Number(ethers.formatUnits(b.amountBuy, 18));
      const priceA =
        divA === 0
          ? Infinity
          : Number(ethers.formatUnits(a.amountSell, 18)) / divA;
      const priceB =
        divB === 0
          ? Infinity
          : Number(ethers.formatUnits(b.amountSell, 18)) / divB;
      return priceA - priceB;
    });

    // Sort buys descending by price (highest bid first)
    buy.sort((a, b) => {
      const divA = Number(ethers.formatUnits(a.amountSell, 18));
      const divB = Number(ethers.formatUnits(b.amountSell, 18));
      const priceA =
        divA === 0
          ? 0
          : Number(ethers.formatUnits(a.amountBuy, 18)) / divA;
      const priceB =
        divB === 0
          ? 0
          : Number(ethers.formatUnits(b.amountBuy, 18)) / divB;
      return priceB - priceA;
    });

    return { sellOrders: sell, buyOrders: buy };
  }, [orders, tokenSell, tokenBuy]);

  // Compute max total for depth bar sizing
  const maxSellTotal = useMemo(
    () =>
      sellOrders.reduce((max, o) => {
        const { total } = computeRowData(o, 'sell');
        return Math.max(max, total);
      }, 0),
    [sellOrders],
  );

  const maxBuyTotal = useMemo(
    () =>
      buyOrders.reduce((max, o) => {
        const { total } = computeRowData(o, 'buy');
        return Math.max(max, total);
      }, 0),
    [buyOrders],
  );

  // Spread calculation
  const spread = useMemo(() => {
    if (sellOrders.length === 0 || buyOrders.length === 0) return null;
    const lowestAsk = computeRowData(sellOrders[0], 'sell').priceDisplay;
    const highestBid = computeRowData(buyOrders[0], 'buy').priceDisplay;
    const spreadValue = lowestAsk - highestBid;
    const spreadPct =
      highestBid > 0 ? (spreadValue / highestBid) * 100 : 0;
    return { value: spreadValue, percent: spreadPct };
  }, [sellOrders, buyOrders]);

  // ---- Fetch orders -------------------------------------------------------

  const fetchOrders = useCallback(async () => {
    if (!contractService || !tokenSell || !tokenBuy) {
      setOrders([]);
      return;
    }

    try {
      setLoading(true);

      // Fetch both directions of the pair from AssetBackedExchange
      const [sellSide, buySide] = await Promise.all([
        contractService.getExchangeActiveOrders(tokenSell, tokenBuy).catch(() => []),
        contractService.getExchangeActiveOrders(tokenBuy, tokenSell).catch(() => []),
      ]);

      setOrders([...sellSide, ...buySide]);
    } catch (err) {
      console.error('Failed to fetch order book:', err);
      toast.error('Failed to load order book');
    } finally {
      setLoading(false);
    }
  }, [contractService, tokenSell, tokenBuy]);

  // ---- Resolve chainId ----------------------------------------------------

  useEffect(() => {
    async function resolveChain() {
      if (!contractService) return;
      try {
        const signer = await contractService.getSigner();
        const provider = signer.provider;
        if (provider) {
          const network = await provider.getNetwork();
          setChainId(Number(network.chainId));
        }
      } catch (error) {
        console.error('Failed to resolve chain:', error);
        toast.error('Failed to detect network');
      }
    }
    void resolveChain();
  }, [contractService]);

  // ---- Periodic refresh ---------------------------------------------------

  useEffect(() => {
    void fetchOrders();

    intervalRef.current = setInterval(() => {
      void fetchOrders();
    }, REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchOrders]);

  // ---- Fill order handler -------------------------------------------------

  const handleFillOrder = useCallback(
    async (order: Order) => {
      if (!contractService) return;
      // Prevent double-click while a fill is already in flight
      if (fillingId !== null) return;

      // Prevent filling your own order (the contract would revert, but give a
      // clear error message before spending gas on the approval tx).
      try {
        const signer = await contractService.getSigner();
        const userAddr = await signer.getAddress();
        if (userAddr.toLowerCase() === order.maker.toLowerCase()) {
          toast.error('You cannot fill your own order');
          return;
        }
      } catch {
        // If we cannot resolve the signer, let the tx itself fail with a
        // proper revert message rather than blocking here.
      }

      setFillingId(order.id);
      setFillTxHash(null);

      try {
        // Compute the remaining unfilled buy-side amount.
        const fillAmountBuy = remainingBuy(order);
        if (fillAmountBuy <= 0n) {
          toast.error('This order is already fully filled');
          return;
        }

        // Determine if the filler needs to provide ETH or ERC-20.
        const fillTokenAddress = order.tokenBuy;
        const fillWithETH = isETH(fillTokenAddress);

        if (fillWithETH) {
          // Fill with native ETH -- no approval needed, send msg.value
          toast.loading('Filling order with ETH...', { id: 'fill-order' });
          const fillTx = await contractService.fillExchangeOrderWithETH(
            order.id,
            fillAmountBuy,
          );
          setFillTxHash(fillTx.hash);
          await contractService.waitForTransaction(fillTx);
        } else {
          // ERC-20 fill: approve then fill
          toast.loading('Approving token for fill...', { id: 'fill-approve' });
          const approveTx = await contractService.approveAssetBackedExchange(
            fillTokenAddress,
            fillAmountBuy,
          );
          await contractService.waitForTransaction(approveTx);
          toast.success('Token approved', { id: 'fill-approve' });

          toast.loading('Filling order...', { id: 'fill-order' });
          const fillTx = await contractService.fillExchangeOrder(
            order.id,
            fillAmountBuy,
          );
          setFillTxHash(fillTx.hash);
          await contractService.waitForTransaction(fillTx);
        }

        toast.success('Order filled successfully!', { id: 'fill-order' });

        // Refresh
        onOrderFilled();
        void fetchOrders();
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Failed to fill order';
        console.error('Fill order failed:', err);
        toast.error(message, { id: 'fill-order' });
        toast.dismiss('fill-approve');
      } finally {
        setFillingId(null);
      }
    },
    [contractService, fillingId, onOrderFilled, fetchOrders],
  );

  // ---- Render helpers -----------------------------------------------------

  function renderSkeletonRow(index: number) {
    return (
      <div
        key={`skeleton-${index}`}
        className="grid grid-cols-3 gap-3 sm:gap-6 px-3 sm:px-5 py-3"
      >
        <div className="h-4 animate-pulse rounded-md bg-white/[0.04]" />
        <div className="h-4 animate-pulse rounded-md bg-white/[0.04]" />
        <div className="h-4 animate-pulse rounded-md bg-white/[0.04]" />
      </div>
    );
  }

  function renderOrderRow(
    order: Order,
    side: 'sell' | 'buy',
    maxTotal: number,
  ) {
    const isFilling = fillingId === order.id;
    const { priceDisplay, amount, total } = computeRowData(order, side);
    const depthPercent = maxTotal > 0 ? (total / maxTotal) * 100 : 0;

    return (
      <div
        key={order.id.toString()}
        role="button"
        tabIndex={0}
        onClick={() => !isFilling && handleFillOrder(order)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !isFilling) handleFillOrder(order);
        }}
        className={clsx(
          'group relative grid cursor-pointer grid-cols-3 gap-3 sm:gap-6 px-3 sm:px-5 py-3 transition-all duration-150',
          'hover:bg-white/[0.04]',
          'min-h-[44px] items-center',
          isFilling && 'pointer-events-none opacity-50',
        )}
      >
        {/* Depth bar background */}
        <div
          className={clsx(
            'pointer-events-none absolute inset-y-0 right-0 transition-all duration-300',
            side === 'sell' ? 'bg-red-500/[0.06]' : 'bg-emerald-500/[0.06]',
          )}
          style={{ width: `${Math.min(depthPercent, 100)}%` }}
        />

        {/* Price */}
        <span
          className={clsx(
            'relative z-10 text-right font-mono text-[11px] sm:text-[13px] font-medium tabular-nums',
            side === 'sell' ? 'text-red-400' : 'text-emerald-400',
          )}
        >
          {formatPrice(priceDisplay)}
        </span>

        {/* Amount */}
        <span className="relative z-10 text-right font-mono text-[11px] sm:text-[13px] tabular-nums text-gray-300">
          {formatTokenAmount(amount)}
        </span>

        {/* Total */}
        <span className="relative z-10 text-right font-mono text-[11px] sm:text-[13px] tabular-nums text-gray-500">
          {formatTokenAmount(total)}
        </span>

        {/* Fill indicator on hover */}
        {isFilling && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0D0F14]/60 backdrop-blur-sm">
            <Loader2 className="h-4 w-4 animate-spin text-white" />
          </div>
        )}
      </div>
    );
  }

  // ---- Main render --------------------------------------------------------

  if (!tokenSell || !tokenBuy) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/[0.06]">
          <BookOpen className="h-6 w-6 text-gray-600" />
        </div>
        <p className="text-sm font-medium text-gray-400">
          Select both tokens to view the order book
        </p>
        <p className="mt-2 text-xs text-gray-600">
          Choose a trading pair from the form above
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Pair header with ETH awareness */}
      <div className="mb-4 flex items-center gap-2.5 px-5 text-xs text-gray-500">
        <span className="font-mono font-semibold text-gray-300">
          {formatTokenLabel(tokenSell)}
        </span>
        <span className="text-gray-600">/</span>
        <span className="font-mono font-semibold text-gray-300">
          {formatTokenLabel(tokenBuy)}
        </span>
        <InfoTooltip content={TOOLTIPS.orderBook} />
        {loading && orders.length > 0 && (
          <Loader2 className="ml-auto h-3 w-3 animate-spin text-gray-600" />
        )}
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-3 gap-3 sm:gap-6 border-b border-white/[0.06] px-3 sm:px-5 py-3">
        <span className="text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Price
        </span>
        <span className="text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Amount
        </span>
        <span className="text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Total
        </span>
      </div>

      {/* Loading skeleton */}
      {loading && orders.length === 0 && (
        <div className="py-1">
          {Array.from({ length: SKELETON_ROWS }).map((_, i) =>
            renderSkeletonRow(i),
          )}
        </div>
      )}

      {/* Empty state */}
      {!loading && sellOrders.length === 0 && buyOrders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/[0.06]">
            <AlertCircle className="h-5 w-5 text-gray-600" />
          </div>
          <p className="text-sm font-medium text-gray-400">
            No orders for this pair
          </p>
          <p className="mt-2 text-xs text-gray-600">
            Be the first to create an order.
          </p>
        </div>
      )}

      {/* Asks (sell orders) -- shown in reverse so lowest ask is at bottom */}
      {(sellOrders.length > 0 || buyOrders.length > 0) && (
        <>
          {/* Asks section label */}
          <div className="flex items-center gap-2.5 px-5 pt-4 pb-2">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-red-400/70">
              Asks
            </span>
            <span className="text-[10px] text-gray-600">
              ({sellOrders.length})
            </span>
          </div>

          <div className="flex flex-col-reverse">
            {sellOrders.length === 0 ? (
              <div className="px-5 py-5 text-center text-xs text-gray-600">
                No sell orders
              </div>
            ) : (
              sellOrders.map((o) => renderOrderRow(o, 'sell', maxSellTotal))
            )}
          </div>

          {/* Spread indicator */}
          <div className="my-1 flex items-center justify-center gap-4 border-y border-white/[0.06] px-5 py-4">
            {spread ? (
              <>
                <span className="font-mono text-sm font-semibold text-white">
                  {formatPrice(spread.value)}
                </span>
                <span className="rounded-md bg-white/[0.06] px-2 py-1 font-mono text-[11px] text-gray-400 border border-white/[0.04]">
                  {formatPercent(spread.percent)}
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-gray-600">
                  Spread
                </span>
              </>
            ) : (
              <span className="text-xs text-gray-600">--</span>
            )}
          </div>

          {/* Bids section label */}
          <div className="flex items-center gap-2.5 px-5 pt-2 pb-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400/70">
              Bids
            </span>
            <span className="text-[10px] text-gray-600">
              ({buyOrders.length})
            </span>
          </div>

          {/* Bids (buy orders) */}
          <div>
            {buyOrders.length === 0 ? (
              <div className="px-5 py-5 text-center text-xs text-gray-600">
                No buy orders
              </div>
            ) : (
              buyOrders.map((o) => renderOrderRow(o, 'buy', maxBuyTotal))
            )}
          </div>
        </>
      )}

      {/* Fill transaction link */}
      {fillTxHash && (
        <div className="flex items-center justify-center gap-2.5 border-t border-white/[0.06] px-5 py-4 text-xs text-gray-500">
          <span className="font-mono">{formatAddress(fillTxHash)}</span>
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
