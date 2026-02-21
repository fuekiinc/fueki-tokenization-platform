import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface SpinnerProps {
  size?: SpinnerSize;
  /** Override spinner colour. Defaults to indigo-500 (accent). */
  color?: string;
  /** Accessible loading label */
  label?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Size map
// ---------------------------------------------------------------------------

const sizeMap: Record<SpinnerSize, { box: string; stroke: number }> = {
  xs: { box: 'h-3.5 w-3.5', stroke: 3 },
  sm: { box: 'h-4 w-4',     stroke: 2.8 },
  md: { box: 'h-6 w-6',     stroke: 2.5 },
  lg: { box: 'h-8 w-8',     stroke: 2.2 },
  xl: { box: 'h-12 w-12',   stroke: 2 },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Spinner({
  size = 'md',
  color,
  label = 'Loading',
  className,
}: SpinnerProps) {
  const { box, stroke } = sizeMap[size];

  return (
    <span
      role="status"
      className="inline-flex items-center justify-center"
    >
      <svg
        className={clsx('animate-spin', box, className)}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Background track ring */}
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth={stroke}
          className="opacity-[0.08]"
        />

        {/* Foreground arc */}
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke={color ?? 'url(#spinner-gradient)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray="42 88"
          strokeDashoffset="0"
          className={clsx(!color && 'text-cyan-400')}
        />

        {/* Gradient definition */}
        {!color && (
          <defs>
            <linearGradient
              id="spinner-gradient"
              x1="0"
              y1="0"
              x2="24"
              y2="24"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#11b9a5" />
              <stop offset="1" stopColor="#2da7de" />
            </linearGradient>
          </defs>
        )}
      </svg>

      {/* Screen-reader only label */}
      <span className="sr-only">{label}</span>
    </span>
  );
}
