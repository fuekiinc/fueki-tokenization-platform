import { useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  ArrowUpDown,
  Banknote,
  ChevronDown,
  CircleDot,
  CreditCard,
  FileSearch,
  Hash,
  Receipt,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useDocumentStore } from '../../store/documentStore.ts';
import { formatCurrency, formatDate } from '../../lib/utils/helpers';
import type { ParsedTransaction } from '../../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortField = 'amount' | 'date';
type SortDirection = 'asc' | 'desc';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 15;

/** Maps transaction type strings to display badge colors and icons. */
const TYPE_CONFIG: Record<string, { bg: string; text: string; ring: string; icon: typeof Wallet }> = {
  payment:  { bg: 'bg-blue-500/10',   text: 'text-blue-400',   ring: 'ring-blue-500/20',   icon: CreditCard },
  transfer: { bg: 'bg-violet-500/10',  text: 'text-violet-400',  ring: 'ring-violet-500/20',  icon: ArrowRightLeft },
  deposit:  { bg: 'bg-emerald-500/10', text: 'text-emerald-400', ring: 'ring-emerald-500/20', icon: Wallet },
  withdrawal: { bg: 'bg-amber-500/10', text: 'text-amber-400',  ring: 'ring-amber-500/20',  icon: Banknote },
  invoice:  { bg: 'bg-cyan-500/10',    text: 'text-cyan-400',    ring: 'ring-cyan-500/20',    icon: Receipt },
  fee:      { bg: 'bg-rose-500/10',    text: 'text-rose-400',    ring: 'ring-rose-500/20',    icon: Hash },
};

const DEFAULT_TYPE_CONFIG = {
  bg: 'bg-gray-500/10',
  text: 'text-gray-400',
  ring: 'ring-gray-500/20',
  icon: CircleDot,
};

function getTypeConfig(type: string) {
  return TYPE_CONFIG[type.toLowerCase()] ?? DEFAULT_TYPE_CONFIG;
}


// ---------------------------------------------------------------------------
// Sort button (must be declared outside TransactionPreview to avoid
// re-creating the component on every render)
// ---------------------------------------------------------------------------

function SortButton({
  field,
  label,
  sortField,
  sortDirection,
  onToggle,
}: {
  field: SortField;
  label: string;
  sortField: SortField;
  sortDirection: SortDirection;
  onToggle: (field: SortField) => void;
}) {
  const isActive = sortField === field;
  const dirLabel = isActive ? (sortDirection === 'asc' ? 'ascending' : 'descending') : '';
  return (
    <button
      type="button"
      onClick={() => onToggle(field)}
      aria-label={`Sort by ${label}${dirLabel ? `, currently ${dirLabel}` : ''}`}
      aria-sort={isActive ? (sortDirection === 'asc' ? 'ascending' : 'descending') : undefined}
      className={[
        'inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors',
        isActive
          ? 'text-indigo-400 hover:text-indigo-300'
          : 'text-gray-500 hover:text-gray-300',
      ].join(' ')}
    >
      {label}
      <ArrowUpDown
        className={`h-3 w-3 transition-colors ${
          isActive ? 'text-indigo-400' : 'text-gray-700'
        }`}
        aria-hidden="true"
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TransactionPreview() {
  const currentDocument = useDocumentStore((s) => s.currentDocument);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // ---- Sorting ------------------------------------------------------------

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedTransactions = useMemo<ParsedTransaction[]>(() => {
    if (!currentDocument) return [];

    const txs = [...currentDocument.transactions];

    txs.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'amount') {
        cmp = a.amount - b.amount;
      } else {
        cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return txs;
  }, [currentDocument, sortField, sortDirection]);

  const visibleTransactions = sortedTransactions.slice(0, visibleCount);
  const hasMore = visibleCount < sortedTransactions.length;

  // ---- Empty state --------------------------------------------------------

  if (!currentDocument || currentDocument.transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl bg-[#0D0F14]/80 backdrop-blur-xl border border-white/[0.06] py-20 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06]">
          <FileSearch className="h-7 w-7 text-gray-600" />
        </div>
        <p className="text-sm font-semibold text-gray-400">
          No transactions to display
        </p>
        <p className="mt-2 max-w-[280px] text-xs leading-relaxed text-gray-600">
          Upload and parse a document to preview its transaction data here
        </p>
      </div>
    );
  }

  // ---- Render -------------------------------------------------------------

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------------ */}
      {/* Table container -- glass card                                      */}
      {/* ------------------------------------------------------------------ */}
      <div className="overflow-hidden rounded-2xl bg-[#0D0F14]/80 backdrop-blur-xl border border-white/[0.06]">
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full text-left text-sm">
            {/* Sticky header */}
            <thead className="sticky top-0 z-10 border-b border-white/[0.06] bg-[#0D0F14]/95 backdrop-blur-sm">
              <tr>
                <th className="w-12 px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  #
                </th>
                <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Type
                </th>
                <th className="px-5 py-3.5">
                  <SortButton field="amount" label="Amount" sortField={sortField} sortDirection={sortDirection} onToggle={toggleSort} />
                </th>
                <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Currency
                </th>
                <th className="px-5 py-3.5">
                  <SortButton field="date" label="Date" sortField={sortField} sortDirection={sortDirection} onToggle={toggleSort} />
                </th>
                <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Description
                </th>
              </tr>
            </thead>

            {/* Body with alternating rows */}
            <tbody>
              {visibleTransactions.map((tx, index) => {
                const cfg = getTypeConfig(tx.type);
                const TypeIcon = cfg.icon;
                const isEven = index % 2 === 0;

                return (
                  <tr
                    key={tx.id}
                    className={[
                      'transition-colors hover:bg-indigo-500/[0.04]',
                      isEven ? 'bg-transparent' : 'bg-white/[0.01]',
                    ].join(' ')}
                  >
                    {/* Row number */}
                    <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs tabular-nums text-gray-600">
                      {index + 1}
                    </td>

                    {/* Type badge */}
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold capitalize ring-1 ${cfg.bg} ${cfg.text} ${cfg.ring}`}
                      >
                        <TypeIcon className="h-3 w-3" />
                        {tx.type}
                      </span>
                    </td>

                    {/* Amount -- right-aligned within column for easy scanning */}
                    <td className="whitespace-nowrap px-5 py-3.5 text-right font-mono text-sm font-medium tabular-nums text-white">
                      {formatCurrency(tx.amount, tx.currency)}
                    </td>

                    {/* Currency */}
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <span className="inline-flex rounded-md bg-white/[0.04] px-2 py-0.5 text-[11px] font-semibold tracking-wide text-gray-400 ring-1 ring-white/[0.06]">
                        {tx.currency}
                      </span>
                    </td>

                    {/* Date */}
                    <td className="whitespace-nowrap px-5 py-3.5 font-mono text-sm text-gray-400">
                      {formatDate(tx.date)}
                    </td>

                    {/* Description */}
                    <td className="max-w-[240px] truncate px-5 py-3.5 text-sm text-gray-500">
                      {tx.description || '--'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Show more button                                                   */}
      {/* ------------------------------------------------------------------ */}
      {hasMore && (
        <button
          type="button"
          onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
          aria-label={`Show ${Math.min(PAGE_SIZE, sortedTransactions.length - visibleCount)} more transactions`}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-3.5 text-xs font-semibold text-gray-400 transition-all hover:border-white/[0.12] hover:bg-white/[0.04] hover:text-gray-300"
        >
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          Show more ({sortedTransactions.length - visibleCount} remaining)
        </button>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Summary row                                                        */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-2xl bg-[#0D0F14]/80 backdrop-blur-xl border border-white/[0.06] p-7">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">
            {/* Total Transactions */}
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 ring-1 ring-indigo-500/20">
                <TrendingUp className="h-4 w-4 text-indigo-400" />
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
                  Total Transactions
                </p>
                <p className="mt-0.5 text-sm font-bold tabular-nums text-white">
                  {currentDocument.transactions.length}
                </p>
              </div>
            </div>

            <div className="h-10 w-px bg-white/[0.06]" />

            {/* Currency */}
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
                Currency
              </p>
              <p className="mt-0.5 text-sm font-bold text-white">
                {currentDocument.currency}
              </p>
            </div>
          </div>

          {/* Total Value */}
          <div className="text-right">
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Total Value
            </p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-white font-mono">
              {formatCurrency(currentDocument.totalValue, currentDocument.currency)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
