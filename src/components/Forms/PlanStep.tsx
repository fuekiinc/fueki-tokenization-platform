import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';
import type { SubscriptionPlan } from '../../types/auth';
import { BACK_BUTTON, CONTINUE_BUTTON } from './signupStyles';

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

type PlanCategory = 'platform' | 'deployer_only';

const PLANS: {
  id: SubscriptionPlan;
  category: PlanCategory;
  name: string;
  price: string;
  period: string;
  description: string;
  highlights: string[];
  accessScope: string;
  invoicing: string;
  badge?: string;
}[] = [
  {
    id: 'monthly',
    category: 'platform',
    name: 'Platform Monthly',
    price: '$200',
    period: '/month',
    description: 'Full tokenization platform access billed monthly.',
    highlights: [
      'Access to full platform modules',
      'Manage and interact with tokenized assets',
      'Monthly subscription invoicing after approval',
    ],
    accessScope: 'Full platform access',
    invoicing: 'Monthly invoice after approval',
  },
  {
    id: 'annual',
    category: 'platform',
    name: 'Platform Annual',
    price: '$1,800',
    period: '/year',
    description: 'Full platform access with annual billing.',
    highlights: [
      'Includes everything in Platform Monthly',
      'Annual billing cycle for predictable budgeting',
      'Lower effective monthly cost',
    ],
    accessScope: 'Full platform access',
    invoicing: 'Annual invoice after approval',
    badge: 'Save 25%',
  },
  {
    id: 'full_service',
    category: 'platform',
    name: 'White Glove Platform',
    price: 'Bespoke pricing',
    period: '',
    description: 'Team-led onboarding, configuration, and deployment support.',
    highlights: [
      'Dedicated white-glove implementation support',
      'Full platform access for monitoring and management',
      'Pricing quoted based on your requirements',
    ],
    accessScope: 'Full platform access + white-glove support',
    invoicing: 'Bespoke invoice after scope review',
    badge: 'White Glove',
  },
  {
    id: 'contract_deployment_monthly',
    category: 'deployer_only',
    name: 'Contract Deploy Monthly',
    price: '$70',
    period: '/month',
    description: 'Access only to the smart contract deployment workflow.',
    highlights: [
      'Contract deployer access only',
      'Monthly subscription billing',
      'Per-contract deployment fees apply',
    ],
    accessScope: 'Contract deployer only',
    invoicing: 'Monthly invoice + per-deployment fees',
    badge: 'Deployer Only',
  },
  {
    id: 'contract_deployment_annual',
    category: 'deployer_only',
    name: 'Contract Deploy Annual',
    price: '$600',
    period: '/year',
    description: 'Deployer-only access with annual billing.',
    highlights: [
      'Contract deployer access only',
      'Annual subscription billing',
      'Per-contract deployment fees apply',
    ],
    accessScope: 'Contract deployer only',
    invoicing: 'Annual invoice + per-deployment fees',
    badge: 'Deployer Only',
  },
  {
    id: 'contract_deployment_white_glove',
    category: 'deployer_only',
    name: 'White Glove Deploy',
    price: 'Bespoke pricing',
    period: '',
    description: 'White-glove deployment and configuration for contract-only workflows.',
    highlights: [
      'Contract deployment handled with expert support',
      'Custom scoping based on your deployment needs',
      'Deployer-only platform access model',
    ],
    accessScope: 'Contract deployer only + white-glove support',
    invoicing: 'Bespoke invoice + per-deployment fees',
    badge: 'Deployer + White Glove',
  },
];

const PLAN_GROUPS: {
  id: PlanCategory;
  title: string;
  description: string;
}[] = [
  {
    id: 'platform',
    title: 'Full Platform Access Plans',
    description: 'Best for issuers who want the full tokenization, portfolio, and trading experience.',
  },
  {
    id: 'deployer_only',
    title: 'Contract Deployer-Only Plans',
    description: 'Best for users who only need contract deployment workflows.',
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
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
        <p className="text-sm leading-relaxed text-amber-100">
          Please select a subscription plan. You will only be invoiced after your account is
          verified and approved. On the next page, you can enter demo mode and test the platform
          before any invoice is due.
        </p>
      </div>

      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
        A platform subscription is required to access the tokenization platform
        and to interact with your on-chain assets. Deployer-only plans are
        restricted to the contract deployment section of the app.
      </p>

      <div className="space-y-6">
        {PLAN_GROUPS.map((group) => (
          <section key={group.id} className="space-y-3">
            <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-4 py-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">{group.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                {group.description}
              </p>
            </div>

            <div className="space-y-3">
              {PLANS.filter((plan) => plan.category === group.id).map((plan) => {
                const isSelected = selected === plan.id;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelected(plan.id)}
                    className={clsx(
                      'relative w-full text-left rounded-xl border p-4 transition-all duration-200',
                      isSelected
                        ? 'border-indigo-500 bg-indigo-500/[0.10] ring-1 ring-indigo-500'
                        : 'border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:border-[var(--border-hover)]',
                    )}
                  >
                    {plan.badge && (
                      <span
                        className={clsx(
                          'absolute right-3 top-3 rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide',
                          isSelected
                            ? 'bg-indigo-500 text-white'
                            : 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]',
                        )}
                      >
                        {plan.badge}
                      </span>
                    )}

                    <div className="flex items-start gap-3">
                      <div
                        className={clsx(
                          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                          isSelected
                            ? 'border-indigo-500 bg-indigo-500'
                            : 'border-[var(--border-primary)]',
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                      </div>

                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-2 pr-24 sm:pr-28">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[var(--text-primary)]">{plan.name}</p>
                            <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                              {plan.description}
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="text-lg font-bold text-[var(--text-primary)]">{plan.price}</p>
                            {plan.period && (
                              <p className="text-xs text-[var(--text-muted)]">{plan.period}</p>
                            )}
                          </div>
                        </div>

                        <ul className="space-y-1.5">
                          {plan.highlights.map((highlight) => (
                            <li key={highlight} className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
                              <span>{highlight}</span>
                            </li>
                          ))}
                        </ul>

                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-3 py-2">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Access scope</p>
                            <p className="mt-1 text-xs text-[var(--text-secondary)]">{plan.accessScope}</p>
                          </div>
                          <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-3 py-2">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Invoicing</p>
                            <p className="mt-1 text-xs text-[var(--text-secondary)]">{plan.invoicing}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <p className="text-xs text-[var(--text-muted)] leading-relaxed">
        After your application is approved, you will receive an invoice via email
        for the plan you selected above. White-glove plans are bespoke priced and
        invoiced based on your specific requirements. Deployer-only plans include
        a separate per-contract deployment fee.
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
