import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  User,
  Calendar,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import clsx from 'clsx';

import { personalSchema, type PersonalValues } from './signupSchemas';
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
  onBack: () => void;
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
    },
  });

  const onSubmit = handleSubmit((values) => {
    onNext(values);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {/* First Name */}
      <div>
        <label htmlFor="signup-firstName" className={LABEL}>
          First name
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

      {/* Date of Birth */}
      <div>
        <label htmlFor="signup-dateOfBirth" className={LABEL}>
          Date of birth
        </label>
        <div className="relative">
          <Calendar className={ICON_LEFT} aria-hidden="true" />
          <input
            id="signup-dateOfBirth"
            type="date"
            autoComplete="bday"
            aria-invalid={errors.dateOfBirth ? true : undefined}
            aria-describedby={errors.dateOfBirth ? 'signup-dateOfBirth-error' : 'signup-dateOfBirth-hint'}
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

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onBack} className={BACK_BUTTON}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Back</span>
        </button>
        <button type="submit" className={CONTINUE_BUTTON}>
          <span>Continue</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
