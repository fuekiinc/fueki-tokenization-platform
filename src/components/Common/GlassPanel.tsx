import { forwardRef } from 'react';
import type { ElementType, ComponentPropsWithRef } from 'react';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for the GlassPanel component.
 *
 * The `as` prop controls which HTML element (or React component) is rendered.
 * Defaults to `'div'`.
 */
interface GlassPanelOwnProps<T extends ElementType = 'div'> {
  /** The element type to render. Defaults to `'div'`. */
  as?: T;
  /** Tailwind padding class(es). Defaults to `'p-6'`. */
  padding?: string;
  /** Additional CSS class names merged via clsx. */
  className?: string;
  children?: React.ReactNode;
}

type GlassPanelProps<T extends ElementType = 'div'> = GlassPanelOwnProps<T> &
  Omit<ComponentPropsWithRef<T>, keyof GlassPanelOwnProps<T>>;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Reusable glass-morphism panel that matches the platform's design system.
 *
 * Uses the same visual treatment found on LoginPage and SignupPage cards:
 *   - Semi-transparent secondary background with backdrop blur
 *   - Primary border, generous rounding, and a deep shadow
 *
 * @example
 * ```tsx
 * <GlassPanel>
 *   <h2>Card Title</h2>
 *   <p>Content goes here.</p>
 * </GlassPanel>
 *
 * <GlassPanel as="section" padding="p-8 sm:p-10" className="max-w-xl">
 *   <form>...</form>
 * </GlassPanel>
 * ```
 */
const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(function GlassPanel(
  { as, padding = 'p-6', className, children, ...rest },
  ref,
) {
  const Component: ElementType = as ?? 'div';

  return (
    <Component
      ref={ref}
      className={clsx(
        'bg-[var(--bg-secondary)]/80 backdrop-blur-2xl',
        'border border-[var(--border-primary)]',
        'rounded-3xl shadow-2xl shadow-black/20',
        padding,
        className,
      )}
      {...rest}
    >
      {children}
    </Component>
  );
}) as <T extends ElementType = 'div'>(
  props: GlassPanelProps<T> & { ref?: React.Ref<HTMLElement> },
) => React.ReactElement | null;

export default GlassPanel;
