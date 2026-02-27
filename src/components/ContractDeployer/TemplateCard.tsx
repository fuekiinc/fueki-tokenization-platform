/**
 * TemplateCard -- clickable card for a single smart contract template.
 *
 * Renders the template icon, category badge, name, description, tags, and
 * constructor parameter count. Clicking navigates to the deployment wizard
 * for the selected template.
 */

import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import * as LucideIcons from 'lucide-react';
import type { ContractTemplate } from '../../types/contractDeployer';
import { BADGE_CLASSES } from '../../lib/designTokens';

// ---------------------------------------------------------------------------
// Icon resolver
// ---------------------------------------------------------------------------

/**
 * Resolve a Lucide icon name string to the corresponding React component.
 * Falls back to `FileCode2` when the name is not found.
 */
function getIcon(name: string): React.ComponentType<{ className?: string; size?: number }> {
  const icons = LucideIcons as unknown as Record<
    string,
    React.ComponentType<{ className?: string; size?: number }>
  >;
  return icons[name] ?? LucideIcons.FileCode2;
}

// ---------------------------------------------------------------------------
// Category styling
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<string, string> = {
  tokens: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  nfts: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  staking: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  trading: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  utility: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
};

const CATEGORY_ICON_BG: Record<string, string> = {
  tokens: 'from-indigo-500/20 to-violet-500/20',
  nfts: 'from-violet-500/20 to-purple-500/20',
  staking: 'from-emerald-500/20 to-teal-500/20',
  trading: 'from-amber-500/20 to-orange-500/20',
  utility: 'from-cyan-500/20 to-blue-500/20',
};

const CATEGORY_ICON_TEXT: Record<string, string> = {
  tokens: 'text-indigo-400',
  nfts: 'text-violet-400',
  staking: 'text-emerald-400',
  trading: 'text-amber-400',
  utility: 'text-cyan-400',
};

const CATEGORY_LABELS: Record<string, string> = {
  tokens: 'Token',
  nfts: 'NFT',
  staking: 'Staking',
  trading: 'Trading',
  utility: 'Utility',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TemplateCard({ template }: { template: ContractTemplate }) {
  const navigate = useNavigate();
  const Icon = getIcon(template.icon);

  const categoryClass = CATEGORY_COLORS[template.category] ?? 'bg-gray-500/10 text-gray-400 border-gray-500/20';
  const iconBg = CATEGORY_ICON_BG[template.category] ?? 'from-gray-500/20 to-gray-600/20';
  const iconText = CATEGORY_ICON_TEXT[template.category] ?? 'text-gray-400';
  const categoryLabel = CATEGORY_LABELS[template.category] ?? template.category;

  const paramCount = template.constructorParams.length;

  return (
    <button
      type="button"
      onClick={() => navigate(`/contracts/deploy/${template.id}`)}
      className={clsx(
        'group text-left w-full',
        'relative overflow-hidden rounded-2xl',
        'bg-[#0D0F14]/80 backdrop-blur-xl',
        'border border-white/[0.06]',
        'p-6',
        'transition-all duration-300 ease-out cursor-pointer',
        'hover:border-white/[0.12] hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5',
        'focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06070A]',
        'outline-none',
      )}
      aria-label={`Deploy ${template.name}`}
    >
      {/* Top gradient accent */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent group-hover:via-indigo-500/30 transition-all duration-300" />

      {/* ------------------------------------------------------------------ */}
      {/* Header: icon + category badge                                      */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-start justify-between mb-4">
        <div
          className={clsx(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
            'bg-gradient-to-br ring-1 ring-white/[0.06]',
            'transition-all duration-300 group-hover:ring-white/[0.10] group-hover:scale-105',
            iconBg,
          )}
        >
          <Icon className={clsx('h-5 w-5', iconText)} />
        </div>

        <span
          className={clsx(
            BADGE_CLASSES.base,
            categoryClass,
          )}
        >
          {categoryLabel}
        </span>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Name                                                               */}
      {/* ------------------------------------------------------------------ */}
      <h3 className="text-[15px] font-semibold text-white tracking-tight mb-2 group-hover:text-indigo-200 transition-colors duration-200">
        {template.name}
      </h3>

      {/* ------------------------------------------------------------------ */}
      {/* Description                                                        */}
      {/* ------------------------------------------------------------------ */}
      <p className="text-[13px] leading-relaxed text-gray-400 mb-4 line-clamp-2">
        {template.description}
      </p>

      {/* ------------------------------------------------------------------ */}
      {/* Tags                                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {template.tags.slice(0, 4).map((tag) => (
          <span
            key={tag}
            className="inline-block rounded-md bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-gray-500 tracking-wide"
          >
            {tag}
          </span>
        ))}
        {template.tags.length > 4 && (
          <span className="inline-block rounded-md bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-gray-600 tracking-wide">
            +{template.tags.length - 4}
          </span>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Footer: constructor params + deploy arrow                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center justify-between pt-3 border-t border-white/[0.04]">
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
          <LucideIcons.Settings2 className="h-3.5 w-3.5" />
          <span>
            {paramCount === 0
              ? 'No config needed'
              : `${paramCount} parameter${paramCount > 1 ? 's' : ''}`}
          </span>
          {template.payable && (
            <>
              <span className="text-gray-700 mx-1">|</span>
              <LucideIcons.Coins className="h-3.5 w-3.5 text-amber-500/60" />
              <span className="text-amber-500/80">Payable</span>
            </>
          )}
        </div>

        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.03] border border-white/[0.04] group-hover:bg-indigo-500/10 group-hover:border-indigo-500/20 transition-all duration-200">
          <LucideIcons.ArrowRight className="h-3.5 w-3.5 text-gray-600 group-hover:text-indigo-400 transition-colors duration-200" />
        </div>
      </div>
    </button>
  );
}

export default TemplateCard;
