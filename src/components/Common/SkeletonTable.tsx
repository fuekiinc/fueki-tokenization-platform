// ---------------------------------------------------------------------------
// SkeletonTable -- animated placeholder for table-like loading states
// ---------------------------------------------------------------------------

import clsx from 'clsx';
import { SHIMMER_CLASSES } from '../../lib/designTokens';

interface SkeletonTableProps {
  rows?: number;
  cols?: number;
}

export function SkeletonTable({ rows = 5, cols = 4 }: SkeletonTableProps) {
  return (
    <div className="animate-pulse space-y-3">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className={clsx('h-3 flex-1 rounded', SHIMMER_CLASSES.tailwind)} />
          ))}
        </div>
      ))}
    </div>
  );
}
