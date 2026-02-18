/**
 * FormField -- Reusable inline validation wrapper for form inputs.
 *
 * Provides consistent label, error, and hint rendering across all forms.
 * Error messages receive role="alert" for screen-reader accessibility.
 */

import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FormFieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FormField({ label, htmlFor, error, hint, required, children }: FormFieldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-300">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1.5 mt-1.5" role="alert">
          <span className="h-1 w-1 rounded-full bg-red-400 shrink-0" />
          {error}
        </p>
      )}
      {hint && !error && (
        <p className="text-xs text-gray-600 mt-1">{hint}</p>
      )}
    </div>
  );
}

export default FormField;
