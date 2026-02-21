import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
} from 'lucide-react';
import clsx from 'clsx';

import {
  accountSchema,
  getPasswordStrength,
  PASSWORD_STRENGTH_CONFIG,
  HELP_LEVEL_OPTIONS,
  type AccountValues,
} from './signupSchemas';
import {
  INPUT_BASE,
  ICON_LEFT,
  LABEL,
  ERROR_TEXT,
  CONTINUE_BUTTON,
} from './signupStyles';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AccountStepProps {
  defaultValues: AccountValues | null;
  onNext: (values: AccountValues) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AccountStep({ defaultValues, onNext }: AccountStepProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<AccountValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      email: defaultValues?.email ?? '',
      password: defaultValues?.password ?? '',
      confirmPassword: defaultValues?.confirmPassword ?? '',
      helpLevel: defaultValues?.helpLevel ?? 'novice',
      acceptTerms: defaultValues?.acceptTerms ?? false as unknown as true,
    },
  });

  const passwordValue = watch('password');
  const strength = getPasswordStrength(passwordValue ?? '');
  const strengthConfig = PASSWORD_STRENGTH_CONFIG[strength];

  const onSubmit = handleSubmit((values) => {
    onNext(values);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {/* Email */}
      <div>
        <label htmlFor="signup-email" className={LABEL}>
          Email address
          <span className="ml-0.5 text-red-400" aria-hidden="true">*</span>
        </label>
        <div className="relative">
          <Mail className={ICON_LEFT} aria-hidden="true" />
          <input
            id="signup-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'signup-email-error' : undefined}
            aria-required="true"
            className={clsx(
              INPUT_BASE,
              errors.email && 'border-[var(--danger)]',
            )}
            {...register('email')}
          />
        </div>
        {errors.email && (
          <p id="signup-email-error" role="alert" className={ERROR_TEXT}>
            {errors.email.message}
          </p>
        )}
      </div>

      {/* Password */}
      <div>
        <label htmlFor="signup-password" className={LABEL}>
          Password
          <span className="ml-0.5 text-red-400" aria-hidden="true">*</span>
        </label>
        <div className="relative">
          <Lock className={ICON_LEFT} aria-hidden="true" />
          <input
            id="signup-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Create a strong password"
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? 'signup-password-error' : 'signup-password-hint'}
            aria-required="true"
            className={clsx(
              INPUT_BASE,
              'pr-11',
              errors.password && 'border-[var(--danger)]',
            )}
            {...register('password')}
          />
          <button
            type="button"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((v) => !v)}
            className={clsx(
              'absolute right-3 top-1/2 -translate-y-1/2',
              'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
              'transition-colors duration-150',
            )}
          >
            {showPassword ? (
              <EyeOff className="h-[18px] w-[18px]" aria-hidden="true" />
            ) : (
              <Eye className="h-[18px] w-[18px]" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Password strength indicator */}
        {passwordValue && passwordValue.length > 0 && (
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
                <div
                  className={clsx(
                    'h-full rounded-full transition-all duration-300',
                    strengthConfig.bgColor,
                    strengthConfig.width,
                  )}
                />
              </div>
              <span className={clsx('text-xs font-medium', strengthConfig.color)}>
                {strengthConfig.label}
              </span>
            </div>
          </div>
        )}

        {errors.password ? (
          <p id="signup-password-error" role="alert" className={ERROR_TEXT}>
            {errors.password.message}
          </p>
        ) : (
          <p id="signup-password-hint" className="mt-1.5 text-xs text-[var(--text-muted)]">
            At least 8 characters with uppercase, lowercase, number, and special character.
          </p>
        )}
      </div>

      {/* Confirm Password */}
      <div>
        <label htmlFor="signup-confirmPassword" className={LABEL}>
          Confirm password
          <span className="ml-0.5 text-red-400" aria-hidden="true">*</span>
        </label>
        <div className="relative">
          <Lock className={ICON_LEFT} aria-hidden="true" />
          <input
            id="signup-confirmPassword"
            type={showConfirm ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Re-enter your password"
            aria-invalid={errors.confirmPassword ? true : undefined}
            aria-describedby={errors.confirmPassword ? 'signup-confirmPassword-error' : undefined}
            aria-required="true"
            className={clsx(
              INPUT_BASE,
              'pr-11',
              errors.confirmPassword && 'border-[var(--danger)]',
            )}
            {...register('confirmPassword')}
          />
          <button
            type="button"
            aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
            aria-pressed={showConfirm}
            onClick={() => setShowConfirm((v) => !v)}
            className={clsx(
              'absolute right-3 top-1/2 -translate-y-1/2',
              'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
              'transition-colors duration-150',
            )}
          >
            {showConfirm ? (
              <EyeOff className="h-[18px] w-[18px]" aria-hidden="true" />
            ) : (
              <Eye className="h-[18px] w-[18px]" aria-hidden="true" />
            )}
          </button>
        </div>
        {errors.confirmPassword && (
          <p id="signup-confirmPassword-error" role="alert" className={ERROR_TEXT}>
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      {/* Help level */}
      <fieldset className="space-y-2.5">
        <legend className={LABEL}>
          Help mode
          <span className="ml-0.5 text-red-400" aria-hidden="true">*</span>
        </legend>
        <p className="text-xs text-[var(--text-muted)]">
          Choose how much in-app guidance you want. You can change this in settings later.
        </p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {HELP_LEVEL_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={clsx(
                'group relative flex cursor-pointer flex-col rounded-xl border px-3.5 py-3 transition-all duration-150',
                'bg-[var(--bg-tertiary)]/70',
                'hover:border-[var(--border-hover)]',
              )}
            >
              <input
                type="radio"
                value={option.value}
                className="peer sr-only"
                {...register('helpLevel')}
              />
              <span
                className={clsx(
                  'mb-1 text-sm font-semibold text-[var(--text-secondary)]',
                  'peer-checked:text-[var(--text-primary)]',
                )}
              >
                {option.label}
              </span>
              <span className="text-xs leading-relaxed text-[var(--text-muted)]">
                {option.description}
              </span>
              <span
                className={clsx(
                  'pointer-events-none absolute inset-0 rounded-xl border transition-all duration-150',
                  'border-transparent peer-checked:border-indigo-500/60 peer-checked:ring-1 peer-checked:ring-indigo-500/35',
                )}
                aria-hidden="true"
              />
            </label>
          ))}
        </div>
      </fieldset>

      {/* Terms of Service */}
      <div className="space-y-1.5">
        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            className={clsx(
              'mt-0.5 h-4 w-4 shrink-0 rounded border appearance-none cursor-pointer',
              'border-[var(--border-primary)] bg-[var(--bg-tertiary)]',
              'checked:bg-indigo-600 checked:border-indigo-600',
              'focus:ring-2 focus:ring-[var(--accent-primary)]/30 focus:ring-offset-0',
              'transition-colors duration-150',
              errors.acceptTerms && 'border-[var(--danger)]',
            )}
            aria-invalid={errors.acceptTerms ? true : undefined}
            aria-describedby={errors.acceptTerms ? 'signup-terms-error' : undefined}
            {...register('acceptTerms')}
          />
          <span className="text-sm text-[var(--text-secondary)] leading-relaxed group-hover:text-[var(--text-primary)] transition-colors">
            I agree to the{' '}
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent-primary)] underline underline-offset-2 hover:text-indigo-300"
              onClick={(e) => e.stopPropagation()}
            >
              Terms of Service
            </a>{' '}
            and{' '}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent-primary)] underline underline-offset-2 hover:text-indigo-300"
              onClick={(e) => e.stopPropagation()}
            >
              Privacy Policy
            </a>
          </span>
        </label>
        {errors.acceptTerms && (
          <p id="signup-terms-error" role="alert" className={ERROR_TEXT}>
            {errors.acceptTerms.message}
          </p>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        <button type="submit" className={CONTINUE_BUTTON}>
          <span>Continue</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
