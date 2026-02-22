/**
 * Tooltip -- lightweight, accessible tooltip component (WCAG 2.1 AA).
 *
 * Features:
 *   - Shows on hover (desktop) and tap (mobile)
 *   - Shows on focus for keyboard accessibility
 *   - Auto-detects viewport edges and repositions
 *   - Supports simple text and rich ReactNode content
 *   - Glass-morphism styling matching the platform dark theme
 *   - Fade-in animation respecting prefers-reduced-motion
 *   - Closes on Escape key and outside click (mobile)
 *   - Proper ARIA: role="tooltip", aria-describedby linkage
 *   - Unique IDs for multiple tooltip instances
 *
 * Also exports `InfoTooltip` -- a convenience wrapper that renders a small
 * HelpCircle icon as the trigger with a text-only tooltip.
 */

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useId,
  type ReactNode,
} from 'react';
import clsx from 'clsx';
import { HelpCircle } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TooltipProps {
  /** Tooltip body -- plain text or rich content. */
  content: string | ReactNode;
  /** Optional custom trigger element. Defaults to rendering `children`. */
  children?: ReactNode;
  /** Extra class names applied to the outer wrapper. */
  className?: string;
  /** Preferred position. The component will flip if near a viewport edge. */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Maximum width of the tooltip bubble in pixels. */
  maxWidth?: number;
}

export interface InfoTooltipProps {
  /** Plain-text explanation shown in the tooltip. */
  content: string;
  /** Extra class names applied to the outer wrapper. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EDGE_MARGIN = 12; // px from viewport edge before flipping
const HIDE_DELAY = 120; // ms before hiding -- allows mouse to bridge the gap

// ---------------------------------------------------------------------------
// Tooltip Component
// ---------------------------------------------------------------------------

export default function Tooltip({
  content,
  children,
  className,
  position = 'top',
  maxWidth = 280,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [resolvedPos, setResolvedPos] = useState(position);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pinnedRef = useRef(false);
  const tooltipId = useId();

  // ---- Resolve position (flip if near viewport edge) ----------------------

  const resolvePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();

    let pos = position;

    // Flip vertical
    if (pos === 'top' && rect.top < 80) pos = 'bottom';
    if (pos === 'bottom' && rect.bottom > window.innerHeight - 80) pos = 'top';

    // Flip horizontal
    if (pos === 'left' && rect.left < maxWidth + EDGE_MARGIN) pos = 'right';
    if (pos === 'right' && rect.right > window.innerWidth - maxWidth - EDGE_MARGIN) pos = 'left';

    setResolvedPos(pos);
  }, [position, maxWidth]);

  // ---- Show / Hide handlers -----------------------------------------------

  const show = useCallback(() => {
    clearTimeout(hideTimeoutRef.current);
    resolvePosition();
    setVisible(true);
  }, [resolvePosition]);

  const hide = useCallback(() => {
    if (pinnedRef.current) return;
    clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => {
      setVisible(false);
    }, HIDE_DELAY);
  }, []);

  const dismiss = useCallback(() => {
    clearTimeout(hideTimeoutRef.current);
    pinnedRef.current = false;
    setVisible(false);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => () => clearTimeout(hideTimeoutRef.current), []);

  // Reset pinned state when tooltip hides
  useEffect(() => {
    if (!visible) pinnedRef.current = false;
  }, [visible]);

  // Click handler: pin on first click, dismiss on second (for mobile/touch)
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (pinnedRef.current) {
      dismiss();
    } else {
      pinnedRef.current = true;
      show();
    }
  }, [show, dismiss]);

  // ---- Close on outside click (mobile) ------------------------------------

  useEffect(() => {
    if (!visible) return;

    function handleClickOutside(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        bubbleRef.current &&
        !bubbleRef.current.contains(target)
      ) {
        dismiss();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [visible, dismiss]);

  // ---- Close on Escape ----------------------------------------------------

  useEffect(() => {
    if (!visible) return;

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        dismiss();
        // Return focus to the trigger element
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [visible, dismiss]);

  // ---- Position classes ---------------------------------------------------

  const positionClasses: Record<string, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  // ---- Render -------------------------------------------------------------

  return (
    <span
      ref={triggerRef}
      className={clsx('relative inline-flex items-center', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onClick={handleClick}
      tabIndex={0}
      aria-describedby={visible ? tooltipId : undefined}
    >
      {children}

      {/* Tooltip bubble */}
      <div
        ref={bubbleRef}
        id={tooltipId}
        role="tooltip"
        aria-hidden={!visible}
        onMouseEnter={show}
        onMouseLeave={hide}
        className={clsx(
          'absolute z-[100]',
          positionClasses[resolvedPos],
          // Glass-morphism styling
          'rounded-lg px-3.5 py-2.5',
          'bg-[#1a1d24] backdrop-blur-xl',
          'border border-white/[0.08]',
          'shadow-xl shadow-black/40',
          // Typography -- 4.5:1 contrast on dark bg
          'text-sm leading-relaxed text-gray-100',
          // Animation -- respects prefers-reduced-motion
          'transition-all duration-150 ease-out motion-reduce:transition-none',
          visible
            ? 'opacity-100 scale-100'
            : 'opacity-0 scale-95 pointer-events-none',
        )}
        style={{ maxWidth, width: 'max-content' }}
      >
        {content}
      </div>
    </span>
  );
}

// ---------------------------------------------------------------------------
// InfoTooltip -- convenience wrapper with HelpCircle icon trigger
// ---------------------------------------------------------------------------

export function InfoTooltip({ content, className }: InfoTooltipProps) {
  return (
    <Tooltip content={content} position="top" className={className}>
      <HelpCircle
        className="h-4 w-4 shrink-0 text-white/30 transition-colors duration-150 hover:text-white/60 cursor-help"
        aria-hidden="true"
      />
      <span className="sr-only">More info: {content}</span>
    </Tooltip>
  );
}

export type { TooltipProps as TooltipComponentProps };
