import clsx from 'clsx';
import { CheckCircle2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StepIndicatorProps {
  steps: { label: string; description?: string }[];
  /** Zero-indexed current step */
  currentStep: number;
  className?: string;
}

// ---------------------------------------------------------------------------
// Step status helpers
// ---------------------------------------------------------------------------

type StepStatus = 'completed' | 'current' | 'upcoming';

function getStepStatus(index: number, currentStep: number): StepStatus {
  if (index < currentStep) return 'completed';
  if (index === currentStep) return 'current';
  return 'upcoming';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StepCircle({
  status,
  stepNumber,
}: {
  status: StepStatus;
  stepNumber: number;
}) {
  const isActive = status === 'completed' || status === 'current';

  return (
    <div
      className={clsx(
        'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
        'text-xs font-bold transition-all duration-300',
        isActive && [
          'bg-gradient-to-br from-indigo-500 to-violet-500 text-white',
          'shadow-[0_0_16px_-4px_rgba(99,102,241,0.5)]',
        ],
        status === 'upcoming' && [
          'bg-[var(--bg-tertiary)] border border-[var(--border-primary)]',
          'text-[var(--text-muted)]',
        ],
      )}
      aria-current={status === 'current' ? 'step' : undefined}
    >
      {status === 'completed' ? (
        <CheckCircle2 className="h-4.5 w-4.5" strokeWidth={2.5} />
      ) : (
        <span>{stepNumber}</span>
      )}
    </div>
  );
}

function ConnectingLine({ completed }: { completed: boolean }) {
  return (
    <div
      className={clsx(
        'h-0.5 flex-1 rounded-full transition-colors duration-300',
        completed
          ? 'bg-gradient-to-r from-indigo-500 to-violet-500'
          : 'bg-[var(--border-primary)]',
      )}
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// StepIndicator
// ---------------------------------------------------------------------------

export default function StepIndicator({
  steps,
  currentStep,
  className,
}: StepIndicatorProps) {
  return (
    <nav aria-label="Progress" className={clsx('w-full', className)}>
      <ol className="flex items-center">
        {steps.map((step, index) => {
          const status = getStepStatus(index, currentStep);
          const isLast = index === steps.length - 1;

          return (
            <li
              key={step.label}
              className={clsx(
                'flex items-center',
                // Each step + its connecting line should share available space
                // except the last step which only contains the circle
                isLast ? 'shrink-0' : 'flex-1',
              )}
            >
              {/* Circle + label column */}
              <div className="flex flex-col items-center gap-2">
                <StepCircle status={status} stepNumber={index + 1} />

                {/* Label -- hidden on small screens for compactness */}
                <div className="hidden sm:flex flex-col items-center text-center">
                  <span
                    className={clsx(
                      'text-xs font-medium transition-colors duration-300',
                      status === 'upcoming'
                        ? 'text-[var(--text-muted)]'
                        : 'text-[var(--text-primary)]',
                    )}
                  >
                    {step.label}
                  </span>

                  {step.description && (
                    <span className="mt-0.5 text-[10px] leading-tight text-[var(--text-muted)]">
                      {step.description}
                    </span>
                  )}
                </div>
              </div>

              {/* Connecting line to the next step */}
              {!isLast && (
                <div className="mx-2 sm:mx-3 mb-auto mt-4 flex-1">
                  <ConnectingLine completed={index < currentStep} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export type { StepIndicatorProps };
