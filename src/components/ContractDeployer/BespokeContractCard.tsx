/**
 * BespokeContractCard -- Primary card for requesting a custom contract build.
 *
 * This card appears first in the contract deployer grid and routes users to a
 * dedicated intake form where they can describe bespoke requirements.
 */

import clsx from 'clsx';
import { ArrowRight, Gem, Sparkles, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BADGE_CLASSES } from '../../lib/designTokens';

export function BespokeContractCard() {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate('/contracts/bespoke')}
      className={clsx(
        'group text-left w-full',
        'relative overflow-hidden rounded-2xl',
        'bg-gradient-to-br from-indigo-600/15 via-cyan-600/10 to-emerald-600/10',
        'backdrop-blur-xl',
        'border border-indigo-400/25',
        'p-6',
        'transition-all duration-300 ease-out cursor-pointer',
        'hover:border-indigo-300/50 hover:shadow-lg hover:shadow-indigo-500/15 hover:-translate-y-0.5',
        'focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06070A]',
        'outline-none',
      )}
      aria-label="Request bespoke smart contract"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-300/60 to-transparent" />

      <div className="mb-4 flex items-start justify-between">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/25 to-cyan-500/25 ring-1 ring-indigo-300/40">
          <Gem className="h-5 w-5 text-indigo-200" />
        </div>

        <span
          className={clsx(
            BADGE_CLASSES.base,
            'bg-indigo-500/15 text-indigo-200 border-indigo-300/35',
          )}
        >
          Fueki Team
        </span>
      </div>

      <h3 className="mb-2 text-[15px] font-semibold tracking-tight text-white transition-colors duration-200 group-hover:text-indigo-100">
        Bespoke Smart Contract
      </h3>

      <p className="mb-4 text-[13px] leading-relaxed text-indigo-100/85">
        customized smart contract designed for your specific business needs by
        the Fueki team
      </p>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-indigo-100/90">
          <Sparkles className="h-3 w-3" />
          Custom logic
        </span>
        <span className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-indigo-100/90">
          <Users className="h-3 w-3" />
          White-glove support
        </span>
      </div>

      <div className="flex items-center justify-between border-t border-white/10 pt-3">
        <span className="text-[11px] text-indigo-100/80">
          Tell us what you need
        </span>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-indigo-300/35 bg-indigo-500/15 transition-all duration-200 group-hover:bg-indigo-400/20">
          <ArrowRight className="h-3.5 w-3.5 text-indigo-100" />
        </div>
      </div>
    </button>
  );
}

export default BespokeContractCard;
