import type { ReactNode } from 'react';
import clsx from 'clsx';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StatCardProps {
  title: string;
  value: string | number;
  /** Percentage change shown with a trend arrow. Positive = green, negative = red. */
  change?: number;
  /** Label for the change period, e.g. "vs last week" */
  changeLabel?: string;
  icon?: ReactNode;
  className?: string;
  /** Accessible label override for the entire stat card */
  'aria-label'?: string;
}

// ---------------------------------------------------------------------------
// Decorative mini sparkline SVG path (purely visual)
// ---------------------------------------------------------------------------

function MiniSparkline({ positive }: { positive: boolean }) {
  return (
    <svg
      viewBox="0 0 80 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="pointer-events-none absolute bottom-0 right-0 h-10 w-20 opacity-[0.12]"
      aria-hidden="true"
    >
      <path
        d={
          positive
            ? 'M0 22 C10 20, 18 24, 26 16 S42 6, 50 10 S62 18, 70 8 L80 4'
            : 'M0 8 C10 10, 18 6, 26 14 S42 22, 50 18 S62 12, 70 20 L80 24'
        }
        stroke={positive ? '#10b981' : '#ef4444'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StatCard({
  title,
  value,
  change,
  changeLabel,
  icon,
  className,
  'aria-label': ariaLabel,
}: StatCardProps) {
  const isPositive = change !== undefined && change > 0;
  const isNegative = change !== undefined && change < 0;
  const isNeutral  = change !== undefined && change === 0;

  const formattedChange =
    change !== undefined
      ? `${isPositive ? '+' : ''}${change.toFixed(1)}%`
      : null;

  return (
    <div
      role="group"
      aria-label={ariaLabel ?? title}
      className={clsx(
        // Glass morphism surface
        'relative overflow-hidden rounded-2xl',
        'bg-[#0D0F14]/80 backdrop-blur-xl',
        'border border-white/[0.06]',
        // Spacious padding
        'p-6 sm:p-8',
        // Hover lift
        'transition-all duration-300 ease-out',
        'hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20',
        'hover:border-white/[0.10]',
        // Prevent text overflow
        'min-w-0',
        className,
      )}
    >
      {/* Top row: icon + label */}
      <div className="flex items-center gap-3.5">
        {icon && (
          <div
            className={clsx(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
              'bg-gradient-to-br from-indigo-500/20 to-violet-500/20',
              'text-indigo-400',
              'ring-1 ring-white/[0.06]',
            )}
          >
            {icon}
          </div>
        )}
        <p className="min-w-0 truncate text-sm font-medium uppercase tracking-wider text-gray-400">
          {title}
        </p>
      </div>

      {/* Value */}
      <p className="mt-4 min-w-0 truncate text-2xl sm:text-3xl font-bold tracking-tight text-white">
        {value}
      </p>

      {/* Change indicator */}
      {formattedChange !== null && (
        <div className="mt-3 flex items-center gap-1.5">
          {isPositive && <TrendingUp   className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
          {isNegative && <TrendingDown  className="h-3.5 w-3.5 shrink-0 text-red-400" />}
          {isNeutral  && <Minus         className="h-3.5 w-3.5 shrink-0 text-gray-500" />}

          <span
            className={clsx(
              'text-xs font-semibold',
              isPositive && 'text-emerald-400',
              isNegative && 'text-red-400',
              isNeutral  && 'text-gray-500',
            )}
          >
            {formattedChange}
          </span>

          {changeLabel && (
            <span className="text-xs text-gray-500">{changeLabel}</span>
          )}
        </div>
      )}

      {/* Decorative sparkline */}
      {change !== undefined && (
        <MiniSparkline positive={change >= 0} />
      )}
    </div>
  );
}
