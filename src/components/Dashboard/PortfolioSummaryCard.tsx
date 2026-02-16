import clsx from 'clsx';
import {
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { InfoTooltip } from '../Common/Tooltip';
import { formatPercent } from '../../lib/formatters';

// ---------------------------------------------------------------------------
// Glass morphism shared tokens (matches DashboardPage pattern)
// ---------------------------------------------------------------------------

const GLASS =
  'bg-[#0D0F14]/80 backdrop-blur-xl border border-white/[0.06] rounded-2xl';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PortfolioSummaryCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
  change?: number;
  gradientFrom: string;
  gradientTo: string;
  /** Optional tooltip text shown via an InfoTooltip icon next to the title. */
  tooltip?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PortfolioSummaryCard({
  title,
  value,
  icon: Icon,
  change,
  gradientFrom,
  gradientTo,
  tooltip,
}: PortfolioSummaryCardProps) {
  const isPositive = change !== undefined && change >= 0;

  return (
    <div
      className={clsx(
        GLASS,
        'group relative overflow-hidden p-7 sm:p-9',
        'hover:border-white/[0.12] hover:shadow-lg hover:shadow-black/20',
        'transition-all duration-300',
      )}
    >
      {/* Subtle gradient glow on hover */}
      <div
        className={clsx(
          'absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-0',
          'transition-opacity duration-500 group-hover:opacity-100 blur-3xl',
        )}
        style={{
          background: `radial-gradient(circle, ${gradientFrom}18, transparent 70%)`,
        }}
      />

      <div className="relative flex items-start justify-between gap-4">
        {/* Left: label + value */}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium tracking-wide text-gray-400">
            {title}
            {tooltip && <InfoTooltip content={tooltip} />}
          </p>
          <p className="mt-3 truncate text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {value}
          </p>
          {change !== undefined && !Number.isNaN(change) && (
            <div className="mt-3 flex items-center gap-1.5">
              <div
                className={clsx(
                  'flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold',
                  isPositive
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-red-500/10 text-red-400',
                )}
              >
                {isPositive ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                {formatPercent(Math.abs(change))}
              </div>
              {/* Mini trend sparkline */}
              <div className="ml-2 flex items-end gap-px">
                {[0.4, 0.7, 0.5, 0.8, 0.6, 0.9, 1].map((h, i) => (
                  <div
                    key={i}
                    className={clsx(
                      'w-1 rounded-full transition-all',
                      isPositive ? 'bg-emerald-500/40' : 'bg-red-500/40',
                    )}
                    style={{ height: `${h * 20}px` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: icon in gradient container */}
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: `linear-gradient(135deg, ${gradientFrom}22, ${gradientTo}22)`,
          }}
        >
          <Icon className="h-6 w-6" style={{ color: gradientFrom }} />
        </div>
      </div>
    </div>
  );
}
