import { memo } from 'react';
import clsx from 'clsx';
import { CheckCircle2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StepIndicatorProps {
  steps: { label: string; description?: string }[];
  /** Zero-indexed current step */
  currentStep: number;
  /** Callback when a completed step is clicked to navigate back */
  onStepClick?: (stepIndex: number) => void;
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
    >
      {status === 'completed' ? (
        <CheckCircle2 className="h-4.5 w-4.5" strokeWidth={2.5} aria-hidden="true" />
      ) : (
        <span>{stepNumber}</span>
      )}
    </div>
  );
}

function HorizontalConnectingLine({ completed }: { completed: boolean }) {
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

function VerticalConnectingLine({ completed }: { completed: boolean }) {
  return (
    <div
      className={clsx(
        'w-0.5 flex-1 min-h-[24px] rounded-full transition-colors duration-300 mx-auto',
        completed
          ? 'bg-gradient-to-b from-indigo-500 to-violet-500'
          : 'bg-[var(--border-primary)]',
      )}
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// StepIndicator
// ---------------------------------------------------------------------------

const StepIndicator = memo(function StepIndicator({
  steps,
  currentStep,
  onStepClick,
  className,
}: StepIndicatorProps) {
  return (
    <nav
      aria-label={`Signup progress: step ${currentStep + 1} of ${steps.length}, ${steps[currentStep]?.label ?? ''}`}
      className={clsx('w-full', className)}
    >
      {/* Live region for screen reader step change announcements */}
      <div aria-live="polite" className="sr-only">
        Step {currentStep + 1} of {steps.length}: {steps[currentStep]?.label}
      </div>

      {/* Horizontal layout for sm+ screens */}
      <ol className="hidden sm:flex items-center">
        {steps.map((step, index) => {
          const status = getStepStatus(index, currentStep);
          const isLast = index === steps.length - 1;
          const isClickable = status === 'completed' && !!onStepClick;

          return (
            <li
              key={step.label}
              className={clsx(
                'flex items-center',
                isLast ? 'shrink-0' : 'flex-1',
              )}
              aria-current={status === 'current' ? 'step' : undefined}
            >
              {/* Circle + label column */}
              <div className="flex flex-col items-center gap-2">
                {isClickable ? (
                  <button
                    type="button"
                    onClick={() => onStepClick(index)}
                    aria-label={`Go back to step ${index + 1}: ${step.label} (completed)`}
                    className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)] rounded-full"
                  >
                    <StepCircle status={status} stepNumber={index + 1} />
                  </button>
                ) : (
                  <StepCircle status={status} stepNumber={index + 1} />
                )}

                {/* Label -- visible below each dot */}
                <div className="flex flex-col items-center text-center">
                  <span
                    className={clsx(
                      'text-xs font-medium transition-colors duration-300',
                      isClickable && 'cursor-pointer hover:text-[var(--accent-primary)]',
                      status === 'upcoming'
                        ? 'text-[var(--text-muted)]'
                        : 'text-[var(--text-primary)]',
                    )}
                    onClick={isClickable ? () => onStepClick(index) : undefined}
                    role={isClickable ? 'button' : undefined}
                    tabIndex={isClickable ? 0 : undefined}
                    onKeyDown={
                      isClickable
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onStepClick(index);
                            }
                          }
                        : undefined
                    }
                  >
                    {step.label}
                  </span>

                  {step.description && (
                    <span className="mt-0.5 block text-[10px] leading-tight text-[var(--text-muted)]">
                      {step.description}
                    </span>
                  )}
                </div>

                {/* Screen-reader-only status text */}
                <span className="sr-only">
                  {status === 'completed'
                    ? '(completed)'
                    : status === 'current'
                      ? '(current step)'
                      : '(upcoming)'}
                </span>
              </div>

              {/* Connecting line to the next step */}
              {!isLast && (
                <div className="mx-2 sm:mx-3 mb-auto mt-4 flex-1">
                  <HorizontalConnectingLine completed={index < currentStep} />
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {/* Vertical layout for mobile screens */}
      <ol className="flex sm:hidden flex-col">
        {steps.map((step, index) => {
          const status = getStepStatus(index, currentStep);
          const isLast = index === steps.length - 1;
          const isClickable = status === 'completed' && !!onStepClick;

          return (
            <li
              key={step.label}
              className="flex flex-col"
              aria-current={status === 'current' ? 'step' : undefined}
            >
              <div className="flex items-center gap-3">
                {isClickable ? (
                  <button
                    type="button"
                    onClick={() => onStepClick(index)}
                    aria-label={`Go back to step ${index + 1}: ${step.label} (completed)`}
                    className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)] rounded-full"
                  >
                    <StepCircle status={status} stepNumber={index + 1} />
                  </button>
                ) : (
                  <StepCircle status={status} stepNumber={index + 1} />
                )}

                <div className="flex flex-col min-w-0">
                  <span
                    className={clsx(
                      'text-sm font-medium transition-colors duration-300',
                      isClickable && 'cursor-pointer hover:text-[var(--accent-primary)]',
                      status === 'upcoming'
                        ? 'text-[var(--text-muted)]'
                        : 'text-[var(--text-primary)]',
                    )}
                    onClick={isClickable ? () => onStepClick(index) : undefined}
                    role={isClickable ? 'button' : undefined}
                    tabIndex={isClickable ? 0 : undefined}
                    onKeyDown={
                      isClickable
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onStepClick(index);
                            }
                          }
                        : undefined
                    }
                  >
                    {step.label}
                  </span>
                  {step.description && (
                    <span className="text-xs text-[var(--text-muted)] leading-tight">
                      {step.description}
                    </span>
                  )}
                </div>

                <span className="sr-only">
                  {status === 'completed'
                    ? '(completed)'
                    : status === 'current'
                      ? '(current step)'
                      : '(upcoming)'}
                </span>
              </div>

              {/* Vertical connecting line */}
              {!isLast && (
                <div className="flex ml-[15px] py-1">
                  <VerticalConnectingLine completed={index < currentStep} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
});

export default StepIndicator;
export type { StepIndicatorProps };
