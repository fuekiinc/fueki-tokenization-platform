import clsx from 'clsx';
import { CARD_CLASSES, SHIMMER_CLASSES } from '../../lib/designTokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SkeletonVariant = 'pie' | 'bar' | 'line' | 'table' | 'stat';

interface ChartSkeletonProps {
  /** The type of chart skeleton to render */
  variant?: SkeletonVariant;
  /** Height of the skeleton container (default: 300) */
  height?: number;
  /** Number of table rows when variant is 'table' (default: 5) */
  rows?: number;
  /** Additional CSS class names */
  className?: string;
}

// ---------------------------------------------------------------------------
// Sub-skeletons
// ---------------------------------------------------------------------------

function PieSkeleton({ height }: { height: number }) {
  const size = Math.min(height - 40, 240);
  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{ height }}
    >
      {/* Donut ring skeleton */}
      <div
        className="shimmer rounded-full"
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          mask: `radial-gradient(circle ${size * 0.35}px at center, transparent 99%, black 100%)`,
          WebkitMask: `radial-gradient(circle ${size * 0.35}px at center, transparent 99%, black 100%)`,
        }}
      />
      {/* Legend rows */}
      <div className="mt-6 flex gap-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="shimmer h-3 w-3 rounded-full" />
            <div className="shimmer h-3 w-16 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

function BarSkeleton({ height }: { height: number }) {
  const barCount = 7;
  return (
    <div
      className="flex items-end justify-between gap-3 px-6 pb-6 pt-4"
      style={{ height }}
    >
      {Array.from({ length: barCount }).map((_, i) => {
        const barHeight = 30 + Math.abs(Math.sin(i * 1.8)) * 60;
        return (
          <div
            key={i}
            className="shimmer flex-1 rounded-t-md"
            style={{ height: `${barHeight}%` }}
          />
        );
      })}
    </div>
  );
}

function LineSkeleton({ height }: { height: number }) {
  return (
    <div className="relative overflow-hidden px-6 pb-6 pt-4" style={{ height }}>
      {/* Y-axis labels */}
      <div className="absolute left-6 top-4 bottom-6 flex flex-col justify-between">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="shimmer h-2.5 w-10 rounded" />
        ))}
      </div>
      {/* Chart area skeleton */}
      <div className="ml-14 h-full">
        <div className="shimmer h-full w-full rounded-lg opacity-40" />
        {/* X-axis labels */}
        <div className="mt-3 flex justify-between">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="shimmer h-2.5 w-10 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}

function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div className="w-full">
      {/* Table header */}
      <div className="flex gap-4 px-5 py-4 border-b border-white/[0.06]">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={clsx('shimmer h-3 rounded', i === 0 ? 'w-32' : 'flex-1')}
          />
        ))}
      </div>
      {/* Table rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-5 py-4 border-b border-white/[0.04]"
        >
          <div className="shimmer h-8 w-8 rounded-full shrink-0" />
          <div className="shimmer h-3 w-28 rounded" />
          <div className="shimmer h-3 flex-1 rounded" />
          <div className="shimmer h-3 w-20 rounded" />
          <div className="shimmer h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className={clsx(CARD_CLASSES.base, CARD_CLASSES.wrapper, CARD_CLASSES.padding)}>
      <div className="flex items-center gap-3">
        <div className={clsx(SHIMMER_CLASSES.css, 'h-10 w-10 rounded-xl')} />
        <div className={clsx(SHIMMER_CLASSES.css, 'h-3 w-20 rounded')} />
      </div>
      <div className={clsx(SHIMMER_CLASSES.css, 'mt-5 h-8 w-32 rounded')} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ChartSkeleton({
  variant = 'line',
  height = 300,
  rows = 5,
  className,
}: ChartSkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Loading chart data"
      className={clsx(
        CARD_CLASSES.base,
        CARD_CLASSES.wrapper,
        className,
      )}
    >
      <span className="sr-only">Loading chart data...</span>
      {variant === 'pie' && <PieSkeleton height={height} />}
      {variant === 'bar' && <BarSkeleton height={height} />}
      {variant === 'line' && <LineSkeleton height={height} />}
      {variant === 'table' && <TableSkeleton rows={rows} />}
      {variant === 'stat' && <StatSkeleton />}
    </div>
  );
}
