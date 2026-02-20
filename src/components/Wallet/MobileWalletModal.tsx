import { useCallback } from 'react';
import {
  Description,
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react';
import { ExternalLink, Smartphone, X } from 'lucide-react';
import clsx from 'clsx';
import { getMobileWalletDeepLink } from '../../lib/utils/mobile';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MobileWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDirectConnect: () => void;
}

// ---------------------------------------------------------------------------
// Wallet option data
// ---------------------------------------------------------------------------

interface WalletOption {
  id: string;
  name: string;
  description: string;
  color: string;
  initial: string;
}

const WALLET_OPTIONS: WalletOption[] = [
  {
    id: 'metamask',
    name: 'MetaMask',
    description: 'Popular Ethereum wallet',
    color: '#F6851B',
    initial: 'M',
  },
  {
    id: 'trust',
    name: 'Trust Wallet',
    description: 'Multi-chain mobile wallet',
    color: '#0500FF',
    initial: 'T',
  },
  {
    id: 'coinbase',
    name: 'Coinbase Wallet',
    description: 'By Coinbase exchange',
    color: '#0052FF',
    initial: 'C',
  },
];

// ---------------------------------------------------------------------------
// Wallet Icon (colored circle with initial)
// ---------------------------------------------------------------------------

function WalletIcon({ initial, color }: { initial: string; color: string }) {
  return (
    <div
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MobileWalletModal({
  isOpen,
  onClose,
  onDirectConnect,
}: MobileWalletModalProps) {
  const handleWalletSelect = useCallback((walletId: string) => {
    const deepLink = getMobileWalletDeepLink(walletId);
    if (deepLink) {
      window.location.href = deepLink;
    }
  }, []);

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      {/* Backdrop */}
      <DialogBackdrop
        transition
        className={clsx(
          'fixed inset-0 bg-black/60 backdrop-blur-sm',
          'transition-opacity duration-300 ease-out',
          'data-[closed]:opacity-0',
        )}
      />

      {/* Centering container */}
      <div className="fixed inset-0 overflow-y-auto">
        <div className="flex min-h-full items-end justify-center p-4 sm:items-center sm:p-6">
          {/* Panel */}
          <DialogPanel
            transition
            className={clsx(
              'relative w-full max-w-md overflow-hidden',
              // Glass morphism
              'rounded-2xl bg-[#0D0F14]/95 backdrop-blur-xl',
              'border border-white/[0.08]',
              // Depth shadow
              'shadow-[0_25px_60px_-12px_rgba(0,0,0,0.5)]',
              // Transition
              'transition duration-300 ease-out',
              'data-[closed]:scale-95 data-[closed]:opacity-0 data-[closed]:translate-y-4',
            )}
          >
            {/* Gradient top border */}
            <div
              className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500"
              aria-hidden="true"
            />

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className={clsx(
                'absolute top-4 right-4 shrink-0 rounded-xl p-2',
                'min-h-[44px] min-w-[44px] flex items-center justify-center',
                'text-gray-500 transition-all duration-200',
                'hover:bg-white/[0.06] hover:text-white',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D0F14]',
              )}
            >
              <X className="h-5 w-5" />
            </button>

            {/* Header */}
            <div className="px-6 pt-8 pb-2 text-center">
              {/* Icon */}
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/[0.08]">
                <Smartphone className="h-6 w-6 text-indigo-400" />
              </div>

              <DialogTitle className="text-xl font-semibold text-white leading-tight">
                Connect Mobile Wallet
              </DialogTitle>

              <Description className="mt-2.5 text-sm text-gray-400 leading-relaxed max-w-xs mx-auto">
                Open this app in your wallet's browser to connect.
              </Description>
            </div>

            {/* Wallet options */}
            <div className="px-6 pt-4 pb-2 space-y-3">
              {WALLET_OPTIONS.map((wallet) => (
                <button
                  key={wallet.id}
                  type="button"
                  onClick={() => handleWalletSelect(wallet.id)}
                  className={clsx(
                    'flex w-full items-center gap-4 rounded-xl p-4',
                    'min-h-[68px]',
                    // Glass surface
                    'bg-white/[0.03] border border-white/[0.06]',
                    // Transitions
                    'transition-all duration-200 ease-out',
                    // Hover
                    'hover:bg-white/[0.07] hover:border-white/[0.12]',
                    'hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-6px_rgba(0,0,0,0.3)]',
                    // Active press
                    'active:scale-[0.98] active:duration-75',
                    // Focus
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D0F14]',
                  )}
                >
                  <WalletIcon initial={wallet.initial} color={wallet.color} />

                  <div className="min-w-0 flex-1 text-left">
                    <p className="text-sm font-semibold text-white truncate">
                      {wallet.name}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500 truncate">
                      {wallet.description}
                    </p>
                  </div>

                  <ExternalLink className="h-4 w-4 shrink-0 text-gray-600" />
                </button>
              ))}
            </div>

            {/* Separator */}
            <div className="mx-6 mt-4 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

            {/* Direct connect hint */}
            <div className="px-6 pt-4 pb-2 text-center">
              <p className="text-xs text-gray-500 leading-relaxed">
                Already in a wallet browser? Try connecting directly.
              </p>
              <button
                type="button"
                onClick={onDirectConnect}
                className={clsx(
                  'mt-2 inline-flex items-center gap-1.5 rounded-lg px-4 py-2',
                  'min-h-[44px]',
                  'text-sm font-medium text-indigo-400',
                  'transition-all duration-200',
                  'hover:bg-indigo-500/10 hover:text-indigo-300',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50',
                )}
              >
                Connect Directly
              </button>
            </div>

            {/* Cancel button */}
            <div className="px-6 pt-2 pb-6">
              <button
                type="button"
                onClick={onClose}
                className={clsx(
                  'flex w-full items-center justify-center rounded-xl px-6 py-3.5',
                  'min-h-[48px]',
                  // Glass morphism
                  'bg-white/[0.06] backdrop-blur-xl',
                  'border border-white/[0.08]',
                  'text-sm font-semibold text-gray-300',
                  // Transitions
                  'transition-all duration-200 ease-out',
                  // Hover
                  'hover:bg-white/[0.10] hover:text-white hover:border-white/[0.14]',
                  // Active press
                  'active:scale-[0.98] active:duration-75',
                  // Focus
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D0F14]',
                )}
              >
                Cancel
              </button>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}

export type { MobileWalletModalProps };
