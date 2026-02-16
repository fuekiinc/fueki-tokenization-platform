# Fueki Tokenization Platform -- Design System Audit & Proposal

**Agent**: 7 (DesignSystemArchitect)
**Date**: 2026-02-16
**Scope**: Complete visual design language audit and unified design system specification

---

## Table of Contents

1. [Current State Audit](#1-current-state-audit)
2. [Inconsistencies & Gaps](#2-inconsistencies--gaps)
3. [Proposed Design Token Specification](#3-proposed-design-token-specification)
4. [Component Style Guide](#4-component-style-guide)
5. [Migration Plan](#5-migration-plan)
6. [Code Examples](#6-code-examples)

---

## 1. Current State Audit

### 1.1 Design Tokens (CSS Custom Properties)

The platform defines a well-structured set of CSS custom properties in `/src/index.css` (1553 lines). The token categories are:

**Backgrounds (6 tokens)**
| Token | Dark Value | Light Value |
|-------|-----------|-------------|
| `--bg-primary` | `#06070A` | `#F8FAFC` |
| `--bg-secondary` | `#0D0F14` | `#FFFFFF` |
| `--bg-tertiary` | `#141620` | `#F1F5F9` |
| `--bg-hover` | `#1A1D2B` | `#E2E8F0` |
| `--bg-input` | `#0F1118` | `#FFFFFF` |
| `--bg-tooltip` | `#1E2030` | `#FFFFFF` |

**Borders (4 tokens)**
| Token | Dark Value | Light Value |
|-------|-----------|-------------|
| `--border-primary` | `rgba(255,255,255,0.06)` | `rgba(15,23,42,0.08)` |
| `--border-hover` | `rgba(255,255,255,0.12)` | `rgba(15,23,42,0.16)` |
| `--border-focus` | `rgba(99,102,241,0.5)` | `rgba(79,70,229,0.5)` |
| `--border-accent` | `rgba(99,102,241,0.3)` | `rgba(79,70,229,0.25)` |

**Accent (4 tokens + 2 gradients)**
| Token | Dark Value | Light Value |
|-------|-----------|-------------|
| `--accent-primary` | `#6366F1` (Indigo 500) | `#4F46E5` (Indigo 600) |
| `--accent-secondary` | `#8B5CF6` (Violet 500) | `#7C3AED` (Violet 600) |
| `--accent-tertiary` | `#A78BFA` (Violet 400) | `#6D28D9` (Violet 700) |
| `--accent-gradient` | `linear-gradient(135deg, #6366F1...#A78BFA)` | adjusted for contrast |
| `--accent-gradient-hover` | lighter variant | adjusted for contrast |

**Semantic Colors (8 tokens: 4 base + 4 soft)**
- Success: `#10B981` / `#059669` (emerald)
- Warning: `#F59E0B` / `#D97706` (amber)
- Danger: `#EF4444` / `#DC2626` (red)
- Info: `#3B82F6` / `#2563EB` (blue)

**Text (5 tokens)**
| Token | Dark Value | Light Value |
|-------|-----------|-------------|
| `--text-primary` | `#F1F5F9` | `#0F172A` |
| `--text-secondary` | `#94A3B8` | `#475569` |
| `--text-muted` | `#64748B` | `#64748B` (same) |
| `--text-disabled` | `#475569` | `#94A3B8` |
| `--text-inverse` | `#06070A` | `#FFFFFF` |

**Typography Scale (11 fluid sizes via `clamp()`)**
```
--text-xs    : clamp(0.6875rem, ..., 0.75rem)    ~11-12px
--text-sm    : clamp(0.75rem, ..., 0.875rem)      ~12-14px
--text-base  : clamp(0.875rem, ..., 1rem)          ~14-16px
--text-lg    : clamp(1rem, ..., 1.125rem)          ~16-18px
--text-xl    : clamp(1.125rem, ..., 1.25rem)      ~18-20px
--text-2xl   : clamp(1.25rem, ..., 1.5rem)        ~20-24px
--text-3xl   : clamp(1.5rem, ..., 1.875rem)       ~24-30px
--text-4xl   : clamp(1.875rem, ..., 2.25rem)      ~30-36px
--text-5xl   : clamp(2.25rem, ..., 3rem)          ~36-48px
--text-display: clamp(3rem, ..., 4.5rem)          ~48-72px
```

**Border Radii (5 tokens)**
```
--radius-sm   : 6px
--radius-md   : 10px
--radius-lg   : 14px
--radius-xl   : 20px
--radius-full : 9999px
```

**Shadows (4 tokens)**
```
--shadow-sm : 0 1px 2px rgba(0,0,0,0.3)
--shadow-md : 0 4px 12px rgba(0,0,0,0.4)
--shadow-lg : 0 8px 30px rgba(0,0,0,0.5)
--shadow-xl : 0 20px 60px rgba(0,0,0,0.6)
```
Light mode shadows are softer (0.04-0.06 opacity).

**Transitions (5 tokens)**
```
--ease-default  : cubic-bezier(0.4, 0, 0.2, 1)
--ease-spring   : cubic-bezier(0.34, 1.56, 0.64, 1)
--ease-out-expo : cubic-bezier(0.16, 1, 0.3, 1)
--duration-fast : 150ms
--duration-base : 200ms
--duration-slow : 350ms
```

**Z-Index Scale (6 tokens)**
```
--z-dropdown : 50
--z-sticky   : 100
--z-overlay  : 200
--z-modal    : 300
--z-toast    : 400
--z-tooltip  : 500
```

### 1.2 Typography

**Font Family**: Inter (loaded via Google Fonts CDN) with fallbacks:
`'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Helvetica Neue', sans-serif`

**Font Feature Settings**: `'cv02', 'cv03', 'cv04', 'cv11'` -- contextual alternates for cleaner numerals.

**Base Line Height**: `1.6` on body.

**Font Weights Used Across Components**:
- `font-medium` (500) -- labels, secondary text, nav items
- `font-semibold` (600) -- card titles, buttons, badges
- `font-bold` (700) -- page headings, stat values, h1-h3
- `font-extrabold` (800) -- hero heading only (DashboardPage)

**Font Sizes Used in Components (Tailwind classes + arbitrary values)**:
| Pattern | Frequency | Usage |
|---------|-----------|-------|
| `text-xs` (12px) | Very high | Labels, meta text, badges |
| `text-sm` (14px) | Very high | Body text, form fields, descriptions |
| `text-base` (16px) | Medium | Body default, some labels |
| `text-lg` (18px) | Medium | Card titles, section headings |
| `text-xl` (20px) | Low | Modal titles, hero subtitles |
| `text-2xl` (24px) | Medium | Stat values, section headings |
| `text-3xl` (30px) | Medium | Page titles, large stat values |
| `text-4xl` (36px) | Low | Hero heading |
| `text-5xl` (48px) | Low | Hero heading (MintPage) |
| `text-6xl` (60px) | Very low | Hero heading at lg breakpoint |
| `text-[10px]` | High | Micro labels, badge dots, uppercase tracking |
| `text-[11px]` | Very high | Section labels, card subtitles, meta info |
| `text-[13px]` | Low | Order book prices, MintPage subtitle |
| `text-[15px]` | Medium | Mobile nav links, Login form text, chart headers |

### 1.3 Spacing System

**Padding Patterns Observed** (most common first):
- `p-7 sm:p-9` -- primary card padding (~28px/36px) -- used in Card, StatCard, Exchange cards
- `p-5 sm:p-6` -- compact card padding (~20px/24px)
- `p-8 sm:p-10` -- modal padding (~32px/40px)
- `p-10` -- feature card padding (40px)
- `px-8 sm:px-12 lg:px-20 xl:px-32` -- main layout horizontal padding

**Margin/Gap Patterns**:
- `gap-3` to `gap-8` -- grid gaps
- `gap-6 sm:gap-8 lg:gap-8` -- portfolio stat grid
- `gap-6 sm:gap-10` -- dashboard feature cards
- `mb-10`, `mb-12`, `mb-8` -- section bottom margins
- `mt-3`, `mt-5`, `mt-8` -- element spacing within cards
- `space-y-4`, `space-y-5`, `space-y-6` -- form element stacking

**Grid System**:
- Max container width: `max-w-[1920px]`
- Layout padding: `px-8 sm:px-12 lg:px-20 xl:px-32`
- Stat cards: 1 col -> 2 col (sm) -> 4 col (lg)
- Exchange: 12-column grid at lg (`lg:grid-cols-12` with 3/6/3 split)
- Portfolio cards: 1 -> 2 (sm) -> 3 (lg) columns

### 1.4 Color Palette

**Primary Accent Family** (Indigo-Violet):
- `#6366F1` (Indigo 500) -- primary accent
- `#8B5CF6` (Violet 500) -- secondary accent
- `#A78BFA` (Violet 400) -- tertiary/highlight
- `#4F46E5` (Indigo 600) -- light mode primary
- `#818CF8` (Indigo 400) -- hover states

**Extended Palette Used in Tailwind Classes**:
- Emerald (green status): `emerald-400`, `emerald-500`
- Red (danger): `red-400`, `red-500`, `rose-500`
- Amber (warning): `amber-400`, `amber-500`, `orange-500`
- Blue (info): `blue-400`, `blue-500`
- Cyan (exchange accent): `cyan-400`, `cyan-500`, `cyan-600`
- Violet/Purple (secondary accent): `violet-400`, `violet-500`, `purple-400`, `purple-500`
- Teal: `teal-400`, `teal-500` (pool-related)
- Fuchsia: `fuchsia-500` (token gradient palette)
- Rose: `rose-500` (danger gradient, order book accent)

**Hardcoded Hex Values Found in Inline Styles**:
- `#3B82F6` (blue-500) -- dashboard gradient orbs
- `#06B6D4` (cyan-500) -- dashboard gradient orbs
- `#10b981` (emerald-500) -- sparkline strokes
- `#ef4444` (red-500) -- sparkline strokes
- `#6366f1` -- spinner gradient stops
- `#8b5cf6` -- spinner gradient stops
- `#627EEA`, `#E8B44A`, `#CFB5F0`, `#8247E5`, `#28A0F0`, `#0052FF`, `#4ADE80` -- network indicator colors (hardcoded in Navbar)

### 1.5 Component Patterns

**Button** (`/src/components/Common/Button.tsx`):
- 5 variants: `primary`, `secondary`, `danger`, `ghost`, `outline`
- 5 sizes: `xs`, `sm`, `md`, `lg`, `xl`
- Features: loading spinner, left/right icon, fullWidth, disabled state
- Uses gradient backgrounds for primary/danger, glass morphism for secondary
- Well-structured with `clsx`, `forwardRef`, TypeScript types

**Card** (`/src/components/Common/Card.tsx`):
- Padding options: `none`, `sm`, `md`, `lg`
- Features: title/subtitle header, action slot, gradient top border, hoverable mode, compact mode
- Glass morphism base: `bg-[#0D0F14]/80 backdrop-blur-xl border border-white/[0.06]`
- Rounded-2xl default

**Modal** (`/src/components/Common/Modal.tsx`):
- Uses `@headlessui/react` Dialog primitives
- 4 sizes: `sm`, `md`, `lg`, `xl`
- Gradient top border, glass morphism panel
- Header with title/description/close button, body, footer slots
- Animated enter/exit transitions

**Badge** (`/src/components/Common/Badge.tsx`):
- 6 variants: `default`, `primary`, `success`, `warning`, `danger`, `info`
- 2 sizes: `sm`, `md`
- Features: filled/outline modes, pulsing dot indicator
- Pill shape (rounded-full)

**StatCard** (`/src/components/Common/StatCard.tsx`):
- Icon container with gradient background
- Title, value, change percentage with trend arrow
- Decorative mini sparkline SVG

**Spinner** (`/src/components/Common/Spinner.tsx`):
- SVG-based with gradient stroke
- 5 sizes: `xs`, `sm`, `md`, `lg`, `xl`
- Screen reader label

**EmptyState** (`/src/components/Common/EmptyState.tsx`):
- Gradient circle icon container with glow ring
- Title, description, action slot
- Dashed border variant

### 1.6 Elevation/Shadow System

**CSS Variable Shadows** (4 levels):
```
--shadow-sm: 0 1px 2px rgba(0,0,0,0.3)
--shadow-md: 0 4px 12px rgba(0,0,0,0.4)
--shadow-lg: 0 8px 30px rgba(0,0,0,0.5)
--shadow-xl: 0 20px 60px rgba(0,0,0,0.6)
```

**Inline/Tailwind Shadow Patterns Found**:
- `shadow-[0_4px_24px_-4px_rgba(0,0,0,0.3)]` -- default card shadow
- `shadow-[0_0_24px_-6px_rgba(99,102,241,0.45)]` -- primary button glow
- `shadow-[0_8px_40px_-8px_rgba(99,102,241,0.15)]` -- card hover glow
- `shadow-[0_25px_60px_-12px_rgba(0,0,0,0.5)]` -- modal deep shadow
- `shadow-lg shadow-black/20` -- hover lift shadow
- `shadow-lg shadow-indigo-500/25` -- button and icon glow shadows
- `shadow-2xl` -- dropdown shadows

**Backdrop Blur Values**:
- `backdrop-blur-sm` (4px) -- modal backdrop
- `backdrop-blur-lg` (16px) -- compact cards, toast
- `backdrop-blur-xl` (24px) -- primary cards, modals, panels
- `backdrop-blur-2xl` (40px) -- mobile slide-over, login card

**Glow Effects** (CSS utility classes):
- `.glow-sm`: `box-shadow: 0 0 10px rgba(99,102,241,0.15)`
- `.glow-md`: double-layer glow
- `.glow-lg`: triple-layer glow
- `.glow-success`, `.glow-danger`, `.glow-warning`: semantic glow variants

### 1.7 Animation/Motion

**Keyframe Animations** (12 defined):
| Animation | Duration | Easing | Usage |
|-----------|----------|--------|-------|
| `fadeIn` | 0.3-0.4s | ease-out / --ease-default | Page entrances, overlays |
| `slideUp` | 0.3-0.45s | ease-out / --ease-out-expo | List items, stagger children |
| `slideDown` | 0.45s | --ease-out-expo | Dropdown appearance |
| `scaleIn` | 0.2-0.35s | --ease-spring / --ease-out-expo | Dropdowns, tooltips |
| `slideInRight` | 0.3s | --ease-out-expo | Mobile slide-over |
| `slideOutRight` | 0.25s | --ease-out-expo | Mobile slide-over exit |
| `pageFadeIn` | 0.4s | ease-out | Route transitions |
| `shimmer` | 1.8s | ease-in-out infinite | Skeleton loading |
| `pulseGlow` | 2.5s | ease-in-out infinite | Active status indicators |
| `gradientShift` | 6s | ease infinite | Background gradients |
| `float` | 3s | ease-in-out infinite | Decorative elements |
| `spinSlow` | 8s | linear infinite | Decorative spinners |

**Transition Patterns**:
- Default: `all var(--duration-base) var(--ease-default)` (200ms)
- Fast: `150ms` -- hover states, focus
- Standard: `200ms` -- most interactions
- Slow: `300ms` -- hover lift, card transitions, theme toggle
- Very Slow: `500ms` -- gradient opacity reveals on hover

**Stagger System**: CSS `.stagger` class with nth-child delays (0-450ms in 50ms increments for up to 10 children).

**Hover Effects**:
- `.hover-lift`: `translateY(-2px)` + shadow
- `.hover-scale`: `scale(1.02)`
- `.hover-glow`: accent box-shadow
- Button active press: `scale(0.98)` at 75ms duration
- Card hover: `-translate-y-0.5` (1px lift)

### 1.8 Responsive Breakpoints

**Tailwind v4 Default Breakpoints Used**:
| Prefix | Min-width | Usage Frequency |
|--------|-----------|-----------------|
| `sm:` | 640px | Very high -- padding adjustments, grid columns |
| `md:` | 768px | Low -- rarely used directly |
| `lg:` | 1024px | Very high -- layout shifts, column counts, element visibility |
| `xl:` | 1280px | Medium -- layout padding, optional element visibility |

**Breakpoint Usage Patterns**:
- `sm:` -- padding increases (p-7 -> sm:p-9), text size bumps, 2-column grids
- `lg:` -- main layout switches (single column to multi-column), desktop nav vs hamburger
- `xl:` -- max-width padding (xl:px-32), optional network badges
- Desktop nav hidden at `<lg`, mobile hamburger hidden at `>=lg`

### 1.9 Icon System

**Library**: `lucide-react` v0.563.0

**Icon Sizes Used**:
| Size | Class | Usage |
|------|-------|-------|
| 12px | `h-3 w-3` | Tiny indicators, copy icons |
| 14px | `h-3.5 w-3.5` | Inline icons, chevrons, action button icons |
| 16px | `h-4 w-4` | Standard button icons, nav icons, card header icons |
| 18px | `h-[18px] w-[18px]` | Theme toggle, form field icons, activity feed header |
| 20px | `h-5 w-5` | Modal close, hamburger menu, section header icons |
| 24px | `h-6 w-6` | Stat card icons |
| 28px | `h-7 w-7` | Feature card icons, empty state large icons |
| 32px | `h-8 w-8` | Hero section icons, empty state |
| 36px | `h-9 w-9` | Large warning icons |
| 44px | `h-11 w-11` | Exchange/AMM hero icons |

**Stroke Width**: Default (2px). No custom stroke width overrides found. All icons use the lucide-react default.

**Icon Container Patterns**:
- Small: `h-9 w-9 rounded-lg` with color-tinted background + ring
- Medium: `h-10 w-10 rounded-xl` with gradient background + ring
- Large: `h-12 w-12 rounded-xl` with gradient background
- Hero: `h-14 w-14 rounded-2xl` or `h-16 w-16 rounded-2xl` with gradient
- Extra large: `h-20 w-20 rounded-full` or `h-24 w-24 rounded-2xl`

### 1.10 Dark/Light Mode Implementation

**Theming Mechanism**: `data-theme` attribute on `<html>` element, managed by a custom `useTheme` hook (`/src/hooks/useTheme.ts`) using `useSyncExternalStore`.

**Storage**: `localStorage` key `fueki-theme` with system preference fallback via `prefers-color-scheme`.

**Theme Application**:
1. CSS custom properties are redefined under `[data-theme="light"]` selector
2. Component-level Tailwind classes use hardcoded dark-mode values (e.g., `bg-white/[0.06]`, `text-gray-400`)
3. Light mode overrides in CSS use `[data-theme="light"]` with `!important` to override Tailwind classes
4. Theme transitions handled by `.theme-transitioning` class (0.35s ease)

**Coverage Assessment**: Light mode is handled through a comprehensive override system in `index.css` (sections 28a through 29n). The system covers:
- All CSS utility classes (glass, gradient, glow, shimmer)
- Tailwind class overrides (text-white, bg-*, border-*, shadow-*)
- Component-specific overrides (charts, tooltips, modals, navbar)
- Inline style overrides where possible

---

## 2. Inconsistencies & Gaps

### 2.1 CRITICAL: Dual Styling Paradigm Conflict

The most significant design system issue is the **split between CSS custom properties and hardcoded Tailwind classes**. The CSS tokens are well-defined but largely unused in components:

- Components use `bg-[#0D0F14]/80` instead of `bg-[var(--bg-secondary)]`
- Components use `text-gray-400` instead of `text-[var(--text-secondary)]`
- Components use `border-white/[0.06]` instead of `border-[var(--border-primary)]`
- Auth pages (LoginPage, FormField) DO use CSS variables correctly: `bg-[var(--bg-tertiary)]`, `text-[var(--text-primary)]`

This forces the light mode to rely on a fragile system of CSS overrides with `!important` flags and attribute selectors like `[data-theme="light"] [class*="bg-\\["][class*="0D0F14"]`.

### 2.2 Typography Inconsistencies

1. **Arbitrary font sizes**: `text-[10px]`, `text-[11px]`, `text-[13px]`, `text-[15px]` are used extensively (100+ instances) but have no corresponding CSS variable or design token. These sit outside both the Tailwind scale and the `--text-*` CSS variable scale.

2. **CSS type scale unused**: The 11 `--text-*` custom properties with fluid `clamp()` values are only used in the global CSS base styles (body, form elements, table cells). No component references them directly.

3. **Inconsistent title sizing**: Page titles use `text-3xl sm:text-4xl` (DashboardPage, PortfolioPage), `text-5xl sm:text-xl` (MintPage -- this is a bug: goes from 48px down to 20px at sm), `text-2xl sm:text-3xl` (ExchangePage, OrbitalAMMPage).

4. **Leading/line-height inconsistencies**: Some components use `leading-tight`, some `leading-relaxed`, some `leading-snug`, and most use no explicit leading class at all.

### 2.3 Spacing Inconsistencies

1. **Card padding is not standardized**: Some cards use `p-7 sm:p-9`, others use `p-5 sm:p-7`, `p-8 sm:p-10`, `p-10`, `p-8 sm:p-11`, or `px-10 sm:px-14 py-20 sm:py-28`. The Card component defaults to `p-7 sm:p-9` or `p-5 sm:p-6` (compact), but page-level inline glass cards don't use the Card component.

2. **Section margins vary**: Page section spacing alternates between `mb-10`, `mb-12`, `mb-8`, `mt-12`, `mt-10 sm:mt-14`, `mt-12 sm:mt-16` with no clear rhythm.

3. **Grid gaps inconsistent**: `gap-6 sm:gap-8`, `gap-6 sm:gap-10`, `gap-6 sm:gap-12`, `gap-8 lg:gap-8`, `gap-8 lg:gap-10` are all found across different pages.

### 2.4 Color Inconsistencies

1. **Gray text classes vary**: Components mix `text-gray-200`, `text-gray-300`, `text-gray-400`, `text-gray-500`, `text-gray-600` for similar visual roles. For example, secondary text uses `text-gray-400` in some places and `text-gray-500` in others; muted text uses `text-gray-500` or `text-gray-600`.

2. **Accent color variants**: The primary indigo is applied inconsistently: some use `indigo-400`, some `indigo-500`, some `indigo-600`. Button primary uses `from-indigo-500 to-violet-500`, while the connect button on ExchangePage uses `from-indigo-600 to-indigo-500`.

3. **Semantic color application**: Status colors are mostly consistent but use two systems: CSS badge classes (`.badge-success` with `var(--success)`) and Tailwind classes (`bg-emerald-500/10 text-emerald-400`).

### 2.5 Component Pattern Duplication

1. **GlassCard defined in three places**: ExchangePage, OrbitalAMMPage, and DashboardPage each define their own inline `GlassCard` wrapper with identical glass morphism styles. These should use the Common/Card component or a shared utility.

2. **StatCard defined twice**: There is a formal `Common/StatCard.tsx` component AND an inline `StatCard` function in DashboardPage with different APIs (one takes `icon: ReactNode`, the other takes `icon: React.ElementType` plus `gradientFrom`/`gradientTo`).

3. **Inline button styles**: The ExchangePage and OrbitalAMMPage define their own connect wallet buttons with inline gradient/glow styles instead of using the Button component.

4. **Glass morphism pattern repeated**: The pattern `bg-[#0D0F14]/80 backdrop-blur-xl border border-white/[0.06] rounded-2xl` is copy-pasted across approximately 20+ locations in page components rather than using a shared class or component.

### 2.6 Elevation System Gaps

1. **No formalized elevation scale**: While `--shadow-sm` through `--shadow-xl` exist, components overwhelmingly use inline `shadow-[...]` values or Tailwind `shadow-lg shadow-black/20` rather than the CSS variables.

2. **Backdrop blur inconsistency**: Cards use `backdrop-blur-xl`, modals use `backdrop-blur-xl`, the mobile slide-over uses `backdrop-blur-2xl`, login card uses `backdrop-blur-2xl`. No clear rationale for when each level is used.

### 2.7 Motion Inconsistencies

1. **Duration values vary**: Despite having `--duration-fast` (150ms), `--duration-base` (200ms), and `--duration-slow` (350ms), components use arbitrary values: `duration-150`, `duration-200`, `duration-300`, `duration-500`, `duration-700`. The CSS variables are not referenced from Tailwind classes.

2. **Easing inconsistency**: `ease-out` (Tailwind default), `var(--ease-default)`, `var(--ease-out-expo)`, and `var(--ease-spring)` are all used, but component code predominantly uses Tailwind's `ease-out` rather than the custom CSS easing curves.

3. **Animation class naming**: Two naming conventions coexist: `.fade-in`, `.slide-up` (short) and `.animate-fade-in`, `.animate-slide-in` (Tailwind-style prefix). Both reference the same keyframes but with slightly different durations and easings.

### 2.8 Responsive Design Gaps

1. **`md:` breakpoint underused**: The `md:` (768px) breakpoint is almost never used, creating a large gap between `sm:` (640px) and `lg:` (1024px) where layouts may feel suboptimal.

2. **Tablet layout missing**: The Exchange page three-column layout jumps from single-column stacked (mobile) directly to three-column at `lg:`. There is no intermediate two-column layout for tablets.

### 2.9 Dark/Light Mode Gaps

1. **Hardcoded dark colors in components**: Most components hardcode dark-mode-specific Tailwind classes (`bg-white/[0.06]`, `text-white`, `bg-[#0D0F14]`), requiring extensive CSS override hacks for light mode.

2. **Missing light mode for inline styles**: Components with `style={{ background: ... }}` inline styles (e.g., network colors, gradient orbs, sparkline strokes) are NOT affected by the CSS override system.

3. **Hero section vignette**: DashboardPage hero uses inline style `background: radial-gradient(ellipse at 50% 50%, transparent 0%, #0D0F14 80%)` which is dark-mode-only. The CSS attempts to override it with `[data-theme="light"] [style*="..."]` selectors, which are fragile and may not match.

4. **Toast styles duplicated**: The Toaster configuration with dark/light inline styles is duplicated verbatim between Layout.tsx and AuthLayout.tsx.

### 2.10 Accessibility Concerns

1. **Focus indicators**: `focus-visible:ring-2` is used consistently on buttons, but focus styling is absent on many interactive elements (card expand, sort pills, view toggle).

2. **Color contrast**: Several text combinations may fail WCAG AA: `text-gray-600` on dark backgrounds (#0D0F14), `text-gray-500` on dark backgrounds, `text-[11px]` micro labels may be too small at 4.5:1 minimum contrast.

3. **Reduced motion**: The global `prefers-reduced-motion` media query is properly implemented in index.css, overriding all animations and transitions.

---

## 3. Proposed Design Token Specification

### 3.1 Unified Color Tokens

All component styling should use CSS custom properties via Tailwind's `var()` syntax. The following extends the existing token set:

```css
:root {
  /* === Backgrounds === */
  --bg-primary: #06070A;
  --bg-secondary: #0D0F14;
  --bg-tertiary: #141620;
  --bg-elevated: #1A1D2B;         /* renamed from --bg-hover for clarity */
  --bg-input: #0F1118;
  --bg-overlay: rgba(0, 0, 0, 0.6);
  --bg-tooltip: #1E2030;

  /* === Surface Glass (new) === */
  --surface-glass: rgba(13, 15, 20, 0.8);
  --surface-glass-hover: rgba(20, 22, 32, 0.85);
  --surface-glass-navbar: rgba(6, 7, 10, 0.72);
  --surface-glass-subtle: rgba(255, 255, 255, 0.03);
  --surface-glass-medium: rgba(255, 255, 255, 0.06);

  /* === Borders === */
  --border-default: rgba(255, 255, 255, 0.06);
  --border-subtle: rgba(255, 255, 255, 0.04);
  --border-medium: rgba(255, 255, 255, 0.10);
  --border-strong: rgba(255, 255, 255, 0.14);
  --border-focus: rgba(99, 102, 241, 0.5);
  --border-accent: rgba(99, 102, 241, 0.3);

  /* === Text === */
  --text-primary: #F1F5F9;
  --text-secondary: #94A3B8;      /* maps to gray-400 */
  --text-tertiary: #64748B;       /* maps to gray-500 */
  --text-muted: #475569;          /* maps to gray-600 */
  --text-disabled: #334155;       /* maps to gray-700 */
  --text-inverse: #06070A;
  --text-on-accent: #FFFFFF;

  /* === Accent === */
  --accent-primary: #6366F1;
  --accent-primary-hover: #818CF8;
  --accent-secondary: #8B5CF6;
  --accent-tertiary: #A78BFA;
  --accent-gradient: linear-gradient(135deg, #6366F1, #8B5CF6, #A78BFA);

  /* === Semantic === */
  --color-success: #10B981;
  --color-success-soft: rgba(16, 185, 129, 0.12);
  --color-success-text: #34D399;  /* emerald-400 equivalent */
  --color-warning: #F59E0B;
  --color-warning-soft: rgba(245, 158, 11, 0.12);
  --color-warning-text: #FBBF24;  /* amber-400 equivalent */
  --color-danger: #EF4444;
  --color-danger-soft: rgba(239, 68, 68, 0.12);
  --color-danger-text: #F87171;   /* red-400 equivalent */
  --color-info: #3B82F6;
  --color-info-soft: rgba(59, 130, 246, 0.12);
  --color-info-text: #60A5FA;     /* blue-400 equivalent */
}
```

### 3.2 Typography Scale

Consolidate to a strict scale. Eliminate arbitrary `text-[Npx]` values:

| Token | Size | Line Height | Usage |
|-------|------|-------------|-------|
| `--type-micro` | 10px | 16px | Badge dots, status indicators, uppercase micro labels |
| `--type-caption` | 11px | 16px | Section meta, card subtitles, footer text |
| `--type-xs` | 12px | 16px | Badges, labels, timestamps, uppercase tracking |
| `--type-sm` | 14px | 20px | Form fields, descriptions, secondary body text |
| `--type-base` | 15px | 24px | Nav links, form labels, auth page text |
| `--type-md` | 16px | 24px | Card titles (compact), body default |
| `--type-lg` | 18px | 28px | Card titles, section headings |
| `--type-xl` | 20px | 28px | Modal titles, subsection headings |
| `--type-2xl` | 24px | 32px | Stat values, medium headings |
| `--type-3xl` | 30px | 36px | Page titles |
| `--type-4xl` | 36px | 40px | Hero heading at default |
| `--type-5xl` | 48px | 52px | Hero heading at sm+ |
| `--type-display` | 60px | 64px | Hero heading at lg+ |

### 3.3 Spacing Scale (4px/8px Grid)

```
--space-0:    0
--space-0.5:  2px
--space-1:    4px
--space-1.5:  6px
--space-2:    8px
--space-2.5:  10px
--space-3:    12px
--space-3.5:  14px
--space-4:    16px
--space-5:    20px
--space-6:    24px
--space-7:    28px
--space-8:    32px
--space-9:    36px
--space-10:   40px
--space-12:   48px
--space-14:   56px
--space-16:   64px
--space-20:   80px
--space-24:   96px
```

**Semantic Spacing Tokens**:
```
--card-padding-compact: var(--space-5) / var(--space-6)   /* 20px/24px */
--card-padding-default: var(--space-7) / var(--space-9)   /* 28px/36px */
--card-padding-spacious: var(--space-8) / var(--space-10) /* 32px/40px */
--section-gap: var(--space-12) / var(--space-16)          /* 48px/64px */
--page-gutter: var(--space-8) / var(--space-12) / var(--space-20) / var(--space-8) /* responsive */
--grid-gap: var(--space-6) / var(--space-8)               /* 24px/32px */
```

### 3.4 Elevation Scale

Formalize into named levels:

| Level | Name | Shadow (Dark) | Blur | Use Case |
|-------|------|---------------|------|----------|
| 0 | `flat` | none | none | Inline elements |
| 1 | `raised` | `0 1px 2px rgba(0,0,0,0.3)` | none | Subtle lift, form fields |
| 2 | `card` | `0 4px 24px -4px rgba(0,0,0,0.3)` | `backdrop-blur-xl` | Cards, panels |
| 3 | `dropdown` | `0 8px 30px rgba(0,0,0,0.4)` | `backdrop-blur-xl` | Dropdowns, popovers |
| 4 | `modal` | `0 25px 60px -12px rgba(0,0,0,0.5)` | `backdrop-blur-xl` | Modals, dialogs |
| 5 | `toast` | `0 20px 60px rgba(0,0,0,0.5)` | `backdrop-blur-lg` | Toast notifications |

**Glow Scale** (accent):
```
--glow-none:   none
--glow-sm:     0 0 10px rgba(99, 102, 241, 0.15)
--glow-md:     0 0 20px rgba(99, 102, 241, 0.2), 0 0 40px rgba(99, 102, 241, 0.05)
--glow-lg:     0 0 30px rgba(99, 102, 241, 0.25), 0 0 60px rgba(99, 102, 241, 0.1)
```

### 3.5 Motion Scale

| Token | Duration | Easing | Usage |
|-------|----------|--------|-------|
| `--motion-instant` | `0ms` | -- | Immediate state changes |
| `--motion-fast` | `150ms` | `ease-out` | Focus rings, color changes |
| `--motion-base` | `200ms` | `cubic-bezier(0.4, 0, 0.2, 1)` | Standard interactions |
| `--motion-moderate` | `300ms` | `cubic-bezier(0.4, 0, 0.2, 1)` | Layout shifts, card hovers |
| `--motion-slow` | `500ms` | `cubic-bezier(0.16, 1, 0.3, 1)` | Complex animations |
| `--motion-enter` | `350ms` | `cubic-bezier(0.16, 1, 0.3, 1)` | Entrance animations |
| `--motion-exit` | `250ms` | `cubic-bezier(0.4, 0, 0.2, 1)` | Exit animations |
| `--motion-spring` | `350ms` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Bouncy entrances |

### 3.6 Border Radius Scale

```
--radius-sm:   6px    /* badges, small pills */
--radius-md:   10px   /* inputs, small cards */
--radius-lg:   12px   /* buttons, icon containers */
--radius-xl:   16px   /* cards, panels */
--radius-2xl:  20px   /* large cards, modals */
--radius-3xl:  24px   /* hero elements */
--radius-full: 9999px /* pills, avatars, dots */
```

---

## 4. Component Style Guide

### 4.1 Surface Hierarchy (Semantic Naming)

| Level | Name | CSS Variable | Tailwind Class |
|-------|------|-------------|----------------|
| Background | `surface-canvas` | `--bg-primary` | `bg-[var(--bg-primary)]` |
| Layer 1 | `surface-default` | `--bg-secondary` | `bg-[var(--bg-secondary)]` |
| Layer 2 | `surface-raised` | `--bg-tertiary` | `bg-[var(--bg-tertiary)]` |
| Layer 3 | `surface-elevated` | `--bg-elevated` | `bg-[var(--bg-elevated)]` |
| Glass | `surface-glass` | `--surface-glass` | Custom `.glass` class |
| Input | `surface-input` | `--bg-input` | `bg-[var(--bg-input)]` |

### 4.2 Button Variants (Unified)

All buttons should use the `Button` component from `Common/Button.tsx`. Inline button styles should be eliminated.

**Do not use**:
```tsx
// BAD: inline gradient button
<button className="bg-gradient-to-r from-indigo-600 to-indigo-500 ...">
```

**Instead use**:
```tsx
// GOOD: design system component
<Button variant="primary" size="lg" icon={<Wallet className="h-4.5 w-4.5" />}>
  Connect Wallet
</Button>
```

### 4.3 Card Patterns

All glass morphism cards should use the `Card` component or the `glass` CSS utility class. Page-specific inline glass cards should be refactored.

**Standard Card**:
```tsx
<Card title="Section Title" subtitle="Description" padding="md" hoverable>
  {content}
</Card>
```

**Proposed GlassPanel Component** (for page sections):
```tsx
interface GlassPanelProps {
  children: React.ReactNode;
  gradient?: { from: string; to: string };  /* top accent line colors */
  padding?: 'sm' | 'md' | 'lg';
  className?: string;
}
```

### 4.4 Badge Semantic Map

| Context | Badge Variant |
|---------|--------------|
| Active/Online | `success` with `dot` |
| Pending | `warning` with `dot` |
| Error/Failed | `danger` |
| Informational | `info` |
| Neutral/Default | `default` |
| Accent/Selected | `primary` |
| Document: JSON | `info` |
| Document: CSV | `success` |
| Document: XML | `warning` |

### 4.5 Input Field Specification

All form inputs should use CSS variables and follow this pattern:
```tsx
<input
  className={clsx(
    'w-full rounded-[var(--radius-lg)] bg-[var(--bg-input)]',
    'border border-[var(--border-default)]',
    'px-4 py-3 text-sm',
    'text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]',
    'transition-all duration-200',
    'focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]/30',
    'hover:border-[var(--border-medium)]',
  )}
/>
```

---

## 5. Migration Plan

### Phase 1: Token Consolidation (Week 1)

**Priority**: CRITICAL

1. **Extend CSS custom properties** with the new tokens proposed in Section 3.
2. **Create a Tailwind v4 theme extension** that maps CSS variables to utility classes:
   ```css
   @theme {
     --color-surface-glass: var(--surface-glass);
     --color-border-default: var(--border-default);
     --color-text-primary: var(--text-primary);
     /* ... */
   }
   ```
3. **Eliminate arbitrary text sizes**: Replace all `text-[10px]`, `text-[11px]`, `text-[13px]`, `text-[15px]` with semantic classes mapped to the type scale tokens.

### Phase 2: Component Refactoring (Week 2)

**Priority**: HIGH

1. **Extract shared GlassCard**: Move the inline `GlassCard` from ExchangePage/OrbitalAMMPage into `Common/GlassPanel.tsx`.
2. **Consolidate StatCard**: Remove the inline StatCard from DashboardPage; extend `Common/StatCard.tsx` to accept `gradientFrom`/`gradientTo` and `icon` as ElementType.
3. **Refactor inline buttons**: Replace all inline connect-wallet buttons and action buttons with `Button` component usage.
4. **Deduplicate toast config**: Create a shared `toastConfig.ts` that both Layout.tsx and AuthLayout.tsx import.

### Phase 3: Token Adoption in Components (Week 3)

**Priority**: HIGH

1. **Replace hardcoded colors with CSS variables** in all component files:
   - `bg-[#0D0F14]/80` -> `bg-[var(--surface-glass)]`
   - `border-white/[0.06]` -> `border-[var(--border-default)]`
   - `text-white` -> `text-[var(--text-primary)]`
   - `text-gray-400` -> `text-[var(--text-secondary)]`
   - `text-gray-500` -> `text-[var(--text-tertiary)]`
   - `text-gray-600` -> `text-[var(--text-muted)]`
2. **Replace hardcoded shadows** with CSS variable shadows.
3. **Replace hardcoded transitions** with token-based duration/easing.

### Phase 4: Light Mode Cleanup (Week 4)

**Priority**: MEDIUM

Once components use CSS variables instead of hardcoded Tailwind classes, the massive light mode override section (sections 29a through 29n in index.css, approximately 300 lines) can be reduced to near-zero. The `[data-theme="light"]` block only needs to redefine the CSS custom properties, not override every individual Tailwind class.

### Phase 5: Responsive Refinement (Week 4-5)

**Priority**: LOW

1. Add `md:` breakpoint usage for tablet layouts on Exchange and Portfolio pages.
2. Standardize grid gap values across all pages.
3. Create responsive padding utility classes for consistent page gutters.

### Phase 6: Documentation & Tooling (Ongoing)

1. Create a living style guide page (e.g., `/design-system`) that renders all components, tokens, and patterns.
2. Add ESLint rules to warn against hardcoded color values.
3. Consider Storybook integration for component documentation.

---

## 6. Code Examples

### 6.1 Shared Glass Panel Component

```tsx
// /src/components/Common/GlassPanel.tsx
import type { HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  gradient?: { from: string; to: string };
  padding?: 'none' | 'sm' | 'md' | 'lg';
  className?: string;
}

const paddingMap = {
  none: '',
  sm: 'p-5 sm:p-6',
  md: 'p-7 sm:p-9',
  lg: 'p-8 sm:p-10',
};

export default function GlassPanel({
  children,
  gradient,
  padding = 'md',
  className,
  ...rest
}: GlassPanelProps) {
  return (
    <div
      className={clsx(
        'relative rounded-2xl',
        'bg-[var(--surface-glass)] backdrop-blur-xl',
        'border border-[var(--border-default)]',
        'transition-all duration-300',
        paddingMap[padding],
        className,
      )}
      {...rest}
    >
      {gradient && (
        <div
          className={clsx(
            'absolute inset-x-0 top-0 h-[1px] rounded-t-2xl',
            'bg-gradient-to-r opacity-60',
            gradient.from,
            gradient.to,
          )}
        />
      )}
      {children}
    </div>
  );
}
```

### 6.2 Shared Toast Configuration

```tsx
// /src/lib/toastConfig.ts

export function getToastOptions(isDark: boolean) {
  return {
    duration: 5000,
    style: isDark
      ? {
          background: 'rgba(17, 17, 24, 0.95)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-xl)',
          backdropFilter: 'blur(16px)',
          padding: '14px 18px',
          fontSize: '14px',
          boxShadow: 'var(--shadow-xl)',
        }
      : {
          background: 'rgba(255, 255, 255, 0.95)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-xl)',
          backdropFilter: 'blur(16px)',
          padding: '14px 18px',
          fontSize: '14px',
          boxShadow: 'var(--shadow-lg)',
        },
    success: {
      iconTheme: {
        primary: 'var(--accent-primary)',
        secondary: '#fff',
      },
    },
    error: {
      iconTheme: {
        primary: 'var(--color-danger)',
        secondary: '#fff',
      },
    },
  };
}
```

### 6.3 Token-Based Component Migration Example

**Before** (current DashboardPage StatCard):
```tsx
<div className={clsx(
  'bg-[#0D0F14]/80 backdrop-blur-xl border border-white/[0.06] rounded-2xl',
  'group relative overflow-hidden p-7 sm:p-9',
  'hover:border-white/[0.12] hover:shadow-lg hover:shadow-black/20',
  'transition-all duration-300',
)}>
  <p className="text-sm font-medium tracking-wide text-gray-400">{title}</p>
  <p className="mt-3 truncate text-2xl font-bold tracking-tight text-white sm:text-3xl">
    {value}
  </p>
</div>
```

**After** (migrated to CSS variable tokens):
```tsx
<div className={clsx(
  'bg-[var(--surface-glass)] backdrop-blur-xl',
  'border border-[var(--border-default)] rounded-2xl',
  'group relative overflow-hidden p-7 sm:p-9',
  'hover:border-[var(--border-medium)]',
  'hover:shadow-[var(--shadow-lg)]',
  'transition-all duration-[var(--motion-moderate)]',
)}>
  <p className="text-sm font-medium tracking-wide text-[var(--text-secondary)]">{title}</p>
  <p className="mt-3 truncate text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
    {value}
  </p>
</div>
```

### 6.4 Semantic Tailwind Theme Extension (Tailwind v4)

```css
/* Add to index.css after @import "tailwindcss" */

@theme {
  /* Map CSS variables to Tailwind utility classes */
  --color-surface-canvas: var(--bg-primary);
  --color-surface-default: var(--bg-secondary);
  --color-surface-raised: var(--bg-tertiary);
  --color-surface-elevated: var(--bg-elevated);
  --color-surface-input: var(--bg-input);

  --color-border-default: var(--border-default);
  --color-border-subtle: var(--border-subtle);
  --color-border-medium: var(--border-medium);
  --color-border-strong: var(--border-strong);

  --color-fg-primary: var(--text-primary);
  --color-fg-secondary: var(--text-secondary);
  --color-fg-tertiary: var(--text-tertiary);
  --color-fg-muted: var(--text-muted);

  --color-accent: var(--accent-primary);
  --color-accent-hover: var(--accent-primary-hover);

  --color-success: var(--color-success);
  --color-warning: var(--color-warning);
  --color-danger: var(--color-danger);
  --color-info: var(--color-info);
}
```

This enables Tailwind classes like `bg-surface-default`, `text-fg-secondary`, `border-border-default` that automatically adapt to light/dark themes without any override hacks.

### 6.5 Icon Size Constants

```tsx
// /src/lib/design/iconSizes.ts

export const ICON_SIZE = {
  xs: 'h-3 w-3',       // 12px - tiny indicators
  sm: 'h-3.5 w-3.5',   // 14px - inline, chevrons
  md: 'h-4 w-4',       // 16px - standard buttons/nav
  lg: 'h-5 w-5',       // 20px - section headers, close buttons
  xl: 'h-6 w-6',       // 24px - stat card icons
  '2xl': 'h-7 w-7',    // 28px - feature cards
  '3xl': 'h-8 w-8',    // 32px - hero/empty state
} as const;

export const ICON_CONTAINER = {
  sm: 'h-9 w-9 rounded-lg',
  md: 'h-10 w-10 rounded-xl',
  lg: 'h-12 w-12 rounded-xl',
  xl: 'h-14 w-14 rounded-2xl',
  '2xl': 'h-16 w-16 rounded-2xl',
  '3xl': 'h-20 w-20 rounded-full',
} as const;
```

---

## Summary of Key Findings

| Area | Current State | Severity | Proposed Fix |
|------|--------------|----------|--------------|
| Token usage in components | CSS vars defined but unused; hardcoded Tailwind classes | CRITICAL | Migrate all components to CSS variable references |
| Light mode implementation | 300+ lines of `!important` overrides | CRITICAL | CSS variable adoption eliminates overrides |
| Arbitrary font sizes | 100+ instances of text-[Npx] | HIGH | Define type scale tokens, create utility classes |
| Component duplication | GlassCard (3x), StatCard (2x), toast config (2x) | HIGH | Extract to shared components |
| Color inconsistency | gray-400 vs gray-500 for same visual role | MEDIUM | Map gray shades to semantic text tokens |
| Spacing inconsistency | 6+ different card padding patterns | MEDIUM | Standardize to 3 padding levels |
| Transition inconsistency | Mix of CSS vars, Tailwind, and arbitrary durations | LOW | Standardize on motion tokens |
| Responsive gaps | Missing md: breakpoint, no tablet layouts | LOW | Add intermediate breakpoint usage |

The platform has a strong visual foundation with a well-curated dark theme inspired by leading DeFi interfaces. The primary work is **closing the gap between the well-defined CSS token system and the actual component implementations** that bypass it. Once this migration is complete, the light mode system becomes trivially maintainable, and the entire design language becomes coherent and predictable.
