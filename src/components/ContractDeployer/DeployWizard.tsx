/**
 * Deploy Wizard -- 3-step orchestrator for the Smart Contract Deployer.
 *
 * Steps:
 *   1. Configure -- constructor parameter form (ConstructorForm)
 *   2. Review    -- parameter summary, gas estimate, deploy button (DeployReview)
 *   3. Success   -- deployed contract details + CTA buttons (DeploySuccess)
 *
 * The wizard reads and writes state through `useContractDeployerStore` so that
 * the page-level component can reset on unmount and the store persists across
 * re-renders.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileSearch,
  Loader2,
  Rocket,
  Settings2,
} from 'lucide-react';
import toast from 'react-hot-toast';

import type {
  ContractDeploymentTemplateType,
  ContractTemplate,
  DeploymentRecord,
} from '../../types/contractDeployer';
import { useContractDeployerStore } from '../../store/contractDeployerStore';
import { validateConstructorParams } from '../../lib/contractDeployer/validation';
import { deployTemplate, waitForDeployment } from '../../lib/contractDeployer/deploy';
import { estimateDeployGas } from '../../lib/contractDeployer/gasEstimate';
import { saveDeploymentToBackend } from '../../lib/api/deployments';
import ConstructorForm from './ConstructorForm';
import DeployReview from './DeployReview';
import { DeploySuccess } from './DeploySuccess';
import { useWalletStore } from '../../store/walletStore';
import { SUPPORTED_NETWORKS } from '../../contracts/addresses';

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

const STEPS = [
  { id: 'configure' as const, label: 'Configure', fullLabel: 'Configure parameters', icon: Settings2 },
  { id: 'review' as const, label: 'Review', fullLabel: 'Review & deploy', icon: FileSearch },
  { id: 'success' as const, label: 'Success', fullLabel: 'Deployment complete', icon: CheckCircle2 },
] as const;

type WizardStepId = (typeof STEPS)[number]['id'];

function stepIndex(stepId: WizardStepId): number {
  return STEPS.findIndex((s) => s.id === stepId);
}

function resolveTemplateType(template: ContractTemplate): ContractDeploymentTemplateType {
  const normalizedId = template.id.toLowerCase();
  const normalizedName = template.name.toLowerCase();
  const normalizedTags = template.tags.map((tag) => tag.toLowerCase());

  if (normalizedId.includes('1404') || normalizedTags.includes('erc1404')) {
    return 'ERC1404';
  }
  if (normalizedId.includes('1155') || normalizedTags.includes('erc1155')) {
    return 'ERC1155';
  }
  if (
    normalizedId.includes('721') ||
    normalizedTags.includes('erc721') ||
    normalizedTags.includes('nft')
  ) {
    return 'ERC721';
  }
  if (normalizedTags.includes('erc20') || normalizedName.includes('token')) {
    return 'ERC20';
  }
  if (normalizedName.includes('staking')) {
    return 'STAKING';
  }
  if (normalizedName.includes('auction')) {
    return 'AUCTION';
  }
  if (normalizedName.includes('escrow')) {
    return 'ESCROW';
  }
  if (normalizedName.includes('split')) {
    return 'SPLITTER';
  }
  if (normalizedName.includes('lottery')) {
    return 'LOTTERY';
  }

  return 'CUSTOM';
}

// ---------------------------------------------------------------------------
// Step indicator (mirrors DeployTokenPage pattern)
// ---------------------------------------------------------------------------

function StepIndicator({ activeStep }: { activeStep: WizardStepId }) {
  const activeIdx = stepIndex(activeStep);
  const currentStepLabel =
    STEPS.find((s) => s.id === activeStep)?.fullLabel ?? '';

  return (
    <nav
      aria-label={`Deploy wizard progress: step ${activeIdx + 1} of ${STEPS.length}, ${currentStepLabel}`}
      className="mx-auto w-full max-w-xl"
    >
      <div aria-live="polite" className="sr-only">
        Step {activeIdx + 1} of {STEPS.length}: {currentStepLabel}
      </div>

      <ol className="flex items-center justify-between">
        {STEPS.map((step, idx) => {
          const StepIcon = step.icon;
          const isCompleted = idx < activeIdx;
          const isCurrent = step.id === activeStep;
          const isUpcoming = idx > activeIdx;

          return (
            <li
              key={step.id}
              className="flex flex-1 items-center"
              aria-current={isCurrent ? 'step' : undefined}
            >
              <div className="flex flex-col items-center gap-2.5">
                <div
                  className={clsx(
                    'relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-500',
                    isCurrent && [
                      'bg-gradient-to-br from-indigo-500 to-violet-600 text-white',
                      'shadow-lg shadow-indigo-500/25 ring-4 ring-indigo-500/10',
                    ],
                    isCompleted && [
                      'bg-emerald-500/15 text-emerald-400',
                      'ring-2 ring-emerald-500/20',
                    ],
                    isUpcoming && [
                      'bg-white/[0.04] text-gray-600',
                      'border border-white/[0.08]',
                    ],
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle2
                      className="h-4.5 w-4.5"
                      aria-hidden="true"
                    />
                  ) : (
                    <StepIcon className="h-4 w-4" aria-hidden="true" />
                  )}
                  {isCurrent && (
                    <span
                      className="absolute inset-0 animate-ping motion-reduce:animate-none rounded-full bg-indigo-500/20 duration-1000"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <span
                  className={clsx(
                    'text-xs font-medium tracking-wide transition-colors duration-300',
                    isCurrent && 'text-indigo-300',
                    isCompleted && 'text-emerald-400/70',
                    isUpcoming && 'text-gray-600',
                  )}
                >
                  <span className="hidden sm:inline">{step.fullLabel}</span>
                  <span className="sm:hidden">{step.label}</span>
                </span>
                <span className="sr-only">
                  {isCompleted
                    ? '(completed)'
                    : isCurrent
                      ? '(current step)'
                      : '(upcoming)'}
                </span>
              </div>

              {idx < STEPS.length - 1 && (
                <div
                  className="relative mx-2 mb-7 h-px flex-1 sm:mx-4"
                  aria-hidden="true"
                >
                  <div className="absolute inset-0 rounded-full bg-white/[0.06]" />
                  <div
                    className={clsx(
                      'absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out',
                      idx < activeIdx
                        ? 'w-full bg-gradient-to-r from-emerald-500/50 to-emerald-400/50'
                        : 'w-0',
                    )}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DeployWizardProps {
  template: ContractTemplate;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DeployWizard({ template }: DeployWizardProps) {
  const navigate = useNavigate();
  const wallet = useWalletStore((s) => s.wallet);

  // Store selectors
  const wizardStep = useContractDeployerStore((s) => s.wizardStep);
  const constructorValues = useContractDeployerStore((s) => s.constructorValues);
  const validationErrors = useContractDeployerStore((s) => s.validationErrors);
  const isDeploying = useContractDeployerStore((s) => s.isDeploying);
  const gasEstimate = useContractDeployerStore((s) => s.gasEstimate);
  const deploymentResult = useContractDeployerStore((s) => s.deploymentResult);
  const deployError = useContractDeployerStore((s) => s.deployError);

  // Store actions
  const setWizardStep = useContractDeployerStore((s) => s.setWizardStep);
  const setConstructorValue = useContractDeployerStore((s) => s.setConstructorValue);
  const setValidationErrors = useContractDeployerStore((s) => s.setValidationErrors);
  const setDeploying = useContractDeployerStore((s) => s.setDeploying);
  const setGasEstimate = useContractDeployerStore((s) => s.setGasEstimate);
  const setDeploymentResult = useContractDeployerStore((s) => s.setDeploymentResult);
  const setDeployError = useContractDeployerStore((s) => s.setDeployError);
  const addDeployment = useContractDeployerStore((s) => s.addDeployment);
  const resetWizard = useContractDeployerStore((s) => s.resetWizard);

  // Local state for gas estimation loading
  const [isEstimatingGas, setIsEstimatingGas] = useState(false);

  // -----------------------------------------------------------------------
  // Gas estimation (triggered when entering the review step)
  // -----------------------------------------------------------------------

  const runGasEstimate = useCallback(async () => {
    setIsEstimatingGas(true);
    setGasEstimate(null);
    try {
      const estimate = await estimateDeployGas(template, constructorValues);
      setGasEstimate(estimate);
    } catch {
      // Non-blocking: the UI simply hides the gas preview
      setGasEstimate(null);
    } finally {
      setIsEstimatingGas(false);
    }
  }, [template, constructorValues, setGasEstimate]);

  // Trigger gas estimation when entering the review step
  useEffect(() => {
    if (wizardStep === 'review') {
      runGasEstimate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardStep]);

  // -----------------------------------------------------------------------
  // Navigation
  // -----------------------------------------------------------------------

  const goNext = useCallback(() => {
    if (wizardStep === 'configure') {
      // Validate constructor params before advancing
      const errors = validateConstructorParams(template, constructorValues);
      if (Object.keys(errors).length > 0) {
        setValidationErrors(errors);
        const firstKey = Object.keys(errors)[0];
        toast.error(errors[firstKey]);
        return;
      }
      setValidationErrors({});
      setDeployError(null);
      setWizardStep('review');
    }
  }, [wizardStep, template, constructorValues, setValidationErrors, setDeployError, setWizardStep]);

  const goBack = useCallback(() => {
    if (wizardStep === 'review') {
      setDeployError(null);
      setWizardStep('configure');
    }
  }, [wizardStep, setDeployError, setWizardStep]);

  // -----------------------------------------------------------------------
  // Deploy
  // -----------------------------------------------------------------------

  const deployingRef = useRef(false);

  const handleDeploy = useCallback(async () => {
    if (!wallet.isConnected) {
      toast.error('Please connect your wallet first');
      return;
    }
    // Guard against double-click race: synchronous ref check prevents
    // concurrent deploys before React state update takes effect.
    if (deployingRef.current) return;
    deployingRef.current = true;

    setDeploying(true);
    setDeployError(null);

    try {
      toast.loading('Confirm the transaction in your wallet...', {
        id: 'contract-deploy-tx',
      });

      // Send deployment transaction
      const tx = await deployTemplate(template, constructorValues);

      toast.loading('Transaction submitted. Waiting for confirmation...', {
        id: 'contract-deploy-tx',
      });

      // Wait for confirmation
      const result = await waitForDeployment(tx);

      // Create deployment record
      const record: DeploymentRecord = {
        id: crypto.randomUUID(),
        templateId: template.id,
        templateName: template.name,
        contractName: template.name,
        templateType: resolveTemplateType(template),
        contractAddress: result.contractAddress,
        deployerAddress: (wallet.address ?? '').toLowerCase(),
        walletAddress: (wallet.address ?? '').toLowerCase(),
        chainId: wallet.chainId ?? 1,
        txHash: tx.hash,
        constructorArgs: { ...constructorValues },
        abi: template.abi,
        sourceCode: null,
        compilationWarnings: [],
        blockNumber: result.blockNumber,
        gasUsed: result.gasUsed,
        deployedAt: new Date().toISOString(),
      };

      // Persist to backend so history survives refreshes and reconnects.
      const persistedDeployment = await saveDeploymentToBackend(record);
      const storedRecord: DeploymentRecord = persistedDeployment
        ? {
            ...record,
            id: persistedDeployment.id,
            contractName: persistedDeployment.contractName ?? record.contractName,
            templateType: persistedDeployment.templateType ?? record.templateType,
            contractAddress: persistedDeployment.contractAddress,
            deployerAddress: persistedDeployment.deployerAddress,
            walletAddress: persistedDeployment.walletAddress ?? record.walletAddress,
            txHash: persistedDeployment.txHash,
            sourceCode: persistedDeployment.sourceCode ?? record.sourceCode,
            compilationWarnings:
              persistedDeployment.compilationWarnings ?? record.compilationWarnings,
            blockNumber: persistedDeployment.blockNumber ?? undefined,
            gasUsed: persistedDeployment.gasUsed ?? undefined,
            deployedAt: persistedDeployment.deployedAt,
            createdAt: persistedDeployment.createdAt,
            updatedAt: persistedDeployment.updatedAt,
          }
        : record;

      // Save to local history using the backend-backed record ID when available.
      addDeployment(storedRecord);

      // Update store with result
      setDeploymentResult({
        contractAddress: result.contractAddress,
        txHash: tx.hash,
        blockNumber: result.blockNumber,
        gasUsed: result.gasUsed,
      });

      setDeploying(false);
      setWizardStep('success');

      toast.success('Contract deployed successfully!', {
        id: 'contract-deploy-tx',
        duration: 4000,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Deployment failed. Please try again.';
      setDeployError(message);
      setDeploying(false);
      deployingRef.current = false;

      toast.error(message, {
        id: 'contract-deploy-tx',
        duration: 5000,
      });
    }
  }, [
    wallet,
    template,
    constructorValues,
    setDeploying,
    setDeployError,
    setDeploymentResult,
    setWizardStep,
    addDeployment,
  ]);

  // -----------------------------------------------------------------------
  // Success handlers
  // -----------------------------------------------------------------------

  const handleInteract = useCallback(() => {
    if (deploymentResult) {
      navigate(`/contracts/interact/${deploymentResult.contractAddress}`);
    }
  }, [navigate, deploymentResult]);

  const handleDeployAnother = useCallback(() => {
    resetWizard();
    // Stay on the same template page with a fresh wizard
  }, [resetWizard]);

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  const showNavigation = wizardStep !== 'success';
  const canGoBack = wizardStep === 'review' && !isDeploying;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div>
      {/* Step indicator */}
      <div className="mb-10 sm:mb-12">
        <StepIndicator activeStep={wizardStep} />
      </div>

      {/* Wizard card */}
      <section
        className={clsx(
          'relative overflow-hidden rounded-2xl border backdrop-blur-xl',
          'bg-[#0D0F14]/80 border-white/[0.06]',
          'shadow-[0_4px_24px_-4px_rgba(0,0,0,0.3)]',
        )}
      >
        {/* Top accent */}
        <div
          className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent"
          aria-hidden="true"
        />

        <div className="px-6 py-8 sm:px-10 sm:py-10">
          {/* ---- STEP 1: Configure ---- */}
          {wizardStep === 'configure' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-white mb-1">
                  Configure Parameters
                </h2>
                <p className="text-sm text-gray-500">
                  {template.constructorParams.length > 0
                    ? 'Fill in the constructor parameters for your contract.'
                    : 'This contract has no constructor parameters. Proceed to review.'}
                </p>
              </div>

              {template.constructorParams.length > 0 && (
                <ConstructorForm
                  template={template}
                  values={constructorValues}
                  errors={validationErrors}
                  onChange={setConstructorValue}
                  disabled={isDeploying}
                />
              )}
            </div>
          )}

          {/* ---- STEP 2: Review ---- */}
          {wizardStep === 'review' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-white mb-1">
                  Review &amp; Deploy
                </h2>
                <p className="text-sm text-gray-500">
                  Verify your configuration before deploying to the blockchain.
                </p>
              </div>

              <DeployReview
                template={template}
                values={constructorValues}
                gasEstimate={gasEstimate}
                isEstimating={isEstimatingGas}
                chainId={wallet.chainId ?? null}
                chainName={wallet.chainId ? (SUPPORTED_NETWORKS[wallet.chainId]?.name ?? `Chain ${wallet.chainId}`) : 'Not connected'}
              />

              {/* Wallet status warnings */}
              {!wallet.isConnected && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/[0.06] border border-amber-500/15 text-amber-300 text-sm">
                  <AlertCircle
                    className="h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  Please connect your wallet to deploy.
                </div>
              )}

              {/* Deploy error */}
              {deployError && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-500/[0.06] border border-red-500/15 text-red-300 text-sm">
                  <AlertCircle
                    className="h-4 w-4 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-medium mb-0.5">Deployment Failed</p>
                    <p className="text-red-400/80">{deployError}</p>
                  </div>
                </div>
              )}

              {/* Deploy button */}
              <button
                type="button"
                onClick={handleDeploy}
                disabled={!wallet.isConnected || isDeploying}
                className={clsx(
                  'w-full flex items-center justify-center gap-2',
                  'bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed',
                  'text-white rounded-xl px-6 py-3.5 font-medium transition-colors',
                )}
              >
                {isDeploying ? (
                  <>
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    Deploying...
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4" aria-hidden="true" />
                    Deploy Contract
                  </>
                )}
              </button>
            </div>
          )}

          {/* ---- STEP 3: Success ---- */}
          {wizardStep === 'success' && deploymentResult && (
            <DeploySuccess
              templateName={template.name}
              contractAddress={deploymentResult.contractAddress}
              txHash={deploymentResult.txHash}
              chainId={wallet.chainId ?? 1}
              blockNumber={deploymentResult.blockNumber}
              gasUsed={deploymentResult.gasUsed}
              onInteract={handleInteract}
              onDeployAnother={handleDeployAnother}
            />
          )}
        </div>

        {/* Navigation buttons (hidden on success step) */}
        {showNavigation && (
          <div className="px-6 pb-8 sm:px-10 sm:pb-10 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={goBack}
              disabled={!canGoBack}
              className={clsx(
                'flex items-center gap-1.5',
                'bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08]',
                'text-white rounded-xl px-5 py-2.5 text-sm font-medium transition-colors',
                'disabled:opacity-30 disabled:cursor-not-allowed',
              )}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </button>

            {wizardStep === 'configure' && (
              <button
                type="button"
                onClick={goNext}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-5 py-2.5 text-sm font-medium transition-colors"
              >
                Next
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
