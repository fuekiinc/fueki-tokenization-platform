import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  CheckCircle2,
  Coins,
  FileText,
  History,
  Sparkles,
  Upload,
} from 'lucide-react';
import { useDocumentStore } from '../store/documentStore.ts';
import { useTradeStore } from '../store/tradeStore.ts';
import FileUploader from '../components/Upload/FileUploader';
import TransactionPreview from '../components/Upload/TransactionPreview';
import MintForm from '../components/Mint/MintForm';
import MintHistory from '../components/Mint/MintHistory';
import PendingTokensPanel from '../components/Mint/PendingTokensPanel';
import type { MintApprovalRequestItem } from '../types/mintApproval';

// ---------------------------------------------------------------------------
// Step indicator configuration
// ---------------------------------------------------------------------------

const STEPS = [
  { id: 1, label: 'Upload', fullLabel: 'Upload document', icon: Upload },
  { id: 2, label: 'Review', fullLabel: 'Review data', icon: FileText },
  { id: 3, label: 'Configure', fullLabel: 'Configure token', icon: Coins },
  { id: 4, label: 'Mint', fullLabel: 'Mint asset', icon: CheckCircle2 },
] as const;

// ---------------------------------------------------------------------------
// Step indicator bar (with proper ARIA)
// ---------------------------------------------------------------------------

function MintStepIndicator({ activeStep }: { activeStep: number }) {
  const currentStepLabel = STEPS.find((s) => s.id === activeStep)?.fullLabel ?? '';

  return (
    <nav
      aria-label={`Mint workflow progress: step ${activeStep} of ${STEPS.length}, ${currentStepLabel}`}
      className="mx-auto w-full max-w-xl"
    >
      {/* Live region for step change announcements */}
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
                      'bg-indigo-500/15 text-indigo-400',
                      'ring-2 ring-indigo-500/20',
                    ],
                    isUpcoming && [
                      'bg-white/[0.04] text-gray-600',
                      'border border-white/[0.08]',
                    ],
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-4.5 w-4.5" aria-hidden="true" />
                  ) : (
                    <StepIcon className="h-4 w-4" aria-hidden="true" />
                  )}
                  {isCurrent && (
                    <span className="absolute inset-0 animate-ping motion-reduce:animate-none rounded-full bg-indigo-500/20 duration-1000" aria-hidden="true" />
                  )}
                </div>
                <span
                  className={clsx(
                    'text-xs font-medium tracking-wide transition-colors duration-300',
                    isCurrent && 'text-indigo-300',
                    isCompleted && 'text-indigo-400/70',
                    isUpcoming && 'text-gray-600',
                  )}
                >
                  <span className="hidden sm:inline">{step.fullLabel}</span>
                  <span className="sm:hidden">{step.label}</span>
                </span>

                {/* Screen reader status */}
                <span className="sr-only">
                  {isCompleted
                    ? '(completed)'
                    : isCurrent
                      ? '(current step)'
                      : '(upcoming)'}
                </span>
              </div>

              {idx < STEPS.length - 1 && (
                <div className="relative mx-2 mb-7 h-px flex-1 sm:mx-4" aria-hidden="true">
                  <div className="absolute inset-0 rounded-full bg-white/[0.06]" />
                  <div
                    className={clsx(
                      'absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out',
                      step.id < activeStep
                        ? 'w-full bg-gradient-to-r from-indigo-500/50 to-violet-500/50'
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
// Section card -- glass container with step badge
// ---------------------------------------------------------------------------

interface SectionCardProps {
  children: React.ReactNode;
  stepNumber: number;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  isActive?: boolean;
  isCompleted?: boolean;
}

function SectionCard({
  children,
  stepNumber,
  title,
  subtitle,
  icon: Icon,
  isActive = false,
  isCompleted = false,
}: SectionCardProps) {
  return (
    <section
      aria-label={`Step ${stepNumber}: ${title}`}
      className={clsx(
        'group relative overflow-hidden rounded-2xl border backdrop-blur-xl transition-all duration-500',
        'bg-[#0D0F14]/80',
        isActive
          ? 'border-indigo-500/20 shadow-[0_0_60px_-15px_rgba(99,102,241,0.12)]'
          : 'border-white/[0.06] shadow-lg shadow-black/20',
        isCompleted && !isActive && 'border-emerald-500/10',
      )}
    >
      {/* Gradient top accent */}
      <div
        className={clsx(
          'absolute inset-x-0 top-0 h-[2px] transition-all duration-500',
          isActive
            ? 'bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-100'
            : isCompleted
              ? 'bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent opacity-100'
              : 'bg-gradient-to-r from-white/[0.04] via-white/[0.08] to-white/[0.04] opacity-60',
        )}
        aria-hidden="true"
      />

      {/* Header */}
      <div className="flex items-start gap-5 px-6 pt-6 pb-2 sm:px-8 sm:pt-8">
        <div
          className={clsx(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold transition-all duration-500',
            isActive && [
              'bg-gradient-to-br from-indigo-500 to-violet-600 text-white',
              'shadow-md shadow-indigo-500/25',
            ],
            isCompleted &&
              !isActive && [
                'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15',
              ],
            !isActive &&
              !isCompleted && [
                'bg-white/[0.05] text-gray-500 border border-white/[0.06]',
              ],
          )}
          aria-hidden="true"
        >
          {isCompleted && !isActive ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            stepNumber
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <Icon
              className={clsx(
                'h-4 w-4 shrink-0 transition-colors duration-300',
                isActive && 'text-indigo-400',
                isCompleted && !isActive && 'text-emerald-400/70',
                !isActive && !isCompleted && 'text-gray-500',
              )}
              aria-hidden="true"
            />
            <h3
              className={clsx(
                'text-base font-semibold leading-snug tracking-tight transition-colors duration-300 sm:text-lg',
                isActive && 'text-gray-100',
                isCompleted && !isActive && 'text-gray-300',
                !isActive && !isCompleted && 'text-gray-400',
              )}
            >
              {title}
            </h3>
          </div>
          {subtitle && (
            <p className="mt-1 text-[13px] leading-relaxed text-gray-500">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-6 pb-6 pt-5 sm:px-8 sm:pb-8 sm:pt-6">
        {children}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function MintPage() {
  const currentDocument = useDocumentStore((s) => s.currentDocument);
  const tradeHistory = useTradeStore((s) => s.tradeHistory);
  const [selectedMintRequest, setSelectedMintRequest] =
    useState<MintApprovalRequestItem | null>(null);

  const hasMinted = tradeHistory.some(
    (t) => t.type === 'mint' && t.status === 'confirmed',
  );

  const activeStep = useMemo(() => {
    if (!currentDocument) return 1;
    if (
      !currentDocument.transactions ||
      currentDocument.transactions.length === 0
    )
      return 1;
    if (hasMinted) return 4;
    return 2;
  }, [currentDocument, hasMinted]);

  const transactionCountLabel = currentDocument?.transactions?.length
    ? `${currentDocument.transactions.length} transaction${currentDocument.transactions.length === 1 ? '' : 's'} parsed from ${currentDocument.fileName}`
    : 'Parsed transactions will appear here after upload.';

  return (
    <div className="w-full">
      {/* ---------------------------------------------------------------- */}
      {/* Page header                                                      */}
      {/* ---------------------------------------------------------------- */}
      <header className="mb-12 text-center sm:mb-16">
        <div className="mb-4 flex items-center justify-center">
          <div className="flex items-center gap-2.5 rounded-full border border-indigo-500/15 bg-indigo-500/[0.06] px-4 py-1.5">
            <Sparkles className="h-3.5 w-3.5 text-indigo-400" aria-hidden="true" />
            <span className="text-xs font-medium tracking-wide text-indigo-300/90">
              Asset Tokenization
            </span>
          </div>
        </div>

        <h1 className="mb-5 bg-gradient-to-r from-indigo-300 via-violet-300 to-purple-300 bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl md:text-4xl">
          Upload &amp; Mint
        </h1>

        <div className="mt-12 sm:mt-14">
          <MintStepIndicator activeStep={activeStep} />
        </div>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* Info banner                                                      */}
      {/* ---------------------------------------------------------------- */}
      <div
        className={clsx(
          'mb-10 flex items-start gap-5 rounded-2xl border p-5 backdrop-blur-xl sm:mb-14 sm:gap-6 sm:p-7',
          'border-indigo-500/10 bg-indigo-500/[0.03] bg-[#0D0F14]/80',
        )}
        role="note"
      >
        <div className="flex-1 text-sm text-gray-400 leading-relaxed">
          <p className="font-medium text-gray-300 mb-1">How it works</p>
          <p>
            Upload a document (JSON, CSV, or XML), review the parsed transaction data,
            configure your token details, then mint your asset on-chain. Your wallet will
            prompt you to confirm the transaction.
          </p>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Two-column layout: Upload & Preview | Mint & History             */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-10">
        {/* Left column -- Upload + Transaction Preview */}
        <div className="flex flex-col gap-8">
          <SectionCard
            stepNumber={1}
            title="Upload document"
            subtitle="Drag and drop or browse for JSON, CSV, or XML files."
            icon={Upload}
            isActive={activeStep === 1}
            isCompleted={activeStep > 1}
          >
            <FileUploader />
          </SectionCard>

          <SectionCard
            stepNumber={2}
            title="Transaction preview"
            subtitle={transactionCountLabel}
            icon={FileText}
            isActive={activeStep === 2}
            isCompleted={activeStep > 2}
          >
            <TransactionPreview />
          </SectionCard>
        </div>

        {/* Right column -- Mint Form + History */}
        <div className="flex flex-col gap-8">
          <SectionCard
            stepNumber={3}
            title="Configure and mint asset"
            subtitle="Configure token details and mint your asset."
            icon={Coins}
            isActive={activeStep >= 2 && activeStep < 4}
            isCompleted={activeStep === 4}
          >
            <MintForm
              document={currentDocument}
              selectedRequest={selectedMintRequest}
              onClearSelectedRequest={() => setSelectedMintRequest(null)}
            />
          </SectionCard>

          <SectionCard
            stepNumber={4}
            title="Minting history"
            subtitle="Track minted assets."
            icon={History}
            isActive={activeStep === 4}
          >
            <MintHistory />
          </SectionCard>
        </div>
      </div>

      <section
        aria-label="Pending token requests"
        className="mt-10 rounded-2xl border border-white/[0.06] bg-[#0D0F14]/80 p-6 backdrop-blur-xl sm:mt-12 sm:p-8"
      >
        <div className="mb-5">
          <h2 className="text-base font-semibold tracking-tight text-gray-100">
            Pending Tokens
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Use pending and approved requests to prefill the mint form.
          </p>
        </div>
        <PendingTokensPanel
          selectedRequestId={selectedMintRequest?.id ?? null}
          onSelectRequest={setSelectedMintRequest}
        />
      </section>
    </div>
  );
}
