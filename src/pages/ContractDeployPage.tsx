/**
 * Contract Deployment Page -- `/contracts/deploy/:templateId`
 *
 * Loads a contract template by URL parameter, initializes the deployment
 * wizard store, and renders the DeployWizard orchestrator component.
 *
 * On mount:  sets the active template ID in the deployer store.
 * On unmount: resets the wizard state so the next visit starts fresh.
 */

import { useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowLeft, Sparkles, AlertCircle } from 'lucide-react';

import { getTemplateById } from '../contracts/templates';
import { useContractDeployerStore } from '../store/contractDeployerStore';
import { DeployWizard } from '../components/ContractDeployer/DeployWizard';

// ---------------------------------------------------------------------------
// Category badge styling
// ---------------------------------------------------------------------------

const CATEGORY_STYLES: Record<string, { label: string; className: string }> = {
  tokens: {
    label: 'Token',
    className: 'border-indigo-500/15 bg-indigo-500/[0.06] text-indigo-300/90',
  },
  nfts: {
    label: 'NFT',
    className: 'border-purple-500/15 bg-purple-500/[0.06] text-purple-300/90',
  },
  staking: {
    label: 'Staking',
    className: 'border-emerald-500/15 bg-emerald-500/[0.06] text-emerald-300/90',
  },
  trading: {
    label: 'Trading',
    className: 'border-amber-500/15 bg-amber-500/[0.06] text-amber-300/90',
  },
  utility: {
    label: 'Utility',
    className: 'border-cyan-500/15 bg-cyan-500/[0.06] text-cyan-300/90',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ContractDeployPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  const template = templateId ? getTemplateById(templateId) : undefined;

  // Store actions
  const setActiveTemplate = useContractDeployerStore((s) => s.setActiveTemplate);
  const resetWizard = useContractDeployerStore((s) => s.resetWizard);
  const loadHistory = useContractDeployerStore((s) => s.loadHistory);

  // On mount: set the active template and load deployment history.
  // On unmount: reset wizard state for a clean slate.
  useEffect(() => {
    if (templateId) {
      setActiveTemplate(templateId);
    }
    loadHistory();

    return () => {
      resetWizard();
    };
    // Only run on mount/unmount and when the template ID changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  // -----------------------------------------------------------------------
  // 404 state: template not found
  // -----------------------------------------------------------------------

  if (!template) {
    return (
      <div className="w-full max-w-3xl mx-auto">
        <div className="text-center py-20">
          <div className="flex items-center justify-center mb-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 ring-4 ring-red-500/20">
              <AlertCircle
                className="h-8 w-8 text-red-400"
                aria-hidden="true"
              />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-white mb-3">
            Template Not Found
          </h1>
          <p className="text-sm text-gray-500 mb-8 max-w-md mx-auto">
            The contract template{' '}
            {templateId ? (
              <code className="text-gray-400 bg-white/[0.05] px-1.5 py-0.5 rounded text-xs">
                {templateId}
              </code>
            ) : (
              'you requested'
            )}{' '}
            does not exist or has been removed.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/contracts"
              className={clsx(
                'flex items-center gap-2',
                'bg-indigo-600 hover:bg-indigo-500',
                'text-white rounded-xl px-6 py-3 font-medium transition-colors',
              )}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Browse Templates
            </Link>

            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] text-white rounded-xl px-6 py-3 font-medium transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Normal state: render page header + wizard
  // -----------------------------------------------------------------------

  const categoryStyle = CATEGORY_STYLES[template.category] ?? {
    label: template.category,
    className: 'border-gray-500/15 bg-gray-500/[0.06] text-gray-300/90',
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Page header */}
      <header className="mb-12 text-center sm:mb-16">
        {/* Back link */}
        <div className="mb-6 flex justify-start">
          <Link
            to="/contracts"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            All Templates
          </Link>
        </div>

        {/* Category badge */}
        <div className="mb-4 flex items-center justify-center">
          <div
            className={clsx(
              'flex items-center gap-2.5 rounded-full border px-4 py-1.5',
              categoryStyle.className,
            )}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="text-xs font-medium tracking-wide">
              {categoryStyle.label}
            </span>
          </div>
        </div>

        {/* Template name */}
        <h1 className="mb-5 bg-gradient-to-r from-indigo-300 via-violet-300 to-purple-300 bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl md:text-4xl">
          Deploy {template.name}
        </h1>

        {/* Description */}
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          {template.description}
        </p>
      </header>

      {/* Wizard */}
      <DeployWizard template={template} />
    </div>
  );
}
