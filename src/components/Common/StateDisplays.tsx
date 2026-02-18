import { AlertCircle, Package, Loader2, RefreshCw } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

interface LoadingStateProps {
  message?: string;
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

interface CardSkeletonProps {
  lines?: number;
}

// ---------------------------------------------------------------------------
// EmptyState -- centered placeholder for empty lists / tables
// ---------------------------------------------------------------------------

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl mb-4 bg-indigo-500/[0.06] border border-indigo-500/10">
        {icon || <Package className="h-6 w-6 text-gray-600" />}
      </div>
      <p className="text-sm font-medium text-gray-400">{title}</p>
      {description && (
        <p className="text-xs text-gray-600 mt-2 max-w-[260px] leading-relaxed">
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 rounded-xl bg-indigo-500/15 border border-indigo-500/25 px-4 py-2 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/25 transition-all"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LoadingState -- spinner with optional message
// ---------------------------------------------------------------------------

export function LoadingState({ message = 'Loading...' }: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mb-3" />
      <p className="text-xs text-gray-500">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ErrorState -- error message with optional retry action
// ---------------------------------------------------------------------------

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl mb-4 bg-red-500/[0.06] border border-red-500/10">
        <AlertCircle className="h-6 w-6 text-red-400" />
      </div>
      <p className="text-sm font-medium text-gray-400">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 flex items-center gap-2 rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2 text-xs font-medium text-gray-400 hover:bg-white/[0.08] transition-all"
        >
          <RefreshCw className="h-3 w-3" /> Try again
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CardSkeleton -- shimmer placeholder for card content
// ---------------------------------------------------------------------------

export function CardSkeleton({ lines = 3 }: CardSkeletonProps) {
  return (
    <div className="animate-pulse rounded-2xl bg-[#0D0F14]/80 border border-white/[0.06] p-8">
      <div className="h-4 w-1/3 rounded bg-white/[0.06] mb-6" />
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3 rounded bg-white/[0.04] mb-3"
          style={{ width: `${80 - i * 15}%` }}
        />
      ))}
    </div>
  );
}
