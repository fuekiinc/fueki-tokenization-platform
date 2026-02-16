# Accessibility Audit Report -- Fueki Tokenization Platform

**Agent**: 3 / AccessibilityAuditor
**Date**: 2026-02-16
**Standard**: WCAG 2.1 Level AA
**Scope**: All views, components, layouts, and interactions across the platform

---

## WCAG 2.1 AA Compliance Score Estimate

| Category       | Score  | Notes                                              |
|----------------|--------|----------------------------------------------------|
| Perceivable    | 55/100 | Contrast gaps, missing text alternatives, no live regions |
| Operable       | 50/100 | Missing skip link, focus traps, keyboard-dead zones |
| Understandable | 65/100 | Form validation present but errors not linked to inputs |
| Robust         | 60/100 | Good semantic HTML in places, but missing ARIA on custom widgets |
| **Overall**    | **57/100** | **Does not meet WCAG 2.1 AA**                  |

---

## 1. Perceivable (WCAG Principle 1)

Issues under this principle relate to making content available to all senses -- primarily sight and hearing in web contexts.

---

### P-01: Color Contrast -- Muted and Secondary Text Falls Below 4.5:1

**WCAG Criterion**: 1.4.3 Contrast (Minimum)
**Severity**: High
**Affected Files**:
- `/src/index.css` (design token definitions)
- Every component using `text-[var(--text-muted)]` or `text-[var(--text-secondary)]`

**Description**:
The dark theme defines `--text-muted: #64748B` and `--text-secondary: #94A3B8` against `--bg-primary: #06070A`. The contrast ratios are:

| Pair                                | Ratio   | Required | Pass? |
|-------------------------------------|---------|----------|-------|
| `#64748B` on `#06070A` (muted)      | ~4.0:1  | 4.5:1    | No    |
| `#64748B` on `#0F1117` (bg-secondary) | ~3.8:1 | 4.5:1   | No    |
| `#94A3B8` on `#06070A` (secondary)  | ~6.5:1  | 4.5:1    | Yes   |
| `#94A3B8` on `#0F1117` (bg-secondary) | ~6.0:1 | 4.5:1   | Yes   |
| `#475569` on `#06070A` (disabled)   | ~2.6:1  | 4.5:1    | No    |

The `--text-muted` color is used extensively for labels, helper text, timestamps, placeholder text, and secondary UI elements. `--text-disabled` fails even more severely.

**Fix**:

```css
/* /src/index.css -- Dark theme root */
:root {
  /* Before */
  --text-muted: #64748B;    /* ~4.0:1 on #06070A */
  --text-disabled: #475569; /* ~2.6:1 on #06070A */

  /* After */
  --text-muted: #7C8BA5;    /* ~5.0:1 on #06070A */
  --text-disabled: #5A6A80; /* ~3.5:1 -- acceptable for disabled per 1.4.3 exception */
}
```

> Note: WCAG 1.4.3 exempts "text that is part of an inactive user interface component" from the 4.5:1 requirement. The `--text-disabled` value is borderline but acceptable if used only on truly disabled controls.

---

### P-02: PageLoader Spinner Has No Text Alternative

**WCAG Criterion**: 1.1.1 Non-text Content, 4.1.3 Status Messages
**Severity**: Medium
**Affected File**: `/src/App.tsx` (lines 20-26)

**Description**:
The `PageLoader` component renders a spinning `<div>` with no screen reader announcement. When a lazy-loaded page is loading, screen reader users receive no indication that content is being fetched.

```tsx
// Current (no accessible label)
function PageLoader() {
  return (
    <div className="flex items-center justify-center py-32">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
    </div>
  );
}
```

**Fix**:

```tsx
function PageLoader() {
  return (
    <div className="flex items-center justify-center py-32" role="status" aria-live="polite">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" aria-hidden="true" />
      <span className="sr-only">Loading page...</span>
    </div>
  );
}
```

---

### P-03: Toast Notifications Not Announced to Screen Readers

**WCAG Criterion**: 4.1.3 Status Messages
**Severity**: High
**Affected Files**:
- `/src/components/Layout/Layout.tsx`
- `/src/components/Layout/AuthLayout.tsx`

**Description**:
The `react-hot-toast` `<Toaster>` component is used without configuring `ariaProps`. While `react-hot-toast` does add `role="status"` internally, success/error distinctions are not conveyed and the component's default ARIA behavior is inconsistent across versions.

**Fix**:

```tsx
<Toaster
  // ... existing props
  toastOptions={{
    // ... existing options
    ariaProps: {
      role: 'status',
      'aria-live': 'polite',
    },
  }}
/>
```

For error toasts specifically, `role="alert"` is more appropriate. Since react-hot-toast does not natively differentiate, consider wrapping error toast calls:

```tsx
// Utility wrapper
function showError(message: string) {
  toast.error(message, {
    ariaProps: { role: 'alert', 'aria-live': 'assertive' },
  });
}
```

---

### P-04: Sparkline Chart Bars Lack aria-hidden

**WCAG Criterion**: 1.1.1 Non-text Content
**Severity**: Low
**Affected File**: `/src/pages/DashboardPage.tsx`

**Description**:
The mini sparkline bars rendered in the dashboard stat cards are decorative visual elements that convey no meaningful information to screen readers. They are not hidden from the accessibility tree.

**Fix**:

```tsx
{/* Wrap decorative sparkline */}
<div className="flex items-end gap-0.5 h-8" aria-hidden="true">
  {bars.map((h, i) => (
    <div key={i} className="w-1 rounded-full bg-indigo-500/30" style={{ height: `${h}%` }} />
  ))}
</div>
```

---

### P-05: ErrorBoundary Fallback Lacks Semantic Structure and Adequate Contrast

**WCAG Criterion**: 1.4.3 Contrast (Minimum), 1.3.1 Info and Relationships
**Severity**: Medium
**Affected File**: `/src/main.tsx`

**Description**:
The error boundary fallback UI uses inline styles with hardcoded colors and no semantic heading. The error message `color: '#ff6b6b'` on `background: '#1a1a2e'` yields approximately 4.3:1 contrast -- below the 4.5:1 requirement for normal text.

**Fix**:

```tsx
<div role="alert" style={{ /* ... existing styles */ }}>
  <h1 style={{ color: '#ff8080', fontSize: '1.5rem', marginBottom: '0.5rem' }}>
    Something went wrong
  </h1>
  <p style={{ color: '#ccc' }}>{this.state.error?.message}</p>
  <button
    onClick={() => window.location.reload()}
    style={{ /* existing styles with sufficient contrast */ }}
    aria-label="Reload the application"
  >
    Reload
  </button>
</div>
```

---

### P-06: Search Input on PortfolioPage Missing Visible Label

**WCAG Criterion**: 1.3.1 Info and Relationships, 3.3.2 Labels or Instructions
**Severity**: Medium
**Affected File**: `/src/pages/PortfolioPage.tsx`

**Description**:
The search input in the portfolio asset list uses only a `placeholder` attribute with no associated `<label>` element. Placeholders disappear on focus and are not reliable labels for screen readers.

**Fix**:

```tsx
<div className="relative">
  <label htmlFor="asset-search" className="sr-only">Search assets</label>
  <input
    id="asset-search"
    type="search"
    placeholder="Search assets..."
    aria-label="Search assets"
    // ... rest of props
  />
</div>
```

---

## 2. Operable (WCAG Principle 2)

Issues under this principle relate to ensuring all functionality is available from a keyboard and that users have enough time and guidance to navigate.

---

### O-01: No Skip-to-Content Link

**WCAG Criterion**: 2.4.1 Bypass Blocks
**Severity**: High
**Affected File**: `/src/components/Layout/Layout.tsx`

**Description**:
The main application layout includes a fixed navbar with multiple interactive elements (logo, nav links, network selector, wallet button, theme toggle). Keyboard users must tab through all of these on every page navigation before reaching the main content.

**Fix**:

```tsx
// /src/components/Layout/Layout.tsx
export default function Layout() {
  return (
    <div className="min-h-screen">
      {/* Skip link -- first focusable element */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:bg-indigo-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-semibold focus:shadow-lg"
      >
        Skip to main content
      </a>

      <Navbar />
      <main id="main-content" className="...">
        <Outlet />
      </main>
    </div>
  );
}
```

---

### O-02: Mobile Slide-Over Menu Lacks Focus Trap and Dialog Semantics

**WCAG Criterion**: 2.4.3 Focus Order, 2.1.2 No Keyboard Trap (inverse -- focus escapes when it should not)
**Severity**: Critical
**Affected File**: `/src/components/Layout/Navbar.tsx` (MobileSlideOver, approx. line 532)

**Description**:
The mobile navigation slide-over panel opens as an overlay but:
1. Does not trap focus within the panel.
2. Missing `role="dialog"` and `aria-modal="true"`.
3. The overlay backdrop is closed via `onClick` only, with no keyboard equivalent.
4. Focus is not moved to the panel when it opens.
5. Focus is not returned to the trigger button when it closes.

Users can tab behind the panel into the obscured page content.

**Fix**:

Replace the custom slide-over with HeadlessUI `Dialog` (already a project dependency):

```tsx
import { Dialog, DialogPanel } from '@headlessui/react';

function MobileSlideOver({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50 lg:hidden">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />

      {/* Panel */}
      <DialogPanel className="fixed inset-y-0 right-0 w-80 bg-[var(--bg-secondary)] shadow-xl overflow-y-auto">
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close navigation menu"
          className="absolute top-4 right-4 ..."
        >
          <X className="h-5 w-5" />
        </button>

        {/* Navigation links */}
        {/* ... */}
      </DialogPanel>
    </Dialog>
  );
}
```

This provides focus trap, Escape key handling, focus restoration, and proper ARIA semantics automatically.

---

### O-03: Hamburger Menu Button Missing aria-label and aria-expanded

**WCAG Criterion**: 4.1.2 Name, Role, Value
**Severity**: High
**Affected File**: `/src/components/Layout/Navbar.tsx` (approx. line 731)

**Description**:
The hamburger button that toggles the mobile menu has no accessible name and does not communicate its expanded/collapsed state.

**Fix**:

```tsx
<button
  onClick={() => setMobileOpen(true)}
  aria-label="Open navigation menu"
  aria-expanded={mobileOpen}
  className="lg:hidden p-2 ..."
>
  <Menu className="h-6 w-6" aria-hidden="true" />
</button>
```

---

### O-04: Network Selector and Wallet Dropdowns Missing ARIA Attributes

**WCAG Criterion**: 4.1.2 Name, Role, Value
**Severity**: High
**Affected File**: `/src/components/Layout/Navbar.tsx`

**Description**:
Both the `NetworkSelector` and `WalletButton` components render custom dropdown menus that:
1. Lack `aria-haspopup="listbox"` (or `"menu"`) on the trigger button.
2. Lack `aria-expanded` to indicate open/closed state.
3. Lack `role="listbox"` or `role="menu"` on the dropdown panel.
4. Lack keyboard arrow-key navigation within the dropdown.
5. Lack Escape key to close the dropdown.

**Fix** (NetworkSelector example):

```tsx
<button
  onClick={() => setOpen(!open)}
  aria-haspopup="listbox"
  aria-expanded={open}
  aria-label={`Select network. Current: ${currentNetwork.name}`}
  className="..."
>
  {/* button content */}
</button>

{open && (
  <ul
    role="listbox"
    aria-label="Available networks"
    className="..."
  >
    {networks.map((network) => (
      <li
        key={network.id}
        role="option"
        aria-selected={network.id === currentNetwork.id}
        tabIndex={0}
        onClick={() => selectNetwork(network)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') selectNetwork(network);
          if (e.key === 'Escape') setOpen(false);
        }}
      >
        {network.name}
      </li>
    ))}
  </ul>
)}
```

Alternatively, use HeadlessUI `Listbox` for full keyboard and ARIA support.

---

### O-05: Password Toggle Button Has tabIndex={-1}

**WCAG Criterion**: 2.1.1 Keyboard
**Severity**: Medium
**Affected Files**:
- `/src/pages/LoginPage.tsx` (line 183)
- `/src/pages/SignupPage.tsx`

**Description**:
The show/hide password toggle button uses `tabIndex={-1}`, making it unreachable via keyboard Tab navigation. Keyboard-only users cannot toggle password visibility.

**Fix**:

```tsx
<button
  type="button"
  // Remove tabIndex={-1}
  aria-label={showPassword ? 'Hide password' : 'Show password'}
  aria-pressed={showPassword}
  onClick={() => setShowPassword((v) => !v)}
  className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
>
  {showPassword ? (
    <EyeOff className="h-[18px] w-[18px]" aria-hidden="true" />
  ) : (
    <Eye className="h-[18px] w-[18px]" aria-hidden="true" />
  )}
</button>
```

---

### O-06: Portfolio Asset Cards Use onClick on Non-Interactive Elements

**WCAG Criterion**: 2.1.1 Keyboard
**Severity**: High
**Affected File**: `/src/pages/PortfolioPage.tsx`

**Description**:
Asset cards in the portfolio grid attach `onClick` handlers to `<div>` elements. These are not focusable and cannot be activated via keyboard.

**Fix** (option A -- use a button):

```tsx
<button
  type="button"
  onClick={() => selectAsset(asset)}
  className="w-full text-left rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] p-5 hover:border-[var(--border-hover)] transition-all focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2"
  aria-label={`View details for ${asset.name}`}
>
  {/* card content */}
</button>
```

**Fix** (option B -- if `<div>` must remain):

```tsx
<div
  role="button"
  tabIndex={0}
  onClick={() => selectAsset(asset)}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      selectAsset(asset);
    }
  }}
  aria-label={`View details for ${asset.name}`}
  className="... cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
>
  {/* card content */}
</div>
```

---

### O-07: Exchange and AMM Tab Bars Missing Tab Semantics

**WCAG Criterion**: 4.1.2 Name, Role, Value
**Severity**: Medium
**Affected Files**:
- `/src/pages/ExchangePage.tsx`
- `/src/pages/OrbitalAMMPage.tsx`

**Description**:
The mobile tab bars on the Exchange and AMM pages render `<button>` elements that act as tabs but lack `role="tablist"`, `role="tab"`, `aria-selected`, and `role="tabpanel"` semantics. Keyboard arrow-key navigation between tabs is not supported.

**Fix**:

```tsx
<div role="tablist" aria-label="Exchange sections">
  {tabs.map((tab) => (
    <button
      key={tab.id}
      role="tab"
      id={`tab-${tab.id}`}
      aria-selected={activeTab === tab.id}
      aria-controls={`panel-${tab.id}`}
      tabIndex={activeTab === tab.id ? 0 : -1}
      onClick={() => setActiveTab(tab.id)}
      onKeyDown={handleTabKeyDown} // arrow key navigation
      className="..."
    >
      {tab.label}
    </button>
  ))}
</div>

<div
  role="tabpanel"
  id={`panel-${activeTab}`}
  aria-labelledby={`tab-${activeTab}`}
  tabIndex={0}
>
  {/* panel content */}
</div>
```

---

### O-08: Focus Ring Offset Hardcodes Dark Background Color

**WCAG Criterion**: 2.4.7 Focus Visible
**Severity**: Low
**Affected File**: `/src/components/Common/Button.tsx`

**Description**:
The `Button` component uses `focus-visible:ring-offset-[#0a0b0f]`, which hardcodes the dark theme background color. In light mode, the focus ring offset creates a dark-colored gap that looks broken.

**Fix**:

```tsx
// Replace hardcoded color with CSS variable
'focus-visible:ring-offset-[var(--bg-primary)]'
```

Or use Tailwind's theme-aware approach:

```tsx
'focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]'
```

---

## 3. Understandable (WCAG Principle 3)

Issues under this principle relate to making content and controls predictable and helping users avoid and correct errors.

---

### U-01: Form Error Messages Not Programmatically Linked to Inputs

**WCAG Criterion**: 3.3.1 Error Identification, 3.3.3 Error Suggestion
**Severity**: High
**Affected Files**:
- `/src/pages/LoginPage.tsx`
- `/src/pages/SignupPage.tsx`
- `/src/components/Mint/MintForm.tsx`

**Description**:
Validation error messages are displayed visually below the relevant input, but they are not linked via `aria-describedby`. Screen readers will not announce the error when the input is focused. Additionally, error messages lack `role="alert"` or `aria-live="polite"`, so they are not announced when they dynamically appear.

Current pattern:

```tsx
<input id="email" {...register('email')} />
{errors.email && (
  <p className="text-xs font-medium text-red-400 pl-1">
    {errors.email.message}
  </p>
)}
```

**Fix**:

```tsx
<input
  id="email"
  aria-invalid={!!errors.email}
  aria-describedby={errors.email ? 'email-error' : undefined}
  {...register('email')}
/>
{errors.email && (
  <p
    id="email-error"
    role="alert"
    className="text-xs font-medium text-red-400 pl-1"
  >
    {errors.email.message}
  </p>
)}
```

This pattern must be applied to every validated input across all forms. Consider creating a reusable `FormField` component to enforce this consistently.

---

### U-02: Multi-Step Signup Wizard Does Not Announce Step Changes

**WCAG Criterion**: 3.2.2 On Input, 4.1.3 Status Messages
**Severity**: Medium
**Affected File**: `/src/pages/SignupPage.tsx`

**Description**:
When the user progresses through the signup wizard steps (Account Setup, Identity Verification, Document Upload), the step change is purely visual. Screen reader users are not informed that the content has changed or which step they are on.

The `StepIndicator` component also lacks `role="progressbar"` or other ARIA semantics.

**Fix**:

```tsx
// 1. Add a live region for step announcements
<div aria-live="polite" className="sr-only">
  Step {currentStep} of {totalSteps}: {stepLabels[currentStep - 1]}
</div>

// 2. Add semantics to StepIndicator
<nav aria-label="Signup progress">
  <ol className="flex items-center gap-4">
    {steps.map((step, i) => (
      <li
        key={step.id}
        aria-current={i + 1 === currentStep ? 'step' : undefined}
        className="..."
      >
        <span className="sr-only">
          Step {i + 1}: {step.label}
          {i + 1 < currentStep ? ' (completed)' : i + 1 === currentStep ? ' (current)' : ''}
        </span>
        {/* visual indicator */}
      </li>
    ))}
  </ol>
</nav>

// 3. Move focus to the new step heading when step changes
useEffect(() => {
  stepHeadingRef.current?.focus();
}, [currentStep]);
```

---

### U-03: Pending Approval Page Progress Bar Missing ARIA

**WCAG Criterion**: 4.1.2 Name, Role, Value
**Severity**: Medium
**Affected File**: `/src/pages/PendingApprovalPage.tsx`

**Description**:
The KYC progress bar on the pending approval page is a styled `<div>` with no `role="progressbar"` or associated ARIA value attributes. Screen readers cannot interpret the current progress.

**Fix**:

```tsx
<div
  role="progressbar"
  aria-valuenow={progressPercent}
  aria-valuemin={0}
  aria-valuemax={100}
  aria-label="KYC verification progress"
  className="w-full h-2 rounded-full bg-[var(--bg-tertiary)]"
>
  <div
    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
    style={{ width: `${progressPercent}%` }}
    aria-hidden="true"
  />
</div>
```

---

### U-04: SSN Masking Input May Confuse Screen Readers

**WCAG Criterion**: 3.3.2 Labels or Instructions
**Severity**: Low
**Affected File**: `/src/pages/SignupPage.tsx`

**Description**:
The SSN field uses custom JavaScript masking to format the value as `XXX-XX-XXXX`. This dynamic reformatting can be disorienting for screen reader users, especially when characters are inserted or deleted at unexpected positions.

**Fix**:

```tsx
<input
  id="ssn"
  type="text"
  inputMode="numeric"
  aria-label="Social Security Number"
  aria-describedby="ssn-format-hint"
  placeholder="XXX-XX-XXXX"
  // ... mask logic
/>
<p id="ssn-format-hint" className="sr-only">
  Enter your 9-digit Social Security Number. It will be formatted automatically as three digits, dash, two digits, dash, four digits.
</p>
```

---

## 4. Robust (WCAG Principle 4)

Issues under this principle relate to ensuring content is compatible with current and future assistive technologies.

---

### R-01: AddressIdenticon Missing Role and Alternative Text

**WCAG Criterion**: 1.1.1 Non-text Content, 4.1.2 Name, Role, Value
**Severity**: Low
**Affected File**: `/src/components/Layout/Navbar.tsx`

**Description**:
The `AddressIdenticon` component generates a decorative blocky avatar from an Ethereum address. It is rendered without `aria-hidden="true"` (if decorative) or `role="img"` with an `aria-label` (if meaningful).

**Fix** (decorative):

```tsx
<div aria-hidden="true" className="w-8 h-8 rounded-full overflow-hidden">
  {/* identicon rendering */}
</div>
```

**Fix** (if meaningful -- shows identity):

```tsx
<div role="img" aria-label={`Account avatar for ${truncatedAddress}`} className="...">
  {/* identicon rendering */}
</div>
```

---

### R-02: Inline Style Tags Injected in Components

**WCAG Criterion**: 4.1.1 Parsing (historical, still good practice)
**Severity**: Low
**Affected File**: `/src/pages/DashboardPage.tsx`

**Description**:
The dashboard page injects a `<style>` tag into the component render tree for custom keyframe animations. While modern parsers handle this, it can cause issues with assistive technology that re-parses the DOM. Move these to the global stylesheet.

**Fix**:

```css
/* Move to /src/index.css */
@keyframes float-particle {
  0%, 100% { transform: translateY(0) translateX(0); opacity: 0; }
  50% { opacity: 0.6; }
  100% { transform: translateY(-40px) translateX(20px); opacity: 0; }
}
```

---

### R-03: MintForm Success/Failure States Not Announced

**WCAG Criterion**: 4.1.3 Status Messages
**Severity**: Medium
**Affected File**: `/src/components/Mint/MintForm.tsx`

**Description**:
When a minting transaction succeeds or fails, the UI updates to show a success or error state. These state changes are not wrapped in `aria-live` regions and are not announced to screen readers.

**Fix**:

```tsx
{/* Wrap status messages in a live region */}
<div aria-live="assertive" aria-atomic="true">
  {mintStatus === 'success' && (
    <div role="alert" className="...">
      <p>Token minted successfully!</p>
      {/* transaction details */}
    </div>
  )}
  {mintStatus === 'error' && (
    <div role="alert" className="...">
      <p>Minting failed: {errorMessage}</p>
    </div>
  )}
</div>
```

---

### R-04: Copy-to-Clipboard Buttons Missing Accessible Name and Feedback

**WCAG Criterion**: 4.1.2 Name, Role, Value
**Severity**: Medium
**Affected Files**:
- `/src/components/Mint/MintForm.tsx`
- `/src/pages/PortfolioPage.tsx`

**Description**:
Copy buttons throughout the app use an icon-only design with `title` attributes but no `aria-label`. The `title` attribute is not reliably announced by screen readers. Additionally, after a successful copy, no screen reader feedback is provided.

**Fix**:

```tsx
<button
  type="button"
  onClick={() => copyToClipboard(value)}
  aria-label={`Copy ${fieldName} to clipboard`}
  className="..."
>
  {copied ? (
    <Check className="h-4 w-4" aria-hidden="true" />
  ) : (
    <Copy className="h-4 w-4" aria-hidden="true" />
  )}
  <span className="sr-only" aria-live="polite">
    {copied ? 'Copied!' : ''}
  </span>
</button>
```

---

### R-05: View Toggle and Sort Buttons on PortfolioPage Rely on title Only

**WCAG Criterion**: 4.1.2 Name, Role, Value
**Severity**: Medium
**Affected File**: `/src/pages/PortfolioPage.tsx`

**Description**:
The grid/list view toggle buttons and sort direction buttons use `title` attributes instead of `aria-label`. The `title` attribute is not announced by most screen readers when the element is focused.

**Fix**:

```tsx
<button
  onClick={() => setView('grid')}
  aria-label="Grid view"
  aria-pressed={view === 'grid'}
  className="..."
>
  <Grid className="h-4 w-4" aria-hidden="true" />
</button>

<button
  onClick={() => setView('list')}
  aria-label="List view"
  aria-pressed={view === 'list'}
  className="..."
>
  <List className="h-4 w-4" aria-hidden="true" />
</button>
```

---

## 5. Motion and Animation

---

### M-01: prefers-reduced-motion Support (GOOD)

**WCAG Criterion**: 2.3.3 Animation from Interactions
**Severity**: N/A -- Compliant
**Affected File**: `/src/index.css` (line 131)

The platform includes a comprehensive `prefers-reduced-motion` media query that disables transitions and animations globally. This is a strong positive finding.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

### M-02: scroll-behavior: smooth Without Reduced-Motion Guard (ACCEPTABLE)

**WCAG Criterion**: 2.3.3 Animation from Interactions
**Severity**: N/A -- Mitigated
**Affected File**: `/src/index.css` (line 106)

`scroll-behavior: smooth` is set on `html`, but the `prefers-reduced-motion` block overrides it with `scroll-behavior: auto`. This is properly handled.

---

## 6. Touch Targets

---

### T-01: Several Interactive Elements Below 44x44px Minimum

**WCAG Criterion**: 2.5.5 Target Size (Enhanced, Level AAA) / 2.5.8 Target Size Minimum (Level AA, WCAG 2.2)
**Severity**: Medium
**Affected Files**: Multiple components

**Description**:
Several interactive elements have touch targets smaller than the recommended 44x44 CSS pixels:

| Element                   | Estimated Size | File                     |
|---------------------------|---------------|--------------------------|
| Theme toggle button       | 36x36px       | ThemeToggle.tsx           |
| Copy-to-clipboard buttons | 24x24px       | MintForm.tsx, PortfolioPage.tsx |
| Close button (mobile menu)| 32x32px       | Navbar.tsx               |
| Password show/hide toggle | 18x18px       | LoginPage.tsx, SignupPage.tsx |
| Sort direction button     | 32x32px       | PortfolioPage.tsx        |

**Fix**:

Ensure all interactive elements have at minimum 44x44px touch target. This can be achieved without changing visual size by using padding or a transparent pseudo-element:

```tsx
// Example: Copy button with adequate touch target
<button
  className="relative p-3 -m-1.5"  // visual padding + negative margin
  aria-label="Copy to clipboard"
>
  <Copy className="h-4 w-4" aria-hidden="true" />
</button>
```

Or via CSS:

```css
.touch-target-44::after {
  content: '';
  position: absolute;
  inset: -8px; /* Expands the touch target */
}
```

---

## 7. Positive Findings (What Works Well)

The following accessibility patterns are already well-implemented and should be preserved:

| Finding | File | Detail |
|---------|------|--------|
| HeadlessUI Modal with focus trap | `/src/components/Common/Modal.tsx` | Full ARIA dialog semantics, focus trap, Escape key, backdrop click |
| Modal close button has aria-label | `Modal.tsx` | `aria-label="Close dialog"` |
| Spinner with sr-only label | `/src/components/Common/Spinner.tsx` | `role="status"`, `aria-hidden` on SVG, `<span className="sr-only">` |
| ThemeToggle with dynamic aria-label | `ThemeToggle.tsx` | Changes label based on current mode |
| Button component with aria-busy | `Button.tsx` | `aria-busy={loading}`, `aria-disabled` |
| Badge with role="status" | `Badge.tsx` | Includes optional `aria-label` |
| EmptyState with role="status" | `EmptyState.tsx` | Decorative elements marked `aria-hidden="true"` |
| StatCard with role="group" | `StatCard.tsx` | Proper grouping with `aria-label` |
| MintPage StepIndicator | `MintPage.tsx` | Uses `<nav aria-label>` with `<ol>` -- good semantics |
| prefers-reduced-motion | `index.css` | Comprehensive motion reduction |
| focus-visible styles | `index.css` | Global `outline: 2px solid var(--accent-primary)` on `:focus-visible` |
| System color scheme respect | `useTheme.ts` | Respects OS `prefers-color-scheme` preference |
| File upload remove button | `FileUploader.tsx` | `aria-label="Remove file"` |
| Signup radio buttons | `SignupPage.tsx` | Uses `sr-only` class for custom-styled radio inputs |
| Form labels with htmlFor/id | Multiple | Proper label association on login, signup, mint forms |
| autocomplete attributes | `LoginPage.tsx` | `autoComplete="email"`, `autoComplete="current-password"` |

---

## 8. Quick Wins vs Long-Term Improvements

### Quick Wins (1-2 hours each, high impact)

| Priority | Issue ID | Fix Description | Effort |
|----------|----------|-----------------|--------|
| 1 | O-01 | Add skip-to-content link in `Layout.tsx` | 15 min |
| 2 | O-03 | Add `aria-label` and `aria-expanded` to hamburger button | 5 min |
| 3 | P-02 | Add `role="status"` and `sr-only` text to `PageLoader` | 5 min |
| 4 | P-01 | Adjust `--text-muted` CSS variable for contrast | 10 min |
| 5 | U-01 | Add `aria-describedby` and `aria-invalid` to login form | 20 min |
| 6 | O-05 | Remove `tabIndex={-1}` from password toggle | 2 min |
| 7 | P-04 | Add `aria-hidden="true"` to decorative sparklines | 5 min |
| 8 | R-04 | Add `aria-label` to copy buttons | 10 min |
| 9 | R-05 | Replace `title` with `aria-label` on toggle/sort buttons | 10 min |
| 10 | U-03 | Add `role="progressbar"` to KYC progress bar | 10 min |

### Medium-Term Improvements (2-8 hours each)

| Priority | Issue ID | Fix Description | Effort |
|----------|----------|-----------------|--------|
| 1 | U-01 | Create reusable `FormField` component with built-in aria-describedby, aria-invalid, and error announcement | 4 hrs |
| 2 | O-04 | Add ARIA attributes to Network and Wallet dropdowns, or migrate to HeadlessUI Listbox/Menu | 4 hrs |
| 3 | O-07 | Implement proper tab widget pattern on Exchange and AMM pages | 3 hrs |
| 4 | O-06 | Convert portfolio asset card divs to buttons or add keyboard support | 2 hrs |
| 5 | U-02 | Add step announcement live region and focus management to signup wizard | 3 hrs |
| 6 | T-01 | Audit and fix all touch targets below 44x44px | 3 hrs |

### Long-Term Improvements (1-3 days each)

| Priority | Issue ID | Fix Description | Effort |
|----------|----------|-----------------|--------|
| 1 | O-02 | Replace custom mobile slide-over with HeadlessUI Dialog for full focus management | 1 day |
| 2 | -- | Implement automated accessibility testing in CI (axe-core + Playwright) | 2 days |
| 3 | -- | Create an accessibility component library (accessible Form, Tabs, Dropdown, Toast primitives) | 3 days |
| 4 | -- | Conduct user testing with assistive technology users | 2 days |
| 5 | -- | Add comprehensive keyboard shortcuts documentation page | 1 day |

---

## 9. Recommended Testing Tools

| Tool | Purpose |
|------|---------|
| axe DevTools (browser extension) | Automated WCAG violation scanning |
| axe-core + @axe-core/react | Runtime accessibility checks in development |
| Playwright + @axe-core/playwright | Automated accessibility testing in CI |
| NVDA / VoiceOver | Manual screen reader testing |
| Colour Contrast Analyser (CCA) | Manual contrast verification |
| Lighthouse Accessibility Audit | Automated scoring in Chrome DevTools |
| Tab key + keyboard-only navigation | Manual keyboard accessibility verification |

---

## 10. Summary

The Fueki Tokenization Platform has a mixed accessibility posture. Strong foundations exist -- HeadlessUI modals, `prefers-reduced-motion` support, `focus-visible` styling, and proper label associations on most forms. However, critical gaps remain in keyboard operability (missing skip link, no focus trap on mobile menu, non-interactive elements with click handlers), screen reader support (form errors not linked to inputs, dropdowns lacking ARIA, status changes not announced), and color contrast (muted text below 4.5:1 threshold).

The estimated overall compliance score of **57/100** reflects a platform that partially addresses WCAG 2.1 AA but would not pass a formal audit. The quick wins listed above would raise the score to approximately **72-75/100** with minimal effort, and the medium-term improvements would bring it to **85-90/100**.

---

*Report generated by Agent 3 (AccessibilityAuditor) as part of the 15-agent Fueki Platform Audit.*
