import { useState, useMemo, useCallback } from 'react';
import clsx from 'clsx';
import {
  ChevronUp,
  ChevronDown,
  Copy,
  Send,
  Flame,
  ExternalLink,
  Package,
  ArrowUpRight,
} from 'lucide-react';
import type { WrappedAsset } from '../../types/index';
import { formatBalance, copyToClipboard } from '../../lib/utils/helpers';
import ChartSkeleton from './ChartSkeleton';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortField = 'name' | 'balance' | 'value';
type SortDir = 'asc' | 'desc';

interface HoldingsTableProps {
  assets: WrappedAsset[];
  isLoading?: boolean;
  onTransfer?: (asset: WrappedAsset) => void;
  onBurn?: (asset: WrappedAsset) => void;
  onViewExplorer?: (asset: WrappedAsset) => void;
  onMintNew?: () => void;
}

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HoldingsTable({
  assets,
  isLoading = false,
  onTransfer,
  onBurn,
  onViewExplorer,
  onMintNew,
}: HoldingsTableProps) {
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

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

  const sortedAssets = useMemo(() => {
    const result = [...assets];
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'balance':
          cmp = parseFloat(a.balance || '0') - parseFloat(b.balance || '0');
          break;
        case 'value':
          cmp =
            parseFloat(a.originalValue || '0') -
            parseFloat(b.originalValue || '0');
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [assets, sortField, sortDir]);

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

  return (
    <div
      className={clsx(
        'relative overflow-hidden rounded-2xl',
        'bg-[#0D0F14]/80 backdrop-blur-xl',
        'border border-white/[0.06]',
      )}
    >
      {/* Top gradient accent */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />

      {/* Responsive wrapper -- horizontal scroll on mobile */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]" aria-label="Token holdings">
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
              <th
                scope="col"
                className="px-6 py-4 text-right text-xs font-medium uppercase tracking-wider text-gray-500"
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedAssets.map((asset) => {
              const gradient = getTokenGradient(asset.name ?? '');
              const tokenInitials = (asset.name ?? '')
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w.charAt(0).toUpperCase())
                .join('') || '??';
              const docType = (asset.documentType ?? '').toUpperCase();

              return (
                <tr
                  key={asset.address}
                  className="border-b border-white/[0.04] transition-colors hover:bg-white/[0.02]"
                >
                  {/* Asset name + symbol */}
                  <td className="px-6 py-5">
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
                  </td>

                  {/* Document type */}
                  <td className="px-6 py-5">
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
                  </td>

                  {/* Balance */}
                  <td className="px-6 py-5 text-right">
                    <span className="tabular-nums text-sm font-semibold text-white">
                      {formatBalance(asset.balance ?? '0')}
                    </span>
                  </td>

                  {/* Value */}
                  <td className="px-6 py-5 text-right">
                    <span className="tabular-nums text-sm text-gray-400">
                      ${formatBalance(asset.originalValue ?? '0')}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-5 text-right">
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
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
