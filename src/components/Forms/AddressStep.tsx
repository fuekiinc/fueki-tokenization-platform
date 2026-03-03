import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Hash,
  MapPin,
} from 'lucide-react';
import clsx from 'clsx';
import usePlacesAutocomplete, { getGeocode } from 'use-places-autocomplete';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

import { addressSchema, type AddressValues, COUNTRIES } from './signupSchemas';
import {
  BACK_BUTTON,
  CONTINUE_BUTTON,
  ERROR_TEXT,
  ICON_LEFT,
  INPUT_BASE,
  INPUT_NO_ICON,
  LABEL,
  SELECT_BASE,
} from './signupStyles';

// ---------------------------------------------------------------------------
// Google Maps loader (singleton – avoids loading the script twice)
// ---------------------------------------------------------------------------

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

let loaderPromise: Promise<void> | null = null;

function ensurePlacesApi(): Promise<void> {
  if (!GOOGLE_API_KEY) return Promise.resolve();
  if (loaderPromise) return loaderPromise;
  setOptions({ key: GOOGLE_API_KEY });
  loaderPromise = importLibrary('places').then(() => {});
  return loaderPromise;
}

// ---------------------------------------------------------------------------
// Map Google address_components to our form fields
// ---------------------------------------------------------------------------

const COMPONENT_MAP: Record<string, keyof Pick<AddressValues, 'city' | 'state' | 'zipCode' | 'country'>> = {
  locality: 'city',
  administrative_area_level_1: 'state',
  postal_code: 'zipCode',
  country: 'country',
};

// Google returns country as short code (US) – map to our COUNTRIES list display name
const COUNTRY_CODE_TO_NAME: Record<string, string> = {
  US: 'United States',
  CA: 'Canada',
  GB: 'United Kingdom',
  DE: 'Germany',
  FR: 'France',
  JP: 'Japan',
  AU: 'Australia',
  SG: 'Singapore',
  CH: 'Switzerland',
  NL: 'Netherlands',
  SE: 'Sweden',
  NO: 'Norway',
  KR: 'South Korea',
  BR: 'Brazil',
  IN: 'India',
  MX: 'Mexico',
  IE: 'Ireland',
};

function parsePlace(place: google.maps.GeocoderResult): Partial<AddressValues> {
  const result: Partial<AddressValues> = {};
  let streetNumber = '';
  let route = '';

  for (const component of place.address_components) {
    const type = component.types[0];

    if (type === 'street_number') {
      streetNumber = component.long_name;
    } else if (type === 'route') {
      route = component.long_name;
    } else if (type === 'sublocality_level_1' || type === 'sublocality') {
      // fallback for city when locality is missing
      if (!result.city) result.city = component.long_name;
    } else if (type in COMPONENT_MAP) {
      const field = COMPONENT_MAP[type];
      if (field === 'country') {
        result.country = COUNTRY_CODE_TO_NAME[component.short_name] ?? component.long_name;
      } else if (field === 'state') {
        result.state = component.short_name; // e.g. "NY"
      } else {
        result[field] = component.long_name;
      }
    }
  }

  result.addressLine1 = [streetNumber, route].filter(Boolean).join(' ');
  return result;
}

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
    setValue,
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

  const [apiReady, setApiReady] = useState(false);

  useEffect(() => {
    ensurePlacesApi().then(() => setApiReady(true));
  }, []);

  const onSubmit = handleSubmit((values) => {
    onNext(values);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {/* Address Line 1 – with autocomplete when API is loaded */}
      <div>
        <label htmlFor="signup-addressLine1" className={LABEL}>
          Street address
          <span className="ml-0.5 text-red-400" aria-hidden="true">*</span>
        </label>
        {apiReady && GOOGLE_API_KEY ? (
          <PlacesInput
            defaultValue={defaultValues?.addressLine1 ?? ''}
            error={!!errors.addressLine1}
            register={register}
            onSelect={(parsed) => {
              if (parsed.addressLine1) setValue('addressLine1', parsed.addressLine1, { shouldValidate: true });
              if (parsed.city) setValue('city', parsed.city, { shouldValidate: true });
              if (parsed.state) setValue('state', parsed.state, { shouldValidate: true });
              if (parsed.zipCode) setValue('zipCode', parsed.zipCode, { shouldValidate: true });
              if (parsed.country) setValue('country', parsed.country, { shouldValidate: true });
            }}
          />
        ) : (
          <div className="relative">
            <MapPin className={ICON_LEFT} aria-hidden="true" />
            <input
              id="signup-addressLine1"
              type="text"
              autoComplete="address-line1"
              placeholder="123 Main Street"
              aria-invalid={errors.addressLine1 ? true : undefined}
              aria-describedby={errors.addressLine1 ? 'signup-addressLine1-error' : undefined}
              aria-required="true"
              className={clsx(INPUT_BASE, errors.addressLine1 && 'border-[var(--danger)]')}
              {...register('addressLine1')}
            />
          </div>
        )}
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
            <span className="ml-0.5 text-red-400" aria-hidden="true">*</span>
          </label>
          <input
            id="signup-city"
            type="text"
            autoComplete="address-level2"
            placeholder="New York"
            aria-invalid={errors.city ? true : undefined}
            aria-describedby={errors.city ? 'signup-city-error' : undefined}
            aria-required="true"
            className={clsx(INPUT_NO_ICON, errors.city && 'border-[var(--danger)]')}
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
            State / Province
            <span className="ml-0.5 text-red-400" aria-hidden="true">*</span>
          </label>
          <input
            id="signup-state"
            type="text"
            autoComplete="address-level1"
            placeholder="NY"
            aria-invalid={errors.state ? true : undefined}
            aria-describedby={errors.state ? 'signup-state-error' : undefined}
            aria-required="true"
            className={clsx(INPUT_NO_ICON, errors.state && 'border-[var(--danger)]')}
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
            ZIP / Postal code
            <span className="ml-0.5 text-red-400" aria-hidden="true">*</span>
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
              aria-required="true"
              className={clsx(INPUT_BASE, errors.zipCode && 'border-[var(--danger)]')}
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
            <span className="ml-0.5 text-red-400" aria-hidden="true">*</span>
          </label>
          <div className="relative">
            <MapPin className={ICON_LEFT} aria-hidden="true" />
            <select
              id="signup-country"
              autoComplete="country-name"
              aria-invalid={errors.country ? true : undefined}
              aria-describedby={errors.country ? 'signup-country-error' : undefined}
              aria-required="true"
              className={clsx(SELECT_BASE, errors.country && 'border-[var(--danger)]')}
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

// ---------------------------------------------------------------------------
// PlacesInput – autocomplete sub-component
// ---------------------------------------------------------------------------

interface PlacesInputProps {
  defaultValue: string;
  error: boolean;
  register: ReturnType<typeof useForm<AddressValues>>['register'];
  onSelect: (parsed: Partial<AddressValues>) => void;
}

function PlacesInput({ defaultValue, error, register, onSelect }: PlacesInputProps) {
  const {
    ready,
    value,
    suggestions: { status, data },
    setValue: setPlacesValue,
    clearSuggestions,
  } = usePlacesAutocomplete({
    requestOptions: { types: ['address'] },
    defaultValue,
    debounce: 300,
  });

  const listboxRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Sync the hidden react-hook-form field with the autocomplete value
  const { onChange: rhfOnChange, ...restRegister } = register('addressLine1');

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPlacesValue(e.target.value);
      rhfOnChange(e); // keep react-hook-form in sync
      setOpen(true);
      setActiveIndex(-1);
    },
    [setPlacesValue, rhfOnChange],
  );

  const handleSelect = useCallback(
    async (description: string) => {
      setPlacesValue(description, false);
      clearSuggestions();
      setOpen(false);

      try {
        const results = await getGeocode({ address: description });
        const parsed = parsePlace(results[0]);
        onSelect({ ...parsed, addressLine1: parsed.addressLine1 || description });
      } catch {
        // If geocode fails, still set the raw text
        onSelect({ addressLine1: description });
      }
    },
    [setPlacesValue, clearSuggestions, onSelect],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open || status !== 'OK') return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i < data.length - 1 ? i + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i > 0 ? i - 1 : data.length - 1));
      } else if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        handleSelect(data[activeIndex].description);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    },
    [open, status, data, activeIndex, handleSelect],
  );

  const hasSuggestions = open && status === 'OK' && data.length > 0;

  return (
    <div className="relative">
      <MapPin className={ICON_LEFT} aria-hidden="true" />
      <input
        id="signup-addressLine1"
        type="text"
        placeholder="Start typing your address..."
        disabled={!ready}
        value={value}
        aria-invalid={error || undefined}
        aria-describedby={error ? 'signup-addressLine1-error' : undefined}
        aria-expanded={hasSuggestions}
        aria-autocomplete="list"
        aria-controls="places-listbox"
        role="combobox"
        className={clsx(INPUT_BASE, error && 'border-[var(--danger)]')}
        {...restRegister}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={(e) => {
          // Delay closing so click on suggestion registers
          setTimeout(() => setOpen(false), 200);
          restRegister.onBlur?.(e);
        }}
        onFocus={() => {
          if (status === 'OK' && data.length > 0) setOpen(true);
        }}
      />

      {hasSuggestions && (
        <ul
          id="places-listbox"
          role="listbox"
          ref={listboxRef}
          className={clsx(
            'absolute z-50 mt-1 w-full rounded-xl overflow-hidden',
            'bg-[var(--bg-secondary)] border border-[var(--border-primary)]',
            'shadow-lg max-h-60 overflow-y-auto',
          )}
        >
          {data.map(({ place_id, description, structured_formatting }, idx) => (
            <li
              key={place_id}
              id={`places-option-${idx}`}
              role="option"
              aria-selected={idx === activeIndex}
              className={clsx(
                'px-4 py-2.5 cursor-pointer text-sm transition-colors',
                idx === activeIndex
                  ? 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]'
                  : 'text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]',
              )}
              onMouseDown={(e) => e.preventDefault()} // prevent blur before click
              onClick={() => handleSelect(description)}
            >
              <span className="font-medium">{structured_formatting.main_text}</span>
              {structured_formatting.secondary_text && (
                <span className="text-[var(--text-muted)] ml-1">
                  {structured_formatting.secondary_text}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
