import clsx from 'clsx';
import { CARD_CLASSES, SHIMMER_CLASSES, GRID_CLASSES } from '../../lib/designTokens';

// ---------------------------------------------------------------------------
// Shared shimmer animation class
// ---------------------------------------------------------------------------

const SHIMMER = SHIMMER_CLASSES.tailwind;

const GLASS = CARD_CLASSES.base;

// ---------------------------------------------------------------------------
// StatCard skeleton -- matches StatsGrid card layout
// ---------------------------------------------------------------------------

function StatCardSkeleton() {
  return (
    <div className={clsx(GLASS, 'p-6')}>
      <div className="flex items-center justify-between mb-3">
        {/* Label */}
        <div className={clsx('h-3 w-24 rounded-md', SHIMMER)} />
        {/* Icon */}
        <div className={clsx('h-8 w-8 shrink-0 rounded-lg', SHIMMER)} />
      </div>
      {/* Value */}
      <div className={clsx('h-7 w-32 rounded-lg', SHIMMER)} />
      {/* Change badge */}
      <div className={clsx('mt-2 h-4 w-20 rounded-md', SHIMMER)} />
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
    <div className="flex items-center gap-4 py-4">
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
    <div className={clsx(GLASS, 'p-6 sm:p-8')}>
      {/* Header with filter pills */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className={clsx('h-10 w-10 rounded-xl', SHIMMER)} />
          <div>
            <div className={clsx('h-4 w-32 rounded-md', SHIMMER)} />
            <div className={clsx('mt-2 h-3 w-48 rounded-md', SHIMMER)} />
          </div>
        </div>
        {/* Filter pills skeleton */}
        <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03]">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={clsx('h-7 w-14 rounded-lg', SHIMMER)} />
          ))}
        </div>
      </div>
      {/* Activity items */}
      <div className="divide-y divide-white/[0.04]">
        <ActivityItemSkeleton />
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
      <div className="mb-8 sm:mb-10">
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
        <div className="mt-8 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      </div>

      {/* Stats Row -- 4 cols desktop, 2 tablet, 1 mobile */}
      <div className={GRID_CLASSES.stats}>
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      {/* Charts Row */}
      <div className={clsx(GRID_CLASSES.sectionGap, GRID_CLASSES.charts)}>
        <ChartSkeleton />
        <ChartSkeleton />
      </div>

      {/* Activity Feed -- full width */}
      <div className={GRID_CLASSES.sectionGap}>
        <ActivitySkeleton />
      </div>

      {/* Quick Actions -- full width */}
      <div className={GRID_CLASSES.sectionGap}>
        <QuickActionsSkeleton />
      </div>
    </div>
  );
}

export { StatCardSkeleton, ChartSkeleton, ActivitySkeleton, QuickActionsSkeleton };
