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

import { accountSchema, type AccountValues } from './signupSchemas';
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
    formState: { errors },
  } = useForm<AccountValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      email: defaultValues?.email ?? '',
      password: defaultValues?.password ?? '',
      confirmPassword: defaultValues?.confirmPassword ?? '',
    },
  });

  const onSubmit = handleSubmit((values) => {
    onNext(values);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {/* Email */}
      <div>
        <label htmlFor="signup-email" className={LABEL}>
          Email address
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
