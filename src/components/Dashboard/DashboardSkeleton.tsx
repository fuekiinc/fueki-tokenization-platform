import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Shared shimmer animation class
// ---------------------------------------------------------------------------

const SHIMMER =
  'relative overflow-hidden bg-white/[0.04] before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.8s_ease-in-out_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/[0.06] before:to-transparent';

const GLASS =
  'bg-[#0D0F14]/80 backdrop-blur-xl border border-white/[0.06] rounded-2xl';

// ---------------------------------------------------------------------------
// StatCard skeleton
// ---------------------------------------------------------------------------

function StatCardSkeleton() {
  return (
    <div className={clsx(GLASS, 'p-7 sm:p-9')}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {/* Title */}
          <div className={clsx('h-4 w-24 rounded-md', SHIMMER)} />
          {/* Value */}
          <div className={clsx('mt-4 h-8 w-32 rounded-lg', SHIMMER)} />
          {/* Change badge */}
          <div className={clsx('mt-4 h-5 w-20 rounded-full', SHIMMER)} />
        </div>
        {/* Icon container */}
        <div className={clsx('h-12 w-12 shrink-0 rounded-xl', SHIMMER)} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart skeleton
// ---------------------------------------------------------------------------

function ChartSkeleton() {
  return (
    <div className={clsx(GLASS, 'p-8 sm:p-11')}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className={clsx('h-10 w-10 rounded-xl', SHIMMER)} />
          <div>
            <div className={clsx('h-4 w-32 rounded-md', SHIMMER)} />
            <div className={clsx('mt-2 h-3 w-24 rounded-md', SHIMMER)} />
          </div>
        </div>
        <div className={clsx('h-8 w-20 rounded-lg', SHIMMER)} />
      </div>
      {/* Chart area */}
      <div className={clsx('h-48 w-full rounded-xl', SHIMMER)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity skeleton
// ---------------------------------------------------------------------------

function ActivityItemSkeleton() {
  return (
    <div className="flex items-center gap-4 py-5">
      <div className={clsx('h-10 w-10 shrink-0 rounded-xl', SHIMMER)} />
      <div className="flex-1 min-w-0">
        <div className={clsx('h-4 w-40 rounded-md', SHIMMER)} />
        <div className={clsx('mt-2 h-3 w-56 rounded-md', SHIMMER)} />
      </div>
      <div className={clsx('h-5 w-16 shrink-0 rounded-full', SHIMMER)} />
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className={clsx(GLASS, 'p-8 sm:p-11')}>
      {/* Header */}
      <div className="flex items-center gap-4 mb-10">
        <div className={clsx('h-10 w-10 rounded-xl', SHIMMER)} />
        <div>
          <div className={clsx('h-4 w-32 rounded-md', SHIMMER)} />
          <div className={clsx('mt-2 h-3 w-24 rounded-md', SHIMMER)} />
        </div>
      </div>
      {/* Activity items */}
      <div className="divide-y divide-white/[0.04]">
        <ActivityItemSkeleton />
        <ActivityItemSkeleton />
        <ActivityItemSkeleton />
        <ActivityItemSkeleton />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick Actions skeleton
// ---------------------------------------------------------------------------

function QuickActionsSkeleton() {
  return (
    <div className={clsx(GLASS, 'p-7 sm:p-9')}>
      <div className="flex items-center gap-3 mb-10">
        <div className={clsx('h-10 w-10 rounded-xl', SHIMMER)} />
        <div>
          <div className={clsx('h-4 w-24 rounded-md', SHIMMER)} />
          <div className={clsx('mt-2 h-3 w-32 rounded-md', SHIMMER)} />
        </div>
      </div>
      <div className="space-y-5">
        {[1, 2, 3].map((i) => (
          <div key={i} className={clsx(GLASS, 'flex items-center gap-5 p-5 sm:p-7')}>
            <div className={clsx('h-11 w-11 shrink-0 rounded-xl', SHIMMER)} />
            <div className="flex-1 min-w-0">
              <div className={clsx('h-4 w-28 rounded-md', SHIMMER)} />
              <div className={clsx('mt-2 h-3 w-40 rounded-md', SHIMMER)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full Dashboard Skeleton
// ---------------------------------------------------------------------------

export default function DashboardSkeleton() {
  return (
    <div className="w-full animate-fade-in">
      {/* Page Header */}
      <div className="mb-12 sm:mb-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className={clsx('h-9 w-48 rounded-lg', SHIMMER)} />
            <div className={clsx('mt-4 h-4 w-72 rounded-md', SHIMMER)} />
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <div className={clsx('h-10 w-40 rounded-xl', SHIMMER)} />
            <div className={clsx('h-10 w-32 rounded-xl', SHIMMER)} />
          </div>
        </div>
        <div className="mt-10 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 gap-6 pl-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-12 overflow-hidden">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      {/* Charts Row */}
      <div className="mt-12 grid grid-cols-1 gap-8 sm:mt-16 sm:gap-10 lg:grid-cols-2">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>

      {/* Activity + Quick Actions */}
      <div className="mt-12 grid grid-cols-1 gap-8 sm:mt-16 sm:gap-10 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ActivitySkeleton />
        </div>
        <QuickActionsSkeleton />
      </div>
    </div>
  );
}

export { StatCardSkeleton, ChartSkeleton, ActivitySkeleton, QuickActionsSkeleton };
