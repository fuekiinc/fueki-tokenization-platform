/**
 * DeploymentHistoryCard -- glassmorphism card displaying a single deployment record.
 *
 * Shows the template name, truncated contract address with copy button,
 * chain badge, relative deployment date, gas used, and action buttons
 * (explorer link, delete with confirmation).
 *
 * Clicking the card body navigates to the contract interaction page.
 */

import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  Copy,
  Check,
  ExternalLink,
  Trash2,
  Clock,
  Fuel,
  FileCode2,
} from 'lucide-react';
import type { DeploymentRecord } from '../../types/contractDeployer';
import { SUPPORTED_NETWORKS } from '../../contracts/addresses';
import { formatAddress, copyToClipboard } from '../../lib/utils/helpers';

// ---------------------------------------------------------------------------
// Chain name lookup (superset for deployer -- includes chains not in SUPPORTED_NETWORKS)
// ---------------------------------------------------------------------------

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  17000: 'Holesky',
  42161: 'Arbitrum',
  421614: 'Arb Sepolia',
  11155111: 'Sepolia',
  137: 'Polygon',
  8453: 'Base',
  84532: 'Base Sepolia',
  31337: 'Hardhat',
};

// ---------------------------------------------------------------------------
// Chain badge color map
// ---------------------------------------------------------------------------

const CHAIN_BADGE_COLORS: Record<number, string> = {
  1: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  17000: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  42161: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  421614: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  11155111: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  137: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  8453: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  84532: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  31337: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getChainName(chainId: number): string {
  return CHAIN_NAMES[chainId] ?? `Chain ${chainId}`;
}

function getChainBadgeColor(chainId: number): string {
  return CHAIN_BADGE_COLORS[chainId] ?? 'bg-gray-500/10 text-gray-400 border-gray-500/20';
}

function getExplorerUrl(chainId: number, address: string): string {
  const network = SUPPORTED_NETWORKS[chainId];
  if (!network?.blockExplorer) return '';
  return `${network.blockExplorer}/address/${address}`;
}

/**
 * Format a deployment timestamp as a human-readable relative string
 * (e.g. "2 hours ago", "3 days ago") or an absolute date if older than 30 days.
 */
function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = Date.now();
  const diffMs = now - date.getTime();

  if (diffMs < 0 || isNaN(diffMs)) {
    return formatAbsoluteDate(date);
  }

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;

  return formatAbsoluteDate(date);
}

function formatAbsoluteDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatGas(gasUsed: string | undefined): string {
  if (!gasUsed) return '--';
  const num = parseInt(gasUsed, 10);
  if (isNaN(num)) return gasUsed;
  return num.toLocaleString('en-US');
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  deployment: DeploymentRecord;
  onDelete: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DeploymentHistoryCard({ deployment, onDelete }: Props) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const explorerUrl = useMemo(
    () => getExplorerUrl(deployment.chainId, deployment.contractAddress),
    [deployment.chainId, deployment.contractAddress],
  );

  const handleCopyAddress = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      void copyToClipboard(deployment.contractAddress).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    },
    [deployment.contractAddress],
  );

  const handleNavigate = useCallback(() => {
    navigate(`/contracts/${deployment.chainId}/${deployment.contractAddress}`);
  }, [navigate, deployment.chainId, deployment.contractAddress]);

  const handleExplorerClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (explorerUrl) {
        window.open(explorerUrl, '_blank', 'noopener,noreferrer');
      }
    },
    [explorerUrl],
  );

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (confirmDelete) {
        onDelete(deployment.id);
        setConfirmDelete(false);
      } else {
        setConfirmDelete(true);
        // Auto-dismiss confirmation after 3 seconds
        setTimeout(() => setConfirmDelete(false), 3000);
      }
    },
    [confirmDelete, deployment.id, onDelete],
  );

  return (
    <button
      type="button"
      onClick={handleNavigate}
      className={clsx(
        'group/card relative w-full overflow-hidden text-left',
        'bg-[#0D0F14]/80 backdrop-blur-xl',
        'border border-white/[0.06] rounded-2xl p-5',
        'transition-all duration-300 ease-out',
        'hover:border-white/[0.10] hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5',
        'focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06070A]',
        'outline-none',
      )}
      aria-label={`View ${deployment.templateName} deployed on ${getChainName(deployment.chainId)}`}
    >
      {/* Gradient accent line */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent" />

      {/* ---- Header row: Template name + chain badge ---- */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/[0.08]">
            <FileCode2 className="h-4 w-4 text-indigo-400" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-white tracking-tight truncate">
              {deployment.templateName}
            </h3>
          </div>
        </div>

        <span
          className={clsx(
            'inline-flex items-center shrink-0 rounded-full px-2.5 py-1',
            'text-[10px] font-semibold uppercase tracking-wide border',
            getChainBadgeColor(deployment.chainId),
          )}
        >
          {getChainName(deployment.chainId)}
        </span>
      </div>

      {/* ---- Contract address row ---- */}
      <div className="mt-4 flex items-center gap-2">
        <span className="font-mono text-sm text-gray-400 truncate">
          {formatAddress(deployment.contractAddress)}
        </span>
        <button
          type="button"
          onClick={handleCopyAddress}
          className={clsx(
            'shrink-0 flex h-6 w-6 items-center justify-center rounded-md',
            'text-gray-600 transition-all duration-200',
            'hover:text-gray-300 hover:bg-white/[0.06]',
            'focus-visible:ring-1 focus-visible:ring-indigo-400',
            'outline-none',
          )}
          aria-label={copied ? 'Address copied' : 'Copy contract address'}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* ---- Metadata row: Date + Gas ---- */}
      <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          <time dateTime={deployment.deployedAt}>
            {formatRelativeDate(deployment.deployedAt)}
          </time>
        </span>
        {deployment.gasUsed && (
          <span className="inline-flex items-center gap-1.5">
            <Fuel className="h-3.5 w-3.5" aria-hidden="true" />
            {formatGas(deployment.gasUsed)} gas
          </span>
        )}
      </div>

      {/* ---- Action buttons ---- */}
      <div className="mt-4 flex items-center gap-2 border-t border-white/[0.04] pt-4">
        {explorerUrl && (
          <button
            type="button"
            onClick={handleExplorerClick}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5',
              'text-[11px] font-medium text-gray-400',
              'bg-white/[0.03] border border-white/[0.04]',
              'transition-all duration-200',
              'hover:bg-white/[0.06] hover:text-white hover:border-white/[0.08]',
              'focus-visible:ring-1 focus-visible:ring-indigo-400',
              'outline-none',
            )}
            aria-label="View on block explorer"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            Explorer
          </button>
        )}

        <div className="flex-1" />

        <button
          type="button"
          onClick={handleDeleteClick}
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5',
            'text-[11px] font-medium',
            'transition-all duration-200',
            'focus-visible:ring-1 focus-visible:ring-red-400',
            'outline-none',
            confirmDelete
              ? 'bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25'
              : 'text-gray-500 bg-white/[0.02] border border-white/[0.04] hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20',
          )}
          aria-label={confirmDelete ? 'Click again to confirm deletion' : 'Delete deployment record'}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          {confirmDelete ? 'Confirm?' : 'Delete'}
        </button>
      </div>
    </button>
  );
}

export default DeploymentHistoryCard;
