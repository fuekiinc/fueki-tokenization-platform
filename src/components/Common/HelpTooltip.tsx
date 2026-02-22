import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronDown, CircleHelp } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { trackTooltipOpened } from '../../lib/analytics';
import {
  getTooltipBody,
  getTooltipDefinition,
  getTooltipLearnMore,
  getTooltipRiskNote,
  getValidatedTooltipLinks,
  shouldShowLearnMore,
  shouldShowTooltipForHelpLevel,
  type TooltipId,
} from '../../lib/tooltipRegistry';
import type { HelpLevel } from '../../types/auth';

interface HelpTooltipProps {
  tooltipId: TooltipId;
  flow: 'mint' | 'securityMint' | 'swap' | 'pool' | 'orbital';
  component: string;
  className?: string;
  iconClassName?: string;
  ariaLabel?: string;
}

type HorizontalAnchor = 'left' | 'center' | 'right';
type VerticalAnchor = 'top' | 'bottom';

const VIEWPORT_MARGIN = 12;
const MAX_TOOLTIP_WIDTH = 320;
const ROUTE_LINK_LABELS: Record<string, string> = {
  '/mint': 'Mint Guide',
  '/exchange': 'Exchange Guide',
  '/advanced': 'Orbital AMM Guide',
  '/security-tokens': 'Security Token Guide',
  '/security-tokens/deploy': 'Deployment Guide',
  '/terms': 'Terms',
  '/privacy': 'Privacy',
};

function getHorizontalAnchor(centerX: number, viewportWidth: number): HorizontalAnchor {
  const half = MAX_TOOLTIP_WIDTH / 2;
  if (centerX <= VIEWPORT_MARGIN + half) return 'left';
  if (centerX >= viewportWidth - VIEWPORT_MARGIN - half) return 'right';
  return 'center';
}

function resolvePopoverTransform(
  horizontal: HorizontalAnchor,
  vertical: VerticalAnchor,
): string {
  const x = horizontal === 'left' ? '0%' : horizontal === 'right' ? '-100%' : '-50%';
  const y = vertical === 'top' ? '-100%' : '0%';
  return `translate(${x}, ${y})`;
}

function resolveHelpLevel(isInitialized: boolean, storedLevel: HelpLevel | undefined): HelpLevel | null {
  if (!isInitialized) return null;
  return storedLevel ?? 'novice';
}

export default function HelpTooltip({
  tooltipId,
  flow,
  component,
  className,
  iconClassName,
  ariaLabel,
}: HelpTooltipProps) {
  const location = useLocation();
  const tooltip = getTooltipDefinition(tooltipId);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  const isInitialized = useAuthStore((s) => s.isInitialized);
  const storedHelpLevel = useAuthStore((s) => s.user?.helpLevel);
  const helpLevel = resolveHelpLevel(isInitialized, storedHelpLevel);

  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);

  const visible = useMemo(
    () => (helpLevel ? shouldShowTooltipForHelpLevel(tooltip, helpLevel) : false),
    [helpLevel, tooltip],
  );

  const body = useMemo(
    () => (helpLevel ? getTooltipBody(tooltip, helpLevel) : ''),
    [helpLevel, tooltip],
  );

  const riskNote = useMemo(
    () => (helpLevel ? getTooltipRiskNote(tooltip, helpLevel) : undefined),
    [helpLevel, tooltip],
  );

  const learnMore = useMemo(
    () => (helpLevel ? getTooltipLearnMore(tooltip, helpLevel) : undefined),
    [helpLevel, tooltip],
  );

  const showLearnMoreToggle = useMemo(
    () => Boolean(helpLevel && learnMore && shouldShowLearnMore(tooltip, helpLevel)),
    [helpLevel, learnMore, tooltip],
  );

  const links = useMemo(() => getValidatedTooltipLinks(tooltip), [tooltip]);

  const updatePopoverPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const centerX = rect.left + rect.width / 2;
    const horizontal = getHorizontalAnchor(centerX, viewportWidth);
    const vertical: VerticalAnchor = rect.top < 170 ? 'bottom' : 'top';

    const left =
      horizontal === 'left'
        ? VIEWPORT_MARGIN
        : horizontal === 'right'
          ? viewportWidth - VIEWPORT_MARGIN
          : centerX;

    let top = vertical === 'top' ? rect.top - 10 : rect.bottom + 10;
    if (vertical === 'bottom') {
      top = Math.min(top, viewportHeight - VIEWPORT_MARGIN);
    }

    setPopoverStyle({
      position: 'fixed',
      top,
      left,
      width: `min(${MAX_TOOLTIP_WIDTH}px, calc(100vw - ${VIEWPORT_MARGIN * 2}px))`,
      transform: resolvePopoverTransform(horizontal, vertical),
      zIndex: 700,
    });
  }, []);

  const closePopover = useCallback(() => {
    setOpen(false);
    setExpanded(false);
  }, []);

  const openPopover = useCallback(() => {
    if (!helpLevel || !visible) return;
    updatePopoverPosition();
    setOpen(true);
    setExpanded(false);
    trackTooltipOpened({
      tooltipId,
      helpLevel,
      route: location.pathname,
      flow,
      component,
    });
  }, [component, flow, helpLevel, location.pathname, tooltipId, updatePopoverPosition, visible]);

  useEffect(() => {
    if (!open) return;
    popoverRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      closePopover();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePopover();
        triggerRef.current?.focus();
      }
    };
    const onViewportChange = () => {
      updatePopoverPosition();
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);

    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [closePopover, open, updatePopoverPosition]);

  useEffect(() => {
    closePopover();
  }, [closePopover, location.pathname]);

  if (!visible || !helpLevel) {
    return null;
  }

  const title = tooltip.title ?? 'Quick Help';
  const label = ariaLabel ?? `Open help for ${title}`;

  return (
    <span className={clsx('inline-flex items-center', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={(e) => {
          // Prevent <label> from forwarding click to the associated input,
          // which would trigger the outside-click handler and immediately
          // close the popover.
          e.preventDefault();
          e.stopPropagation();
          if (open) {
            closePopover();
            return;
          }
          openPopover();
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            openPopover();
          }
        }}
        className={clsx(
          'inline-flex h-5 w-5 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors',
          'hover:text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60',
          iconClassName,
        )}
      >
        <CircleHelp className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && popoverStyle && (
        <div
          id={popoverId}
          ref={popoverRef}
          role="dialog"
          aria-modal="false"
          aria-label={title}
          tabIndex={-1}
          style={popoverStyle}
          className={clsx(
            'rounded-xl border border-white/[0.1] bg-[#101621]/95 px-3.5 py-3 shadow-2xl shadow-black/50 backdrop-blur-xl',
            'text-xs leading-relaxed text-gray-200',
          )}
        >
          <div className="mb-2 flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-white">{title}</p>
            <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-400">
              {helpLevel}
            </span>
          </div>

          <p>{body}</p>

          {riskNote && (
            <p className="mt-2 rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-200">
              <span className="font-semibold">Risk note:</span> {riskNote}
            </p>
          )}

          {showLearnMoreToggle && learnMore && (
            <div className="mt-2.5">
              <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-300 transition-colors hover:text-indigo-200"
              >
                Learn more
                <ChevronDown
                  className={clsx(
                    'h-3.5 w-3.5 transition-transform',
                    expanded && 'rotate-180',
                  )}
                  aria-hidden="true"
                />
              </button>
              {expanded && (
                <p className="mt-1.5 text-[11px] text-gray-300">{learnMore}</p>
              )}
            </div>
          )}

          {links.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {links.map((route) => (
                <Link
                  key={route}
                  to={route}
                  className="rounded-md border border-indigo-500/35 bg-indigo-500/10 px-2 py-1 text-[10px] font-semibold text-indigo-300 transition-colors hover:bg-indigo-500/20 hover:text-indigo-200"
                >
                  {ROUTE_LINK_LABELS[route] ?? 'Open'}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </span>
  );
}

export type { TooltipId };
