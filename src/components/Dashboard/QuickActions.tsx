import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowUpRight,
  TrendingUp,
  Repeat,
  ArrowRight,
  Zap,
} from 'lucide-react';
import { CARD_CLASSES } from '../../lib/designTokens';

// ---------------------------------------------------------------------------
// QuickAction item
// ---------------------------------------------------------------------------

function QuickAction({
  icon: Icon,
  title,
  description,
  gradientFrom,
  gradientTo,
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  gradientFrom: string;
  gradientTo: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        CARD_CLASSES.base,
        CARD_CLASSES.hover,
        'group relative flex w-full items-center gap-5 overflow-hidden p-5 text-left sm:p-7',
      )}
    >
      {/* Hover glow */}
      <div
        className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: `radial-gradient(ellipse at 0% 50%, ${gradientFrom}08, transparent 70%)`,
        }}
      />

      <div
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
        style={{
          background: `linear-gradient(135deg, ${gradientFrom}20, ${gradientTo}20)`,
        }}
      >
        <Icon className="h-5 w-5" style={{ color: gradientFrom }} />
      </div>

      <div className="relative min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-1 text-xs text-gray-500">{description}</p>
      </div>

      <ArrowRight
        className={clsx(
          'relative h-4 w-4 shrink-0 text-gray-600',
          'transition-all duration-300',
          'group-hover:translate-x-0.5 group-hover:text-gray-300',
        )}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function QuickActions() {
  const navigate = useNavigate();

  return (
    <div className={clsx(CARD_CLASSES.base, CARD_CLASSES.padding)}>
      <div className="mb-10 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
          <Zap className="h-5 w-5 text-amber-400" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-gray-100">
            Quick Actions
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Common operations
          </p>
        </div>
      </div>

      <div className="space-y-5">
        <QuickAction
          icon={ArrowUpRight}
          title="Upload & Mint"
          description="Tokenize a new document"
          gradientFrom="#3B82F6"
          gradientTo="#6366F1"
          onClick={() => navigate('/mint')}
        />
        <QuickAction
          icon={TrendingUp}
          title="View Portfolio"
          description="Manage your wrapped assets"
          gradientFrom="#8B5CF6"
          gradientTo="#A855F7"
          onClick={() => navigate('/portfolio')}
        />
        <QuickAction
          icon={Repeat}
          title="Exchange"
          description="Trade wrapped assets"
          gradientFrom="#10B981"
          gradientTo="#06B6D4"
          onClick={() => navigate('/exchange')}
        />
      </div>
    </div>
  );
}
