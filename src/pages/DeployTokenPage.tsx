/**
 * Token Deployment Wizard page.
 *
 * A four-step wizard that guides the user through deploying an ERC-1404
 * compliant security token via the SecurityTokenFactory contract:
 *
 *   Step 1 -- Token Metadata (name, symbol, decimals, document type)
 *   Step 2 -- Supply Configuration (supply, max supply, timelock, delay, value)
 *   Step 3 -- Document Hash (file upload or manual hex input)
 *   Step 4 -- Review & Deploy (summary, chain selection, gas estimate, deploy)
 */

import { useState, useCallback, useMemo, useRef, type ChangeEvent } from 'react';
import clsx from 'clsx';
import {
  Sparkles,
  Tag,
  Settings2,
  FileDigit,
  Rocket,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Upload,
  AlertCircle,
  ExternalLink,
  Loader2,
  Copy,
  Check,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ethers } from 'ethers';

import { useWalletStore, getProvider, getSigner } from '../store/walletStore.ts';
import { useWallet } from '../hooks/useWallet.ts';
import { SecurityTokenFactoryABI } from '../contracts/abis/SecurityTokenFactory.ts';
import { TRANSFER_RULES_BYTECODE, RESTRICTED_SWAP_BYTECODE } from '../contracts/bytecodes.ts';
import {
  DEFAULT_SWITCH_CHAIN_IDS,
  SUPPORTED_NETWORKS,
  getExplorerTxUrl,
  getExplorerAddressUrl,
} from '../contracts/addresses.ts';
import { encodeDocumentHash, parseContractError } from '../lib/blockchain/contracts.ts';
import HelpTooltip, { type TooltipId } from '../components/Common/HelpTooltip';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOCUMENT_TYPES = [
  'Security',
  'Bond',
  'Equity',
  'Fund',
  'Real Estate',
  'Other',
] as const;

const SECONDS_PER_DAY = 86_400;
const DEFAULT_MAX_RELEASE_DELAY_DAYS = 365;

/** Networks that have the SecurityTokenFactory deployed. */
function getSupportedDeployNetworks() {
  const preferredRank = new Map<number, number>(
    DEFAULT_SWITCH_CHAIN_IDS.map((chainId, idx) => [chainId, idx]),
  );

  return Object.values(SUPPORTED_NETWORKS).filter(
    (n) => n.securityTokenFactoryAddress.length > 0,
  ).sort((a, b) => {
    const aRank = preferredRank.get(a.chainId) ?? Number.MAX_SAFE_INTEGER;
    const bRank = preferredRank.get(b.chainId) ?? Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) return aRank - bRank;
    return a.chainId - b.chainId;
  });
}

// ---------------------------------------------------------------------------
// Step definition
// ---------------------------------------------------------------------------

const STEPS = [
  { id: 1, label: 'Metadata', fullLabel: 'Token metadata', icon: Tag },
  { id: 2, label: 'Supply', fullLabel: 'Supply config', icon: Settings2 },
  { id: 3, label: 'Document', fullLabel: 'Document hash', icon: FileDigit },
  { id: 4, label: 'Deploy', fullLabel: 'Review & deploy', icon: Rocket },
] as const;

// ---------------------------------------------------------------------------
// Form state type
// ---------------------------------------------------------------------------

interface TokenFormState {
  // Step 1
  name: string;
  symbol: string;
  decimals: number;
  documentType: string;
  // Step 2
  totalSupply: string;
  maxTotalSupply: string;
  minTimelockAmount: string;
  maxReleaseDelayDays: string;
  originalValue: string;
  // Step 3
  documentHash: string;
  hashSource: 'file' | 'manual';
  fileName: string;
}

const initialFormState: TokenFormState = {
  name: '',
  symbol: '',
  decimals: 18,
  documentType: DOCUMENT_TYPES[0],
  totalSupply: '',
  maxTotalSupply: '',
  minTimelockAmount: '1',
  maxReleaseDelayDays: String(DEFAULT_MAX_RELEASE_DELAY_DAYS),
  originalValue: '',
  documentHash: '',
  hashSource: 'file',
  fileName: '',
};

// ---------------------------------------------------------------------------
// Deployment result type
// ---------------------------------------------------------------------------

interface DeploymentResult {
  txHash: string;
  tokenAddress: string;
  transferRulesAddress: string;
  chainId: number;
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

function StepIndicator({ activeStep }: { activeStep: number }) {
  const currentStepLabel =
    STEPS.find((s) => s.id === activeStep)?.fullLabel ?? '';

  return (
    <nav
      aria-label={`Deploy wizard progress: step ${activeStep} of ${STEPS.length}, ${currentStepLabel}`}
      className="mx-auto w-full max-w-xl"
    >
      <div aria-live="polite" className="sr-only">
        Step {activeStep} of {STEPS.length}: {currentStepLabel}
      </div>

      <ol className="flex items-center justify-between">
        {STEPS.map((step, idx) => {
          const StepIcon = step.icon;
          const isCompleted = step.id < activeStep;
          const isCurrent = step.id === activeStep;
          const isUpcoming = step.id > activeStep;

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
                      step.id < activeStep
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
// Reusable form field components
// ---------------------------------------------------------------------------

const inputClasses =
  'bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors w-full';

const selectClasses =
  'bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-3 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors w-full appearance-none cursor-pointer';

function FieldLabel({
  htmlFor,
  children,
  required,
  tooltipId,
}: {
  htmlFor: string;
  children: React.ReactNode;
  required?: boolean;
  tooltipId?: TooltipId;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="flex items-center gap-1.5 text-sm font-medium text-gray-300 mb-2"
    >
      {children}
      {required && <span className="text-red-400 ml-0.5">*</span>}
      {tooltipId && (
        <HelpTooltip
          tooltipId={tooltipId}
          flow="securityMint"
          component={`DeployTokenPage.${htmlFor}`}
        />
      )}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
      <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs text-gray-500">{children}</p>;
}

// ---------------------------------------------------------------------------
// Copy to clipboard button
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] transition-colors"
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-gray-400" />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// SHA-256 file hash helper
// ---------------------------------------------------------------------------

async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = new Uint8Array(hashBuffer);
  return (
    '0x' +
    Array.from(hashArray)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  );
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateStep1(form: TokenFormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.name.trim()) {
    errors.name = 'Token name is required';
  }
  if (!form.symbol.trim()) {
    errors.symbol = 'Token symbol is required';
  } else if (form.symbol.length > 11) {
    errors.symbol = 'Symbol must be 11 characters or fewer';
  } else if (!/^[A-Za-z0-9]+$/.test(form.symbol)) {
    errors.symbol = 'Symbol must contain only letters and numbers';
  }
  if (form.decimals < 0 || form.decimals > 18) {
    errors.decimals = 'Decimals must be between 0 and 18';
  }
  if (!form.documentType) {
    errors.documentType = 'Document type is required';
  }
  return errors;
}

function validateStep2(form: TokenFormState): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!form.totalSupply.trim()) {
    errors.totalSupply = 'Total supply is required';
  } else {
    const val = Number(form.totalSupply);
    if (isNaN(val) || val <= 0) {
      errors.totalSupply = 'Total supply must be a positive number';
    }
  }

  if (!form.maxTotalSupply.trim()) {
    errors.maxTotalSupply = 'Max total supply is required';
  } else {
    const val = Number(form.maxTotalSupply);
    if (isNaN(val) || val <= 0) {
      errors.maxTotalSupply = 'Max total supply must be a positive number';
    } else if (
      form.totalSupply.trim() &&
      !isNaN(Number(form.totalSupply)) &&
      val < Number(form.totalSupply)
    ) {
      errors.maxTotalSupply =
        'Max total supply must be greater than or equal to total supply';
    }
  }

  if (form.minTimelockAmount.trim()) {
    const val = Number(form.minTimelockAmount);
    if (isNaN(val) || val < 0) {
      errors.minTimelockAmount = 'Min timelock amount must be non-negative';
    }
  }

  if (form.maxReleaseDelayDays.trim()) {
    const val = Number(form.maxReleaseDelayDays);
    if (isNaN(val) || val < 0) {
      errors.maxReleaseDelayDays = 'Max release delay must be non-negative';
    }
  }

  if (!form.originalValue.trim()) {
    errors.originalValue = 'Original value is required';
  } else {
    const val = Number(form.originalValue);
    if (isNaN(val) || val < 0) {
      errors.originalValue = 'Original value must be a non-negative number';
    }
  }

  return errors;
}

function validateStep3(form: TokenFormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.documentHash.trim()) {
    errors.documentHash =
      'Upload a document or enter a hash manually';
  } else if (
    form.hashSource === 'manual' &&
    !/^0x[0-9a-fA-F]{1,64}$/.test(form.documentHash.trim())
  ) {
    errors.documentHash =
      'Hash must be a hex string starting with 0x (up to 64 hex characters)';
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DeployTokenPage() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<TokenFormState>({ ...initialFormState });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isHashing, setIsHashing] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<DeploymentResult | null>(
    null,
  );
  const [gasEstimate, setGasEstimate] = useState<string | null>(null);
  const [isEstimatingGas, setIsEstimatingGas] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const wallet = useWalletStore((s) => s.wallet);
  const { switchNetwork: switchWalletNetwork } = useWallet();

  // Supported deploy networks
  const deployNetworks = useMemo(() => getSupportedDeployNetworks(), []);

  // Selected target chain for deployment -- default to connected chain if supported
  const [targetChainId, setTargetChainId] = useState<number>(() => {
    const nets = getSupportedDeployNetworks();
    if (wallet.chainId && nets.some((n) => n.chainId === wallet.chainId)) {
      return wallet.chainId;
    }
    return nets[0]?.chainId ?? 0;
  });

  const targetNetwork = useMemo(
    () => deployNetworks.find((n) => n.chainId === targetChainId),
    [deployNetworks, targetChainId],
  );

  const isOnCorrectChain = wallet.chainId === targetChainId;

  // -----------------------------------------------------------------------
  // Form updater
  // -----------------------------------------------------------------------

  const updateField = useCallback(
    <K extends keyof TokenFormState>(field: K, value: TokenFormState[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      // Clear the specific field error on change
      setErrors((prev) => {
        if (prev[field]) {
          const next = { ...prev };
          delete next[field];
          return next;
        }
        return prev;
      });
    },
    [],
  );

  // -----------------------------------------------------------------------
  // Navigation
  // -----------------------------------------------------------------------

  const goToStep = useCallback(
    (target: number) => {
      // Validate current step before moving forward
      if (target > step) {
        let stepErrors: Record<string, string> = {};
        if (step === 1) stepErrors = validateStep1(form);
        if (step === 2) stepErrors = validateStep2(form);
        if (step === 3) stepErrors = validateStep3(form);

        if (Object.keys(stepErrors).length > 0) {
          setErrors(stepErrors);
          const firstKey = Object.keys(stepErrors)[0];
          toast.error(stepErrors[firstKey]);
          return;
        }
      }

      setErrors({});
      setStep(target);
    },
    [step, form],
  );

  const goNext = useCallback(() => goToStep(step + 1), [goToStep, step]);
  const goBack = useCallback(
    () => setStep((s) => Math.max(1, s - 1)),
    [],
  );

  // -----------------------------------------------------------------------
  // File upload handler (SHA-256 hash)
  // -----------------------------------------------------------------------

  const handleFileUpload = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsHashing(true);
      try {
        const hash = await computeFileHash(file);
        updateField('documentHash', hash);
        updateField('fileName', file.name);
        updateField('hashSource', 'file');
        toast.success(`SHA-256 hash computed for ${file.name}`);
      } catch (err) {
        toast.error('Failed to compute file hash');
        console.error('Hash computation error:', err);
      } finally {
        setIsHashing(false);
      }
    },
    [updateField],
  );

  // -----------------------------------------------------------------------
  // Gas estimation
  // -----------------------------------------------------------------------

  const estimateGas = useCallback(async () => {
    if (!wallet.isConnected || !isOnCorrectChain) return;

    const provider = getProvider();
    if (!provider) return;

    setIsEstimatingGas(true);
    setGasEstimate(null);

    try {
      const signer = await provider.getSigner();
      const factory = new ethers.Contract(
        targetNetwork!.securityTokenFactoryAddress,
        SecurityTokenFactoryABI,
        signer,
      );

      const decimals = form.decimals;
      const totalSupplyWei = ethers.parseUnits(
        form.totalSupply || '0',
        decimals,
      );
      const maxTotalSupplyWei = ethers.parseUnits(
        form.maxTotalSupply || '0',
        decimals,
      );
      const minTimelockAmountWei = ethers.parseUnits(
        form.minTimelockAmount || '0',
        decimals,
      );
      const maxReleaseDelay = BigInt(
        Math.floor(Number(form.maxReleaseDelayDays || '0') * SECONDS_PER_DAY),
      );
      const originalValue = ethers.parseUnits(
        form.originalValue || '0',
        0,
      );
      const encodedHash = encodeDocumentHash(form.documentHash);

      const gas = await factory.createSecurityToken.estimateGas(
        TRANSFER_RULES_BYTECODE,
        RESTRICTED_SWAP_BYTECODE,
        form.name,
        form.symbol,
        decimals,
        totalSupplyWei,
        maxTotalSupplyWei,
        encodedHash,
        form.documentType,
        originalValue,
        minTimelockAmountWei,
        maxReleaseDelay,
      );

      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice ?? 0n;
      const estimatedCost = gas * gasPrice;
      const costEth = ethers.formatEther(estimatedCost);
      const gasFormatted = gas.toLocaleString();

      setGasEstimate(`~${gasFormatted} gas (~${Number(costEth).toFixed(6)} ETH)`);
    } catch (err) {
      const msg = parseContractError(err);
      setGasEstimate(`Estimation failed: ${msg}`);
    } finally {
      setIsEstimatingGas(false);
    }
  }, [wallet, isOnCorrectChain, targetNetwork, form]);

  // -----------------------------------------------------------------------
  // Network switching
  // -----------------------------------------------------------------------

  const handleSwitchNetwork = useCallback(async () => {
    await switchWalletNetwork(targetChainId);
  }, [switchWalletNetwork, targetChainId]);

  // -----------------------------------------------------------------------
  // Deploy
  // -----------------------------------------------------------------------

  const handleDeploy = useCallback(async () => {
    if (!wallet.isConnected) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (!isOnCorrectChain) {
      toast.error(
        `Please switch to ${targetNetwork?.name ?? 'the correct network'}`,
      );
      return;
    }

    const provider = getProvider();
    const signer = getSigner();
    if (!provider || !signer) {
      toast.error('Please connect your wallet before deploying.');
      return;
    }

    setIsDeploying(true);

    try {
      const factory = new ethers.Contract(
        targetNetwork!.securityTokenFactoryAddress,
        SecurityTokenFactoryABI,
        signer,
      );

      const decimals = form.decimals;
      const totalSupplyWei = ethers.parseUnits(form.totalSupply, decimals);
      const maxTotalSupplyWei = ethers.parseUnits(
        form.maxTotalSupply,
        decimals,
      );
      const minTimelockAmountWei = ethers.parseUnits(
        form.minTimelockAmount || '0',
        decimals,
      );
      const maxReleaseDelay = BigInt(
        Math.floor(
          Number(form.maxReleaseDelayDays || '0') * SECONDS_PER_DAY,
        ),
      );
      const originalValue = ethers.parseUnits(form.originalValue, 0);
      const encodedHash = encodeDocumentHash(form.documentHash);

      // Estimate gas with 20% buffer
      const gasEstimateRaw =
        await factory.createSecurityToken.estimateGas(
          TRANSFER_RULES_BYTECODE,
          RESTRICTED_SWAP_BYTECODE,
          form.name,
          form.symbol,
          decimals,
          totalSupplyWei,
          maxTotalSupplyWei,
          encodedHash,
          form.documentType,
          originalValue,
          minTimelockAmountWei,
          maxReleaseDelay,
        );
      const gasLimit = (gasEstimateRaw * 120n) / 100n;

      toast.loading('Confirm the transaction in your wallet...', {
        id: 'deploy-tx',
      });

      const tx = await factory.createSecurityToken(
        TRANSFER_RULES_BYTECODE,
        RESTRICTED_SWAP_BYTECODE,
        form.name,
        form.symbol,
        decimals,
        totalSupplyWei,
        maxTotalSupplyWei,
        encodedHash,
        form.documentType,
        originalValue,
        minTimelockAmountWei,
        maxReleaseDelay,
        { gasLimit },
      );

      toast.loading('Transaction submitted. Waiting for confirmation...', {
        id: 'deploy-tx',
      });

      const receipt = await tx.wait(1);

      if (!receipt || receipt.status === 0) {
        throw new Error('Transaction reverted on-chain');
      }

      // Parse the SecurityTokenCreated event from the receipt
      const iface = new ethers.Interface(SecurityTokenFactoryABI);
      let tokenAddress = '';
      let transferRulesAddress = '';

      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          if (parsed && parsed.name === 'SecurityTokenCreated') {
            tokenAddress = parsed.args[1]; // indexed tokenAddress
            transferRulesAddress = parsed.args[2]; // indexed transferRulesAddress
            break;
          }
        } catch {
          // Not our event, skip
        }
      }

      if (!tokenAddress) {
        // Fallback: the function returns (address tokenAddress, address rulesAddress)
        // but we may not have the return value in the receipt. The event is the
        // primary source.
        toast.success('Token deployed, but could not parse event. Check the transaction on the explorer.', {
          id: 'deploy-tx',
          duration: 5000,
        });
        setDeployResult({
          txHash: receipt.hash,
          tokenAddress: 'Unknown (check explorer)',
          transferRulesAddress: 'Unknown (check explorer)',
          chainId: targetChainId,
        });
      } else {
        toast.success('Security token deployed successfully!', {
          id: 'deploy-tx',
          duration: 4000,
        });
        setDeployResult({
          txHash: receipt.hash,
          tokenAddress,
          transferRulesAddress,
          chainId: targetChainId,
        });
      }
    } catch (err) {
      const msg = parseContractError(err);
      toast.error(msg, { id: 'deploy-tx', duration: 5000 });
      console.error('Deployment error:', err);
    } finally {
      setIsDeploying(false);
    }
  }, [wallet, isOnCorrectChain, targetNetwork, targetChainId, form]);

  // -----------------------------------------------------------------------
  // Summary data for step 4
  // -----------------------------------------------------------------------

  const summaryItems = useMemo(() => {
    const decimals = form.decimals;
    const maxDelaySec = Math.floor(
      Number(form.maxReleaseDelayDays || '0') * SECONDS_PER_DAY,
    );
    const maxDelayLabel =
      maxDelaySec >= SECONDS_PER_DAY
        ? `${(maxDelaySec / SECONDS_PER_DAY).toFixed(0)} days`
        : `${maxDelaySec.toLocaleString()} seconds`;

    return [
      { label: 'Token Name', value: form.name },
      { label: 'Symbol', value: form.symbol.toUpperCase() },
      { label: 'Decimals', value: String(decimals) },
      { label: 'Document Type', value: form.documentType },
      { label: 'Total Supply', value: form.totalSupply },
      { label: 'Max Total Supply', value: form.maxTotalSupply },
      { label: 'Min Timelock Amount', value: form.minTimelockAmount || '0' },
      { label: 'Max Release Delay', value: maxDelayLabel },
      {
        label: 'Original Value',
        value: `${Number(form.originalValue || 0).toLocaleString()} (wei)`,
      },
      {
        label: 'Document Hash',
        value: form.documentHash
          ? `${form.documentHash.slice(0, 10)}...${form.documentHash.slice(-8)}`
          : 'None',
        fullValue: form.documentHash,
      },
    ];
  }, [form]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Page header */}
      <header className="mb-12 text-center sm:mb-16">
        <div className="mb-4 flex items-center justify-center">
          <div className="flex items-center gap-2.5 rounded-full border border-indigo-500/15 bg-indigo-500/[0.06] px-4 py-1.5">
            <Sparkles
              className="h-3.5 w-3.5 text-indigo-400"
              aria-hidden="true"
            />
            <span className="text-xs font-medium tracking-wide text-indigo-300/90">
              Security Token Deployment
            </span>
          </div>
        </div>

        <h1 className="mb-5 bg-gradient-to-r from-indigo-300 via-violet-300 to-purple-300 bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl md:text-4xl">
          Deploy Token
        </h1>

        <p className="text-sm text-gray-500 max-w-md mx-auto">
          Configure and deploy an ERC-1404 compliant security token with
          built-in transfer rules, lockups, and dividend capabilities.
        </p>

        <div className="mt-12 sm:mt-14">
          <StepIndicator activeStep={deployResult ? 5 : step} />
        </div>
      </header>

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
          {/* ---- STEP 1: Token Metadata ---- */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-white mb-1">
                  Token Metadata
                </h2>
                <p className="text-sm text-gray-500">
                  Define the identity of your security token.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Token name */}
                <div className="sm:col-span-2">
                  <FieldLabel htmlFor="name" required>
                    Token Name
                  </FieldLabel>
                  <input
                    id="name"
                    type="text"
                    className={inputClasses}
                    placeholder="e.g. Fueki Real Estate Fund I"
                    value={form.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    maxLength={64}
                  />
                  <FieldError message={errors.name} />
                </div>

                {/* Symbol */}
                <div>
                  <FieldLabel htmlFor="symbol" required>
                    Token Symbol
                  </FieldLabel>
                  <input
                    id="symbol"
                    type="text"
                    className={clsx(inputClasses, 'uppercase')}
                    placeholder="e.g. FREF"
                    value={form.symbol}
                    onChange={(e) =>
                      updateField(
                        'symbol',
                        e.target.value.toUpperCase().slice(0, 11),
                      )
                    }
                    maxLength={11}
                  />
                  <FieldHint>Maximum 11 characters</FieldHint>
                  <FieldError message={errors.symbol} />
                </div>

                {/* Decimals */}
                <div>
                  <FieldLabel htmlFor="decimals" tooltipId="mint.decimals">
                    Decimals
                  </FieldLabel>
                  <input
                    id="decimals"
                    type="number"
                    className={inputClasses}
                    value={form.decimals}
                    onChange={(e) =>
                      updateField(
                        'decimals',
                        Math.min(
                          18,
                          Math.max(0, parseInt(e.target.value) || 0),
                        ),
                      )
                    }
                    min={0}
                    max={18}
                  />
                  <FieldHint>Standard is 18 for most tokens</FieldHint>
                  <FieldError message={errors.decimals} />
                </div>

                {/* Document type */}
                <div className="sm:col-span-2">
                  <FieldLabel htmlFor="documentType" required>
                    Document Type
                  </FieldLabel>
                  <select
                    id="documentType"
                    className={selectClasses}
                    value={form.documentType}
                    onChange={(e) =>
                      updateField('documentType', e.target.value)
                    }
                  >
                    {DOCUMENT_TYPES.map((type) => (
                      <option key={type} value={type} className="bg-[#0D0F14]">
                        {type}
                      </option>
                    ))}
                  </select>
                  <FieldError message={errors.documentType} />
                </div>
              </div>
            </div>
          )}

          {/* ---- STEP 2: Supply Configuration ---- */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-white mb-1">
                  Supply Configuration
                </h2>
                <p className="text-sm text-gray-500">
                  Configure the token supply, lockup parameters, and reference
                  value.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Total supply */}
                <div>
                  <FieldLabel htmlFor="totalSupply" required>
                    Total Supply
                  </FieldLabel>
                  <input
                    id="totalSupply"
                    type="text"
                    inputMode="decimal"
                    className={inputClasses}
                    placeholder="e.g. 1000000"
                    value={form.totalSupply}
                    onChange={(e) =>
                      updateField('totalSupply', e.target.value)
                    }
                  />
                  <FieldHint>
                    Human-readable amount (auto-converts using decimals)
                  </FieldHint>
                  <FieldError message={errors.totalSupply} />
                </div>

                {/* Max total supply */}
                <div>
                  <FieldLabel htmlFor="maxTotalSupply" required>
                    Max Total Supply
                  </FieldLabel>
                  <input
                    id="maxTotalSupply"
                    type="text"
                    inputMode="decimal"
                    className={inputClasses}
                    placeholder="e.g. 10000000"
                    value={form.maxTotalSupply}
                    onChange={(e) =>
                      updateField('maxTotalSupply', e.target.value)
                    }
                  />
                  <FieldHint>Must be &ge; total supply</FieldHint>
                  <FieldError message={errors.maxTotalSupply} />
                </div>

                {/* Min timelock amount */}
                <div>
                  <FieldLabel
                    htmlFor="minTimelockAmount"
                    tooltipId="security.timelock"
                  >
                    Min Timelock Amount
                  </FieldLabel>
                  <input
                    id="minTimelockAmount"
                    type="text"
                    inputMode="decimal"
                    className={inputClasses}
                    placeholder="1"
                    value={form.minTimelockAmount}
                    onChange={(e) =>
                      updateField('minTimelockAmount', e.target.value)
                    }
                  />
                  <FieldHint>
                    Minimum token amount subject to lockup rules
                  </FieldHint>
                  <FieldError message={errors.minTimelockAmount} />
                </div>

                {/* Max release delay */}
                <div>
                  <FieldLabel
                    htmlFor="maxReleaseDelayDays"
                    tooltipId="security.releaseDelay"
                  >
                    Max Release Delay (days)
                  </FieldLabel>
                  <input
                    id="maxReleaseDelayDays"
                    type="text"
                    inputMode="decimal"
                    className={inputClasses}
                    placeholder="365"
                    value={form.maxReleaseDelayDays}
                    onChange={(e) =>
                      updateField('maxReleaseDelayDays', e.target.value)
                    }
                  />
                  <FieldHint>
                    Stored on-chain as{' '}
                    {(
                      Math.floor(
                        Number(form.maxReleaseDelayDays || '0') *
                          SECONDS_PER_DAY,
                      )
                    ).toLocaleString()}{' '}
                    seconds
                  </FieldHint>
                  <FieldError message={errors.maxReleaseDelayDays} />
                </div>

                {/* Original value */}
                <div className="sm:col-span-2">
                  <FieldLabel htmlFor="originalValue" required>
                    Original Value (reference)
                  </FieldLabel>
                  <input
                    id="originalValue"
                    type="text"
                    inputMode="decimal"
                    className={inputClasses}
                    placeholder="e.g. 1000000"
                    value={form.originalValue}
                    onChange={(e) =>
                      updateField('originalValue', e.target.value)
                    }
                  />
                  <FieldHint>
                    USD or reference value stored on-chain as a uint256 (no
                    decimals applied)
                  </FieldHint>
                  <FieldError message={errors.originalValue} />
                </div>
              </div>
            </div>
          )}

          {/* ---- STEP 3: Document Hash ---- */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-white mb-1">
                  Document Hash
                </h2>
                <p className="text-sm text-gray-500">
                  Upload a document to compute its SHA-256 hash, or enter a hash
                  manually. This hash is stored immutably on-chain.
                </p>
              </div>

              {/* Mode toggle */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => updateField('hashSource', 'file')}
                  className={clsx(
                    'px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                    form.hashSource === 'file'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white/[0.05] border border-white/[0.08] text-gray-400 hover:bg-white/[0.08]',
                  )}
                >
                  Upload File
                </button>
                <button
                  type="button"
                  onClick={() => updateField('hashSource', 'manual')}
                  className={clsx(
                    'px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                    form.hashSource === 'manual'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white/[0.05] border border-white/[0.08] text-gray-400 hover:bg-white/[0.08]',
                  )}
                >
                  Manual Input
                </button>
              </div>

              {/* File upload mode */}
              {form.hashSource === 'file' && (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.png,.jpg,.jpeg,.gif,.bmp,.tiff,.doc,.docx,.xls,.xlsx,.csv,.json,.xml,.txt"
                    onChange={handleFileUpload}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isHashing}
                    className={clsx(
                      'w-full flex flex-col items-center justify-center gap-3 py-10 rounded-xl border-2 border-dashed transition-colors',
                      'border-white/[0.08] hover:border-indigo-500/40 hover:bg-indigo-500/[0.02]',
                      isHashing && 'opacity-50 cursor-wait',
                    )}
                  >
                    {isHashing ? (
                      <Loader2
                        className="h-8 w-8 text-indigo-400 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Upload
                        className="h-8 w-8 text-gray-500"
                        aria-hidden="true"
                      />
                    )}
                    <div className="text-center">
                      <p className="text-sm font-medium text-gray-300">
                        {isHashing
                          ? 'Computing hash...'
                          : form.fileName
                            ? `Replace ${form.fileName}`
                            : 'Click to upload a document'}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        PDF, images, Office docs, CSV, JSON, XML
                      </p>
                    </div>
                  </button>

                  {form.fileName && !isHashing && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-gray-400">
                      <CheckCircle2
                        className="h-4 w-4 text-emerald-400 shrink-0"
                        aria-hidden="true"
                      />
                      <span className="truncate">{form.fileName}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Manual hash input mode */}
              {form.hashSource === 'manual' && (
                <div>
                  <FieldLabel
                    htmlFor="manualHash"
                    required
                    tooltipId="mint.documentHash"
                  >
                    Document Hash (hex)
                  </FieldLabel>
                  <input
                    id="manualHash"
                    type="text"
                    className={clsx(inputClasses, 'font-mono text-sm')}
                    placeholder="0x..."
                    value={form.documentHash}
                    onChange={(e) =>
                      updateField('documentHash', e.target.value)
                    }
                  />
                  <FieldHint>
                    Enter a bytes32 hex string (0x followed by up to 64 hex
                    characters). Shorter values will be zero-padded.
                  </FieldHint>
                  <FieldError message={errors.documentHash} />
                </div>
              )}

              {/* Display the computed/entered hash */}
              {form.documentHash && (
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-2">
                    On-chain document hash (bytes32)
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="text-sm text-indigo-300 font-mono break-all flex-1">
                      {form.documentHash}
                    </code>
                    <CopyButton text={form.documentHash} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ---- STEP 4: Review & Deploy ---- */}
          {step === 4 && !deployResult && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-white mb-1">
                  Review &amp; Deploy
                </h2>
                <p className="text-sm text-gray-500">
                  Verify your configuration before deploying to the blockchain.
                </p>
              </div>

              {/* Summary table */}
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl divide-y divide-white/[0.04]">
                {summaryItems.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-start justify-between px-4 py-3 gap-4"
                  >
                    <span className="text-sm text-gray-500 shrink-0">
                      {item.label}
                    </span>
                    <span className="text-sm text-white text-right font-medium break-all">
                      {item.value}
                      {'fullValue' in item && item.fullValue && (
                        <span className="ml-2 inline-flex">
                          <CopyButton text={item.fullValue} />
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-[#0D0F14] p-4">
                <h3 className="mb-3 text-sm font-semibold text-gray-200">
                  Compliance Readiness
                </h3>
                <div className="space-y-2.5 text-xs text-gray-400">
                  <div className="flex items-start justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5">
                      Transfer restrictions
                      <HelpTooltip
                        tooltipId="security.transferRestrictions"
                        flow="securityMint"
                        component="DeployTokenPage.Review"
                      />
                    </span>
                    <span className="text-gray-500">
                      Enforced through transfer-rules contract
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5">
                      Role assignments
                      <HelpTooltip
                        tooltipId="security.roleAssignments"
                        flow="securityMint"
                        component="DeployTokenPage.Review"
                      />
                    </span>
                    <span className="text-gray-500">
                      Configure issuer/admin roles post-deployment
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5">
                      Whitelist policy
                      <HelpTooltip
                        tooltipId="security.whitelist"
                        flow="securityMint"
                        component="DeployTokenPage.Review"
                      />
                    </span>
                    <span className="text-gray-500">
                      Add verified investor addresses before trading
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5">
                      Offering disclosure
                      <HelpTooltip
                        tooltipId="security.complianceDisclosure"
                        flow="securityMint"
                        component="DeployTokenPage.Review"
                      />
                    </span>
                    <span className="text-gray-500">
                      Ensure terms and disclosures are published
                    </span>
                  </div>
                </div>
              </div>

              {/* Network selector */}
              <div>
                <FieldLabel htmlFor="targetChain">Deploy to Network</FieldLabel>
                <select
                  id="targetChain"
                  className={selectClasses}
                  value={targetChainId}
                  onChange={(e) => {
                    setTargetChainId(Number(e.target.value));
                    setGasEstimate(null);
                  }}
                >
                  {deployNetworks.map((net) => (
                    <option
                      key={net.chainId}
                      value={net.chainId}
                      className="bg-[#0D0F14]"
                    >
                      {net.name} (Chain ID: {net.chainId})
                    </option>
                  ))}
                </select>
              </div>

              {/* Wallet status */}
              {!wallet.isConnected && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/[0.06] border border-amber-500/15 text-amber-300 text-sm">
                  <AlertCircle
                    className="h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  Please connect your wallet to deploy.
                </div>
              )}

              {wallet.isConnected && !isOnCorrectChain && (
                <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-500/[0.06] border border-amber-500/15">
                  <div className="flex items-center gap-2 text-amber-300 text-sm">
                    <AlertCircle
                      className="h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span>
                      Wrong network. Switch to{' '}
                      <strong>{targetNetwork?.name}</strong>.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSwitchNetwork}
                    className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors shrink-0"
                  >
                    Switch Network
                  </button>
                </div>
              )}

              {/* Gas estimation */}
              {wallet.isConnected && isOnCorrectChain && (
                <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <div className="text-sm">
                    <span className="text-gray-500">Gas estimate: </span>
                    {isEstimatingGas ? (
                      <span className="text-gray-400">Estimating...</span>
                    ) : gasEstimate ? (
                      <span className="text-gray-300 font-mono text-xs">
                        {gasEstimate}
                      </span>
                    ) : (
                      <span className="text-gray-600">Not estimated</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={estimateGas}
                    disabled={isEstimatingGas}
                    className="bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] text-gray-300 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {isEstimatingGas ? 'Estimating...' : 'Estimate Gas'}
                  </button>
                </div>
              )}

              {/* Deploy button */}
              <button
                type="button"
                onClick={handleDeploy}
                disabled={
                  !wallet.isConnected || !isOnCorrectChain || isDeploying
                }
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
                    Deploy Security Token
                  </>
                )}
              </button>
            </div>
          )}

          {/* ---- Deployment success ---- */}
          {deployResult && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="flex items-center justify-center mb-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 ring-4 ring-emerald-500/20">
                    <CheckCircle2
                      className="h-8 w-8 text-emerald-400"
                      aria-hidden="true"
                    />
                  </div>
                </div>
                <h2 className="text-xl font-semibold text-white mb-2">
                  Token Deployed Successfully
                </h2>
                <p className="text-sm text-gray-500">
                  Your ERC-1404 security token has been deployed to{' '}
                  {SUPPORTED_NETWORKS[deployResult.chainId]?.name ?? 'the blockchain'}.
                </p>
              </div>

              {/* Deployed addresses */}
              <div className="space-y-3">
                {/* Token address */}
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1.5">
                    Token Contract Address
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="text-sm text-emerald-300 font-mono break-all flex-1">
                      {deployResult.tokenAddress}
                    </code>
                    {ethers.isAddress(deployResult.tokenAddress) && (
                      <>
                        <CopyButton text={deployResult.tokenAddress} />
                        {SUPPORTED_NETWORKS[deployResult.chainId]
                          ?.blockExplorer && (
                          <a
                            href={getExplorerAddressUrl(
                              deployResult.chainId,
                              deployResult.tokenAddress,
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] transition-colors"
                            title="View on explorer"
                          >
                            <ExternalLink className="h-3.5 w-3.5 text-gray-400" />
                          </a>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Transfer rules address */}
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1.5">
                    Transfer Rules Address
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="text-sm text-indigo-300 font-mono break-all flex-1">
                      {deployResult.transferRulesAddress}
                    </code>
                    {ethers.isAddress(deployResult.transferRulesAddress) && (
                      <>
                        <CopyButton
                          text={deployResult.transferRulesAddress}
                        />
                        {SUPPORTED_NETWORKS[deployResult.chainId]
                          ?.blockExplorer && (
                          <a
                            href={getExplorerAddressUrl(
                              deployResult.chainId,
                              deployResult.transferRulesAddress,
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] transition-colors"
                            title="View on explorer"
                          >
                            <ExternalLink className="h-3.5 w-3.5 text-gray-400" />
                          </a>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Transaction hash */}
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1.5">
                    Transaction Hash
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="text-sm text-gray-300 font-mono break-all flex-1">
                      {deployResult.txHash}
                    </code>
                    <CopyButton text={deployResult.txHash} />
                    {SUPPORTED_NETWORKS[deployResult.chainId]
                      ?.blockExplorer && (
                      <a
                        href={getExplorerTxUrl(
                          deployResult.chainId,
                          deployResult.txHash,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] transition-colors"
                        title="View on explorer"
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-gray-400" />
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Deploy another */}
              <button
                type="button"
                onClick={() => {
                  setForm({ ...initialFormState });
                  setDeployResult(null);
                  setGasEstimate(null);
                  setStep(1);
                }}
                className="w-full bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] text-white rounded-xl px-6 py-3 font-medium transition-colors"
              >
                Deploy Another Token
              </button>
            </div>
          )}
        </div>

        {/* Navigation buttons */}
        {!deployResult && (
          <div className="px-6 pb-8 sm:px-10 sm:pb-10 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 1}
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

            {step < 4 && (
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
