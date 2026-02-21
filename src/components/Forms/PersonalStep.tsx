import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  User,
  Calendar,
  Phone,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import clsx from 'clsx';

import { personalSchema, HELP_LEVEL_OPTIONS, type PersonalValues } from './signupSchemas';
import {
  INPUT_BASE,
  ICON_LEFT,
  LABEL,
  ERROR_TEXT,
  CONTINUE_BUTTON,
  BACK_BUTTON,
} from './signupStyles';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PersonalStepProps {
  defaultValues: PersonalValues | null;
  onNext: (values: PersonalValues) => void;
  onBack?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PersonalStep({ defaultValues, onNext, onBack }: PersonalStepProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PersonalValues>({
    resolver: zodResolver(personalSchema),
    defaultValues: {
      firstName: defaultValues?.firstName ?? '',
      lastName: defaultValues?.lastName ?? '',
      dateOfBirth: defaultValues?.dateOfBirth ?? '',
      phone: defaultValues?.phone ?? '',
      helpLevel: defaultValues?.helpLevel ?? 'novice',
    },
  });

  const onSubmit = handleSubmit((values) => {
    onNext(values);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {/* Name row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* First Name */}
        <div>
          <label htmlFor="signup-firstName" className={LABEL}>
            First name
            <span className="ml-0.5 text-red-400" aria-hidden="true">*</span>
          </label>
          <div className="relative">
            <User className={ICON_LEFT} aria-hidden="true" />
            <input
              id="signup-firstName"
              type="text"
              autoComplete="given-name"
              placeholder="Enter your first name"
              aria-invalid={errors.firstName ? true : undefined}
              aria-describedby={errors.firstName ? 'signup-firstName-error' : undefined}
              aria-required="true"
              className={clsx(
                INPUT_BASE,
                errors.firstName && 'border-[var(--danger)]',
              )}
              {...register('firstName')}
            />
          </div>
          {errors.firstName && (
            <p id="signup-firstName-error" role="alert" className={ERROR_TEXT}>
              {errors.firstName.message}
            </p>
          )}
        </div>

        {/* Last Name */}
        <div>
          <label htmlFor="signup-lastName" className={LABEL}>
            Last name
            <span className="ml-0.5 text-red-400" aria-hidden="true">*</span>
          </label>
          <div className="relative">
            <User className={ICON_LEFT} aria-hidden="true" />
            <input
              id="signup-lastName"
              type="text"
              autoComplete="family-name"
              placeholder="Enter your last name"
              aria-invalid={errors.lastName ? true : undefined}
              aria-describedby={errors.lastName ? 'signup-lastName-error' : undefined}
              aria-required="true"
              className={clsx(
                INPUT_BASE,
                errors.lastName && 'border-[var(--danger)]',
              )}
              {...register('lastName')}
            />
          </div>
          {errors.lastName && (
            <p id="signup-lastName-error" role="alert" className={ERROR_TEXT}>
              {errors.lastName.message}
            </p>
          )}
        </div>
      </div>

      {/* Date of Birth */}
      <div>
        <label htmlFor="signup-dateOfBirth" className={LABEL}>
          Date of birth
          <span className="ml-0.5 text-red-400" aria-hidden="true">*</span>
        </label>
        <div className="relative">
          <Calendar className={ICON_LEFT} aria-hidden="true" />
          <input
            id="signup-dateOfBirth"
            type="date"
            autoComplete="bday"
            aria-invalid={errors.dateOfBirth ? true : undefined}
            aria-describedby={errors.dateOfBirth ? 'signup-dateOfBirth-error' : 'signup-dateOfBirth-hint'}
            aria-required="true"
            className={clsx(
              INPUT_BASE,
              '[color-scheme:dark]',
              errors.dateOfBirth && 'border-[var(--danger)]',
            )}
            {...register('dateOfBirth')}
          />
        </div>
        {errors.dateOfBirth ? (
          <p id="signup-dateOfBirth-error" role="alert" className={ERROR_TEXT}>
            {errors.dateOfBirth.message}
          </p>
        ) : (
          <p id="signup-dateOfBirth-hint" className="mt-1.5 text-xs text-[var(--text-muted)]">
            You must be at least 18 years old.
          </p>
        )}
      </div>

      {/* Phone Number */}
      <div>
        <label htmlFor="signup-phone" className={LABEL}>
          Phone number
          <span className="ml-0.5 text-red-400" aria-hidden="true">*</span>
        </label>
        <div className="relative">
          <Phone className={ICON_LEFT} aria-hidden="true" />
          <input
            id="signup-phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="+12125551234"
            aria-invalid={errors.phone ? true : undefined}
            aria-describedby={errors.phone ? 'signup-phone-error' : 'signup-phone-hint'}
            aria-required="true"
            className={clsx(
              INPUT_BASE,
              errors.phone && 'border-[var(--danger)]',
            )}
            {...register('phone')}
          />
        </div>
        {errors.phone ? (
          <p id="signup-phone-error" role="alert" className={ERROR_TEXT}>
            {errors.phone.message}
          </p>
        ) : (
          <p id="signup-phone-hint" className="mt-1.5 text-xs text-[var(--text-muted)]">
            Include your country code (e.g., +1 for US/Canada).
          </p>
        )}
      </div>

      {/* Help level */}
      <fieldset className="space-y-2">
        <legend className={LABEL}>
          Help mode
          <span className="ml-0.5 text-red-400" aria-hidden="true">*</span>
        </legend>
        <p className="text-[11px] text-[var(--text-muted)]">
          Choose how much in-app guidance you want. You can change this later.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {HELP_LEVEL_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={clsx(
                'group relative flex cursor-pointer flex-col rounded-lg border px-2.5 py-2 transition-all duration-150',
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
                  'text-xs font-semibold text-[var(--text-secondary)]',
                  'peer-checked:text-[var(--text-primary)]',
                )}
              >
                {option.label}
              </span>
              <span className="text-[10px] leading-snug text-[var(--text-muted)] mt-0.5">
                {option.description}
              </span>
              <span
                className={clsx(
                  'pointer-events-none absolute inset-0 rounded-lg border transition-all duration-150',
                  'border-transparent peer-checked:border-indigo-500/60 peer-checked:ring-1 peer-checked:ring-indigo-500/35',
                )}
                aria-hidden="true"
              />
            </label>
          ))}
        </div>
      </fieldset>

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        {onBack && (
          <button type="button" onClick={onBack} className={BACK_BUTTON}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Back</span>
          </button>
        )}
        <button type="submit" className={CONTINUE_BUTTON}>
          <span>Continue</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
