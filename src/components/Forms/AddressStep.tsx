import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  MapPin,
  Building2,
  Hash,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import clsx from 'clsx';

import { addressSchema, type AddressValues, COUNTRIES } from './signupSchemas';
import {
  INPUT_BASE,
  INPUT_NO_ICON,
  SELECT_BASE,
  ICON_LEFT,
  LABEL,
  ERROR_TEXT,
  CONTINUE_BUTTON,
  BACK_BUTTON,
} from './signupStyles';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AddressStepProps {
  defaultValues: AddressValues | null;
  onNext: (values: AddressValues) => void;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AddressStep({ defaultValues, onNext, onBack }: AddressStepProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AddressValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      addressLine1: defaultValues?.addressLine1 ?? '',
      addressLine2: defaultValues?.addressLine2 ?? '',
      city: defaultValues?.city ?? '',
      state: defaultValues?.state ?? '',
      zipCode: defaultValues?.zipCode ?? '',
      country: defaultValues?.country ?? 'United States',
    },
  });

  const onSubmit = handleSubmit((values) => {
    onNext(values);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {/* Address Line 1 */}
      <div>
        <label htmlFor="signup-addressLine1" className={LABEL}>
          Street address
        </label>
        <div className="relative">
          <MapPin className={ICON_LEFT} aria-hidden="true" />
          <input
            id="signup-addressLine1"
            type="text"
            autoComplete="address-line1"
            placeholder="123 Main Street"
            aria-invalid={errors.addressLine1 ? true : undefined}
            aria-describedby={errors.addressLine1 ? 'signup-addressLine1-error' : undefined}
            className={clsx(
              INPUT_BASE,
              errors.addressLine1 && 'border-[var(--danger)]',
            )}
            {...register('addressLine1')}
          />
        </div>
        {errors.addressLine1 && (
          <p id="signup-addressLine1-error" role="alert" className={ERROR_TEXT}>
            {errors.addressLine1.message}
          </p>
        )}
      </div>

      {/* Address Line 2 */}
      <div>
        <label htmlFor="signup-addressLine2" className={LABEL}>
          Address line 2{' '}
          <span className="text-[var(--text-muted)] font-normal">(optional)</span>
        </label>
        <div className="relative">
          <Building2 className={ICON_LEFT} aria-hidden="true" />
          <input
            id="signup-addressLine2"
            type="text"
            autoComplete="address-line2"
            placeholder="Apt, Suite, Unit, etc."
            className={INPUT_BASE}
            {...register('addressLine2')}
          />
        </div>
      </div>

      {/* City & State row */}
      <div className="grid grid-cols-2 gap-4">
        {/* City */}
        <div>
          <label htmlFor="signup-city" className={LABEL}>
            City
          </label>
          <input
            id="signup-city"
            type="text"
            autoComplete="address-level2"
            placeholder="New York"
            aria-invalid={errors.city ? true : undefined}
            aria-describedby={errors.city ? 'signup-city-error' : undefined}
            className={clsx(
              INPUT_NO_ICON,
              errors.city && 'border-[var(--danger)]',
            )}
            {...register('city')}
          />
          {errors.city && (
            <p id="signup-city-error" role="alert" className={ERROR_TEXT}>
              {errors.city.message}
            </p>
          )}
        </div>

        {/* State */}
        <div>
          <label htmlFor="signup-state" className={LABEL}>
            State
          </label>
          <input
            id="signup-state"
            type="text"
            autoComplete="address-level1"
            placeholder="NY"
            aria-invalid={errors.state ? true : undefined}
            aria-describedby={errors.state ? 'signup-state-error' : undefined}
            className={clsx(
              INPUT_NO_ICON,
              errors.state && 'border-[var(--danger)]',
            )}
            {...register('state')}
          />
          {errors.state && (
            <p id="signup-state-error" role="alert" className={ERROR_TEXT}>
              {errors.state.message}
            </p>
          )}
        </div>
      </div>

      {/* ZIP & Country row */}
      <div className="grid grid-cols-2 gap-4">
        {/* ZIP Code */}
        <div>
          <label htmlFor="signup-zipCode" className={LABEL}>
            ZIP code
          </label>
          <div className="relative">
            <Hash className={ICON_LEFT} aria-hidden="true" />
            <input
              id="signup-zipCode"
              type="text"
              autoComplete="postal-code"
              placeholder="10001"
              maxLength={10}
              aria-invalid={errors.zipCode ? true : undefined}
              aria-describedby={errors.zipCode ? 'signup-zipCode-error' : undefined}
              className={clsx(
                INPUT_BASE,
                errors.zipCode && 'border-[var(--danger)]',
              )}
              {...register('zipCode')}
            />
          </div>
          {errors.zipCode && (
            <p id="signup-zipCode-error" role="alert" className={ERROR_TEXT}>
              {errors.zipCode.message}
            </p>
          )}
        </div>

        {/* Country */}
        <div>
          <label htmlFor="signup-country" className={LABEL}>
            Country
          </label>
          <div className="relative">
            <MapPin className={ICON_LEFT} aria-hidden="true" />
            <select
              id="signup-country"
              autoComplete="country-name"
              aria-invalid={errors.country ? true : undefined}
              aria-describedby={errors.country ? 'signup-country-error' : undefined}
              className={clsx(
                SELECT_BASE,
                errors.country && 'border-[var(--danger)]',
              )}
              {...register('country')}
            >
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          {errors.country && (
            <p id="signup-country-error" role="alert" className={ERROR_TEXT}>
              {errors.country.message}
            </p>
          )}
        </div>
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
