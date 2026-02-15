/**
 * UserOrders -- professional DEX-style order management panel.
 *
 * Displays the connected user's active and historical orders with tabs for
 * filtering. Each order shows pair info, side badge, amounts, fill progress
 * bar, status badge, and cancel button for active orders.
 *
 * NOTE: The on-chain Order struct does NOT have a `status` enum, `createdAt`,
 * `filledAt`, or `filledBy` field. Status is derived from `cancelled` and
 * the relationship between `filledBuy` and `amountBuy`.
 *
 * FIXES vs prior version:
 * - Uses AssetBackedExchange methods (getExchangeUserOrders, getExchangeOrder,
 *   cancelExchangeOrder) instead of AssetExchange methods
 * - Displays "ETH" label for orders involving native ETH sentinel address
 * - Shows ETH withdrawal prompt when cancelled sell-ETH orders exist
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  Loader2,
  ExternalLink,
  X,
  Clock,
  AlertCircle,
  ArrowRight,
  Download,
} from 'lucide-react';
import { ContractService, isETH, type Order } from '../../lib/blockchain/contracts';
import { getNetworkConfig } from '../../contracts/addresses';
import { formatAddress } from '../../lib/utils/helpers';
import Badge from '../Common/Badge';

// ---------------------------------------------------------------------------
// Helpers -- derive display status from on-chain Order fields
// ---------------------------------------------------------------------------

type DerivedStatus = 'open' | 'filled' | 'cancelled';
type TabFilter = 'all' | 'open' | 'filled' | 'cancelled';

function deriveOrderStatus(order: Order): DerivedStatus {
  if (order.cancelled) return 'cancelled';
  if (order.filledBuy >= order.amountBuy) return 'filled';
  return 'open';
}

function isOrderOpenDerived(order: Order): boolean {
  return deriveOrderStatus(order) === 'open';
}

/** Percentage of the order that has been filled (0-100). */
function fillPercentage(order: Order): number {
  if (order.amountBuy === 0n) return 0;
  return Number((order.filledBuy * 100n) / order.amountBuy);
}

/** Format a token address -- show "ETH" for the sentinel address. */
function formatTokenLabel(address: string): string {
  if (isETH(address)) return 'ETH';
  return formatAddress(address);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL_MS = 15_000;

const TABS: { label: string; value: TabFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Open', value: 'open' },
  { label: 'Filled', value: 'filled' },
  { label: 'Cancelled', value: 'cancelled' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface UserOrdersProps {
  contractService: ContractService | null;
  userAddress: string;
  onOrderCancelled: () => void;
}

/** Check if the connected user is the maker of this order. */
function isMaker(order: Order, userAddress: string): boolean {
  return order.maker.toLowerCase() === userAddress.toLowerCase();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function UserOrders({
  contractService,
  userAddress,
  onOrderCancelled,
}: UserOrdersProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<bigint | null>(null);
  const [cancelTxHash, setCancelTxHash] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [ethWithdrawable, setEthWithdrawable] = useState<bigint>(0n);
  const [withdrawing, setWithdrawing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- Derived ------------------------------------------------------------

  const networkConfig = useMemo(
    () => (chainId ? getNetworkConfig(chainId) ?? null : null),
    [chainId],
  );

  const explorerTxUrl = useMemo(() => {
    if (!cancelTxHash || !networkConfig?.blockExplorer) return null;
    return `${networkConfig.blockExplorer}/tx/${cancelTxHash}`;
  }, [cancelTxHash, networkConfig]);

  const filteredOrders = useMemo(() => {
    if (activeTab === 'all') return orders;
    return orders.filter((o) => deriveOrderStatus(o) === activeTab);
  }, [orders, activeTab]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const counts = { all: orders.length, open: 0, filled: 0, cancelled: 0 };
    for (const o of orders) {
      const s = deriveOrderStatus(o);
      counts[s]++;
    }
    return counts;
  }, [orders]);

  // ---- Fetch user orders --------------------------------------------------

  const fetchUserOrders = useCallback(async () => {
    if (!contractService || !userAddress) {
      setOrders([]);
      return;
    }

    try {
      setLoading(true);

      // Get order IDs where user is the maker AND where user is a taker.
      // The filled-order query scans historical events and may fail on public
      // RPCs with log-range limits, so treat it as non-critical.
      const [makerIds, takerIds] = await Promise.all([
        contractService.getExchangeUserOrders(userAddress),
        contractService.getExchangeFilledOrderIds(userAddress).catch(() => [] as bigint[]),
      ]);

      // Merge and deduplicate order IDs
      const seen = new Set<string>();
      const allIds: bigint[] = [];
      for (const id of [...makerIds, ...takerIds]) {
        const key = id.toString();
        if (!seen.has(key)) {
          seen.add(key);
          allIds.push(id);
        }
      }

      if (allIds.length === 0) {
        setOrders([]);
        return;
      }

      // Fetch full details for each order from AssetBackedExchange
      const orderDetails = await Promise.all(
        allIds.map((id) =>
          contractService.getExchangeOrder(id).catch(() => null),
        ),
      );

      const validOrders = orderDetails.filter(
        (o): o is Order => o !== null,
      );

      // Sort by order ID descending (most recent first, since IDs are
      // monotonically increasing).
      validOrders.sort((a, b) => {
        if (b.id > a.id) return 1;
        if (b.id < a.id) return -1;
        return 0;
      });

      setOrders(validOrders);

      // Also check if user has withdrawable ETH from cancelled sell-ETH orders
      try {
        const ethBal = await contractService.getExchangeEthBalance(userAddress);
        setEthWithdrawable(ethBal);
      } catch {
        // Non-critical
      }
    } catch (err) {
      console.error('Failed to fetch user orders:', err);
      toast.error('Failed to load your orders');
    } finally {
      setLoading(false);
    }
  }, [contractService, userAddress]);

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
      } catch {
        // ignore
      }
    }
    void resolveChain();
  }, [contractService]);

  // ---- Periodic refresh ---------------------------------------------------

  useEffect(() => {
    void fetchUserOrders();

    intervalRef.current = setInterval(() => {
      void fetchUserOrders();
    }, REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchUserOrders]);

  // ---- Cancel order handler -----------------------------------------------

  const handleCancelOrder = useCallback(
    async (orderId: bigint) => {
      if (!contractService) return;
      // Prevent double-click while a cancellation is in flight
      if (cancellingId !== null) return;

      setCancellingId(orderId);
      setCancelTxHash(null);

      try {
        toast.loading('Cancelling order...', { id: 'cancel-order' });
        // Use AssetBackedExchange cancel
        const tx = await contractService.cancelExchangeOrder(orderId);
        setCancelTxHash(tx.hash);

        await contractService.waitForTransaction(tx);
        toast.success('Order cancelled', { id: 'cancel-order' });

        onOrderCancelled();
        void fetchUserOrders();
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Failed to cancel order';
        console.error('Cancel order failed:', err);
        toast.error(message, { id: 'cancel-order' });
      } finally {
        setCancellingId(null);
      }
    },
    [contractService, cancellingId, onOrderCancelled, fetchUserOrders],
  );

  // ---- Withdraw ETH handler -----------------------------------------------

  const handleWithdrawETH = useCallback(async () => {
    if (!contractService || ethWithdrawable === 0n || withdrawing) return;
    setWithdrawing(true);
    try {
      toast.loading('Withdrawing ETH...', { id: 'withdraw-eth' });
      const tx = await contractService.withdrawExchangeEth();
      await contractService.waitForTransaction(tx);
      toast.success('ETH withdrawn successfully', { id: 'withdraw-eth' });
      setEthWithdrawable(0n);
      void fetchUserOrders();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to withdraw ETH';
      console.error('ETH withdrawal failed:', err);
      toast.error(message, { id: 'withdraw-eth' });
    } finally {
      setWithdrawing(false);
    }
  }, [contractService, ethWithdrawable, withdrawing, fetchUserOrders]);

  // ---- Status helpers -----------------------------------------------------

  function renderStatusBadge(order: Order) {
    const status = deriveOrderStatus(order);
    const pct = fillPercentage(order);

    switch (status) {
      case 'open':
        return (
          <Badge variant="info" size="sm" dot>
            {pct > 0 ? `Open (${pct}% filled)` : 'Open'}
          </Badge>
        );
      case 'filled':
        return (
          <Badge variant="success" size="sm" dot>
            Filled
          </Badge>
        );
      case 'cancelled':
        return (
          <Badge variant="danger" size="sm" dot>
            Cancelled
          </Badge>
        );
      default:
        return (
          <Badge variant="default" size="sm">
            Unknown
          </Badge>
        );
    }
  }

  // ---- Main render --------------------------------------------------------

  if (!userAddress) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/[0.06]">
          <AlertCircle className="h-6 w-6 text-gray-600" />
        </div>
        <p className="text-sm font-medium text-gray-400">
          Connect your wallet to view orders
        </p>
        <p className="mt-2 text-xs text-gray-600">
          Your active and historical orders will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* ---- ETH withdrawal banner ----------------------------------------- */}
      {ethWithdrawable > 0n && (
        <div className="mb-5 flex items-center justify-between rounded-xl border border-blue-500/20 bg-blue-500/5 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Download className="h-4 w-4 text-blue-400" />
            <span className="text-sm text-blue-300">
              {Number(ethers.formatUnits(ethWithdrawable, 18)).toFixed(6)} ETH available to withdraw
            </span>
          </div>
          <button
            type="button"
            onClick={handleWithdrawETH}
            disabled={withdrawing}
            className={clsx(
              'rounded-lg px-4 py-2 text-xs font-semibold transition-all',
              withdrawing
                ? 'cursor-not-allowed opacity-50 text-blue-400'
                : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30',
            )}
          >
            {withdrawing ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Withdrawing...
              </span>
            ) : (
              'Withdraw'
            )}
          </button>
        </div>
      )}

      {/* ---- Filter tabs --------------------------------------------------- */}
      <div className="mb-6 flex gap-1 border-b border-white/[0.06] px-1 pb-0">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className={clsx(
              'relative px-4 py-3 text-xs font-medium transition-colors',
              activeTab === tab.value
                ? 'text-white'
                : 'text-gray-500 hover:text-gray-300',
            )}
          >
            {tab.label}
            {tabCounts[tab.value] > 0 && (
              <span
                className={clsx(
                  'ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold',
                  activeTab === tab.value
                    ? 'bg-white/[0.1] text-white'
                    : 'bg-white/[0.04] text-gray-500',
                )}
              >
                {tabCounts[tab.value]}
              </span>
            )}
            {/* Active indicator line */}
            {activeTab === tab.value && (
              <span className="absolute bottom-0 left-1 right-1 h-[2px] rounded-full bg-white" />
            )}
          </button>
        ))}
      </div>

      {/* ---- Loading state ------------------------------------------------- */}
      {loading && orders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-full max-w-md space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 rounded-xl bg-white/[0.02] border border-white/[0.04] px-5 py-4"
              >
                <div className="h-9 w-9 animate-pulse rounded-full bg-white/[0.04]" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-28 animate-pulse rounded bg-white/[0.04]" />
                  <div className="h-3 w-36 animate-pulse rounded bg-white/[0.04]" />
                </div>
                <div className="h-6 w-16 animate-pulse rounded-full bg-white/[0.04]" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- Empty state --------------------------------------------------- */}
      {!loading && filteredOrders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/[0.06]">
            <Clock className="h-5 w-5 text-gray-600" />
          </div>
          <p className="text-sm font-medium text-gray-400">
            {orders.length === 0
              ? 'No orders yet'
              : `No ${activeTab} orders`}
          </p>
          {orders.length === 0 && (
            <p className="mt-2 text-xs text-gray-600">
              Create your first order using the trade form.
            </p>
          )}
        </div>
      )}

      {/* ---- Order list ---------------------------------------------------- */}
      <div className="space-y-3">
        {filteredOrders.map((order) => {
          const isCancelling = cancellingId === order.id;
          const open = isOrderOpenDerived(order);
          const status = deriveOrderStatus(order);
          const pct = fillPercentage(order);
          const maker = isMaker(order, userAddress);
          const sellFormatted = Number(
            ethers.formatUnits(order.amountSell, 18),
          ).toFixed(4);
          const buyFormatted = Number(
            ethers.formatUnits(order.amountBuy, 18),
          ).toFixed(4);

          return (
            <div
              key={order.id.toString()}
              className={clsx(
                'group rounded-xl border border-white/[0.06] bg-[#0D0F14]/60 p-5 transition-all',
                open
                  ? 'hover:border-white/[0.1] hover:bg-[#0D0F14]/80'
                  : 'opacity-60 hover:opacity-80',
              )}
            >
              {/* Row 1: Pair + Status + ID */}
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Order ID */}
                  <span className="font-mono text-[11px] text-gray-600">
                    #{order.id.toString()}
                  </span>

                  {/* Role badge */}
                  <span
                    className={clsx(
                      'rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                      maker
                        ? 'bg-red-500/10 text-red-400'
                        : 'bg-indigo-500/10 text-indigo-400',
                    )}
                  >
                    {maker ? 'Maker' : 'Taker'}
                  </span>

                  {/* Pair: tokenSell -> tokenBuy (with ETH awareness) */}
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-mono font-medium text-gray-300">
                      {formatTokenLabel(order.tokenSell)}
                    </span>
                    <ArrowRight className="h-3 w-3 text-gray-600" />
                    <span className="font-mono font-medium text-gray-300">
                      {formatTokenLabel(order.tokenBuy)}
                    </span>
                  </div>
                </div>

                {renderStatusBadge(order)}
              </div>

              {/* Row 2: Amounts */}
              <div className="mb-4 flex gap-4">
                <div className="flex-1 rounded-xl bg-[#0D0F14]/80 border border-white/[0.04] px-4 py-4">
                  <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-gray-600">
                    Sell {isETH(order.tokenSell) ? '(ETH)' : ''}
                  </div>
                  <div className="font-mono text-sm font-semibold tabular-nums text-red-400">
                    {sellFormatted}
                  </div>
                </div>

                <div className="flex items-center text-gray-600">
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>

                <div className="flex-1 rounded-xl bg-[#0D0F14]/80 border border-white/[0.04] px-4 py-4">
                  <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-gray-600">
                    Buy {isETH(order.tokenBuy) ? '(ETH)' : ''}
                  </div>
                  <div className="font-mono text-sm font-semibold tabular-nums text-emerald-400">
                    {buyFormatted}
                  </div>
                </div>
              </div>

              {/* Row 3: Fill progress bar */}
              {(pct > 0 || status === 'filled') && (
                <div className="mb-4">
                  <div className="mb-2 flex items-center justify-between text-[11px]">
                    <span className="text-gray-500">Fill progress</span>
                    <span className="font-mono font-medium text-gray-400">{pct}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
                    <div
                      className={clsx(
                        'h-full rounded-full transition-all duration-500',
                        status === 'filled'
                          ? 'bg-emerald-500'
                          : 'bg-blue-500',
                      )}
                      style={{
                        width: `${Math.min(pct, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Row 4: Cancel button for open orders (maker only) */}
              {open && maker && (
                <button
                  type="button"
                  onClick={() => handleCancelOrder(order.id)}
                  disabled={isCancelling}
                  className={clsx(
                    'flex w-full items-center justify-center gap-2 rounded-xl py-3 px-4 text-xs font-semibold transition-all',
                    isCancelling
                      ? 'cursor-not-allowed bg-white/[0.02] text-gray-600'
                      : 'border border-red-500/10 text-red-400 hover:border-red-500/20 hover:bg-red-500/5',
                  )}
                >
                  {isCancelling ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Cancelling...
                    </>
                  ) : (
                    <>
                      <X className="h-3.5 w-3.5" />
                      Cancel Order
                    </>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Cancel transaction link */}
      {cancelTxHash && (
        <div className="flex items-center justify-center gap-2.5 border-t border-white/[0.06] px-5 py-4 mt-4 text-xs text-gray-500">
          <span className="font-mono">{formatAddress(cancelTxHash)}</span>
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

      {/* Refresh indicator */}
      {loading && orders.length > 0 && (
        <div className="flex items-center justify-center gap-1.5 py-3 text-[11px] text-gray-600">
          <Loader2 className="h-3 w-3 animate-spin" />
          Refreshing...
        </div>
      )}
    </div>
  );
}
