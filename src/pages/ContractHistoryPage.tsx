/**
 * ContractHistoryPage -- page for `/contracts/history`.
 *
 * Displays all previously deployed smart contracts from localStorage.
 * Provides a page header with count badge, subtitle, a CTA link to
 * deploy more contracts, and the filterable DeploymentHistoryList.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Plus, ScrollText } from 'lucide-react';
import {
  loadDeployments,
  removeDeployment,
} from '../lib/contractDeployer/deploymentHistory';
import { DeploymentHistoryList } from '../components/ContractDeployer/DeploymentHistoryList';
import type { DeploymentRecord } from '../types/contractDeployer';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ContractHistoryPage() {
  const [deployments, setDeployments] = useState<DeploymentRecord[]>([]);

  // Load deployment history from localStorage on mount
  useEffect(() => {
    setDeployments(loadDeployments());
  }, []);

  // Delete a deployment record and update local state
  const handleDelete = useCallback((id: string) => {
    removeDeployment(id);
    setDeployments((prev) => prev.filter((d) => d.id !== id));
  }, []);

  return (
    <div className="w-full">
      {/* ================================================================== */}
      {/* Page Header                                                        */}
      {/* ================================================================== */}
      <div className="mb-12 sm:mb-16">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Deployed Contracts
              </h1>
              {deployments.length > 0 && (
                <span
                  className={clsx(
                    'inline-flex items-center justify-center rounded-full',
                    'min-w-[28px] h-7 px-2.5',
                    'text-xs font-semibold tabular-nums',
                    'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20',
                  )}
                >
                  {deployments.length}
                </span>
              )}
            </div>
            <p className="mt-3 text-base leading-relaxed text-gray-500">
              View and interact with your previously deployed contracts
            </p>
          </div>

          <Link
            to="/contracts"
            className={clsx(
              'inline-flex items-center gap-2 rounded-xl shrink-0',
              'px-5 py-3 text-sm font-medium text-white',
              'bg-gradient-to-r from-indigo-500 to-violet-500',
              'shadow-lg shadow-indigo-500/20',
              'transition-all duration-200',
              'hover:shadow-xl hover:shadow-indigo-500/30 hover:-translate-y-0.5',
              'focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06070A]',
            )}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Deploy New Contract
          </Link>
        </div>
      </div>

      {/* ================================================================== */}
      {/* Deployment History                                                 */}
      {/* ================================================================== */}
      <div
        className={clsx(
          'relative overflow-hidden',
          'bg-[#0D0F14]/80 backdrop-blur-xl',
          'border border-white/[0.06] rounded-2xl',
          'p-6 sm:p-8',
        )}
      >
        {/* Gradient accent line */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />

        {/* Section header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/[0.08]">
            <ScrollText className="h-[18px] w-[18px] text-indigo-400" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-white tracking-tight">
              Deployment History
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              {deployments.length === 0
                ? 'No deployments recorded'
                : `${deployments.length} contract${deployments.length === 1 ? '' : 's'} deployed`}
            </p>
          </div>
        </div>

        {/* List component */}
        <DeploymentHistoryList
          deployments={deployments}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}
