import { ExternalLink, History, Clock, Copy, Check } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useTradeStore } from '../../store/tradeStore.ts';
import { useWallet } from '../../hooks/useWallet';
import { formatAddress, copyToClipboard } from '../../lib/utils/helpers';
import { formatTokenAmount } from '../../lib/formatters';
import { getNetworkMetadata } from '../../contracts/addresses';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute a human-readable "time ago" string from a timestamp */
function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

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

function CopyButton({ text }: { text: string }) {
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
      className="flex h-9 w-9 min-h-[44px] min-w-[44px] items-center justify-center rounded-lg bg-white/[0.04] border border-white/[0.06] text-gray-500 transition-all hover:bg-white/[0.08] hover:text-gray-300 focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06070A]"
      aria-label="Copy transaction hash"
      title="Copy transaction hash"
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-400" />
      ) : (
        <Copy className="h-3 w-3" />
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
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-gray-500/10 to-gray-600/10 border border-white/[0.06]">
          <History className="h-7 w-7 text-gray-600" />
        </div>
        <p className="text-sm font-semibold text-gray-400">
          No minting activity yet
        </p>
        <p className="mt-2.5 max-w-xs text-sm text-gray-600 leading-relaxed">
          When you mint wrapped assets, your transaction history will appear here
        </p>
      </div>
    );
  }

  // ---- List ---------------------------------------------------------------

  return (
    <div className="space-y-6">
      {mintTrades.map((trade) => {
        const status = statusConfig[trade.status] ?? statusConfig.pending;

        return (
          <div
            key={trade.id}
            className="group rounded-2xl bg-[#0D0F14]/80 backdrop-blur-xl border border-white/[0.06] p-4 sm:p-7 transition-all duration-200 hover:bg-[#0D0F14] hover:border-white/[0.1]"
          >
            {/* Top row: Name + Symbol + Status */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <span className="truncate text-sm font-semibold text-white">
                    {trade.asset}
                  </span>
                  <span className="shrink-0 inline-flex items-center rounded-lg bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-bold text-indigo-400 ring-1 ring-inset ring-indigo-500/20 uppercase tracking-wide">
                    {trade.assetSymbol}
                  </span>
                </div>

                {/* Amount + Timestamp row */}
                <div className="mt-2.5 flex items-center gap-3 text-xs text-gray-500">
                  <span className="font-medium text-gray-300 tabular-nums font-mono">
                    {isNaN(Number(trade.amount))
                      ? trade.amount
                      : formatTokenAmount(trade.amount)}
                  </span>
                  <span className="text-gray-600">tokens minted</span>
                  <span className="text-gray-700">&middot;</span>
                  <span className="inline-flex items-center gap-1.5 text-gray-500">
                    <Clock className="h-3 w-3" />
                    {timeAgo(trade.timestamp)}
                  </span>
                </div>
              </div>

              {/* Status badge */}
              <span
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-full ${status.bg} px-3 py-1.5 text-[11px] font-semibold ${status.text} ring-1 ring-inset ${status.ring}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${status.dot} ${trade.status === 'pending' ? 'animate-pulse motion-reduce:animate-none' : ''}`} />
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
                  className="group inline-flex items-center gap-2 font-mono text-xs text-indigo-400 transition-colors hover:text-indigo-300 truncate"
                  title={trade.txHash}
                >
                  {formatAddress(trade.txHash)}
                  <ExternalLink className="h-3 w-3 shrink-0 transition-transform group-hover:translate-x-0.5" />
                </a>
              ) : (
                <span className="font-mono text-xs text-gray-500 truncate" title={trade.txHash}>
                  {formatAddress(trade.txHash)}
                </span>
              )}

              <div className="flex items-center gap-2 ml-auto shrink-0">
                <CopyButton text={trade.txHash} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
