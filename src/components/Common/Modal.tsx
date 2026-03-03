import type { ReactNode } from 'react';
import {
  Dialog,
  DialogBackdrop,
  DialogDescription,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react';
import { X } from 'lucide-react';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  size?: ModalSize;
  /** Hide the close (X) button in the top-right corner */
  hideCloseButton?: boolean;
  /** Footer content rendered below the body */
  footer?: ReactNode;
}

// ---------------------------------------------------------------------------
// Size map
// ---------------------------------------------------------------------------

const sizeStyles: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  hideCloseButton = false,
  footer,
}: ModalProps) {
  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      {/* Backdrop -- clean blur */}
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
        <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
          {/* Panel */}
          <DialogPanel
            transition
            className={clsx(
              'relative w-full overflow-hidden',
              // Glass morphism
              'rounded-2xl bg-[#0D0F14]/95 backdrop-blur-xl',
              'border border-white/[0.08]',
              // Depth shadow
              'shadow-[0_25px_60px_-12px_rgba(0,0,0,0.5)]',
              // Transition
              'transition duration-300 ease-out',
              'data-[closed]:scale-95 data-[closed]:opacity-0 data-[closed]:translate-y-2',
              // Size
              sizeStyles[size],
            )}
          >
            {/* Gradient top border */}
            <div
              className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500"
              aria-hidden="true"
            />

            {/* Header */}
            {(title || !hideCloseButton) && (
              <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-5 sm:px-8 md:px-10 pt-6 sm:pt-8 md:pt-10 pb-5 sm:pb-6">
                <div className="min-w-0 flex-1">
                  {title && (
                    <DialogTitle className="text-xl font-semibold text-white leading-tight">
                      {title}
                    </DialogTitle>
                  )}
                  {description && (
                    <DialogDescription className="mt-2.5 text-sm text-gray-400 leading-relaxed">
                      {description}
                    </DialogDescription>
                  )}
                </div>

                {!hideCloseButton && (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close dialog"
                    className={clsx(
                      'absolute top-4 right-4 sm:top-6 sm:right-6 md:top-8 md:right-8 shrink-0 rounded-xl p-2 min-h-[44px] min-w-[44px] flex items-center justify-center',
                      'text-gray-500 transition-all duration-200',
                      'hover:bg-white/[0.06] hover:text-white',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D0F14]',
                    )}
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>
            )}

            {/* Body -- spacious padding */}
            <div className="px-5 sm:px-8 md:px-10 py-6 sm:py-8 md:py-10">{children}</div>

            {/* Footer */}
            {footer && (
              <div className="flex items-center justify-end gap-3 border-t border-white/[0.06] px-5 sm:px-8 md:px-10 py-5 sm:py-6">
                {footer}
              </div>
            )}
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}
