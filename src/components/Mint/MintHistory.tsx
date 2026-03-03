import { Check, Clock, Copy, ExternalLink, History } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTradeStore } from '../../store/tradeStore.ts';
import { useWallet } from '../../hooks/useWallet';
import { copyToClipboard, formatAddress } from '../../lib/utils/helpers';
import { formatDateTime, formatRelativeDate, formatTokenAmount } from '../../lib/formatters';
import { getNetworkMetadata } from '../../contracts/addresses';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Status color config */
const statusConfig = {
  confirmed: {
    dot: 'bg-emerald-400',
    bg: 'bg-emerald-500/[0.08]',
    text: 'text-emerald-400',
    ring: 'ring-emerald-500/20',
    label: 'Confirmed',
  },
  pending: {
    dot: 'bg-amber-400',
    bg: 'bg-amber-500/[0.08]',
    text: 'text-amber-400',
    ring: 'ring-amber-500/20',
    label: 'Pending',
  },
  failed: {
    dot: 'bg-red-400',
    bg: 'bg-red-500/[0.08]',
    text: 'text-red-400',
    ring: 'ring-red-500/20',
    label: 'Failed',
  },
} as const;

// ---------------------------------------------------------------------------
// CopyButton sub-component
// ---------------------------------------------------------------------------

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => { clearTimeout(timerRef.current); };
  }, []);

  const handleCopy = () => {
    void copyToClipboard(text);
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex h-9 w-9 min-h-[44px] min-w-[44px] items-center justify-center rounded-lg bg-white/[0.04] border border-white/[0.06] text-gray-500 transition-all hover:bg-white/[0.08] hover:text-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06070A]"
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-400" aria-hidden="true" />
      ) : (
        <Copy className="h-3 w-3" aria-hidden="true" />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MintHistory() {
  const tradeHistory = useTradeStore((s) => s.tradeHistory);
  const { chainId } = useWallet();

  // Use getNetworkMetadata (not getNetworkConfig) so the block explorer URL
  // is available even on chains where the platform contracts are not deployed.
  const blockExplorer = chainId
    ? getNetworkMetadata(chainId)?.blockExplorer ?? ''
    : '';

  const mintTrades = tradeHistory
    .filter((t) => t.type === 'mint')
    .sort((a, b) => b.timestamp - a.timestamp);

  // ---- Empty state --------------------------------------------------------

  if (mintTrades.length === 0) {
    return (
      <section aria-label="Minting history" className="flex flex-col items-center justify-center py-12 sm:py-20 text-center px-4">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-gray-500/10 to-gray-600/10 border border-white/[0.06]">
          <History className="h-7 w-7 text-gray-600" aria-hidden="true" />
        </div>
        <h3 className="text-sm font-semibold text-gray-400">
          No minting activity yet
        </h3>
        <p className="mt-2.5 max-w-xs text-sm text-gray-600 leading-relaxed">
          Upload a document and mint your first token to see your transaction history here
        </p>
      </section>
    );
  }

  // ---- List ---------------------------------------------------------------

  return (
    <section aria-label="Minting history">
      <h3 className="sr-only">Mint transaction history</h3>

      {/* Responsive: card list on mobile, structured data on all sizes */}
      <div className="space-y-4 sm:space-y-6" role="list" aria-label={`${mintTrades.length} mint transaction${mintTrades.length !== 1 ? 's' : ''}`}>
        {mintTrades.map((trade) => {
          const status = statusConfig[trade.status] ?? statusConfig.pending;
          const timeAgo = formatRelativeDate(trade.timestamp);
          const fullDateTime = formatDateTime(trade.timestamp);

          return (
            <article
              key={trade.id}
              role="listitem"
              className="group rounded-2xl bg-[#0D0F14]/80 backdrop-blur-xl border border-white/[0.06] p-4 sm:p-7 transition-all duration-200 hover:bg-[#0D0F14] hover:border-white/[0.1]"
              aria-label={`${trade.asset} (${trade.assetSymbol}): ${formatTokenAmount(trade.amount)} tokens - ${status.label}`}
            >
              {/* Top row: Name + Symbol + Status */}
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <span className="truncate text-sm font-semibold text-white">
                      {trade.asset}
                    </span>
                    <span className="shrink-0 inline-flex items-center rounded-lg bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-bold text-indigo-400 ring-1 ring-inset ring-indigo-500/20 uppercase tracking-wide">
                      {trade.assetSymbol}
                    </span>
                  </div>

                  {/* Amount + Timestamp row */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-gray-500">
                    <span className="font-medium text-gray-300 tabular-nums font-mono">
                      {isNaN(Number(trade.amount))
                        ? trade.amount
                        : formatTokenAmount(trade.amount)}
                    </span>
                    <span className="text-gray-600">tokens minted</span>
                    <span className="text-gray-700" aria-hidden="true">&middot;</span>
                    <span className="inline-flex items-center gap-1.5 text-gray-500">
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      <time dateTime={new Date(trade.timestamp).toISOString()} title={fullDateTime}>
                        {timeAgo}
                      </time>
                    </span>
                  </div>
                </div>

                {/* Status badge -- includes text label, not just color */}
                <span
                  className={`shrink-0 inline-flex items-center gap-1.5 rounded-full ${status.bg} px-3 py-1.5 text-[11px] font-semibold ${status.text} ring-1 ring-inset ${status.ring}`}
                  role="status"
                  aria-label={`Transaction status: ${status.label}`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${status.dot} ${trade.status === 'pending' ? 'animate-pulse motion-reduce:animate-none' : ''}`}
                    aria-hidden="true"
                  />
                  {status.label}
                </span>
              </div>

              {/* Bottom row: Tx hash with copy + explorer link */}
              <div className="mt-4 flex items-center gap-3 pt-4 border-t border-white/[0.04]">
                {blockExplorer ? (
                  <a
                    href={`${blockExplorer}/tx/${trade.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group/link inline-flex items-center gap-2 font-mono text-xs text-indigo-400 transition-colors hover:text-indigo-300 truncate min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg px-1"
                    aria-label={`View transaction ${formatAddress(trade.txHash)} on block explorer (opens in new tab)`}
                  >
                    {formatAddress(trade.txHash)}
                    <ExternalLink className="h-3 w-3 shrink-0 transition-transform group-hover/link:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
                  </a>
                ) : (
                  <span className="font-mono text-xs text-gray-500 truncate" title={trade.txHash}>
                    {formatAddress(trade.txHash)}
                  </span>
                )}

                <div className="flex items-center gap-2 ml-auto shrink-0">
                  <CopyButton text={trade.txHash} label="transaction hash" />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
