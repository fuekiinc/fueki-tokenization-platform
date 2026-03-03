import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import { getAdminStats } from '../../lib/api/admin';
import type { AdminStats } from '../../lib/api/admin';
import { CARD_CLASSES } from '../../lib/designTokens';

// ---------------------------------------------------------------------------
// Glass style tokens (from design system)
// ---------------------------------------------------------------------------

const GLASS = CARD_CLASSES.base;

// ---------------------------------------------------------------------------
// Stat card config
// ---------------------------------------------------------------------------

interface StatConfig {
  key: keyof AdminStats;
  label: string;
  icon: React.ElementType;
  gradientFrom: string;
  gradientTo: string;
  /** If provided, will show as trend percentage */
  trendKey?: string;
}

const STAT_CARDS: StatConfig[] = [
  {
    key: 'totalUsers',
    label: 'Total Users',
    icon: Users,
    gradientFrom: '#6366f1',
    gradientTo: '#8b5cf6',
  },
  {
    key: 'newUsersLast30Days',
    label: 'New Users (30d)',
    icon: UserPlus,
    gradientFrom: '#3b82f6',
    gradientTo: '#6366f1',
  },
  {
    key: 'kycPending',
    label: 'KYC Pending',
    icon: Clock,
    gradientFrom: '#f59e0b',
    gradientTo: '#d97706',
  },
  {
    key: 'kycApproved',
    label: 'KYC Approved',
    icon: CheckCircle,
    gradientFrom: '#10b981',
    gradientTo: '#059669',
  },
  {
    key: 'kycRejected',
    label: 'KYC Rejected',
    icon: XCircle,
    gradientFrom: '#ef4444',
    gradientTo: '#dc2626',
  },
];

// ---------------------------------------------------------------------------
// Trend indicator helper
// ---------------------------------------------------------------------------

function computeTrend(stats: AdminStats, key: keyof AdminStats): { value: number; isPositive: boolean } | null {
  // Show trend for new users (30d) based on total users ratio
  if (key === 'newUsersLast30Days' && stats.totalUsers > 0) {
    const pct = Math.round((stats.newUsersLast30Days / stats.totalUsers) * 100);
    return { value: pct, isPositive: pct > 0 };
  }
  // Show approval rate for approved
  if (key === 'kycApproved') {
    const total = stats.kycApproved + stats.kycPending + stats.kycRejected;
    if (total === 0) return null;
    const pct = Math.round((stats.kycApproved / total) * 100);
    return { value: pct, isPositive: true };
  }
  // Show rejection rate for rejected
  if (key === 'kycRejected') {
    const total = stats.kycApproved + stats.kycPending + stats.kycRejected;
    if (total === 0) return null;
    const pct = Math.round((stats.kycRejected / total) * 100);
    return { value: pct, isPositive: false };
  }
  return null;
}

function getTrendLabel(key: keyof AdminStats): string {
  if (key === 'newUsersLast30Days') return 'of total';
  if (key === 'kycApproved') return 'approval rate';
  if (key === 'kycRejected') return 'rejection rate';
  return '';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminStatsGrid() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAdminStats();
      setStats(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load stats';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
        {STAT_CARDS.map((card) => (
          <div key={card.key} className={clsx(GLASS, 'animate-pulse p-7')}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-white/[0.06]" />
              <div className="h-4 w-20 rounded bg-white/[0.06]" />
            </div>
            <div className="mt-4 h-8 w-16 rounded bg-white/[0.06]" />
            <div className="mt-2 h-3 w-24 rounded bg-white/[0.06]" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={clsx(GLASS, 'flex flex-col items-center gap-4 p-10')}>
        <AlertTriangle className="h-8 w-8 text-amber-400" aria-hidden="true" />
        <p className="text-sm text-gray-400">{error}</p>
        <button
          onClick={() => void fetchStats()}
          className="rounded-xl bg-white/[0.06] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/[0.10]"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
      {STAT_CARDS.map((card) => {
        const Icon = card.icon;
        const value = stats[card.key];
        const trend = computeTrend(stats, card.key);
        const trendLabel = getTrendLabel(card.key);

        return (
          <div
            key={card.key}
            className={clsx(
              GLASS,
              'group relative overflow-hidden p-7',
              'transition-all duration-300 ease-out',
              'hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20',
              'hover:border-white/[0.10]',
            )}
          >
            {/* Background glow on hover */}
            <div
              className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              style={{
                background: `radial-gradient(ellipse at 50% 0%, ${card.gradientFrom}08, transparent 70%)`,
              }}
              aria-hidden="true"
            />

            <div className="relative">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-white/[0.06]"
                  style={{
                    background: `linear-gradient(135deg, ${card.gradientFrom}20, ${card.gradientTo}20)`,
                  }}
                >
                  <Icon
                    className="h-5 w-5"
                    style={{ color: card.gradientFrom }}
                    aria-hidden="true"
                  />
                </div>
                <p className="min-w-0 truncate text-xs font-medium uppercase tracking-wider text-gray-400">
                  {card.label}
                </p>
              </div>

              <p className="mt-4 text-2xl font-bold tracking-tight text-white">
                {typeof value === 'number' ? value.toLocaleString() : value}
              </p>

              {/* Trend indicator */}
              {trend && (
                <div className="mt-2 flex items-center gap-1.5">
                  {trend.isPositive ? (
                    <TrendingUp
                      className="h-3.5 w-3.5 text-emerald-400"
                      aria-hidden="true"
                    />
                  ) : (
                    <TrendingDown
                      className="h-3.5 w-3.5 text-red-400"
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className={clsx(
                      'text-xs font-medium',
                      trend.isPositive ? 'text-emerald-400' : 'text-red-400',
                    )}
                  >
                    {trend.value}%
                  </span>
                  {trendLabel && (
                    <span className="text-xs text-gray-500">{trendLabel}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
