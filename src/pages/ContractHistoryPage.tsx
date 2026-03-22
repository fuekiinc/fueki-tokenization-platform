import { useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { AlertCircle, Plus, ScrollText } from 'lucide-react';
import { deleteDeploymentFromBackend } from '../lib/api/deployments';
import { DeploymentHistoryList } from '../components/ContractDeployer/DeploymentHistoryList';
import Spinner from '../components/Common/Spinner';
import { createAdaptivePollingLoop } from '../lib/rpc/polling';
import { emitRpcRefetch, subscribeToRpcRefetch } from '../lib/rpc/refetchEvents';
import { useContractDeployerStore } from '../store/contractDeployerStore';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ContractHistoryPage() {
  const deployments = useContractDeployerStore((s) => s.deploymentHistory);
  const isLoading = useContractDeployerStore((s) => s.isLoading);
  const error = useContractDeployerStore((s) => s.error);
  const loadHistory = useContractDeployerStore((s) => s.loadHistory);
  const removeDeployment = useContractDeployerStore((s) => s.removeDeployment);

  // Load deployment history from localStorage immediately, then merge with
  // backend records (which may contain deployments from other devices or
  // sessions where localStorage was cleared).
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
  }, [loadHistory]);

  // Delete a deployment record and update local state
  const handleDelete = useCallback((id: string) => {
    removeDeployment(id);
    void deleteDeploymentFromBackend(id);
    emitRpcRefetch(['history']);
  }, [removeDeployment]);

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
      {error && (
        <div
          className="mb-6 flex items-start gap-4 rounded-2xl border border-red-500/15 bg-red-500/[0.05] p-5"
          role="alert"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 ring-1 ring-red-500/20">
            <AlertCircle className="h-5 w-5 text-red-400" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-red-300">
              Unable to load deployment history
            </p>
            <p className="mt-1 text-sm leading-relaxed text-red-300/70">
              {error}
            </p>
          </div>
        </div>
      )}

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

        {isLoading && deployments.length === 0 ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 text-center">
            <Spinner size="lg" label="Loading deployment history" />
            <div>
              <p className="text-sm font-semibold text-gray-200">
                Loading deployment history
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Restoring your saved contract metadata and syncing with the backend.
              </p>
            </div>
          </div>
        ) : (
          <DeploymentHistoryList
            deployments={deployments}
            onDelete={handleDelete}
          />
        )}
      </div>
    </div>
  );
}
