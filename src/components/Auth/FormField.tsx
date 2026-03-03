import { forwardRef, memo, useId, useState } from 'react';
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import clsx from 'clsx';
import { AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const labelClasses = 'block text-sm font-medium text-[var(--text-secondary)] mb-1.5';

const baseInputClasses = clsx(
  'w-full rounded-xl bg-[var(--bg-tertiary)] border px-4 py-3 text-sm',
  'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
  'transition-all duration-200',
  'focus:outline-none focus:ring-1',
);

const normalBorderClasses =
  'border-[var(--border-primary)] focus:border-[var(--accent-primary)] focus:ring-[var(--accent-primary)]/30';

const errorBorderClasses =
  'border-red-500 focus:border-red-500 focus:ring-red-500/30';

const successBorderClasses =
  'border-emerald-500 focus:border-emerald-500 focus:ring-emerald-500/30';

// ---------------------------------------------------------------------------
// Validation state type
// ---------------------------------------------------------------------------

type ValidationState = 'default' | 'error' | 'success';

// ---------------------------------------------------------------------------
// FormField
// ---------------------------------------------------------------------------

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: ReactNode;
  error?: string;
  rightElement?: ReactNode;
  /** Optional hint text displayed below the input */
  hint?: string;
  /** Validation state: default, error, or success */
  validationState?: ValidationState;
  /** Show a red asterisk next to the label for required fields */
  showRequired?: boolean;
  /** When type="password", show a visibility toggle button */
  showPasswordToggle?: boolean;
}

const FormField = memo(
  forwardRef<HTMLInputElement, FormFieldProps>(
    (
      {
        label,
        icon,
        error,
        rightElement,
        hint,
        validationState: explicitState,
        showRequired = false,
        showPasswordToggle = false,
        className,
        id: externalId,
        type,
        ...props
      },
      ref,
    ) => {
      const generatedId = useId();
      const inputId = externalId ?? generatedId;
      const errorId = `${inputId}-error`;
      const hintId = `${inputId}-hint`;
      const [passwordVisible, setPasswordVisible] = useState(false);

      // Derive validation state from error or explicit prop
      const validationState: ValidationState = error
        ? 'error'
        : explicitState ?? 'default';

      const describedByParts: string[] = [];
      if (error) describedByParts.push(errorId);
      if (hint) describedByParts.push(hintId);
      const ariaDescribedBy =
        describedByParts.length > 0 ? describedByParts.join(' ') : undefined;

      const isPasswordType = type === 'password';
      const effectiveType =
        isPasswordType && passwordVisible ? 'text' : type;

      const borderClasses =
        validationState === 'error'
          ? errorBorderClasses
          : validationState === 'success'
            ? successBorderClasses
            : normalBorderClasses;

      const hasRightContent = !!(rightElement || (isPasswordType && showPasswordToggle));

      return (
        <div className={clsx('space-y-1.5', className)}>
          <label htmlFor={inputId} className={labelClasses}>
            {label}
            {showRequired && (
              <span className="ml-0.5 text-red-400" aria-hidden="true">
                *
              </span>
            )}
          </label>

          <div className="relative">
            {icon && (
              <span
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
                aria-hidden="true"
              >
                {icon}
              </span>
            )}

            <input
              ref={ref}
              id={inputId}
              type={effectiveType}
              aria-invalid={validationState === 'error' ? true : undefined}
              aria-describedby={ariaDescribedBy}
              aria-required={showRequired || props.required || undefined}
              className={clsx(
                baseInputClasses,
                icon && 'pl-11',
                hasRightContent && 'pr-11',
                borderClasses,
              )}
              {...props}
            />

            {/* Password visibility toggle */}
            {isPasswordType && showPasswordToggle && (
              <button
                type="button"
                aria-label={
                  passwordVisible ? 'Hide password' : 'Show password'
                }
                aria-pressed={passwordVisible}
                onClick={() => setPasswordVisible((v) => !v)}
                className={clsx(
                  'absolute right-3.5 top-1/2 -translate-y-1/2',
                  'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
                  'transition-colors duration-150',
                )}
              >
                {passwordVisible ? (
                  <EyeOff
                    className="h-[18px] w-[18px]"
                    aria-hidden="true"
                  />
                ) : (
                  <Eye className="h-[18px] w-[18px]" aria-hidden="true" />
                )}
              </button>
            )}

            {/* Custom right element (non-password) */}
            {rightElement && !(isPasswordType && showPasswordToggle) && (
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
                {rightElement}
              </span>
            )}

            {/* Success check icon (when no right element and success state) */}
            {validationState === 'success' && !hasRightContent && (
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                <CheckCircle2
                  className="h-4 w-4 text-emerald-400"
                  aria-hidden="true"
                />
              </span>
            )}
          </div>

          {error && (
            <p
              id={errorId}
              role="alert"
              className="flex items-center gap-1.5 text-xs text-red-400"
            >
              <AlertCircle
                className="h-3.5 w-3.5 flex-shrink-0"
                aria-hidden="true"
              />
              {error}
            </p>
          )}

          {hint && !error && (
            <p id={hintId} className="text-xs text-[var(--text-muted)]">
              {hint}
            </p>
          )}
        </div>
      );
    },
  ),
);

FormField.displayName = 'FormField';

// ---------------------------------------------------------------------------
// TextareaField
// ---------------------------------------------------------------------------

interface TextareaFieldProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: string;
  validationState?: ValidationState;
  showRequired?: boolean;
}

const TextareaField = memo(
  forwardRef<HTMLTextAreaElement, TextareaFieldProps>(
    (
      {
        label,
        error,
        hint,
        validationState: explicitState,
        showRequired = false,
        className,
        id: externalId,
        ...props
      },
      ref,
    ) => {
      const generatedId = useId();
      const textareaId = externalId ?? generatedId;
      const errorId = `${textareaId}-error`;
      const hintId = `${textareaId}-hint`;

      const validationState: ValidationState = error
        ? 'error'
        : explicitState ?? 'default';

      const describedByParts: string[] = [];
      if (error) describedByParts.push(errorId);
      if (hint) describedByParts.push(hintId);
      const ariaDescribedBy =
        describedByParts.length > 0 ? describedByParts.join(' ') : undefined;

      const borderClasses =
        validationState === 'error'
          ? errorBorderClasses
          : validationState === 'success'
            ? successBorderClasses
            : normalBorderClasses;

      return (
        <div className={clsx('space-y-1.5', className)}>
          <label htmlFor={textareaId} className={labelClasses}>
            {label}
            {showRequired && (
              <span className="ml-0.5 text-red-400" aria-hidden="true">
                *
              </span>
            )}
          </label>

          <textarea
            ref={ref}
            id={textareaId}
            aria-invalid={validationState === 'error' ? true : undefined}
            aria-describedby={ariaDescribedBy}
            aria-required={showRequired || props.required || undefined}
            className={clsx(
              baseInputClasses,
              'resize-none min-h-[100px]',
              borderClasses,
            )}
            {...props}
          />

          {error && (
            <p
              id={errorId}
              role="alert"
              className="flex items-center gap-1.5 text-xs text-red-400"
            >
              <AlertCircle
                className="h-3.5 w-3.5 flex-shrink-0"
                aria-hidden="true"
              />
              {error}
            </p>
          )}

          {hint && !error && (
            <p id={hintId} className="text-xs text-[var(--text-muted)]">
              {hint}
            </p>
          )}
        </div>
      );
    },
  ),
);

TextareaField.displayName = 'TextareaField';

// ---------------------------------------------------------------------------
// SelectField
// ---------------------------------------------------------------------------

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  icon?: ReactNode;
  error?: string;
  options: { value: string; label: string }[];
  /** Placeholder shown as the first disabled option */
  placeholder?: string;
  /** Optional hint text displayed below the select */
  hint?: string;
  validationState?: ValidationState;
  showRequired?: boolean;
}

const SelectField = memo(
  forwardRef<HTMLSelectElement, SelectFieldProps>(
    (
      {
        label,
        icon,
        error,
        options,
        placeholder,
        hint,
        validationState: explicitState,
        showRequired = false,
        className,
        id: externalId,
        ...props
      },
      ref,
    ) => {
      const generatedId = useId();
      const selectId = externalId ?? generatedId;
      const errorId = `${selectId}-error`;
      const hintId = `${selectId}-hint`;

      const validationState: ValidationState = error
        ? 'error'
        : explicitState ?? 'default';

      const describedByParts: string[] = [];
      if (error) describedByParts.push(errorId);
      if (hint) describedByParts.push(hintId);
      const ariaDescribedBy =
        describedByParts.length > 0 ? describedByParts.join(' ') : undefined;

      const borderClasses =
        validationState === 'error'
          ? errorBorderClasses
          : validationState === 'success'
            ? successBorderClasses
            : normalBorderClasses;

      return (
        <div className={clsx('space-y-1.5', className)}>
          <label htmlFor={selectId} className={labelClasses}>
            {label}
            {showRequired && (
              <span className="ml-0.5 text-red-400" aria-hidden="true">
                *
              </span>
            )}
          </label>

          <div className="relative">
            {icon && (
              <span
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
                aria-hidden="true"
              >
                {icon}
              </span>
            )}

            <select
              ref={ref}
              id={selectId}
              aria-invalid={validationState === 'error' ? true : undefined}
              aria-describedby={ariaDescribedBy}
              aria-required={showRequired || props.required || undefined}
              className={clsx(
                baseInputClasses,
                'appearance-none',
                'pr-10',
                icon && 'pl-11',
                borderClasses,
              )}
              {...props}
            >
              {placeholder && (
                <option value="" disabled>
                  {placeholder}
                </option>
              )}
              {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Custom chevron icon */}
            <span
              className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden="true"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4"
              >
                <path
                  fillRule="evenodd"
                  d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
          </div>

          {error && (
            <p
              id={errorId}
              role="alert"
              className="flex items-center gap-1.5 text-xs text-red-400"
            >
              <AlertCircle
                className="h-3.5 w-3.5 flex-shrink-0"
                aria-hidden="true"
              />
              {error}
            </p>
          )}

          {hint && !error && (
            <p id={hintId} className="text-xs text-[var(--text-muted)]">
              {hint}
            </p>
          )}
        </div>
      );
    },
  ),
);

SelectField.displayName = 'SelectField';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export default FormField;
export {
  SelectField,
  TextareaField,
  baseInputClasses,
  normalBorderClasses,
  errorBorderClasses,
  successBorderClasses,
  labelClasses,
};
export type {
  FormFieldProps,
  SelectFieldProps,
  TextareaFieldProps,
  ValidationState,
};
