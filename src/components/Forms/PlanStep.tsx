import { useState } from 'react';
import { ArrowRight, ArrowLeft, Check } from 'lucide-react';
import clsx from 'clsx';
import type { SubscriptionPlan } from '../../types/auth';
import { CONTINUE_BUTTON, BACK_BUTTON } from './signupStyles';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PlanStepProps {
  defaultValue: SubscriptionPlan | null;
  onNext: (plan: SubscriptionPlan) => void;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Plan option data
// ---------------------------------------------------------------------------

const PLANS: {
  id: SubscriptionPlan;
  name: string;
  price: string;
  period: string;
  detail: string;
  subDetail?: string;
  badge?: string;
}[] = [
  {
    id: 'monthly',
    name: 'Monthly',
    price: '$200',
    period: '/month',
    detail: 'Billed monthly. Cancel anytime.',
  },
  {
    id: 'annual',
    name: 'Annual',
    price: '$1,800',
    period: '/year',
    detail: 'Billed annually. Save $600 per year.',
    badge: 'Save 25%',
  },
  {
    id: 'full_service',
    name: 'Full Service',
    price: 'Bespoke pricing',
    period: '',
    detail:
      'The Fueki team personally handles your tokenization process.',
    subDetail:
      'You still get full platform access to view, manage, and interact with your token supply and monetize while we provide white-glove configuration and deployment support.',
    badge: 'White Glove',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PlanStep({ defaultValue, onNext, onBack }: PlanStepProps) {
  const [selected, setSelected] = useState<SubscriptionPlan | null>(defaultValue);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selected) onNext(selected);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
        A platform subscription is required to access the tokenization platform
        and to interact with, transfer, and distribute your security tokens.
      </p>

      <div className="space-y-3">
        {PLANS.map((plan) => {
          const isSelected = selected === plan.id;
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => setSelected(plan.id)}
              className={clsx(
                'relative w-full text-left rounded-xl border p-5 transition-all duration-200',
                isSelected
                  ? 'border-indigo-500 bg-indigo-500/[0.08] ring-1 ring-indigo-500'
                  : 'border-[var(--border-primary)] bg-[var(--bg-tertiary)] hover:border-[var(--border-hover)]',
              )}
            >
              {/* Badge */}
              {plan.badge && (
                <span
                  className={clsx(
                    'absolute -top-2.5 right-4 px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide',
                    isSelected
                      ? 'bg-indigo-500 text-white'
                      : 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]',
                  )}
                >
                  {plan.badge}
                </span>
              )}

              <div className="flex items-center gap-4">
                {/* Radio indicator */}
                <div
                  className={clsx(
                    'flex items-center justify-center h-5 w-5 rounded-full border-2 shrink-0 transition-colors',
                    isSelected
                      ? 'border-indigo-500 bg-indigo-500'
                      : 'border-[var(--border-primary)]',
                  )}
                >
                  {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                </div>

                {/* Plan info */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold tracking-[0.08em] uppercase text-[var(--text-secondary)]">
                    {plan.name}
                  </p>
                  <div className="mt-0.5 flex items-baseline gap-1.5">
                    <span
                      className={clsx(
                        'text-lg font-bold',
                        isSelected ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]',
                      )}
                    >
                      {plan.price}
                    </span>
                    {plan.period && (
                      <span className="text-sm text-[var(--text-muted)]">{plan.period}</span>
                    )}
                  </div>
                  <p className="text-sm text-[var(--text-muted)] mt-0.5">{plan.detail}</p>
                  {plan.subDetail && (
                    <p className="text-xs text-[var(--text-muted)] mt-1.5 leading-relaxed">
                      {plan.subDetail}
                    </p>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-[var(--text-muted)] leading-relaxed">
        After your application is approved, you will receive an invoice via email
        for the plan you selected above. Full Service is bespoke priced and
        invoiced based on your specific requirements.
      </p>

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onBack} className={BACK_BUTTON}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Back</span>
        </button>
        <button type="submit" disabled={!selected} className={CONTINUE_BUTTON}>
          <span>Continue</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
