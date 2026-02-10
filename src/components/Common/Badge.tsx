import type { ReactNode } from 'react';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BadgeVariant =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  /** Show a pulsing coloured dot before the text */
  dot?: boolean;
  /** Render as outline only (border, no background fill) */
  outline?: boolean;
  className?: string;
  /** Accessible label when badge text alone is insufficient */
  'aria-label'?: string;
}

// ---------------------------------------------------------------------------
// Variant styles -- filled (default) appearance
// ---------------------------------------------------------------------------

const filledStyles: Record<BadgeVariant, string> = {
  default:
    'bg-gray-500/10 text-gray-300 border-gray-500/20',
  primary:
    'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  success:
    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  warning:
    'bg-amber-500/10 text-amber-400 border-amber-500/20',
  danger:
    'bg-red-500/10 text-red-400 border-red-500/20',
  info:
    'bg-blue-500/10 text-blue-400 border-blue-500/20',
};

// ---------------------------------------------------------------------------
// Variant styles -- outline appearance
// ---------------------------------------------------------------------------

const outlineStyles: Record<BadgeVariant, string> = {
  default:
    'bg-transparent text-gray-400 border-gray-500/30',
  primary:
    'bg-transparent text-indigo-400 border-indigo-500/40',
  success:
    'bg-transparent text-emerald-400 border-emerald-500/40',
  warning:
    'bg-transparent text-amber-400 border-amber-500/40',
  danger:
    'bg-transparent text-red-400 border-red-500/40',
  info:
    'bg-transparent text-blue-400 border-blue-500/40',
};

// ---------------------------------------------------------------------------
// Dot colour per variant
// ---------------------------------------------------------------------------

const dotColor: Record<BadgeVariant, string> = {
  default: 'bg-gray-400',
  primary: 'bg-indigo-400',
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  danger: 'bg-red-400',
  info: 'bg-blue-400',
};

// ---------------------------------------------------------------------------
// Size styles -- spacious pill shape
// ---------------------------------------------------------------------------

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'px-2.5 py-1 text-[10px] leading-4',
  md: 'px-3 py-1.5 text-xs leading-4',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Badge({
  children,
  variant = 'default',
  size = 'md',
  dot = false,
  outline = false,
  className,
  'aria-label': ariaLabel,
}: BadgeProps) {
  return (
    <span
      role="status"
      aria-label={ariaLabel}
      className={clsx(
        // Base layout
        'inline-flex items-center gap-2 rounded-full border font-medium',
        'select-none whitespace-nowrap',
        // Variant appearance
        outline ? outlineStyles[variant] : filledStyles[variant],
        // Size
        sizeStyles[size],
        className,
      )}
    >
      {/* Pulsing dot indicator */}
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          <span
            className={clsx(
              'absolute inline-flex h-full w-full animate-ping rounded-full opacity-50',
              dotColor[variant],
            )}
          />
          <span
            className={clsx(
              'relative inline-flex h-1.5 w-1.5 rounded-full',
              dotColor[variant],
            )}
          />
        </span>
      )}

      {children}
    </span>
  );
}
