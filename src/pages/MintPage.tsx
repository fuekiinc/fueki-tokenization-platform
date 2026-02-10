import { useMemo } from 'react';
import clsx from 'clsx';
import {
  Upload,
  FileText,
  Coins,
  History,
  Info,
  CheckCircle2,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import FileUploader from '../components/Upload/FileUploader';
import TransactionPreview from '../components/Upload/TransactionPreview';
import MintForm from '../components/Mint/MintForm';
import MintHistory from '../components/Mint/MintHistory';

// ---------------------------------------------------------------------------
// Step indicator configuration
// ---------------------------------------------------------------------------

const STEPS = [
  { id: 1, label: 'Upload', fullLabel: 'Upload Document', icon: Upload },
  { id: 2, label: 'Review', fullLabel: 'Review Data', icon: FileText },
  { id: 3, label: 'Configure', fullLabel: 'Configure Token', icon: Coins },
  { id: 4, label: 'Mint', fullLabel: 'Mint Token', icon: CheckCircle2 },
] as const;

// ---------------------------------------------------------------------------
// Shared style tokens
// ---------------------------------------------------------------------------

const GLASS =
  'bg-[#0D0F14]/80 backdrop-blur-xl border border-white/[0.06] rounded-2xl';

// ---------------------------------------------------------------------------
// Step indicator bar -- horizontal stepper with generous spacing
// ---------------------------------------------------------------------------

function StepIndicator({ activeStep }: { activeStep: number }) {
  return (
    <nav
      aria-label="Mint workflow progress"
      className="mx-auto w-full max-w-2xl"
    >
      <ol className="flex items-center justify-between">
        {STEPS.map((step, idx) => {
          const StepIcon = step.icon;
          const isCompleted = step.id < activeStep;
          const isCurrent = step.id === activeStep;
          const isUpcoming = step.id > activeStep;

          return (
            <li key={step.id} className="flex flex-1 items-center">
              {/* Step node */}
              <div className="flex flex-col items-center gap-3">
                {/* Circle */}
                <div
                  className={clsx(
                    'relative flex h-11 w-11 items-center justify-center rounded-full transition-all duration-500',
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
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <StepIcon className="h-4.5 w-4.5" />
                  )}

                  {/* Pulse ring on active */}
                  {isCurrent && (
                    <span className="absolute inset-0 animate-ping rounded-full bg-indigo-500/20 duration-1000" />
                  )}
                </div>

                {/* Label */}
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
              </div>

              {/* Connector line between steps */}
              {idx < STEPS.length - 1 && (
                <div className="relative mx-3 mb-6 h-px flex-1 sm:mx-5">
                  {/* Track */}
                  <div className="absolute inset-0 rounded-full bg-white/[0.06]" />
                  {/* Fill */}
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
// Section card -- glass container with optional step badge
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
      className={clsx(
        'group relative overflow-hidden rounded-2xl border backdrop-blur-xl transition-all duration-500',
        'bg-[#0D0F14]/80',
        isActive
          ? 'border-indigo-500/20 shadow-[0_0_60px_-15px_rgba(99,102,241,0.12)]'
          : 'border-white/[0.06] shadow-lg shadow-black/20',
        isCompleted && !isActive && 'border-emerald-500/10',
      )}
    >
      {/* Animated gradient top border */}
      <div
        className={clsx(
          'absolute inset-x-0 top-0 h-[2px] transition-all duration-500',
          isActive
            ? 'bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-100'
            : isCompleted
              ? 'bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent opacity-100'
              : 'bg-gradient-to-r from-white/[0.04] via-white/[0.08] to-white/[0.04] opacity-60',
        )}
      />

      {/* Card header with generous padding */}
      <div className="flex items-start gap-4 px-6 pt-6 pb-1 sm:gap-5 sm:px-8 sm:pt-8 lg:px-10 lg:pt-10">
        {/* Step badge */}
        <div
          className={clsx(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold transition-all duration-500',
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
        >
          {isCompleted && !isActive ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            stepNumber
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <Icon
              className={clsx(
                'h-4 w-4 shrink-0 transition-colors duration-300',
                isActive && 'text-indigo-400',
                isCompleted && !isActive && 'text-emerald-400/70',
                !isActive && !isCompleted && 'text-gray-500',
              )}
            />
            <h3
              className={clsx(
                'text-lg font-semibold leading-snug tracking-tight transition-colors duration-300 sm:text-xl',
                isActive && 'text-gray-100',
                isCompleted && !isActive && 'text-gray-300',
                !isActive && !isCompleted && 'text-gray-400',
              )}
            >
              {title}
            </h3>
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-gray-500 sm:text-sm">
            {subtitle}
          </p>
        </div>
      </div>

      {/* Card body with matching generous padding */}
      <div className="px-6 pb-6 pt-5 sm:px-8 sm:pb-8 sm:pt-6 lg:px-10 lg:pb-10 lg:pt-7">
        {children}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function MintPage() {
  const { currentDocument, tradeHistory } = useAppStore();

  // Derive active step from current state.
  // Steps: 1 = Upload, 2 = Review Data, 3 = Configure Token, 4 = Mint
  // We advance to step 2 once a document is parsed with transactions,
  // and to step 3 once the user has the data ready for the mint form.
  // Step 4 is reached only after a successful mint (tracked via trade history).
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
    : 'Parsed transactions will appear here after upload';

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl">
        {/* -------------------------------------------------------------- */}
        {/* Page header                                                    */}
        {/* -------------------------------------------------------------- */}
        <header className="mb-10 text-center sm:mb-14">
          {/* Decorative element */}
          <div className="mb-6 flex items-center justify-center">
            <div className="flex items-center gap-2.5 rounded-full border border-indigo-500/15 bg-indigo-500/[0.06] px-4 py-1.5">
              <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
              <span className="text-xs font-medium tracking-wide text-indigo-300/90">
                Asset Tokenization
              </span>
            </div>
          </div>

          <h1 className="mb-4 bg-gradient-to-r from-indigo-300 via-violet-300 to-purple-300 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl lg:text-5xl">
            Upload &amp; Mint
          </h1>
          <p className="mx-auto max-w-xl text-sm leading-relaxed text-gray-400 sm:text-base sm:leading-relaxed">
            Transform financial documents into blockchain-backed wrapped asset
            tokens in a few simple steps.
          </p>

          {/* Step indicator with generous top margin */}
          <div className="mt-10 sm:mt-12">
            <StepIndicator activeStep={activeStep} />
          </div>
        </header>

        {/* -------------------------------------------------------------- */}
        {/* Info banner                                                    */}
        {/* -------------------------------------------------------------- */}
        <div
          className={clsx(
            GLASS,
            'mb-8 flex items-start gap-4 p-5 sm:mb-10 sm:gap-5 sm:p-6',
            'border-indigo-500/10 bg-indigo-500/[0.03]',
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10">
            <Info className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-indigo-300">
              How tokenization works
            </p>
            <p className="text-[13px] leading-relaxed text-gray-400 sm:text-sm sm:leading-relaxed">
              Upload a supported financial document (JSON, CSV, or XML). The
              platform parses and verifies transaction data, then deploys an
              ERC-20 wrapped asset token on-chain backed by the document hash as
              proof of authenticity.
            </p>
          </div>
        </div>

        {/* -------------------------------------------------------------- */}
        {/* Content area -- centered max-width for form readability        */}
        {/* -------------------------------------------------------------- */}
        <div className="mx-auto max-w-3xl">
          <div className="flex flex-col gap-8 sm:gap-10">
            {/* Step 1 -- Upload Document */}
            <SectionCard
              stepNumber={1}
              title="Upload Document"
              subtitle="Drag and drop or browse for JSON, CSV, or XML files"
              icon={Upload}
              isActive={activeStep === 1}
              isCompleted={activeStep > 1}
            >
              <FileUploader />
            </SectionCard>

            {/* Step 2 -- Transaction Preview */}
            <SectionCard
              stepNumber={2}
              title="Transaction Preview"
              subtitle={transactionCountLabel}
              icon={FileText}
              isActive={activeStep === 2}
              isCompleted={activeStep > 2}
            >
              <TransactionPreview />
            </SectionCard>

            {/* Visual connector between preview and mint */}
            {activeStep >= 2 && (
              <div className="flex items-center justify-center py-1">
                <div className="flex items-center gap-3 text-gray-600">
                  <div className="h-px w-8 bg-gradient-to-r from-transparent to-white/[0.08]" />
                  <ArrowRight className="h-4 w-4 text-indigo-500/40" />
                  <div className="h-px w-8 bg-gradient-to-l from-transparent to-white/[0.08]" />
                </div>
              </div>
            )}

            {/* Step 3 -- Configure & Mint */}
            <SectionCard
              stepNumber={3}
              title="Mint Wrapped Asset"
              subtitle="Create an ERC-20 token backed by your document"
              icon={Coins}
              isActive={activeStep >= 2 && activeStep < 4}
              isCompleted={activeStep === 4}
            >
              <MintForm document={currentDocument} />
            </SectionCard>

            {/* Step 4 -- Minting History */}
            <SectionCard
              stepNumber={4}
              title="Minting History"
              subtitle="Track your recently minted tokens and their on-chain status"
              icon={History}
              isActive={activeStep === 4}
            >
              <MintHistory />
            </SectionCard>
          </div>
        </div>

        {/* Bottom spacer for comfortable scrolling */}
        <div className="h-16 sm:h-20" />
      </div>
    </div>
  );
}
