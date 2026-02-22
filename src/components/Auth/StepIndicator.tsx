import { memo } from 'react';
import clsx from 'clsx';
import { Check } from 'lucide-react';

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

function StepDot({
  status,
  stepNumber,
  size = 'md',
}: {
  status: StepStatus;
  stepNumber: number;
  size?: 'sm' | 'md';
}) {
  const isActive = status === 'completed' || status === 'current';
  const isSm = size === 'sm';

  return (
    <div
      className={clsx(
        'relative z-10 flex shrink-0 items-center justify-center rounded-full',
        'font-bold transition-all duration-300',
        isSm ? 'h-5 w-5 text-[9px]' : 'h-8 w-8 text-xs',
        isActive && [
          'bg-gradient-to-br from-indigo-500 to-violet-500 text-white',
          !isSm && 'shadow-[0_0_16px_-4px_rgba(99,102,241,0.5)]',
        ],
        status === 'upcoming' && [
          'bg-[var(--bg-tertiary)] border border-[var(--border-primary)]',
          'text-[var(--text-muted)]',
        ],
      )}
    >
      {status === 'completed' ? (
        <Check className={isSm ? 'h-3 w-3' : 'h-4 w-4'} strokeWidth={3} aria-hidden="true" />
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

      {/* ----------------------------------------------------------------- */}
      {/* Desktop: horizontal with labels below each dot                     */}
      {/* ----------------------------------------------------------------- */}
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
                    <StepDot status={status} stepNumber={index + 1} />
                  </button>
                ) : (
                  <StepDot status={status} stepNumber={index + 1} />
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

      {/* ----------------------------------------------------------------- */}
      {/* Mobile: compact horizontal dots with current step label            */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex sm:hidden flex-col items-center gap-2">
        {/* Dot row */}
        <ol className="flex items-center gap-1.5">
          {steps.map((step, index) => {
            const status = getStepStatus(index, currentStep);
            const isClickable = status === 'completed' && !!onStepClick;
            const isLast = index === steps.length - 1;

            return (
              <li key={step.label} className="flex items-center" aria-current={status === 'current' ? 'step' : undefined}>
                {isClickable ? (
                  <button
                    type="button"
                    onClick={() => onStepClick(index)}
                    aria-label={`Go back to step ${index + 1}: ${step.label} (completed)`}
                    className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] rounded-full"
                  >
                    <StepDot status={status} stepNumber={index + 1} size="sm" />
                  </button>
                ) : (
                  <StepDot status={status} stepNumber={index + 1} size="sm" />
                )}

                {!isLast && (
                  <div className="w-4 mx-0.5">
                    <HorizontalConnectingLine completed={index < currentStep} />
                  </div>
                )}

                <span className="sr-only">
                  {step.label}
                  {status === 'completed'
                    ? ' (completed)'
                    : status === 'current'
                      ? ' (current step)'
                      : ' (upcoming)'}
                </span>
              </li>
            );
          })}
        </ol>

        {/* Current step label */}
        <p className="text-xs text-[var(--text-muted)]">
          Step {currentStep + 1} of {steps.length}
          <span className="mx-1.5 text-[var(--border-primary)]">&middot;</span>
          <span className="text-[var(--text-secondary)] font-medium">{steps[currentStep]?.label}</span>
        </p>
      </div>
    </nav>
  );
});

export default StepIndicator;
export type { StepIndicatorProps };
