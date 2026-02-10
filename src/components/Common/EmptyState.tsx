import type { ReactNode } from 'react';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Action slot -- typically one or two Button components */
  action?: ReactNode;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      className={clsx(
        'flex flex-col items-center justify-center text-center',
        // Generous vertical padding
        'rounded-2xl px-8 sm:px-12 py-16 sm:py-20',
        // Glass surface
        'bg-[#0D0F14]/60 backdrop-blur-xl',
        'border border-dashed border-white/[0.08]',
        className,
      )}
    >
      {/* Icon in a premium gradient circle with glow */}
      {icon && (
        <div className="relative mb-8">
          {/* Outer glow ring */}
          <div
            aria-hidden="true"
            className={clsx(
              'absolute -inset-4 rounded-full',
              'bg-gradient-to-br from-indigo-500/10 to-violet-500/10',
              'blur-xl',
            )}
          />

          {/* Icon circle -- large container */}
          <div
            className={clsx(
              'relative flex h-20 w-20 items-center justify-center rounded-full',
              'bg-gradient-to-br from-indigo-500/20 to-violet-500/20',
              'ring-1 ring-white/[0.08]',
              'text-indigo-400',
              '[&>svg]:h-8 [&>svg]:w-8',
            )}
          >
            {icon}
          </div>
        </div>
      )}

      {/* Title */}
      <h3 className="mb-3 text-lg sm:text-xl font-semibold text-white">
        {title}
      </h3>

      {/* Description */}
      {description && (
        <p className="max-w-md text-sm sm:text-base leading-relaxed text-gray-400">
          {description}
        </p>
      )}

      {/* Action slot */}
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
}
