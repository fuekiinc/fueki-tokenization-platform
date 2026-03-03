import { useCallback, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Flame,
  Package,
  Send,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { InfoTooltip } from '../Common/Tooltip';
import { TOOLTIPS } from '../../lib/tooltipContent';
import type { TradeHistory, WrappedAsset } from '../../types/index.ts';
import {
  copyToClipboard,
  formatBalance,
  parseTokenAmount,
} from '../../lib/utils/helpers.ts';
import { formatCurrency, formatTokenAmount } from '../../lib/formatters.ts';
import {
  calculateAssetPerformance,
  formatPnLPercent,
} from '../../lib/portfolioMetrics.ts';
import type { AssetPerformance } from '../../lib/portfolioMetrics.ts';
import { CARD_CLASSES } from '../../lib/designTokens';
import ChartSkeleton from './ChartSkeleton.tsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortField = 'name' | 'balance' | 'value' | 'pnl';
type SortDir = 'asc' | 'desc';

interface HoldingsTableProps {
  assets: WrappedAsset[];
  trades?: TradeHistory[];
  isLoading?: boolean;
  onTransfer?: (asset: WrappedAsset) => void;
  onBurn?: (asset: WrappedAsset) => void;
  onViewExplorer?: (asset: WrappedAsset) => void;
  onMintNew?: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROW_HEIGHT = 64;
const OVERSCAN = 5;
const MAX_SCROLL_HEIGHT = 640; // 10 rows visible before scrolling

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GRADIENT_PALETTES = [
  'from-indigo-500 to-violet-400',
  'from-violet-500 to-purple-400',
  'from-emerald-500 to-teal-400',
  'from-amber-500 to-orange-400',
  'from-rose-500 to-pink-400',
  'from-cyan-500 to-blue-400',
  'from-fuchsia-500 to-purple-400',
  'from-blue-500 to-indigo-400',
];

function getTokenGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return GRADIENT_PALETTES[Math.abs(hash) % GRADIENT_PALETTES.length];
}

function getDocBadgeClasses(docType: string): string {
  const lower = (docType ?? '').toLowerCase();
  if (lower === 'json')
    return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
  if (lower === 'csv')
    return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  if (lower === 'xml')
    return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
}

function pnlColorClass(value: number): string {
  if (value > 0) return 'text-emerald-400';
  if (value < 0) return 'text-red-400';
  return 'text-gray-500';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HoldingsTable({
  assets,
  trades = [],
  isLoading = false,
  onTransfer,
  onBurn,
  onViewExplorer,
  onMintNew,
}: HoldingsTableProps) {
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Ref for the virtualiser scroll container
  const parentRef = useRef<HTMLDivElement>(null);

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

  // Pre-compute performance data for each asset
  const performanceMap = useMemo(() => {
    const map = new Map<string, AssetPerformance>();
    for (const asset of assets) {
      map.set(asset.address, calculateAssetPerformance(asset, trades));
    }
    return map;
  }, [assets, trades]);

  const sortedAssets = useMemo(() => {
    const result = [...assets];
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'balance':
          cmp =
            parseTokenAmount(a.balance || '0') -
            parseTokenAmount(b.balance || '0');
          break;
        case 'value':
          cmp =
            parseTokenAmount(a.originalValue || '0') -
            parseTokenAmount(b.originalValue || '0');
          break;
        case 'pnl': {
          const aPnl = performanceMap.get(a.address)?.percentageChange ?? 0;
          const bPnl = performanceMap.get(b.address)?.percentageChange ?? 0;
          cmp = aPnl - bPnl;
          break;
        }
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [assets, sortField, sortDir, performanceMap]);

  // Virtualiser
  const virtualizer = useVirtualizer({
    count: sortedAssets.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  if (isLoading) {
    return <ChartSkeleton variant="table" rows={5} />;
  }

  if (assets.length === 0) {
    return (
      <div
        role="status"
        className={clsx(
          'flex flex-col items-center justify-center text-center',
          'rounded-2xl px-8 sm:px-12 py-16 sm:py-20',
          'bg-[#0D0F14]/60 backdrop-blur-xl',
          'border border-dashed border-white/[0.08]',
        )}
      >
        <div className="relative mb-8">
          <div
            aria-hidden="true"
            className="absolute -inset-4 rounded-full bg-gradient-to-br from-indigo-500/10 to-violet-500/10 blur-xl"
          />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/20 to-violet-500/20 ring-1 ring-white/[0.08] text-indigo-400">
            <Package className="h-8 w-8" />
          </div>
        </div>
        <h3 className="mb-3 text-lg sm:text-xl font-semibold text-white">
          No tokenized assets yet
        </h3>
        <p className="max-w-md text-sm sm:text-base leading-relaxed text-gray-400">
          Upload a document and mint your first wrapped asset to get started.
        </p>
        {onMintNew && (
          <div className="mt-8">
            <button
              type="button"
              onClick={onMintNew}
              className={clsx(
                'inline-flex items-center gap-2 rounded-xl px-6 py-3',
                'bg-gradient-to-r from-indigo-500 to-violet-500',
                'text-sm font-semibold text-white',
                'shadow-lg shadow-indigo-500/25',
                'transition-all duration-200 hover:shadow-xl hover:shadow-indigo-500/30',
                'focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06070A]',
              )}
            >
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              Mint Your First Asset
            </button>
          </div>
        )}
      </div>
    );
  }

  // Sort direction icon
  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? (
      <ChevronUp className="inline h-3 w-3" aria-hidden="true" />
    ) : (
      <ChevronDown className="inline h-3 w-3" aria-hidden="true" />
    );
  }

  const hasTrades = trades.length > 0;

  return (
    <div
      className={clsx(
        CARD_CLASSES.base,
        CARD_CLASSES.wrapper,
      )}
    >
      {/* Top gradient accent */}
      <div className={CARD_CLASSES.gradientAccent} />

      {/* Responsive wrapper -- horizontal scroll on mobile */}
      <div className="overflow-x-auto">
        {/* Sticky header */}
        <table className="w-full min-w-[740px]" aria-label="Token holdings">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th
                scope="col"
                className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
              >
                <button
                  type="button"
                  onClick={() => toggleSort('name')}
                  className="inline-flex items-center gap-1.5 transition-colors hover:text-gray-300"
                  aria-sort={sortField === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  Asset
                  <InfoTooltip content={TOOLTIPS.wrappedAsset} />
                  <SortIcon field="name" />
                </button>
              </th>
              <th
                scope="col"
                className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
              >
                Type
              </th>
              <th
                scope="col"
                className="px-6 py-4 text-right text-xs font-medium uppercase tracking-wider text-gray-500"
              >
                <button
                  type="button"
                  onClick={() => toggleSort('balance')}
                  className="inline-flex items-center gap-1.5 transition-colors hover:text-gray-300"
                  aria-sort={sortField === 'balance' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  Balance
                  <SortIcon field="balance" />
                </button>
              </th>
              <th
                scope="col"
                className="px-6 py-4 text-right text-xs font-medium uppercase tracking-wider text-gray-500"
              >
                <button
                  type="button"
                  onClick={() => toggleSort('value')}
                  className="inline-flex items-center gap-1.5 transition-colors hover:text-gray-300"
                  aria-sort={sortField === 'value' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  Value
                  <SortIcon field="value" />
                </button>
              </th>
              {/* P&L column */}
              <th
                scope="col"
                className="px-6 py-4 text-right text-xs font-medium uppercase tracking-wider text-gray-500"
              >
                <button
                  type="button"
                  onClick={() => toggleSort('pnl')}
                  className="inline-flex items-center gap-1.5 transition-colors hover:text-gray-300"
                  aria-sort={sortField === 'pnl' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  P&L
                  <InfoTooltip content={TOOLTIPS.unrealizedGain} />
                  <SortIcon field="pnl" />
                </button>
              </th>
              <th
                scope="col"
                className="px-6 py-4 text-right text-xs font-medium uppercase tracking-wider text-gray-500"
              >
                Actions
              </th>
            </tr>
          </thead>
        </table>

        {/* Virtualised scrollable body */}
        <div
          ref={parentRef}
          className="overflow-y-auto"
          style={{ maxHeight: MAX_SCROLL_HEIGHT }}
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const asset = sortedAssets[virtualRow.index];
              const perf = performanceMap.get(asset.address);
              const gradient = getTokenGradient(asset.name ?? '');
              const tokenInitials = (asset.name ?? '')
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w.charAt(0).toUpperCase())
                .join('') || '??';
              const docType = (asset.documentType ?? '').toUpperCase();

              return (
                <div
                  key={asset.address}
                  className="absolute left-0 top-0 w-full min-w-[740px]"
                  style={{
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div className="flex h-full items-center border-b border-white/[0.04] transition-colors hover:bg-white/[0.02]">
                    {/* Asset name + symbol */}
                    <div className="w-auto flex-1 px-6">
                      <div className="flex items-center gap-3.5">
                        <div
                          className={clsx(
                            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br',
                            gradient,
                            'text-xs font-bold text-white shadow-lg',
                          )}
                          aria-hidden="true"
                        >
                          {tokenInitials}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">
                            {asset.name}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {asset.symbol}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Document type */}
                    <div className="w-24 shrink-0 px-6">
                      {docType ? (
                        <span
                          className={clsx(
                            'inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide',
                            getDocBadgeClasses(asset.documentType ?? ''),
                          )}
                        >
                          {docType}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-600">--</span>
                      )}
                    </div>

                    {/* Balance */}
                    <div className="w-28 shrink-0 px-6 text-right">
                      <span className="tabular-nums text-sm font-semibold text-white">
                        {formatTokenAmount(formatBalance(asset.balance ?? '0'))}
                      </span>
                    </div>

                    {/* Value */}
                    <div className="w-28 shrink-0 px-6 text-right">
                      <span className="tabular-nums text-sm text-gray-400">
                        {formatCurrency(formatBalance(asset.originalValue ?? '0'))}
                      </span>
                    </div>

                    {/* P&L */}
                    <div className="w-28 shrink-0 px-6 text-right">
                      {perf && hasTrades && perf.hasCostData ? (
                        <span
                          className={clsx(
                            'inline-flex items-center gap-1.5 tabular-nums text-sm font-medium',
                            pnlColorClass(perf.percentageChange),
                          )}
                        >
                          {perf.percentageChange > 0 && (
                            <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          {perf.percentageChange < 0 && (
                            <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          {formatPnLPercent(perf.percentageChange)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-600">--</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="w-44 shrink-0 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {onTransfer && (
                          <button
                            type="button"
                            onClick={() => onTransfer(asset)}
                            aria-label={`Transfer ${asset.name}`}
                            className={clsx(
                              'inline-flex items-center gap-1.5 rounded-lg px-3 py-2',
                              'border border-indigo-500/10 bg-indigo-500/[0.06] text-xs font-medium text-indigo-400',
                              'transition-all duration-200 hover:border-indigo-500/25 hover:bg-indigo-500/[0.12]',
                              'focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0D0F14]',
                            )}
                          >
                            <Send className="h-3 w-3" aria-hidden="true" />
                            <span className="hidden sm:inline">Transfer</span>
                          </button>
                        )}
                        {onBurn && (
                          <button
                            type="button"
                            onClick={() => onBurn(asset)}
                            aria-label={`Burn ${asset.name}`}
                            className={clsx(
                              'inline-flex items-center gap-1.5 rounded-lg px-3 py-2',
                              'border border-red-500/10 bg-red-500/[0.06] text-xs font-medium text-red-400',
                              'transition-all duration-200 hover:border-red-500/25 hover:bg-red-500/[0.12]',
                              'focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0D0F14]',
                            )}
                          >
                            <Flame className="h-3 w-3" aria-hidden="true" />
                            <span className="hidden sm:inline">Burn</span>
                          </button>
                        )}
                        {asset.documentHash && (
                          <button
                            type="button"
                            onClick={() => copyToClipboard(asset.documentHash)}
                            aria-label={`Copy document hash for ${asset.name}`}
                            className={clsx(
                              'inline-flex items-center justify-center rounded-lg p-2',
                              'border border-white/[0.06] bg-white/[0.03] text-gray-500',
                              'transition-all duration-200 hover:border-white/[0.10] hover:bg-white/[0.06] hover:text-gray-300',
                              'focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0D0F14]',
                            )}
                          >
                            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                        {onViewExplorer && (
                          <button
                            type="button"
                            onClick={() => onViewExplorer(asset)}
                            aria-label={`View ${asset.name} on block explorer`}
                            className={clsx(
                              'inline-flex items-center justify-center rounded-lg p-2',
                              'border border-white/[0.06] bg-white/[0.03] text-gray-500',
                              'transition-all duration-200 hover:border-white/[0.10] hover:bg-white/[0.06] hover:text-gray-300',
                              'focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0D0F14]',
                            )}
                          >
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
