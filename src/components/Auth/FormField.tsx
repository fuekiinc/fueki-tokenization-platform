import { forwardRef } from 'react';
import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';
import { AlertCircle } from 'lucide-react';

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const labelClasses = 'block text-sm font-medium text-[var(--text-secondary)]';

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

// ---------------------------------------------------------------------------
// FormField
// ---------------------------------------------------------------------------

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: ReactNode;
  error?: string;
  rightElement?: ReactNode;
}

const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, icon, error, rightElement, className, ...props }, ref) => {
    return (
      <div className={clsx('space-y-1.5', className)}>
        <label className={labelClasses}>{label}</label>

        <div className="relative">
          {icon && (
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
              {icon}
            </span>
          )}

          <input
            ref={ref}
            className={clsx(
              baseInputClasses,
              icon && 'pl-11',
              rightElement && 'pr-11',
              error ? errorBorderClasses : normalBorderClasses,
            )}
            {...props}
          />

          {rightElement && (
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
              {rightElement}
            </span>
          )}
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-xs text-red-400">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            {error}
          </p>
        )}
      </div>
    );
  },
);

FormField.displayName = 'FormField';

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
}

const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ label, icon, error, options, placeholder, className, ...props }, ref) => {
    return (
      <div className={clsx('space-y-1.5', className)}>
        <label className={labelClasses}>{label}</label>

        <div className="relative">
          {icon && (
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none">
              {icon}
            </span>
          )}

          <select
            ref={ref}
            className={clsx(
              baseInputClasses,
              // Appearance reset so we can style the caret ourselves
              'appearance-none',
              // Right padding for the custom chevron
              'pr-10',
              icon && 'pl-11',
              error ? errorBorderClasses : normalBorderClasses,
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
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
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
          <p className="flex items-center gap-1.5 text-xs text-red-400">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            {error}
          </p>
        )}
      </div>
    );
  },
);

SelectField.displayName = 'SelectField';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export default FormField;
export { SelectField };
export type { FormFieldProps, SelectFieldProps };
