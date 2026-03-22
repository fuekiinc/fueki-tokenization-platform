/**
 * ContractBrowserPage -- Template browser page for the Smart Contract Deployer.
 *
 * Displays a searchable, filterable grid of deployable contract templates.
 * Layout matches the PortfolioPage pattern:
 *   - Page badge, title, subtitle
 *   - Optional action buttons (deployment history link)
 *   - TemplateSearch (search input + category pills)
 *   - TemplateBrowser (filtered grid of TemplateCards)
 */

import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { AlertCircle, ArrowRight, FileCode2, History } from 'lucide-react';
import { useContractDeployerStore } from '../store/contractDeployerStore';
import { TemplateSearch } from '../components/ContractDeployer/TemplateSearch';
import { TemplateBrowser } from '../components/ContractDeployer/TemplateBrowser';
import { BADGE_CLASSES } from '../lib/designTokens';
import type { TemplateCategory } from '../types/contractDeployer';
import { createAdaptivePollingLoop } from '../lib/rpc/polling';
import { subscribeToRpcRefetch } from '../lib/rpc/refetchEvents';
import Spinner from '../components/Common/Spinner';
import { useWalletStore } from '../store/walletStore';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ContractBrowserPage() {
  const navigate = useNavigate();

  // Store state & actions
  const searchQuery = useContractDeployerStore((s) => s.searchQuery);
  const selectedCategory = useContractDeployerStore((s) => s.selectedCategory);
  const setSearchQuery = useContractDeployerStore((s) => s.setSearchQuery);
  const setCategory = useContractDeployerStore((s) => s.setCategory);
  const loadHistory = useContractDeployerStore((s) => s.loadHistory);
  const deploymentHistoryTotal = useContractDeployerStore((s) => s.deploymentHistoryTotal);
  const isLoading = useContractDeployerStore((s) => s.isLoading);
  const error = useContractDeployerStore((s) => s.error);
  const walletAddress = useWalletStore((s) => s.wallet.address);

  // Load deployment history on mount so the history count is accurate.
  useEffect(() => {
    void loadHistory();
    const poller = createAdaptivePollingLoop({
      tier: 'low',
      poll: loadHistory,
      immediate: false,
    });
    const unsubscribeRefetch = subscribeToRpcRefetch(['history'], () => {
      poller.triggerNow();
    });
    return () => {
      unsubscribeRefetch();
      poller.cancel();
    };
  }, [loadHistory, walletAddress]);

  // Handlers
  const handleSearchChange = useCallback(
    (query: string) => setSearchQuery(query),
    [setSearchQuery],
  );

  const handleCategoryChange = useCallback(
    (category: TemplateCategory | 'all') => setCategory(category),
    [setCategory],
  );

  return (
    <div className="w-full">
      {/* ================================================================== */}
      {/* Page Header                                                        */}
      {/* ================================================================== */}
      <div className="mb-12 sm:mb-16">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {/* Badge */}
            <span
              className={clsx(
                BADGE_CLASSES.base,
                BADGE_CLASSES.accent,
                'mb-4 inline-flex',
              )}
            >
              <FileCode2 className="mr-1.5 h-3 w-3" />
              Smart Contracts
            </span>

            {/* Title */}
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Contract Deployer
            </h1>

            {/* Subtitle */}
            <p className="mt-3 max-w-xl text-base leading-relaxed text-gray-500">
              Choose a pre-audited smart contract template and deploy it to any
              supported EVM chain in minutes. No Solidity required.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/contracts/history')}
              className={clsx(
                'group/btn inline-flex items-center gap-2.5 rounded-full',
                'border border-white/[0.06] bg-[#0D0F14]/80 backdrop-blur-xl',
                'px-5 py-2.5',
                'transition-all duration-200',
                'hover:border-white/[0.12] hover:bg-white/[0.04]',
                'focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06070A]',
                'outline-none',
              )}
              aria-label="View deployment history"
            >
              <div
                className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/20 to-violet-500/20"
                aria-hidden="true"
              >
                <History className="h-3 w-3 text-indigo-400" />
              </div>
              <span className="text-sm text-gray-400 transition-colors group-hover/btn:text-white">
                History
              </span>
              {isLoading && (
                <Spinner
                  size="xs"
                  label="Loading deployment history"
                  className="text-indigo-400"
                />
              )}
              {deploymentHistoryTotal > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-500/15 px-1.5 text-[10px] font-semibold tabular-nums text-indigo-400 border border-indigo-500/20">
                  {deploymentHistoryTotal}
                </span>
              )}
              <ArrowRight
                className="h-3.5 w-3.5 text-gray-600 transition-colors group-hover/btn:text-gray-400"
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div
          className="mb-8 flex items-start gap-4 rounded-2xl border border-red-500/15 bg-red-500/[0.05] p-5"
          role="alert"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 ring-1 ring-red-500/20">
            <AlertCircle className="h-5 w-5 text-red-400" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-red-300">
              Deployment history sync failed
            </p>
            <p className="mt-1 text-sm leading-relaxed text-red-300/70">
              {error}
            </p>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* Search & Filters                                                   */}
      {/* ================================================================== */}
      <div className="mb-10 sm:mb-12">
        <TemplateSearch
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          selectedCategory={selectedCategory}
          onCategoryChange={handleCategoryChange}
        />
      </div>

      {/* ================================================================== */}
      {/* Template Grid                                                      */}
      {/* ================================================================== */}
      <TemplateBrowser />
    </div>
  );
}
