import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';
import Spinner from './Spinner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
}

// ---------------------------------------------------------------------------
// Variant styles
// ---------------------------------------------------------------------------

const variantStyles: Record<ButtonVariant, string> = {
  primary: clsx(
    // Gradient background: indigo to violet
    'bg-gradient-to-r from-indigo-500 to-violet-500 text-white',
    // Subtle glow shadow
    'shadow-[0_0_24px_-6px_rgba(99,102,241,0.45)]',
    // Hover: enhanced glow + brightness
    'hover:shadow-[0_0_32px_-4px_rgba(99,102,241,0.6)] hover:brightness-110',
    // Focus ring
    'focus-visible:ring-indigo-500/70',
    // Disabled
    'disabled:opacity-50 disabled:shadow-none disabled:brightness-100',
  ),

  secondary: clsx(
    // Glass morphism
    'bg-white/[0.06] text-gray-200 backdrop-blur-xl',
    'border border-white/[0.08]',
    // Hover: brighter glass
    'hover:bg-white/[0.10] hover:text-white hover:border-white/[0.14]',
    // Focus ring
    'focus-visible:ring-white/30',
    // Disabled
    'disabled:opacity-50',
  ),

  danger: clsx(
    // Red gradient
    'bg-gradient-to-r from-red-500 to-rose-500 text-white',
    // Glow shadow
    'shadow-[0_0_24px_-6px_rgba(239,68,68,0.45)]',
    // Hover: enhanced glow
    'hover:shadow-[0_0_32px_-4px_rgba(239,68,68,0.6)] hover:brightness-110',
    // Focus ring
    'focus-visible:ring-red-500/70',
    // Disabled
    'disabled:opacity-50 disabled:shadow-none disabled:brightness-100',
  ),

  ghost: clsx(
    // Transparent
    'bg-transparent text-gray-400',
    // Hover: subtle glass + brighter text
    'hover:bg-white/[0.06] hover:text-white',
    // Focus ring
    'focus-visible:ring-white/20',
    // Disabled
    'disabled:opacity-50 disabled:bg-transparent',
  ),

  outline: clsx(
    // Border only
    'bg-transparent text-gray-300',
    'border border-white/[0.12]',
    // Hover: filled glass + brighter border
    'hover:bg-white/[0.06] hover:text-white hover:border-white/[0.20]',
    // Focus ring
    'focus-visible:ring-white/25',
    // Disabled
    'disabled:opacity-50 disabled:bg-transparent',
  ),
};

// ---------------------------------------------------------------------------
// Size styles -- generous padding, rounded-xl default
// ---------------------------------------------------------------------------

const sizeStyles: Record<ButtonSize, string> = {
  xs: 'h-8 gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold',
  sm: 'h-9 gap-2.5 rounded-xl px-5 py-2 text-xs font-semibold',
  md: 'h-11 gap-2.5 rounded-xl px-6 py-3 text-sm font-semibold',
  lg: 'h-12 gap-3 rounded-xl px-8 py-3.5 text-sm font-semibold',
  xl: 'h-14 gap-3 rounded-2xl px-10 py-4 text-base font-semibold',
};

// ---------------------------------------------------------------------------
// Spinner size mapping
// ---------------------------------------------------------------------------

const spinnerSizes: Record<ButtonSize, 'sm' | 'md' | 'lg'> = {
  xs: 'sm',
  sm: 'sm',
  md: 'sm',
  lg: 'md',
  xl: 'md',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      icon,
      iconRight,
      fullWidth = false,
      disabled,
      className,
      children,
      type = 'button',
      onClick,
      ...rest
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading}
        aria-disabled={isDisabled || undefined}
        onClick={isDisabled ? undefined : onClick}
        className={clsx(
          // Base layout
          'relative inline-flex items-center justify-center',
          // Smooth transitions
          'transition-all duration-200 ease-out',
          // Hover lift
          'hover:scale-[1.02]',
          // Active press
          'active:scale-[0.98] active:duration-75',
          // Focus ring
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0b0f]',
          // Disabled
          'disabled:cursor-not-allowed disabled:pointer-events-none',
          // Variant + size
          variantStyles[variant],
          sizeStyles[size],
          // Full width
          fullWidth && 'w-full',
          // Loading cursor
          loading && 'cursor-wait',
          className,
        )}
        {...rest}
      >
        {/* Left icon or loading spinner */}
        {loading ? (
          <Spinner size={spinnerSizes[size]} />
        ) : (
          icon && <span className="shrink-0">{icon}</span>
        )}

        {/* Label */}
        {children && (
          <span className={clsx('leading-none', loading && 'opacity-80')}>
            {children}
          </span>
        )}

        {/* Right icon (hidden during loading) */}
        {iconRight && !loading && (
          <span className="shrink-0">{iconRight}</span>
        )}
      </button>
    );
  },
);

Button.displayName = 'Button';

export default Button;
