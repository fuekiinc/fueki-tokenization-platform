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
 *
 * ACCESSIBILITY IMPROVEMENTS (Agent 12 audit):
 * - Proper table semantics (scope on th, thead/tbody) for desktop view
 * - Sortable column headers with aria-sort
 * - role="tablist" / role="tab" / role="tabpanel" on filter tabs
 * - aria-hidden on decorative icons
 * - role="progressbar" with aria-valuenow/min/max on fill bars
 * - role="status" on loading/refresh indicators
 * - focus-visible styles on all interactive elements
 * - Responsive: desktop table layout + mobile card layout
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  AlertCircle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  ExternalLink,
  Loader2,
  X,
} from 'lucide-react';
import { ContractService, isETH, type Order, parseContractError } from '../../lib/blockchain/contracts';
import { getNetworkConfig } from '../../contracts/addresses';
import logger from '../../lib/logger';
import { formatAddress } from '../../lib/utils/helpers';
import { formatPrice, formatTokenAmount } from '../../lib/formatters';
import Badge from '../Common/Badge';
import { emitRpcRefetch } from '../../lib/rpc/refetchEvents';
import { queryKeys } from '../../lib/queryClient';
import { useWalletStore } from '../../store/walletStore';

// ---------------------------------------------------------------------------
// Helpers -- derive display status from on-chain Order fields
// ---------------------------------------------------------------------------

type DerivedStatus = 'open' | 'filled' | 'cancelled';
type TabFilter = 'all' | 'open' | 'filled' | 'cancelled';
type SortField = 'id' | 'sell' | 'buy' | 'fill' | 'status';
type SortDir = 'asc' | 'desc';

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

/** Numeric sort value for status so we can sort by it. */
function statusSortValue(order: Order): number {
  const s = deriveOrderStatus(order);
  if (s === 'open') return 0;
  if (s === 'filled') return 1;
  return 2;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABS: { label: string; value: TabFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'open' },
  { label: 'Filled', value: 'filled' },
  { label: 'Cancelled', value: 'cancelled' },
];

/** Generate CSV content from orders for export. */
function generateOrdersCSV(orders: Order[], userAddress: string): string {
  const headers = ['Order ID', 'Role', 'Sell Token', 'Buy Token', 'Sell Amount', 'Buy Amount', 'Fill %', 'Status'];
  const rows = orders.map((order) => {
    const status = order.cancelled ? 'Cancelled' : order.filledBuy >= order.amountBuy ? 'Filled' : 'Open';
    const pct = order.amountBuy === 0n ? 0 : Number((order.filledBuy * 100n) / order.amountBuy);
    const role = order.maker.toLowerCase() === userAddress.toLowerCase() ? 'Maker' : 'Taker';
    return [
      order.id.toString(),
      role,
      isETH(order.tokenSell) ? 'ETH' : order.tokenSell,
      isETH(order.tokenBuy) ? 'ETH' : order.tokenBuy,
      ethers.formatUnits(order.amountSell, 18),
      ethers.formatUnits(order.amountBuy, 18),
      `${pct}%`,
      status,
    ].join(',');
  });
  return [headers.join(','), ...rows].join('\n');
}

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
  const [cancellingId, setCancellingId] = useState<bigint | null>(null);
  const [cancelTxHash, setCancelTxHash] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [withdrawing, setWithdrawing] = useState(false);
  const [sortField, setSortField] = useState<SortField>('id');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [confirmCancelId, setConfirmCancelId] = useState<bigint | null>(null);
  const cancellingRef = useRef(false);
  const queryClient = useQueryClient();
  const chainId = useWalletStore((state) => state.wallet.chainId);

  // ---- Derived ------------------------------------------------------------

  const networkConfig = useMemo(
    () => (chainId ? getNetworkConfig(chainId) ?? null : null),
    [chainId],
  );

  const explorerTxUrl = useMemo(() => {
    if (!cancelTxHash || !networkConfig?.blockExplorer) return null;
    return `${networkConfig.blockExplorer}/tx/${cancelTxHash}`;
  }, [cancelTxHash, networkConfig]);

  // ---- Fetch user orders --------------------------------------------------

  const userOrdersQuery = useQuery<{ orders: Order[]; ethWithdrawable: bigint }>({
    queryKey: queryKeys.userOrders(userAddress, chainId),
    enabled: Boolean(contractService) && Boolean(userAddress),
    refetchInterval: 12_000,
    queryFn: async () => {
      if (!contractService || !userAddress) {
        return { orders: [], ethWithdrawable: 0n };
      }

      const [makerIds, takerIds] = await Promise.all([
        contractService.getExchangeUserOrders(userAddress),
        contractService.getExchangeFilledOrderIds(userAddress).catch(() => [] as bigint[]),
      ]);

      const seen = new Set<string>();
      const allIds: bigint[] = [];
      for (const id of [...makerIds, ...takerIds]) {
        const key = id.toString();
        if (!seen.has(key)) {
          seen.add(key);
          allIds.push(id);
        }
      }

      const orders =
        allIds.length === 0
          ? []
          : await contractService.getExchangeOrders(allIds);

      orders.sort((a, b) => {
        if (b.id > a.id) return 1;
        if (b.id < a.id) return -1;
        return 0;
      });

      const ethWithdrawable = await contractService
        .getExchangeEthBalance(userAddress)
        .catch(() => 0n);

      return { orders, ethWithdrawable };
    },
  });

  const orders = useMemo(
    () => userOrdersQuery.data?.orders ?? [],
    [userOrdersQuery.data?.orders],
  );
  const ethWithdrawable = userOrdersQuery.data?.ethWithdrawable ?? 0n;
  const loading = userOrdersQuery.isLoading || userOrdersQuery.isFetching;

  useEffect(() => {
    if (!userOrdersQuery.error) {
      return;
    }

    logger.error('Failed to fetch user orders:', userOrdersQuery.error);
  }, [userOrdersQuery.error, userOrdersQuery.errorUpdatedAt]);

  // Sort toggle
  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDir('asc');
      }
    },
    [sortField],
  );

  const filteredOrders = useMemo(() => {
    const result = activeTab === 'all'
      ? [...orders]
      : orders.filter((o) => deriveOrderStatus(o) === activeTab);

    // Apply sorting
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'id':
          cmp = a.id > b.id ? 1 : a.id < b.id ? -1 : 0;
          break;
        case 'sell':
          cmp = a.amountSell > b.amountSell ? 1 : a.amountSell < b.amountSell ? -1 : 0;
          break;
        case 'buy':
          cmp = a.amountBuy > b.amountBuy ? 1 : a.amountBuy < b.amountBuy ? -1 : 0;
          break;
        case 'fill':
          cmp = fillPercentage(a) - fillPercentage(b);
          break;
        case 'status':
          cmp = statusSortValue(a) - statusSortValue(b);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [orders, activeTab, sortField, sortDir]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const counts = { all: orders.length, open: 0, filled: 0, cancelled: 0 };
    for (const o of orders) {
      const s = deriveOrderStatus(o);
      counts[s]++;
    }
    return counts;
  }, [orders]);

  // ---- Cancel order handler -----------------------------------------------

  const handleCancelOrder = useCallback(
    async (orderId: bigint) => {
      if (!contractService || cancellingRef.current) return;
      cancellingRef.current = true;

      setCancellingId(orderId);
      setCancelTxHash(null);

      try {
        toast.loading('Cancelling order...', { id: 'cancel-order' });
        // Use AssetBackedExchange cancel
        const tx = await contractService.cancelExchangeOrder(orderId);
        setCancelTxHash(tx.hash);

        await contractService.waitForTransaction(tx);
        toast.success('Order cancelled', { id: 'cancel-order' });

        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: queryKeys.userOrders(userAddress, chainId),
            exact: true,
          }),
          queryClient.invalidateQueries({ queryKey: ['orderBook'] }),
          queryClient.invalidateQueries({ queryKey: ['balance'] }),
        ]);
        emitRpcRefetch(['orders', 'balances']);
        onOrderCancelled();
      } catch (err: unknown) {
        logger.error('Cancel order failed:', err);
        toast.error(parseContractError(err), { id: 'cancel-order' });
      } finally {
        cancellingRef.current = false;
        setCancellingId(null);
      }
    },
    [chainId, contractService, onOrderCancelled, queryClient, userAddress],
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
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.userOrders(userAddress, chainId),
          exact: true,
        }),
        queryClient.invalidateQueries({ queryKey: ['balance'] }),
      ]);
      emitRpcRefetch(['orders', 'balances']);
    } catch (err: unknown) {
      logger.error('ETH withdrawal failed:', err);
      toast.error(parseContractError(err), { id: 'withdraw-eth' });
    } finally {
      setWithdrawing(false);
    }
  }, [chainId, contractService, ethWithdrawable, queryClient, userAddress, withdrawing]);

  // ---- CSV export handler -------------------------------------------------

  const handleExportCSV = useCallback(() => {
    if (filteredOrders.length === 0) return;
    const csv = generateOrdersCSV(filteredOrders, userAddress);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fueki-orders-${activeTab}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredOrders, userAddress, activeTab]);

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

  // ---- Sort icon helper ---------------------------------------------------

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? (
      <ChevronUp className="inline h-3 w-3" aria-hidden="true" />
    ) : (
      <ChevronDown className="inline h-3 w-3" aria-hidden="true" />
    );
  }

  // ---- Main render --------------------------------------------------------

  if (!userAddress) {
    return (
      <div
        role="status"
        className="flex flex-col items-center justify-center py-20 text-center"
      >
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/[0.06]">
          <AlertCircle className="h-6 w-6 text-gray-600" aria-hidden="true" />
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
        <div
          role="alert"
          className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 sm:px-5 sm:py-4"
        >
          <div className="flex items-center gap-2.5">
            <Download className="h-4 w-4 text-blue-400 shrink-0" aria-hidden="true" />
            <span className="text-xs sm:text-sm text-blue-300">
              {formatPrice(Number(ethers.formatUnits(ethWithdrawable, 18)))} ETH available to withdraw
            </span>
          </div>
          <button
            type="button"
            onClick={handleWithdrawETH}
            disabled={withdrawing}
            aria-label={`Withdraw ${formatPrice(Number(ethers.formatUnits(ethWithdrawable, 18)))} ETH`}
            className={clsx(
              'rounded-lg px-4 py-2 text-xs font-semibold transition-all',
              'focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0D0F14]',
              withdrawing
                ? 'cursor-not-allowed opacity-50 text-blue-400'
                : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30',
            )}
          >
            {withdrawing ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                Withdrawing...
              </span>
            ) : (
              'Withdraw ETH'
            )}
          </button>
        </div>
      )}

      {/* ---- Filter tabs with ARIA semantics + CSV export -------------------- */}
      <div className="mb-6 flex items-center gap-2 border-b border-white/[0.06]">
      <div
        role="tablist"
        aria-label="Order status filter"
        className="flex flex-1 gap-0.5 sm:gap-1 px-0.5 sm:px-1 pb-0 overflow-x-auto"
      >
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            id={`tab-${tab.value}`}
            aria-selected={activeTab === tab.value}
            aria-controls={`tabpanel-orders`}
            tabIndex={activeTab === tab.value ? 0 : -1}
            onClick={() => setActiveTab(tab.value)}
            className={clsx(
              'relative px-2.5 sm:px-4 py-3 text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap',
              'min-h-[44px]',
              'focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0D0F14] focus-visible:outline-none',
              activeTab === tab.value
                ? 'text-white'
                : 'text-gray-500 hover:text-gray-300',
            )}
          >
            {tab.label}
            {tabCounts[tab.value] > 0 && (
              <span
                aria-label={`${tabCounts[tab.value]} orders`}
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
              <span className="absolute bottom-0 left-1 right-1 h-[2px] rounded-full bg-white" aria-hidden="true" />
            )}
          </button>
        ))}
      </div>

      {/* CSV export button */}
      {filteredOrders.length > 0 && (
        <button
          type="button"
          onClick={handleExportCSV}
          aria-label="Export orders as CSV"
          title="Export as CSV"
          className={clsx(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg mb-1',
            'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]',
            'transition-all',
            'focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none',
          )}
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      )}
      </div>

      {/* ---- Tab panel ------------------------------------------------------ */}
      <div
        role="tabpanel"
        id="tabpanel-orders"
        aria-labelledby={`tab-${activeTab}`}
      >
        {/* ---- Loading state ------------------------------------------------- */}
        {loading && orders.length === 0 && (
          <div role="status" className="flex flex-col items-center justify-center py-16">
            <span className="sr-only">Loading orders...</span>
            <div className="w-full max-w-md space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 rounded-xl bg-white/[0.02] border border-white/[0.04] px-5 py-4"
                >
                  <div className="h-9 w-9 animate-pulse motion-reduce:animate-none rounded-full bg-white/[0.04]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-28 animate-pulse motion-reduce:animate-none rounded bg-white/[0.04]" />
                    <div className="h-3 w-36 animate-pulse motion-reduce:animate-none rounded bg-white/[0.04]" />
                  </div>
                  <div className="h-6 w-16 animate-pulse motion-reduce:animate-none rounded-full bg-white/[0.04]" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---- Empty state --------------------------------------------------- */}
        {!loading && filteredOrders.length === 0 && (
          <div role="status" className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/[0.06]">
              <Clock className="h-5 w-5 text-gray-600" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-gray-400">
              {orders.length === 0
                ? 'Your order history is empty'
                : `No ${activeTab} orders`}
            </p>
            {orders.length === 0 && (
              <p className="mt-2 text-xs text-gray-600">
                Place your first order using the trade form to get started.
              </p>
            )}
          </div>
        )}

        {/* ---- Desktop table view (sm and up) -------------------------------- */}
        {filteredOrders.length > 0 && (
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full min-w-[700px]" aria-label="Your orders">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort('id')}
                      className="inline-flex items-center gap-1.5 transition-colors hover:text-gray-300 focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none rounded"
                      aria-sort={sortField === 'id' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      aria-label={`Sort by order ID, currently ${sortField === 'id' ? sortDir + 'ending' : 'unsorted'}`}
                    >
                      Order
                      <SortIcon field="id" />
                    </button>
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                  >
                    Pair
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort('sell')}
                      className="inline-flex items-center gap-1.5 transition-colors hover:text-gray-300 focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none rounded"
                      aria-sort={sortField === 'sell' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      aria-label={`Sort by sell amount, currently ${sortField === 'sell' ? sortDir + 'ending' : 'unsorted'}`}
                    >
                      Sell
                      <SortIcon field="sell" />
                    </button>
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort('buy')}
                      className="inline-flex items-center gap-1.5 transition-colors hover:text-gray-300 focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none rounded"
                      aria-sort={sortField === 'buy' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      aria-label={`Sort by buy amount, currently ${sortField === 'buy' ? sortDir + 'ending' : 'unsorted'}`}
                    >
                      Buy
                      <SortIcon field="buy" />
                    </button>
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort('fill')}
                      className="inline-flex items-center gap-1.5 transition-colors hover:text-gray-300 focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none rounded"
                      aria-sort={sortField === 'fill' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      aria-label={`Sort by fill percentage, currently ${sortField === 'fill' ? sortDir + 'ending' : 'unsorted'}`}
                    >
                      Fill
                      <SortIcon field="fill" />
                    </button>
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort('status')}
                      className="inline-flex items-center gap-1.5 transition-colors hover:text-gray-300 focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none rounded"
                      aria-sort={sortField === 'status' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      aria-label={`Sort by status, currently ${sortField === 'status' ? sortDir + 'ending' : 'unsorted'}`}
                    >
                      Status
                      <SortIcon field="status" />
                    </button>
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const isCancelling = cancellingId === order.id;
                  const open = isOrderOpenDerived(order);
                  const pct = fillPercentage(order);
                  const maker = isMaker(order, userAddress);
                  const sellFormatted = formatTokenAmount(
                    Number(ethers.formatUnits(order.amountSell, 18)),
                  );
                  const buyFormatted = formatTokenAmount(
                    Number(ethers.formatUnits(order.amountBuy, 18)),
                  );

                  return (
                    <tr
                      key={order.id.toString()}
                      className={clsx(
                        'border-b border-white/[0.04] transition-colors hover:bg-white/[0.02]',
                        !open && 'opacity-60 hover:opacity-80',
                      )}
                    >
                      {/* Order ID + Role */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-gray-300">
                            #{order.id.toString()}
                          </span>
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
                        </div>
                      </td>

                      {/* Pair */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-mono font-medium text-gray-300">
                            {formatTokenLabel(order.tokenSell)}
                          </span>
                          <ArrowRight className="h-3 w-3 text-gray-600" aria-hidden="true" />
                          <span className="font-mono font-medium text-gray-300">
                            {formatTokenLabel(order.tokenBuy)}
                          </span>
                        </div>
                      </td>

                      {/* Sell amount */}
                      <td className="px-4 py-4 text-right">
                        <span className="font-mono text-sm font-semibold tabular-nums text-red-400">
                          {sellFormatted}
                        </span>
                      </td>

                      {/* Buy amount */}
                      <td className="px-4 py-4 text-right">
                        <span className="font-mono text-sm font-semibold tabular-nums text-emerald-400">
                          {buyFormatted}
                        </span>
                      </td>

                      {/* Fill progress */}
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
                            <div
                              role="progressbar"
                              aria-valuenow={Math.min(pct, 100)}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-label={`Order ${order.id.toString()} fill progress: ${pct}%`}
                              className={clsx(
                                'h-full rounded-full transition-all duration-500',
                                pct >= 100
                                  ? 'bg-emerald-500'
                                  : 'bg-blue-500',
                              )}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs text-gray-500 tabular-nums w-8 text-right">
                            {pct}%
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-4 text-center">
                        {renderStatusBadge(order)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-4 text-right">
                        {open && maker ? (
                          confirmCancelId === order.id ? (
                            <div className="inline-flex items-center gap-1.5">
                              <span className="text-[10px] text-amber-400 mr-1">Cancel?</span>
                              <button
                                type="button"
                                onClick={() => { setConfirmCancelId(null); void handleCancelOrder(order.id); }}
                                disabled={isCancelling}
                                aria-label={`Confirm cancel order #${order.id.toString()}`}
                                className="rounded-md bg-red-500/15 px-2.5 py-1.5 text-[10px] font-bold text-red-400 hover:bg-red-500/25 transition-colors"
                              >
                                {isCancelling ? (
                                  <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                                ) : 'Yes'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmCancelId(null)}
                                className="rounded-md bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-bold text-gray-400 hover:bg-white/[0.08] transition-colors"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmCancelId(order.id)}
                              disabled={isCancelling}
                              aria-label={`Cancel order #${order.id.toString()}`}
                              className={clsx(
                                'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all',
                                'focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0D0F14]',
                                isCancelling
                                  ? 'cursor-not-allowed bg-white/[0.02] text-gray-600'
                                  : 'border border-red-500/10 text-red-400 hover:border-red-500/20 hover:bg-red-500/5',
                              )}
                            >
                              <X className="h-3 w-3" aria-hidden="true" />
                              Cancel
                            </button>
                          )
                        ) : (
                          <span className="text-xs text-gray-700">--</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ---- Mobile card view (below sm) ----------------------------------- */}
        {filteredOrders.length > 0 && (
          <div className="sm:hidden space-y-3" aria-label="Your orders" role="list">
            {filteredOrders.map((order) => {
              const isCancelling = cancellingId === order.id;
              const open = isOrderOpenDerived(order);
              const status = deriveOrderStatus(order);
              const pct = fillPercentage(order);
              const maker = isMaker(order, userAddress);
              const sellFormatted = formatTokenAmount(
                Number(ethers.formatUnits(order.amountSell, 18)),
              );
              const buyFormatted = formatTokenAmount(
                Number(ethers.formatUnits(order.amountBuy, 18)),
              );

              return (
                <div
                  key={order.id.toString()}
                  role="listitem"
                  className={clsx(
                    'group rounded-xl border border-white/[0.06] bg-[#0D0F14]/60 p-5 transition-all',
                    open
                      ? 'hover:border-white/[0.1] hover:bg-[#0D0F14]/80'
                      : 'opacity-60 hover:opacity-80',
                  )}
                >
                  {/* Row 1: Pair + Status + ID */}
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
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
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-medium text-gray-300">
                          {formatTokenLabel(order.tokenSell)}
                        </span>
                        <ArrowRight className="h-3 w-3 text-gray-600" aria-hidden="true" />
                        <span className="font-mono font-medium text-gray-300">
                          {formatTokenLabel(order.tokenBuy)}
                        </span>
                      </div>
                    </div>

                    {renderStatusBadge(order)}
                  </div>

                  {/* Row 2: Amounts */}
                  <div className="mb-4 flex gap-3">
                    <div className="flex-1 rounded-xl bg-[#0D0F14]/80 border border-white/[0.04] px-3 py-3">
                      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-gray-600">
                        Sell {isETH(order.tokenSell) ? '(ETH)' : ''}
                      </div>
                      <div className="font-mono text-xs font-semibold tabular-nums text-red-400 truncate">
                        {sellFormatted}
                      </div>
                    </div>

                    <div className="flex items-center text-gray-600">
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </div>

                    <div className="flex-1 rounded-xl bg-[#0D0F14]/80 border border-white/[0.04] px-3 py-3">
                      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-gray-600">
                        Buy {isETH(order.tokenBuy) ? '(ETH)' : ''}
                      </div>
                      <div className="font-mono text-xs font-semibold tabular-nums text-emerald-400 truncate">
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
                          role="progressbar"
                          aria-valuenow={Math.min(pct, 100)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`Order ${order.id.toString()} fill progress: ${pct}%`}
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
                    confirmCancelId === order.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-amber-400">Cancel this order?</span>
                        <button
                          type="button"
                          onClick={() => { setConfirmCancelId(null); void handleCancelOrder(order.id); }}
                          disabled={isCancelling}
                          className="flex-1 rounded-xl py-3 text-xs font-semibold bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors min-h-[44px]"
                        >
                          {isCancelling ? (
                            <span className="flex items-center justify-center gap-1.5">
                              <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                              Cancelling...
                            </span>
                          ) : 'Confirm'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmCancelId(null)}
                          className="flex-1 rounded-xl py-3 text-xs font-semibold bg-white/[0.04] text-gray-400 hover:bg-white/[0.08] transition-colors min-h-[44px]"
                        >
                          Keep
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmCancelId(order.id)}
                        disabled={isCancelling}
                        aria-label={`Cancel order #${order.id.toString()}`}
                        className={clsx(
                          'flex w-full items-center justify-center gap-2 rounded-xl py-3 px-4 text-xs font-semibold transition-all',
                          'min-h-[44px]',
                          'focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0D0F14]',
                          isCancelling
                            ? 'cursor-not-allowed bg-white/[0.02] text-gray-600'
                            : 'border border-red-500/10 text-red-400 hover:border-red-500/20 hover:bg-red-500/5',
                        )}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                        Cancel Order
                      </button>
                    )
                  )}
                </div>
              );
            })}
          </div>
        )}
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
              aria-label={`View transaction ${formatAddress(cancelTxHash)} on block explorer`}
              className={clsx(
                'inline-flex items-center gap-1 text-blue-400 transition-colors hover:text-blue-300',
                'focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0D0F14]',
              )}
            >
              View
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          )}
        </div>
      )}

      {/* Refresh indicator */}
      {loading && orders.length > 0 && (
        <div role="status" className="flex items-center justify-center gap-1.5 py-3 text-[11px] text-gray-600">
          <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <span>Refreshing...</span>
        </div>
      )}
    </div>
  );
}
