/**
 * DeploymentHistoryList -- filterable grid of DeploymentHistoryCard components.
 *
 * Provides a chain filter bar (All + each unique chain present in the
 * deployment list) and renders cards in a responsive two-column grid.
 * Shows an empty state when no deployments exist or when filters yield
 * no results.
 */

import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Inbox, Plus, Search } from 'lucide-react';
import type { DeploymentRecord } from '../../types/contractDeployer';
import { SUPPORTED_NETWORKS } from '../../contracts/addresses';
import { DeploymentHistoryCard } from './DeploymentHistoryCard';

// ---------------------------------------------------------------------------
// Chain name helper (matches the card component)
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

function getChainName(chainId: number): string {
  return CHAIN_NAMES[chainId] ?? SUPPORTED_NETWORKS[chainId]?.name ?? `Chain ${chainId}`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  deployments: DeploymentRecord[];
  onDelete: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DeploymentHistoryList({ deployments, onDelete }: Props) {
  const [selectedChain, setSelectedChain] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Derive unique chain IDs from the deployment list (sorted by chain ID)
  const uniqueChains = useMemo(() => {
    const chainSet = new Set(deployments.map((d) => d.chainId));
    return Array.from(chainSet).sort((a, b) => a - b);
  }, [deployments]);

  // Filter deployments by chain and search query. The list is already
  // sorted newest-first from the persistence layer (prepend on save).
  const filteredDeployments = useMemo(() => {
    let result = deployments;

    if (selectedChain !== null) {
      result = result.filter((d) => d.chainId === selectedChain);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (d) =>
          d.templateName.toLowerCase().includes(q) ||
          d.contractAddress.toLowerCase().includes(q) ||
          d.txHash.toLowerCase().includes(q),
      );
    }

    return result;
  }, [deployments, selectedChain, searchQuery]);

  const handleChainFilter = useCallback((chainId: number | null) => {
    setSelectedChain(chainId);
  }, []);

  // ---- Empty state: no deployments at all ----
  if (deployments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl mb-5 bg-indigo-500/[0.06] border border-indigo-500/10">
          <Inbox className="h-7 w-7 text-gray-600" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-gray-400">
          No contracts deployed yet
        </p>
        <p className="text-xs text-gray-600 mt-2 max-w-[280px] leading-relaxed">
          Deploy your first smart contract using the Fueki Contract Deployer and
          it will appear here.
        </p>
        <Link
          to="/contracts"
          className={clsx(
            'mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-2.5',
            'text-sm font-medium text-white',
            'bg-indigo-500 hover:bg-indigo-400',
            'transition-all duration-200',
            'focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06070A]',
          )}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Deploy a Contract
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ---- Filter bar ---- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Chain filter pills */}
        <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.04] overflow-x-auto">
          <button
            type="button"
            onClick={() => handleChainFilter(null)}
            className={clsx(
              'relative rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all duration-200 whitespace-nowrap',
              selectedChain === null
                ? 'text-white'
                : 'text-gray-500 hover:text-gray-300',
            )}
          >
            {selectedChain === null && (
              <span className="absolute inset-0 rounded-lg bg-indigo-500/20 border border-indigo-500/30" />
            )}
            <span className="relative">All</span>
          </button>

          {uniqueChains.map((chainId) => (
            <button
              key={chainId}
              type="button"
              onClick={() => handleChainFilter(chainId)}
              className={clsx(
                'relative rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all duration-200 whitespace-nowrap',
                selectedChain === chainId
                  ? 'text-white'
                  : 'text-gray-500 hover:text-gray-300',
              )}
            >
              {selectedChain === chainId && (
                <span className="absolute inset-0 rounded-lg bg-indigo-500/20 border border-indigo-500/30" />
              )}
              <span className="relative">{getChainName(chainId)}</span>
            </button>
          ))}
        </div>

        {/* Search input */}
        <div className="relative max-w-xs w-full sm:w-auto">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-600"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search contracts..."
            className={clsx(
              'w-full rounded-xl border border-white/[0.06] bg-[#0D0F14]',
              'pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-600',
              'outline-none transition-all duration-200',
              'focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20',
            )}
          />
        </div>
      </div>

      {/* ---- Card grid ---- */}
      {filteredDeployments.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredDeployments.map((deployment) => (
            <DeploymentHistoryCard
              key={deployment.id}
              deployment={deployment}
              onDelete={onDelete}
            />
          ))}
        </div>
      ) : (
        /* ---- No results for current filter ---- */
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl mb-4 bg-white/[0.03] border border-white/[0.06]">
            <Search className="h-6 w-6 text-gray-600" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium text-gray-400">
            No matching contracts
          </p>
          <p className="text-xs text-gray-600 mt-1.5">
            Try adjusting your filters or search query.
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedChain(null);
              setSearchQuery('');
            }}
            className="mt-4 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}

export default DeploymentHistoryList;
