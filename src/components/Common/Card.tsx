import type { HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CardPadding = 'none' | 'sm' | 'md' | 'lg';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Card title displayed in the header */
  title?: string;
  /** Subtitle shown below the title */
  subtitle?: string;
  /** Action slot rendered on the right side of the header */
  action?: ReactNode;
  className?: string;
  /** Control inner padding. `true` maps to 'md', `false` maps to 'none'. */
  padding?: boolean | CardPadding;
  /** Show a thin gradient border along the top edge */
  gradientBorder?: boolean;
  /** Enable hover lift + glow effect */
  hoverable?: boolean;
  /** Compact mode for nested cards (less padding, subtler border) */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Padding map -- spacious defaults with responsive breakpoints
// ---------------------------------------------------------------------------

const paddingStyles: Record<CardPadding, string> = {
  none: '',
  sm: 'p-4 sm:p-5',
  md: 'p-6 sm:p-8',
  lg: 'p-8 sm:p-10',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolvePadding(padding: boolean | CardPadding): CardPadding {
  if (typeof padding === 'boolean') {
    return padding ? 'md' : 'none';
  }
  return padding;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Card({
  children,
  title,
  subtitle,
  action,
  className,
  padding = true,
  gradientBorder = false,
  hoverable = false,
  compact = false,
  ...rest
}: CardProps) {
  const resolvedPadding = resolvePadding(padding);
  const hasHeader = !!(title || subtitle || action);

  return (
    <div
      className={clsx(
        'relative overflow-hidden',
        // Glass morphism base
        compact
          ? 'rounded-xl bg-white/[0.03] backdrop-blur-lg border border-white/[0.04]'
          : 'rounded-2xl bg-[#0D0F14]/80 backdrop-blur-xl border border-white/[0.06]',
        // Shadow
        compact
          ? 'shadow-sm'
          : 'shadow-[0_4px_24px_-4px_rgba(0,0,0,0.3)]',
        // Hover lift + glow
        hoverable && [
          'transition-all duration-300 ease-out',
          'hover:-translate-y-0.5',
          'hover:shadow-[0_8px_40px_-8px_rgba(99,102,241,0.15)]',
          'hover:border-white/[0.10]',
        ],
        // Padding (applied to outer container only when no header)
        !hasHeader && paddingStyles[resolvedPadding],
        className,
      )}
      {...rest}
    >
      {/* Optional gradient top border */}
      {gradientBorder && (
        <div
          className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500"
          aria-hidden="true"
        />
      )}

      {/* Header */}
      {hasHeader && (
        <div
          className={clsx(
            'flex items-start justify-between gap-4',
            // Top padding accounts for gradient border
            gradientBorder
              ? 'pt-9'
              : compact
                ? 'pt-4'
                : 'pt-6 sm:pt-8',
            compact
              ? 'px-4 pb-4 mb-4'
              : 'px-6 sm:px-8 pb-5 sm:pb-6 mb-5 sm:mb-6',
            // Subtle separator
            'border-b border-white/[0.04]',
          )}
        >
          <div className="min-w-0 flex-1">
            {title && (
              <h3
                className={clsx(
                  'font-semibold text-white truncate',
                  compact ? 'text-sm' : 'text-base sm:text-lg',
                )}
              >
                {title}
              </h3>
            )}
            {subtitle && (
              <p
                className={clsx(
                  'mt-1.5 text-gray-500 truncate',
                  compact ? 'text-xs' : 'text-sm',
                )}
              >
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}

      {/* Body */}
      {hasHeader ? (
        <div className={clsx(paddingStyles[resolvedPadding], 'pt-0')}>
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

export type { CardProps };
