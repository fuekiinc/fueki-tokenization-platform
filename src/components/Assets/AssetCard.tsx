import clsx from 'clsx';
import { Send, Flame, ExternalLink, Copy } from 'lucide-react';
import type { WrappedAsset } from '../../types/index';
import { formatBalance, formatAddress, copyToClipboard } from '../../lib/utils/helpers';
import Badge from '../Common/Badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AssetCardProps {
  asset: WrappedAsset;
  onTransfer: (asset: WrappedAsset) => void;
  onBurn: (asset: WrappedAsset) => void;
  onViewExplorer: (asset: WrappedAsset) => void;
  onSelect?: (asset: WrappedAsset) => void;
  isExpanded?: boolean;
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

function getDocBadgeVariant(
  docType: string,
): 'info' | 'success' | 'warning' | 'default' {
  const lower = docType.toLowerCase();
  if (lower === 'json') return 'info';
  if (lower === 'csv') return 'success';
  if (lower === 'xml') return 'warning';
  return 'default';
}

function getTokenGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return GRADIENT_PALETTES[Math.abs(hash) % GRADIENT_PALETTES.length];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AssetCard({
  asset,
  onTransfer,
  onBurn,
  onViewExplorer,
  onSelect,
  isExpanded = false,
}: AssetCardProps) {
  const balanceFormatted = formatBalance(asset.balance ?? '0');
  const valueFormatted = formatBalance(asset.originalValue ?? '0');
  const assetName = asset.name ?? '';
  const tokenInitials = assetName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('') || '??';
  const gradient = getTokenGradient(assetName);
  const docType = (asset.documentType ?? '').toUpperCase();

  return (
    <div
      className={clsx(
        'group relative overflow-hidden',
        // Glass card
        'bg-[#0D0F14]/80 backdrop-blur-xl border border-white/[0.06] rounded-2xl',
        // Hover state
        'hover:border-white/[0.1] hover:-translate-y-0.5 transition-all duration-200',
        'hover:shadow-[0_8px_40px_-8px_rgba(99,102,241,0.10)]',
        onSelect && 'cursor-pointer',
      )}
      onClick={() => onSelect?.(asset)}
    >
      {/* Top gradient accent -- visible on hover */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

      {/* Card body */}
      <div className="p-7 sm:p-9">
        {/* ---- Token avatar ---- */}
        <div className="flex flex-col items-center text-center">
          <div
            className={clsx(
              'flex h-14 w-14 shrink-0 items-center justify-center rounded-full',
              'bg-gradient-to-br shadow-lg',
              gradient,
              'text-sm font-bold tracking-wide text-white',
            )}
          >
            {tokenInitials}
          </div>

          {/* Token name */}
          <h3 className="min-w-0 truncate text-lg font-bold text-white mt-5 max-w-full">
            {asset.name}
          </h3>

          {/* Token symbol */}
          <p className="text-sm text-gray-400 mt-1">{asset.symbol}</p>

          {/* Document type badge */}
          {docType && (
            <div className="mt-3">
              <Badge variant={getDocBadgeVariant(asset.documentType ?? '')} size="sm">
                {docType}
              </Badge>
            </div>
          )}
        </div>

        {/* ---- Stats section ---- */}
        <div className="mt-6">
          {/* Balance */}
          <div className="py-3 border-t border-white/[0.04]">
            <div className="flex items-baseline justify-between min-w-0">
              <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
                Balance
              </span>
              <span className="text-2xl font-bold font-mono text-white truncate ml-4">
                {balanceFormatted}
              </span>
            </div>
          </div>

          {/* Original value */}
          <div className="py-3 border-t border-white/[0.04]">
            <div className="flex items-baseline justify-between min-w-0">
              <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
                Original Value
              </span>
              <span className="text-sm font-mono text-gray-400 truncate ml-4">
                {valueFormatted}
              </span>
            </div>
          </div>

          {/* Address */}
          <div className="py-3 border-t border-white/[0.04]">
            <div className="flex items-center justify-between min-w-0">
              <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
                Contract
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  copyToClipboard(asset.address);
                }}
                className="flex items-center gap-1.5 min-w-0 ml-4 group/addr"
                title={asset.address}
              >
                <span className="font-mono text-xs text-gray-500 truncate transition-colors group-hover/addr:text-gray-300">
                  {formatAddress(asset.address)}
                </span>
                <Copy className="h-3 w-3 shrink-0 text-gray-600 transition-colors group-hover/addr:text-gray-400" />
              </button>
            </div>
          </div>
        </div>

        {/* ---- Action buttons ---- */}
        <div className="mt-5 flex gap-2.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTransfer(asset);
            }}
            className={clsx(
              'flex flex-1 items-center justify-center gap-1.5 rounded-xl px-4 py-2.5',
              'border border-indigo-500/10 bg-indigo-500/[0.06] text-xs font-medium text-indigo-400',
              'transition-all duration-200 hover:border-indigo-500/25 hover:bg-indigo-500/[0.12] hover:shadow-sm hover:shadow-indigo-500/10',
            )}
          >
            <Send className="h-3.5 w-3.5" />
            Transfer
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onBurn(asset);
            }}
            className={clsx(
              'flex flex-1 items-center justify-center gap-1.5 rounded-xl px-4 py-2.5',
              'border border-red-500/10 bg-red-500/[0.06] text-xs font-medium text-red-400',
              'transition-all duration-200 hover:border-red-500/25 hover:bg-red-500/[0.12] hover:shadow-sm hover:shadow-red-500/10',
            )}
          >
            <Flame className="h-3.5 w-3.5" />
            Burn
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewExplorer(asset);
            }}
            className={clsx(
              'flex items-center justify-center rounded-xl px-3 py-2.5',
              'border border-white/[0.06] bg-white/[0.03] text-gray-500',
              'transition-all duration-200 hover:border-white/[0.10] hover:bg-white/[0.06] hover:text-gray-300',
            )}
            title="View on Explorer"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* ---- Expandable detail section ---- */}
        {isExpanded && (
          <div className="mt-6 space-y-0 border-t border-white/[0.04]">
            <DetailRow
              label="Contract"
              value={asset.address}
              displayValue={formatAddress(asset.address)}
              mono
              copiable
            />
            <DetailRow
              label="Document Hash"
              value={asset.documentHash}
              displayValue={formatAddress(asset.documentHash)}
              mono
              copiable
            />
            <DetailRow
              label="Total Supply"
              value={formatBalance(asset.totalSupply)}
            />
            <DetailRow label="Original Value" value={valueFormatted} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component
// ---------------------------------------------------------------------------

function DetailRow({
  label,
  value,
  displayValue,
  mono = false,
  copiable = false,
}: {
  label: string;
  value: string;
  displayValue?: string;
  mono?: boolean;
  copiable?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-t border-white/[0.04] min-w-0">
      <span className="text-xs font-medium uppercase tracking-wider text-gray-500 shrink-0">
        {label}
      </span>
      {copiable ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            copyToClipboard(value);
          }}
          className={clsx(
            'flex items-center gap-1.5 min-w-0 ml-4 group/row',
            'text-gray-400 transition-colors hover:text-white',
            mono && 'font-mono',
          )}
          title={value}
        >
          <span className="truncate text-xs">{displayValue ?? value}</span>
          <Copy className="h-3 w-3 shrink-0 text-gray-600 transition-colors group-hover/row:text-gray-400" />
        </button>
      ) : (
        <span
          className={clsx(
            'truncate text-xs text-gray-400 ml-4 min-w-0',
            mono && 'font-mono',
          )}
          title={value}
        >
          {displayValue ?? value}
        </span>
      )}
    </div>
  );
}
