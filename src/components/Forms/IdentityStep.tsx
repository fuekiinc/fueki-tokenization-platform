import { useState, useCallback, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useDropzone } from 'react-dropzone';
import {
  CreditCard,
  FileCheck,
  Upload,
  CheckCircle2,
  ArrowLeft,
  Shield,
  Loader2,
  X,
  Camera,
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACCEPTED_FILE_TYPES: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'application/pdf': ['.pdf'],
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// ---------------------------------------------------------------------------
// SSN helpers
// ---------------------------------------------------------------------------

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface IdentityStepProps {
  defaultSSN?: string;
  defaultDocumentType?: 'drivers_license' | 'passport';
  documentFile: File | null;
  documentPreview: string | null;
  onDocumentSelect: (file: File | null, preview: string | null) => void;
  onSubmit: (values: IdentityValues) => void;
  onBack: () => void;
  isSubmitting: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function IdentityStep({
  defaultSSN,
  defaultDocumentType,
  documentFile,
  documentPreview,
  onDocumentSelect,
  onSubmit: onFormSubmit,
  onBack,
  isSubmitting,
}: IdentityStepProps) {
  const [ssnFocused, setSsnFocused] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
      documentType: defaultDocumentType,
    },
  });

  // ---- SSN helpers ----------------------------------------------------------

  const handleSSNChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 9);
    const formatted = formatSSNDisplay(raw);
    setValue('ssn', formatted, { shouldValidate: true });
  };

  const ssnValue = watch('ssn');
  const displaySSN = ssnFocused ? ssnValue : maskSSN(ssnValue);

  // ---- Document dropzone ----------------------------------------------------

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      if (file.size > MAX_FILE_SIZE) {
        toast.error(`File exceeds the ${formatFileSize(MAX_FILE_SIZE)} size limit.`);
        return;
      }

      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          if (mountedRef.current) {
            onDocumentSelect(file, reader.result as string);
          }
        };
        reader.readAsDataURL(file);
      } else {
        onDocumentSelect(file, null);
      }
    },
    [onDocumentSelect],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_FILE_TYPES,
    maxFiles: 1,
    maxSize: MAX_FILE_SIZE,
    onDropRejected: (rejections) => {
      const error = rejections[0]?.errors[0];
      if (error?.code === 'file-too-large') {
        toast.error(`File exceeds the ${formatFileSize(MAX_FILE_SIZE)} size limit.`);
      } else if (error?.code === 'file-invalid-type') {
        toast.error('Unsupported file type. Please upload a JPG, PNG, or PDF.');
      } else {
        toast.error(error?.message ?? 'File could not be uploaded.');
      }
    },
  });

  const removeDocument = useCallback(() => {
    onDocumentSelect(null, null);
  }, [onDocumentSelect]);

  // ---- Submission -----------------------------------------------------------

  const handleFormSubmit = handleSubmit((values) => {
    if (!documentFile) {
      toast.error('Please upload an identity document to continue.');
      return;
    }
    onFormSubmit(values);
  });

  const fileSizeLabel = documentFile
    ? `${formatFileSize(documentFile.size)} / ${formatFileSize(MAX_FILE_SIZE)} max`
    : null;

  // ---- Render ---------------------------------------------------------------

  return (
    <form onSubmit={handleFormSubmit} noValidate className="space-y-5">
      {/* SSN */}
      <div>
        <label htmlFor="signup-ssn" className={LABEL}>
          Social Security Number
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

      {/* Document Type */}
      <div>
        <label className={LABEL}>Identity document type</label>
        <div className="grid grid-cols-2 gap-3 mt-1" role="radiogroup" aria-label="Identity document type">
          {(
            [
              {
                value: 'drivers_license' as const,
                label: "Driver's license",
                icon: CreditCard,
              },
              {
                value: 'passport' as const,
                label: 'Passport',
                icon: FileCheck,
              },
            ] as const
          ).map(({ value, label, icon: Icon }) => {
            const selected = watch('documentType') === value;
            return (
              <label
                key={value}
                className={clsx(
                  'relative flex items-center gap-3 p-4 rounded-xl cursor-pointer',
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
                    selected
                      ? 'text-[var(--accent-primary)]'
                      : 'text-[var(--text-muted)]',
                  )}
                  aria-hidden="true"
                />
                <span
                  className={clsx(
                    'text-sm font-medium',
                    selected
                      ? 'text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)]',
                  )}
                >
                  {label}
                </span>
                {selected && (
                  <CheckCircle2 className="absolute top-2 right-2 h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
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

      {/* Document Upload */}
      <div>
        <label className={LABEL}>Upload identity document</label>

        {!documentFile ? (
          <div
            {...getRootProps()}
            className={clsx(
              'mt-1 flex flex-col items-center justify-center gap-3',
              'p-8 rounded-xl cursor-pointer',
              'border-2 border-dashed transition-all duration-200',
              isDragActive
                ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/5'
                : 'border-[var(--border-primary)] bg-[var(--bg-tertiary)] hover:border-[var(--border-hover)]',
            )}
          >
            <input {...getInputProps()} />
            <div
              className={clsx(
                'flex items-center justify-center w-12 h-12 rounded-full',
                'bg-[var(--accent-primary)]/10',
              )}
            >
              <Upload
                className={clsx(
                  'h-6 w-6',
                  isDragActive
                    ? 'text-[var(--accent-primary)]'
                    : 'text-[var(--text-muted)]',
                )}
                aria-hidden="true"
              />
            </div>
            <div className="text-center">
              <p className="text-sm text-[var(--text-secondary)]">
                {isDragActive ? (
                  <span className="text-[var(--accent-primary)] font-medium">
                    Drop your file here
                  </span>
                ) : (
                  <>
                    <span className="text-[var(--accent-primary)] font-medium">
                      Click to upload
                    </span>{' '}
                    or drag and drop
                  </>
                )}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                JPG, PNG, or PDF &middot; {formatFileSize(MAX_FILE_SIZE)} max
              </p>
            </div>
          </div>
        ) : (
          <div
            className={clsx(
              'mt-1 relative rounded-xl overflow-hidden',
              'border border-[var(--border-primary)] bg-[var(--bg-tertiary)]',
              'p-4',
            )}
          >
            {/* Remove button */}
            <button
              type="button"
              onClick={removeDocument}
              className={clsx(
                'absolute top-3 right-3 z-10',
                'flex items-center justify-center w-8 h-8 rounded-full',
                'bg-[var(--bg-primary)]/80 backdrop-blur-sm',
                'border border-[var(--border-primary)]',
                'text-[var(--text-muted)] hover:text-[var(--danger)]',
                'transition-colors duration-150',
              )}
              aria-label="Remove document"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>

            {/* Preview */}
            {documentPreview ? (
              <div className="flex flex-col items-center gap-3">
                <div className="relative w-full max-h-48 rounded-lg overflow-hidden bg-black/20 flex items-center justify-center">
                  <img
                    src={documentPreview}
                    alt="Document preview"
                    className="max-h-48 object-contain rounded-lg"
                  />
                </div>
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <Camera className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
                  <span className="truncate max-w-[250px]">
                    {documentFile.name}
                  </span>
                  <span className="text-[var(--text-muted)] text-xs">
                    ({fileSizeLabel})
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 py-2">
                <div
                  className={clsx(
                    'flex items-center justify-center w-10 h-10 rounded-lg',
                    'bg-[var(--accent-primary)]/10',
                  )}
                >
                  <FileCheck className="h-5 w-5 text-[var(--accent-primary)]" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {documentFile.name}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {fileSizeLabel}
                  </p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" aria-hidden="true" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={isSubmitting}
          className={clsx(
            BACK_BUTTON,
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Back</span>
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className={clsx(
            'flex-1 flex items-center justify-center gap-2',
            'bg-gradient-to-r from-indigo-600 to-purple-600',
            'hover:from-indigo-500 hover:to-purple-500',
            'text-white font-semibold',
            'rounded-xl px-4 py-3',
            'transition-all duration-200',
            'disabled:opacity-50 disabled:cursor-not-allowed',
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
