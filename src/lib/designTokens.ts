/**
 * Design Tokens -- centralized constants for the Fueki Tokenization Platform.
 *
 * These tokens mirror the CSS custom properties defined in index.css
 * and provide a TypeScript-level reference for any component that needs
 * to use values programmatically (inline styles, dynamic calculations, etc.).
 *
 * For Tailwind utility classes, the canonical values are:
 *   - Card bg:       bg-[#0D0F14]/80
 *   - Card border:   border-white/[0.06]
 *   - Card radius:   rounded-2xl
 *   - Card padding:  p-7 sm:p-9
 *   - Card hover:    hover:border-white/[0.10] hover:shadow-lg hover:shadow-black/20
 *   - Input bg:      bg-[#0D0F14] (or bg-white/[0.03] for lighter variant)
 *   - Input border:  border-white/[0.06]
 *   - Input radius:  rounded-xl
 *   - Input padding: px-4 py-3.5
 *   - Input focus:   focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20
 *   - Text primary:  text-white
 *   - Text secondary: text-gray-400
 *   - Text muted:    text-gray-500
 *   - Text disabled: text-gray-600
 *   - Section label: text-xs font-semibold uppercase tracking-wider text-gray-500
 */

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

export const COLORS = {
  // Backgrounds
  bgPrimary: '#06070A',
  bgSecondary: '#0D0F14',
  bgTertiary: '#141620',
  bgHover: '#1A1D2B',
  bgInput: '#0F1118',
  bgTooltip: '#1E2030',

  // Borders (rgba strings for inline styles)
  borderDefault: 'rgba(255, 255, 255, 0.06)',
  borderHover: 'rgba(255, 255, 255, 0.12)',
  borderFocus: 'rgba(99, 102, 241, 0.5)',
  borderAccent: 'rgba(99, 102, 241, 0.3)',

  // Brand / Accent
  brandPrimary: '#6366F1',    // indigo-500
  brandSecondary: '#8B5CF6',  // violet-500
  brandTertiary: '#A78BFA',   // violet-400
  brandAccent: '#06B6D4',     // cyan-500

  // Semantic
  success: '#10B981',         // emerald-500
  successSoft: 'rgba(16, 185, 129, 0.12)',
  warning: '#F59E0B',         // amber-500
  warningSoft: 'rgba(245, 158, 11, 0.12)',
  error: '#EF4444',           // red-500
  errorSoft: 'rgba(239, 68, 68, 0.12)',
  info: '#3B82F6',            // blue-500
  infoSoft: 'rgba(59, 130, 246, 0.12)',

  // Text
  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  textDisabled: '#475569',
  textInverse: '#06070A',
} as const;

// ---------------------------------------------------------------------------
// Spacing (used in inline styles or dynamic calculations)
// ---------------------------------------------------------------------------

export const SPACING = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  '2xl': '48px',
  '3xl': '64px',
} as const;

// ---------------------------------------------------------------------------
// Border Radius (matches --radius-* CSS variables)
// ---------------------------------------------------------------------------

export const RADIUS = {
  sm: '6px',      // --radius-sm   (Tailwind: rounded-md equivalent)
  md: '10px',     // --radius-md   (Tailwind: rounded-xl equivalent)
  lg: '14px',     // --radius-lg   (Tailwind: rounded-2xl for cards)
  xl: '20px',     // --radius-xl   (Tailwind: rounded-2xl/3xl)
  full: '9999px', // --radius-full (Tailwind: rounded-full)
} as const;

// ---------------------------------------------------------------------------
// Shadows (matches --shadow-* CSS variables)
// ---------------------------------------------------------------------------

export const SHADOWS = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
  md: '0 4px 12px rgba(0, 0, 0, 0.4)',
  lg: '0 8px 30px rgba(0, 0, 0, 0.5)',
  xl: '0 20px 60px rgba(0, 0, 0, 0.6)',
  card: '0 4px 24px -4px rgba(0, 0, 0, 0.3)',
  elevated: '0 8px 40px -8px rgba(99, 102, 241, 0.15)',
  glow: '0 0 20px rgba(99, 102, 241, 0.15)',
  glowStrong: '0 0 32px rgba(99, 102, 241, 0.25)',
} as const;

// ---------------------------------------------------------------------------
// Transitions (matches --ease-* and --duration-* CSS variables)
// ---------------------------------------------------------------------------

export const TRANSITIONS = {
  easeDefault: 'cubic-bezier(0.4, 0, 0.2, 1)',
  easeSpring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  easeOutExpo: 'cubic-bezier(0.16, 1, 0.3, 1)',
  durationFast: '150ms',
  durationBase: '200ms',
  durationSlow: '350ms',
} as const;

// ---------------------------------------------------------------------------
// Z-index scale (matches CSS custom properties)
// ---------------------------------------------------------------------------

export const Z_INDEX = {
  dropdown: 50,
  sticky: 100,
  overlay: 200,
  modal: 300,
  toast: 400,
  tooltip: 500,
} as const;

// ---------------------------------------------------------------------------
// Tailwind class constants -- reusable across components
// ---------------------------------------------------------------------------

/**
 * Standard glass-morphism card classes.
 * Usage: `<div className={clsx(CARD_CLASSES.base, CARD_CLASSES.hover)}>...</div>`
 */
export const CARD_CLASSES = {
  /** Core card surface: bg + blur + border + radius */
  base: 'bg-[#0D0F14]/80 backdrop-blur-xl border border-white/[0.06] rounded-2xl',
  /** Standard card padding (responsive) */
  padding: 'p-7 sm:p-9',
  /** Compact card padding */
  paddingSm: 'p-5 sm:p-6',
  /** Hover interaction: border brightens, subtle lift */
  hover: 'transition-all duration-300 hover:border-white/[0.10] hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5',
  /** Card shadow baseline */
  shadow: 'shadow-[0_4px_24px_-4px_rgba(0,0,0,0.3)]',
  /** Compact variant (for nested/inner cards) */
  compact: 'bg-white/[0.03] backdrop-blur-lg border border-white/[0.04] rounded-xl',
} as const;

/**
 * Standard input field classes.
 * Usage: `<input className={INPUT_CLASSES.base} />`
 */
export const INPUT_CLASSES = {
  /** Full input styling with bg, border, radius, focus ring */
  base: [
    'w-full bg-[#0D0F14] border border-white/[0.06] rounded-xl',
    'px-4 py-3.5 text-white placeholder-gray-600 text-sm',
    'outline-none transition-all duration-200',
    'focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20',
  ].join(' '),
  /** Light background variant (for inputs inside dark cards) */
  light: [
    'w-full bg-white/[0.03] border border-white/[0.06] rounded-xl',
    'px-4 py-3.5 text-white placeholder-gray-600 text-sm',
    'outline-none transition-all duration-200',
    'focus:border-indigo-500/40 focus:bg-white/[0.05] focus:ring-1 focus:ring-indigo-500/40',
  ].join(' '),
  /** Label styling */
  label: 'block text-sm font-medium text-gray-300 mb-2',
  /** Section label styling (uppercase small) */
  sectionLabel: 'text-xs font-semibold uppercase tracking-wider text-gray-500',
} as const;

/**
 * Standard section separator classes.
 */
export const SEPARATOR_CLASSES = {
  /** Gradient separator line */
  gradient: 'h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent',
  /** Solid subtle separator */
  solid: 'h-px bg-white/[0.06]',
  /** Section divider with label spacing */
  section: 'h-px bg-gradient-to-r from-white/[0.06] to-transparent',
} as const;

/**
 * Standard badge/chip class patterns.
 */
export const BADGE_CLASSES = {
  base: 'inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide border',
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  error: 'bg-red-500/10 text-red-400 border-red-500/20',
  info: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  accent: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  neutral: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
} as const;

/**
 * Standard icon container inside cards/headers.
 */
export const ICON_CONTAINER_CLASSES = {
  /** Small icon box (h-9 w-9) */
  sm: 'flex h-9 w-9 items-center justify-center rounded-lg',
  /** Medium icon box (h-10 w-10) */
  md: 'flex h-10 w-10 items-center justify-center rounded-xl',
  /** Large icon box (h-12 w-12) */
  lg: 'flex h-12 w-12 items-center justify-center rounded-xl',
  /** Extra-large icon box (h-16 w-16) */
  xl: 'flex h-16 w-16 items-center justify-center rounded-2xl',
} as const;
