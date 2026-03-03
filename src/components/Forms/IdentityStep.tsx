import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  FileCheck,
  IdCard,
  Loader2,
  Shield,
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';

import { identitySchema, type IdentityValues } from './signupSchemas';
import {
  INPUT_BASE,
  ICON_LEFT,
  LABEL,
  ERROR_TEXT,
  BACK_BUTTON,
} from './signupStyles';
import type { DocumentType } from '../../types/auth';
import LiveVideoCaptureCard from './LiveVideoCaptureCard';
import PhotoCaptureCard from './PhotoCaptureCard';

const DOCUMENT_TYPE_OPTIONS = [
  {
    value: 'drivers_license' as const,
    label: "US Driver's License",
    icon: CreditCard,
    description: 'Front and back photos are required',
  },
  {
    value: 'passport' as const,
    label: 'Passport',
    icon: FileCheck,
    description: 'Photo page capture is required',
  },
  {
    value: 'national_id' as const,
    label: 'National ID',
    icon: IdCard,
    description: 'Front-side capture is required',
  },
] as const;

interface IdentityStepProps {
  defaultSSN?: string;
  defaultDocumentType?: DocumentType;
  documentFrontFile: File | null;
  documentFrontPreview: string | null;
  documentBackFile: File | null;
  documentBackPreview: string | null;
  liveVideoFile: File | null;
  liveVideoPreview: string | null;
  onDocumentFrontCapture: (file: File | null, previewUrl: string | null) => void;
  onDocumentBackCapture: (file: File | null, previewUrl: string | null) => void;
  onLiveVideoCapture: (file: File | null, previewUrl: string | null) => void;
  onSubmit: (values: IdentityValues) => void;
  onBack: () => void;
  isSubmitting: boolean;
}

function formatSSNDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 9)}`;
}

function maskSSN(formatted: string): string {
  const digits = formatted.replace(/\D/g, '');
  if (digits.length <= 4) return formatted;

  const masked = formatted.split('').map((char, i) => {
    if (char === '-') return '-';
    const digitsBefore = formatted.slice(0, i + 1).replace(/\D/g, '').length;
    const totalDigits = digits.length;
    if (digitsBefore <= totalDigits - 4) return '\u2022';
    return char;
  });
  return masked.join('');
}

export default function IdentityStep({
  defaultSSN,
  defaultDocumentType,
  documentFrontFile,
  documentFrontPreview,
  documentBackFile,
  documentBackPreview,
  liveVideoFile,
  liveVideoPreview,
  onDocumentFrontCapture,
  onDocumentBackCapture,
  onLiveVideoCapture,
  onSubmit: onFormSubmit,
  onBack,
  isSubmitting,
}: IdentityStepProps) {
  const [ssnFocused, setSsnFocused] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<IdentityValues>({
    resolver: zodResolver(identitySchema),
    defaultValues: {
      ssn: defaultSSN ?? '',
      documentType: defaultDocumentType ?? 'drivers_license',
    },
  });

  const handleSSNChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 9);
    const formatted = formatSSNDisplay(raw);
    setValue('ssn', formatted, { shouldValidate: true });
  };

  const ssnValue = watch('ssn');
  const selectedDocType = watch('documentType');
  const displaySSN = ssnFocused ? ssnValue : maskSSN(ssnValue);
  const requiresDocumentBack = selectedDocType === 'drivers_license';

  useEffect(() => {
    if (!requiresDocumentBack && (documentBackFile || documentBackPreview)) {
      onDocumentBackCapture(null, null);
    }
  }, [requiresDocumentBack, documentBackFile, documentBackPreview, onDocumentBackCapture]);

  const frontCaptureTitle = selectedDocType === 'drivers_license'
    ? 'Driver license front photo'
    : selectedDocType === 'passport'
      ? 'Passport photo page'
      : 'National ID photo';

  const handleFormSubmit = handleSubmit((values) => {
    if (!documentFrontFile) {
      toast.error('Capture your identity document photo to continue.');
      return;
    }
    if (values.documentType === 'drivers_license' && !documentBackFile) {
      toast.error('Capture the back side of your driver license to continue.');
      return;
    }
    if (!liveVideoFile) {
      toast.error('Complete the 10-second live scan to continue.');
      return;
    }
    onFormSubmit(values);
  });

  return (
    <form onSubmit={handleFormSubmit} noValidate className="space-y-5">
      <div>
        <label htmlFor="signup-ssn" className={LABEL}>
          Social Security Number
          <span className="ml-0.5 text-red-400" aria-hidden="true">*</span>
        </label>
        <div className="relative">
          <CreditCard className={ICON_LEFT} aria-hidden="true" />
          <input
            id="signup-ssn"
            type="text"
            autoComplete="off"
            inputMode="numeric"
            placeholder="000-00-0000"
            maxLength={11}
            value={displaySSN}
            onFocus={() => setSsnFocused(true)}
            onBlur={() => setSsnFocused(false)}
            onChange={handleSSNChange}
            aria-invalid={errors.ssn ? true : undefined}
            aria-describedby={errors.ssn ? 'signup-ssn-error' : 'signup-ssn-hint'}
            aria-required="true"
            className={clsx(
              INPUT_BASE,
              'tracking-widest',
              errors.ssn && 'border-[var(--danger)]',
            )}
          />
        </div>
        {errors.ssn ? (
          <p id="signup-ssn-error" role="alert" className={ERROR_TEXT}>
            {errors.ssn.message}
          </p>
        ) : (
          <p id="signup-ssn-hint" className="mt-1 text-xs text-[var(--text-muted)]">
            Your SSN is encrypted and stored securely. Only the last 4 digits are displayed.
          </p>
        )}
      </div>

      <div>
        <label className={LABEL}>
          Identity document type
          <span className="ml-0.5 text-red-400" aria-hidden="true">*</span>
        </label>
        <div
          className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-3"
          role="radiogroup"
          aria-label="Identity document type"
        >
          {DOCUMENT_TYPE_OPTIONS.map(({ value, label, icon: Icon, description }) => {
            const selected = selectedDocType === value;
            return (
              <label
                key={value}
                className={clsx(
                  'relative flex cursor-pointer items-center gap-3 rounded-xl p-4',
                  'border transition-all duration-200',
                  selected
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 ring-1 ring-[var(--accent-primary)]'
                    : 'border-[var(--border-primary)] bg-[var(--bg-tertiary)] hover:border-[var(--border-hover)]',
                )}
              >
                <input
                  type="radio"
                  value={value}
                  className="sr-only"
                  {...register('documentType')}
                />
                <Icon
                  className={clsx(
                    'h-5 w-5 shrink-0',
                    selected ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]',
                  )}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <span
                    className={clsx(
                      'block text-sm font-medium',
                      selected ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]',
                    )}
                  >
                    {label}
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                    {description}
                  </span>
                </div>
                {selected && (
                  <CheckCircle2
                    className="absolute right-2 top-2 h-4 w-4 text-[var(--accent-primary)]"
                    aria-hidden="true"
                  />
                )}
              </label>
            );
          })}
        </div>
        {errors.documentType && (
          <p role="alert" className={ERROR_TEXT}>
            {errors.documentType.message}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <label className={LABEL}>
          Camera document capture
          <span className="ml-0.5 text-red-400" aria-hidden="true">*</span>
        </label>
        <p className="text-xs text-[var(--text-muted)]">
          Camera-only capture is required. Uploading pre-existing files is disabled.
        </p>

        <PhotoCaptureCard
          title={frontCaptureTitle}
          description="Ensure all text is readable and edges are visible."
          file={documentFrontFile}
          previewUrl={documentFrontPreview}
          onCapture={onDocumentFrontCapture}
          disabled={isSubmitting}
          filePrefix={`${selectedDocType}-front`}
          facingMode="environment"
        />

        {requiresDocumentBack && (
          <PhotoCaptureCard
            title="Driver license back photo"
            description="Capture the back side clearly, including barcode and issue text."
            file={documentBackFile}
            previewUrl={documentBackPreview}
            onCapture={onDocumentBackCapture}
            disabled={isSubmitting}
            filePrefix="drivers-license-back"
            facingMode="environment"
          />
        )}
      </div>

      <LiveVideoCaptureCard
        title="Live identity scan (required)"
        description="Record a continuous 10-second clip holding your government ID beside your face."
        file={liveVideoFile}
        previewUrl={liveVideoPreview}
        onCapture={onLiveVideoCapture}
        disabled={isSubmitting}
      />

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={isSubmitting}
          className={clsx(
            BACK_BUTTON,
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Back</span>
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className={clsx(
            'flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-white font-semibold',
            'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500',
            'transition-all duration-200',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30',
          )}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" />
              <span>Creating account...</span>
            </>
          ) : (
            <>
              <Shield className="h-[18px] w-[18px]" aria-hidden="true" />
              <span>Complete sign-up</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
