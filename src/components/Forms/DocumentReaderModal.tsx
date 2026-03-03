import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ChevronDown, X } from 'lucide-react';
import clsx from 'clsx';
import TermsContent from './TermsContent';
import PrivacyContent from './PrivacyContent';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DocumentReaderModalProps {
  type: 'terms' | 'privacy';
  open: boolean;
  onClose: () => void;
  onRead: () => void;
}

// ---------------------------------------------------------------------------
// DocumentReaderModal
// ---------------------------------------------------------------------------

export default function DocumentReaderModal({
  type,
  open,
  onClose,
  onRead,
}: DocumentReaderModalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [reachedBottom, setReachedBottom] = useState(false);

  const title = type === 'terms' ? 'Terms of Service' : 'Privacy Policy';

  // Reset scroll state when opening
  useEffect(() => {
    if (open) {
      setReachedBottom(false);
      // Scroll to top when modal opens
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo(0, 0);
      });
    }
  }, [open]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [open]);

  // Scroll listener
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || reachedBottom) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom <= 40) {
      setReachedBottom(true);
    }
  }, [reachedBottom]);

  const handleConfirm = () => {
    onRead();
    onClose();
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-3xl mx-4 flex flex-col max-h-[90vh] bg-[#0c0e14] border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/40">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] shrink-0">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={clsx(
              'p-1.5 rounded-lg transition-colors duration-150',
              'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
              'hover:bg-white/[0.06]',
            )}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-6 py-6 min-h-0"
          style={{ maxHeight: '60vh' }}
        >
          {type === 'terms' ? <TermsContent /> : <PrivacyContent />}
        </div>

        {/* Bottom bar */}
        <div className="px-6 py-4 border-t border-white/[0.06] shrink-0">
          {reachedBottom ? (
            <button
              type="button"
              onClick={handleConfirm}
              className={clsx(
                'w-full flex items-center justify-center gap-2',
                'px-5 py-2.5 rounded-xl text-sm font-semibold',
                'bg-indigo-600 hover:bg-indigo-500 text-white',
                'transition-colors duration-150',
                'focus:outline-none focus:ring-2 focus:ring-indigo-500/50',
              )}
            >
              <CheckCircle2 className="h-4 w-4" />
              I have read this document
            </button>
          ) : (
            <div className="flex items-center justify-center gap-2 text-sm text-[var(--text-muted)] py-2.5">
              <ChevronDown className="h-4 w-4 animate-bounce" />
              Scroll to read entire document
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
