# Fueki Tokenization Platform -- Code Quality Audit Report

**Agent:** CodeAuditor (Agent 1 of 15)
**Date:** 2026-02-16
**Scope:** Full static analysis of all React source files in `src/`
**Files Analyzed:** 65+ source files across pages, components, hooks, stores, types, utilities, parsers, and blockchain service layers

---

## Executive Summary

The Fueki Tokenization Platform is a React/TypeScript single-page application for tokenizing real-world assets on EVM-compatible blockchains. The codebase is functional and demonstrates solid domain knowledge (DeFi patterns, EIP-6963 wallet discovery, multi-contract interaction). However, the audit identified **5 critical**, **18 major**, and **22 minor** issues across 8 analysis categories.

The most significant systemic problems are:

1. **God Component Syndrome** -- Five components exceed 750 lines each, with PortfolioPage at 1,344 lines and SignupPage at 1,329 lines. These components are difficult to test, debug, and maintain.
2. **Pervasive Code Duplication** -- GlassCard, Toaster config, asset fetching logic, gradient palettes, `formatTokenLabel`, `timeAgo`, pool/chain resolution patterns, and `tokenLabel` functions are duplicated across the codebase.
3. **Missing Error Boundaries** -- Only one root-level ErrorBoundary exists. A single unhandled rendering error in any chart, form, or blockchain data display crashes the entire application.
4. **API Type Mismatch** -- `refreshToken(token: string)` in `auth.ts` expects an argument, but `authStore.ts` calls it with zero arguments, creating a potential silent runtime failure in the token refresh flow.
5. **Memory Leak Risks** -- Multiple `setTimeout` calls without cleanup, module-level event listeners that are never removed, and `FileReader` callbacks that can fire after component unmount.

---

## Critical Issues (5)

### C-1: API Type Mismatch in Token Refresh

**File:** `src/lib/api/auth.ts` (line 38) / `src/store/authStore.ts` (line 116)
**Severity:** Critical
**Category:** TypeScript Quality / Runtime Error

**Description:**
The `refreshToken` function in `auth.ts` declares a required `token: string` parameter. However, `authStore.ts` calls `authApi.refreshToken()` with no arguments. TypeScript may not catch this if the import typing is loose. At runtime, `token` will be `undefined`, which will be serialized as the literal string `"undefined"` or cause the refresh endpoint to reject the request. This silently breaks the token refresh flow, logging users out unexpectedly.

```typescript
// src/lib/api/auth.ts (line 38)
export async function refreshToken(token: string): Promise<AuthTokens> {
  const { data } = await api.post<AuthTokens>('/auth/refresh', { refreshToken: token });
  return data;
}

// src/store/authStore.ts (line 116) -- MISMATCH
const tokens = await authApi.refreshToken(); // No argument!
```

**Recommended Fix:**
Either make the parameter optional and read the refresh token from localStorage, or pass the stored refresh token at the call site:

```typescript
// Option A: Fix the call site
const tokens = await authApi.refreshToken(get().tokens?.refreshToken ?? '');

// Option B: Fix the function signature
export async function refreshToken(): Promise<AuthTokens> {
  const stored = localStorage.getItem('fueki_tokens');
  const refreshToken = stored ? JSON.parse(stored).refreshToken : '';
  const { data } = await api.post<AuthTokens>('/auth/refresh', { refreshToken });
  return data;
}
```

---

### C-2: Only Root-Level Error Boundary

**File:** `src/main.tsx` (lines 14-38)
**Severity:** Critical
**Category:** Error Handling

**Description:**
The entire application has a single `ErrorBoundary` class component at the root. If any component throws during rendering (e.g., a Recharts component receives malformed data, or a blockchain response has an unexpected shape), the entire application crashes to a generic error screen. There are no granular error boundaries around:

- Chart components (`PortfolioChart`, `ValueChart`) which process external data
- Blockchain interaction panels (Exchange, OrbitalAMM) which depend on contract calls
- File parsing/upload flows which handle user-provided data
- Individual page routes

**Recommended Fix:**
Add error boundaries at page and feature boundaries:

```typescript
// src/components/Common/PageErrorBoundary.tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; }

export class PageErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page error boundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-lg font-semibold text-red-400">Something went wrong</p>
          <button onClick={() => this.setState({ hasError: false })}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

Wrap each `<Route>` page element and each chart/exchange panel with a `<PageErrorBoundary>`.

---

### C-3: Module-Level EIP-6963 Event Listener Never Cleaned Up

**File:** `src/hooks/useWallet.ts` (lines 51-63)
**Severity:** Critical
**Category:** Memory Leak

**Description:**
An `eip6963:announceProvider` event listener is registered at the module level (outside any component or hook lifecycle). This listener is never removed because it has no associated cleanup function. In development with React StrictMode (which double-mounts), or in environments where the module is hot-reloaded, this creates duplicate listeners that accumulate indefinitely.

```typescript
// Module-level -- runs once when the module is first imported
window.addEventListener('eip6963:announceProvider', (event: Event) => {
  const customEvent = event as CustomEvent<EIP6963AnnounceProviderEvent>;
  // ... modifies module-level state
});
```

**Recommended Fix:**
Move the event listener into a `useEffect` hook with proper cleanup, or guard against duplicate registration with a module-level flag:

```typescript
let eip6963ListenerRegistered = false;

function registerEIP6963Listener() {
  if (eip6963ListenerRegistered) return;
  eip6963ListenerRegistered = true;
  window.addEventListener('eip6963:announceProvider', handleAnnounce);
}
```

---

### C-4: Hardcoded API Base URL to Production

**File:** `src/lib/api/client.ts`
**Severity:** Critical
**Category:** Security / Configuration

**Description:**
The Axios instance uses a hardcoded fallback URL pointing to a production endpoint (`https://fueki-kyc-backend-production.up.railway.app/api`). If the `VITE_API_BASE_URL` environment variable is not set, development and staging environments will silently send requests (including credentials) to the production backend.

**Recommended Fix:**
Fail fast if the environment variable is missing in non-production environments:

```typescript
const baseURL = import.meta.env.VITE_API_BASE_URL;
if (!baseURL && import.meta.env.DEV) {
  console.error('VITE_API_BASE_URL is not set. API requests will fail.');
}
```

---

### C-5: Silently Swallowed Errors in Dashboard Data Fetching

**File:** `src/pages/DashboardPage.tsx` (multiple catch blocks in `fetchData`)
**Severity:** Critical
**Category:** Error Handling

**Description:**
The `fetchData` function in DashboardPage contains multiple `try/catch` blocks where errors are caught and silently discarded (`catch { /* empty */ }`). When asset fetching, trade history loading, or balance queries fail, the user sees stale or empty data with no indication that something went wrong. This is particularly dangerous for a financial application where users make decisions based on displayed balances.

**Recommended Fix:**
Add error state tracking and display a non-blocking error banner when data fetching fails:

```typescript
const [fetchErrors, setFetchErrors] = useState<string[]>([]);

// In each catch block:
catch (err) {
  console.error('Failed to fetch assets:', err);
  setFetchErrors(prev => [...prev, 'Failed to load asset data']);
}
```

---

## Major Issues (18)

### M-1: God Component -- PortfolioPage (1,344 lines)

**File:** `src/pages/PortfolioPage.tsx`
**Category:** Anti-Patterns

Contains 16+ `useState` calls, inline transfer/burn modal logic, filtering, sorting, view mode toggling, asset fetching, and multiple sub-renders. Should be decomposed into: `PortfolioHeader`, `PortfolioFilters`, `AssetGrid`, `AssetTable`, `TransferModal`, `BurnModal`, and a `usePortfolioAssets` hook.

### M-2: God Component -- SignupPage (1,329 lines)

**File:** `src/pages/SignupPage.tsx`
**Category:** Anti-Patterns

A 4-step KYC wizard with all forms inline. Each step (Account, Personal Info, Document Upload, Review) should be extracted to its own component. The FileReader `onload` callback (line 379) can trigger state updates on an unmounted component if the user navigates away during file reading.

### M-3: God Component -- ExchangePage (870 lines)

**File:** `src/pages/ExchangePage.tsx`
**Category:** Anti-Patterns

Contains duplicated state (`assets`/`loadingAssets` as local state mirroring the global Zustand store), an inline `GlassCard` component, and complex layout logic. The duplicated state creates synchronization bugs.

### M-4: God Component -- DashboardPage (793 lines)

**File:** `src/pages/DashboardPage.tsx`
**Category:** Anti-Patterns

Defines inline `StatCard`, `FeatureCard`, and `QuickAction` components at module level. Complex `fetchData` function uses refs (`wrappedAssetsRef`, `tradeHistoryRef`) to avoid stale closures. The data fetching logic is duplicated from PortfolioPage.

### M-5: God Component -- Navbar (758 lines)

**File:** `src/components/Layout/Navbar.tsx`
**Category:** Anti-Patterns

Contains 5 inline sub-components: `NetworkBadge`, `NetworkSelector`, `WalletButton`, `AddressIdenticon`, `MobileSlideOver`. Also defines an inline `useClickOutside` hook. Each should be extracted to its own file.

### M-6: Duplicated GlassCard Component

**File:** `src/pages/ExchangePage.tsx` (line 65) / `src/pages/OrbitalAMMPage.tsx` (line 61)
**Category:** Anti-Patterns (DRY Violation)

Identical `GlassCard` component defined in two separate files. Extract to `src/components/Common/GlassCard.tsx`.

### M-7: Duplicated Toaster Configuration

**File:** `src/components/Layout/Layout.tsx` / `src/components/Layout/AuthLayout.tsx`
**Category:** Anti-Patterns (DRY Violation)

Identical `<Toaster>` configuration with the same styles, position, and options appears in both layouts. Extract to a shared `<AppToaster>` component.

### M-8: Duplicated Asset Fetching Logic

**File:** `src/pages/DashboardPage.tsx` / `src/pages/PortfolioPage.tsx` / `src/pages/ExchangePage.tsx`
**Category:** Anti-Patterns (DRY Violation)

All three pages independently fetch wrapped assets using the same `ContractService.getAllAssets()` pattern with nearly identical error handling. Extract to a `useWrappedAssets(contractService, chainId)` custom hook.

### M-9: Duplicated GRADIENT_PALETTES and getTokenGradient

**File:** `src/pages/PortfolioPage.tsx` / `src/components/Assets/AssetCard.tsx`
**Category:** Anti-Patterns (DRY Violation)

Identical gradient palette arrays and color derivation logic duplicated across two files. Extract to a shared utility.

### M-10: Duplicated `setTimeout` Without Cleanup (Memory Leak)

**Files:**
- `src/components/Layout/Navbar.tsx` (WalletButton `handleCopy`, line 339)
- `src/components/Mint/MintHistory.tsx` (CopyButton, line 61)
- `src/components/Exchange/LiquidityPanel.tsx` (line 219, 286, 312)
- `src/components/Exchange/TradeForm.tsx` (line 403)
- Multiple OrbitalAMM components

**Category:** Memory Leaks

`setTimeout(() => setCopied(false), 2000)` and similar calls have no cleanup. If the component unmounts before the timeout fires, React will warn about state updates on unmounted components. In hot-reload or fast navigation scenarios, these accumulate.

**Recommended Fix:**

```typescript
useEffect(() => {
  if (!copied) return;
  const timer = setTimeout(() => setCopied(false), 2000);
  return () => clearTimeout(timer);
}, [copied]);
```

### M-11: Missing React.memo on Presentational Components

**Files:**
- `src/components/Common/Badge.tsx`
- `src/components/Common/Card.tsx`
- `src/components/Common/EmptyState.tsx`
- `src/components/Common/StatCard.tsx`
- `src/components/Common/Spinner.tsx`
- `src/components/Auth/StepIndicator.tsx`
- `src/components/Auth/FormField.tsx` (has forwardRef but no memo)

**Category:** Unnecessary Re-renders

None of these pure presentational components are wrapped in `React.memo`. They re-render every time their parent re-renders, even when their props have not changed. In pages like PortfolioPage (which has 16+ state variables), this creates unnecessary render cycles.

### M-12: State Normalization -- Arrays Instead of Maps

**File:** `src/store/useAppStore.ts`
**Category:** State Management

All entity collections (`wrappedAssets`, `securityTokens`, `tradeHistory`, `exchangeOrders`) are stored as flat arrays. Lookups and updates require `O(n)` scans via `.find()` or `.filter()`. For a DeFi dashboard that may track dozens to hundreds of assets and orders, this becomes a performance bottleneck.

**Recommended Fix:**

```typescript
// Instead of:
wrappedAssets: WrappedAsset[];

// Use normalized maps:
wrappedAssets: Record<string, WrappedAsset>; // keyed by address
```

### M-13: Duplicated Local + Global State in ExchangePage

**File:** `src/pages/ExchangePage.tsx` (line 119)
**Category:** State Management

ExchangePage maintains `localAssets` state alongside the global `wrappedAssets` from the Zustand store. Both are fetched and updated independently, creating synchronization issues where the local list can diverge from the global state.

### M-14: Prop Drilling of `contractService` Across Exchange Components

**Files:**
- `src/pages/ExchangePage.tsx` drills `contractService` to `OrderBook`, `TradeForm`, `UserOrders`, `LiquidityPanel`, `PoolInfo`
- `src/pages/OrbitalAMMPage.tsx` drills `contractService` (OrbitalContractService) to `PoolList`, `SwapInterface`, `LiquidityPanel`, `CreatePoolForm`

**Category:** Prop Drilling

The `contractService` instance is created at the page level and drilled 2-3 levels deep into every child component. Since `contractService` depends on wallet connection state, a React Context would be more appropriate.

### M-15: `eslint-disable` Suppressing Exhaustive Deps Warnings

**Files:**
- `src/pages/PendingApprovalPage.tsx` (line 105)
- `src/components/Layout/Navbar.tsx` (line 544, MobileSlideOver)
- `src/components/Mint/MintForm.tsx` (line 118)
- `src/pages/OrbitalAMMPage.tsx` (CreatePoolForm auto-name, line 219)

**Category:** Hook Patterns

Multiple `eslint-disable-next-line react-hooks/exhaustive-deps` comments suppress legitimate dependency warnings. Each represents either a potential stale closure bug or a dependency that should be stabilized with `useCallback`/`useMemo`.

### M-16: Hardcoded Etherscan URL in ActivityFeed

**File:** `src/components/Dashboard/ActivityFeed.tsx`
**Category:** Bug

Transaction links are hardcoded to `etherscan.io` regardless of the connected network. On testnet, L2, or non-Ethereum chains, these links will be invalid.

**Recommended Fix:**
Use `getNetworkMetadata(chainId)?.blockExplorer` to derive the correct explorer URL, as is done in `MintHistory.tsx` and `MintForm.tsx`.

### M-17: Direct DOM Manipulation in MobileSlideOver

**File:** `src/components/Layout/Navbar.tsx` (line 550)
**Category:** Anti-Patterns

`document.body.style.overflow = 'hidden'` is set directly when the mobile menu opens. This bypasses React's declarative model and can conflict with other components that also manipulate body overflow (e.g., modals from `@headlessui/react`).

### M-18: TradeForm Component is 1,230 Lines

**File:** `src/components/Exchange/TradeForm.tsx`
**Category:** Anti-Patterns

While technically a component file rather than a page, TradeForm at 1,230 lines contains two complete trade modes (Limit Order and AMM Instant Swap) with all their approval flows, validation, and UI. These should be split into `LimitOrderForm` and `AMMSwapForm`.

---

## Minor Issues (22)

### m-1: Inline Functions in JSX Creating Closures Per Render

**Files:**
- `src/pages/PortfolioPage.tsx` (lines 869-871, 964-985)
- `src/components/Layout/Navbar.tsx` (line 754)
- Various Exchange/OrbitalAMM components

**Category:** Unnecessary Re-renders

Inline arrow functions like `onClick={() => setMobileMenuOpen(false)}` create new function instances on every render. For frequently re-rendering parent components, extract these to `useCallback`.

### m-2: `useTheme` Direct DOM Manipulation

**File:** `src/hooks/useTheme.ts` (line 55)
**Category:** Anti-Patterns

`document.documentElement.setAttribute('data-theme', currentTheme)` directly manipulates the DOM. While this is a common pattern for theme switching and is generally acceptable, it should be documented as an intentional side effect.

### m-3: `formatDate` Not Imported in TransactionPreview

**File:** `src/components/Upload/TransactionPreview.tsx` (line 16)
**Category:** Potential Bug

`formatDate` is imported from helpers but should be verified to exist. If the helpers file does not export this function, the build will fail.

### m-4: Missing `createdAt` in WrappedAsset from `addAsset`

**File:** `src/components/Mint/MintForm.tsx` (line 331)
**Category:** TypeScript Quality

`addAsset` is called with a `createdAt: Date.now()` field, but the `WrappedAsset` type in `types/index.ts` may not include this field. This extra property is silently ignored.

### m-5: `ValueChart` ActiveDot Uses `Record<string, unknown>`

**File:** `src/components/Dashboard/ValueChart.tsx` (line 143)
**Category:** TypeScript Quality

The `ActiveDot` component receives `props: Record<string, unknown>` and destructures specific fields without type narrowing. This is type-unsafe.

### m-6: Type Assertions (`as`) Usage

**Files:**
- `src/hooks/useWallet.ts` (lines 86-92)
- `src/components/Exchange/TradeForm.tsx` (line 108, 124)

**Category:** TypeScript Quality

Multiple `as` type assertions bypass type checking. Prefer type guards or discriminated unions.

### m-7: `copyToClipboard` Promise Not Awaited

**File:** `src/components/Dashboard/PortfolioChart.tsx`
**Category:** Error Handling

`copyToClipboard` returns a Promise but is called without `await` or `.catch()`, swallowing potential clipboard API errors.

### m-8: Duplicated `tokenLabel` / `formatTokenLabel` Helper

**Files:**
- `src/components/Exchange/LiquidityPanel.tsx` (line 201)
- `src/components/Exchange/PoolInfo.tsx` (line 61)
- `src/components/Exchange/OrderBook.tsx` (line 62)
- `src/components/Exchange/UserOrders.tsx` (line 62)

Same function defined in 4 different files. Extract to a shared utility.

### m-9: Duplicated `timeAgo` Function

**Files:**
- `src/components/Mint/MintHistory.tsx` (line 13)
- `src/components/Dashboard/ActivityFeed.tsx` (similar)

### m-10: Duplicated Chain ID Resolution Pattern

**Files:**
- `src/components/Exchange/LiquidityPanel.tsx` (line 77)
- `src/components/Exchange/OrderBook.tsx` (line 245)
- `src/components/Exchange/TradeForm.tsx` (line 262)
- `src/components/Exchange/UserOrders.tsx` (line 213)
- `src/components/Exchange/PoolInfo.tsx` (line 71)

Every Exchange component independently resolves chainId from the contractService. This is a cross-cutting concern that should be resolved once at the parent level.

### m-11: `FORMAT_BADGES` Array Unused

**File:** `src/components/Upload/FileUploader.tsx` (line 38)
**Category:** Dead Code

The `FORMAT_BADGES` array is defined but the div containing it has `className="hidden flex ..."` making it permanently hidden.

### m-12: Non-Deterministic Token Loading Order

**File:** `src/components/OrbitalAMM/CreatePoolForm.tsx` (line 170)
**Category:** Race Condition

`Promise.all` with `tokens.push()` inside the callback can produce tokens in non-deterministic order because `.push()` is called as each promise resolves. The `.sort()` on line 198 mitigates this, but the intermediate state before sort is inconsistent.

### m-13: Missing Keyboard Trap in TokenSelector Portal

**File:** `src/components/Exchange/TokenSelector.tsx`
**Category:** Accessibility

The dropdown rendered via `createPortal` handles Escape to close but does not trap Tab focus within the dropdown while open. Users can tab out of the dropdown into invisible elements behind it.

### m-14: `PoolInfo` Auto-Refresh Does Not Actually Re-Fetch

**File:** `src/components/Exchange/PoolInfo.tsx` (line 120-131)
**Category:** Bug

The auto-refresh interval calls `setLoading((prev) => prev)` which returns the same value, so React batches it as a no-op. The comment says "Force a re-render to trigger the fetch effect" but this does not work because the effect depends on `contractService`, `tokenA`, `tokenB`, `userAddress`, and `refreshKey` -- none of which change.

**Recommended Fix:**
Use a counter state that increments on each interval tick, and include it in the fetch effect's dependency array.

### m-15: `CreatePoolForm` Validation Runs on Every Render

**File:** `src/components/OrbitalAMM/CreatePoolForm.tsx` (lines 288-325)
**Category:** Performance

Validation errors are computed as top-level statements (not in `useMemo`), meaning they are recalculated on every single render even when none of the relevant inputs changed.

### m-16: Unused Import `ArrowRight` in LoginPage

**File:** `src/pages/LoginPage.tsx` (line 12)
**Category:** Dead Code

`ArrowRight` is imported and used, but `Shield` (line 13) icon is imported and only used in a footer badge -- this is fine. However, the import of `Fingerprint` (line 15) is used for branding. All imports appear used. No issue found on closer inspection.

*Correction:* This item is a false positive -- all imports in LoginPage are used.

### m-17: `useAppStore` Notification Timer Map at Module Level

**File:** `src/store/useAppStore.ts`
**Category:** Memory Leak Risk

`_notificationTimers` is a `Map<string, ReturnType<typeof setTimeout>>` at module level. Timers are cleared via `dismissNotification` and `clearNotifications`, but if a notification is auto-dismissed after the store is garbage-collected (in HMR scenarios), the timer map retains stale entries.

### m-18: `setInterval` Accumulation Risk in OrderBook and UserOrders

**Files:**
- `src/components/Exchange/OrderBook.tsx` (line 264)
- `src/components/Exchange/UserOrders.tsx` (line 232)

Both components properly clean up their intervals in effect return functions. However, the `fetchOrders` callback is in the dependency array, and if the callback is recreated (e.g., when `contractService` changes), the old interval is cleared and a new one is created -- this is correct behavior but worth documenting.

### m-19: FileReader Memory Leak in SignupPage

**File:** `src/pages/SignupPage.tsx` (line 379)
**Category:** Memory Leak

The `FileReader.onload` callback captures component state setters. If the component unmounts while the FileReader is still processing, the callback fires on an unmounted component. Unlike modern async patterns, `FileReader` does not support `AbortController`.

**Recommended Fix:**
Use a ref to track mounted state:

```typescript
const mountedRef = useRef(true);
useEffect(() => () => { mountedRef.current = false; }, []);

// In FileReader onload:
reader.onload = () => {
  if (!mountedRef.current) return;
  // ... set state
};
```

### m-20: `PoolInfo.tokenLabel` Defined as Nested Function (Not Memoized)

**File:** `src/components/Exchange/PoolInfo.tsx` (line 61)
**Category:** Performance

`tokenLabel` is defined as a plain function inside the component body. It is recreated on every render. Since it depends on `assets`, wrap it in `useCallback`.

### m-21: Potential Division by Zero in BigInt Pool Calculations

**Files:**
- `src/components/Exchange/LiquidityPanel.tsx` (line 183-184)
- `src/components/OrbitalAMM/SwapInterface.tsx` (line 148)

While `pool.totalLiquidity === 0n` guards exist for some calculations, the `sharePreview` computation divides by `pool.reserve0` and `pool.reserve1` which could be zero if one side of the pool is fully drained.

### m-22: `selectedTokens.length` in CreatePoolForm Dependency Array

**File:** `src/components/OrbitalAMM/CreatePoolForm.tsx` (line 219)
**Category:** Hook Patterns

The dependency array uses `selectedTokens.length` instead of the full `selectedTokens` array. The ESLint rule expects the full reference. While the intent is correct (only regenerate names when count changes), the suppressed warning hides a potential bug if token order matters.

---

## Summary Statistics

| Category | Critical | Major | Minor | Total |
|---|---|---|---|---|
| Anti-Patterns (God Components, DRY, DOM) | 0 | 8 | 3 | 11 |
| Memory Leaks | 1 | 1 | 3 | 5 |
| Unnecessary Re-renders | 0 | 1 | 2 | 3 |
| Prop Drilling | 0 | 1 | 0 | 1 |
| State Management | 0 | 2 | 0 | 2 |
| Hook Patterns | 0 | 1 | 3 | 4 |
| Error Handling | 2 | 1 | 1 | 4 |
| TypeScript Quality | 2 | 3 | 3 | 8 |
| **Total** | **5** | **18** | **22** | **45** |

### Component Size Analysis

| Component | Lines | Classification |
|---|---|---|
| `PortfolioPage.tsx` | 1,344 | God Component |
| `SignupPage.tsx` | 1,329 | God Component |
| `TradeForm.tsx` | 1,230 | God Component |
| `OrbitalAMM/LiquidityPanel.tsx` | 941 | Large |
| `ExchangePage.tsx` | 870 | God Component |
| `CreatePoolForm.tsx` | 832 | Large |
| `SwapInterface.tsx` | 828 | Large |
| `MintForm.tsx` | 851 | Large |
| `DashboardPage.tsx` | 793 | God Component |
| `Navbar.tsx` | 758 | God Component |
| `Exchange/LiquidityPanel.tsx` | 641 | Large |
| `UserOrders.tsx` | 628 | Large |
| `OrderBook.tsx` | 595 | Moderate |
| `OrbitalAMMPage.tsx` | 599 | Moderate |
| `useWallet.ts` | 547 | Large Hook |
| `FileUploader.tsx` | 483 | Moderate |
| `useAppStore.ts` | 416 | Moderate |
| `TokenSelector.tsx` | 379 | Moderate |
| `PoolList.tsx` | 405 | Moderate |

### Positive Observations

1. **Robust Form Validation** -- LoginPage and MintForm use `react-hook-form` + `zod` for declarative validation, which is an excellent pattern.
2. **Proper Async Cancellation** -- Many components use `cancelled` flags in async effects to prevent state updates after unmount (e.g., LiquidityPanel, OrderBook, TradeForm).
3. **Generation Counter Pattern** -- FileUploader uses a `parseGenerationRef` to detect stale async results, preventing race conditions.
4. **Defense-in-Depth in MintForm** -- Double validation of mint amount (client-side + pre-transaction check) prevents over-minting even if React state is manipulated.
5. **Proper Interval Cleanup** -- OrderBook and UserOrders correctly clean up `setInterval` in useEffect return functions.
6. **Block Explorer Awareness** -- MintForm and MintHistory correctly use `getNetworkMetadata` instead of `getNetworkConfig` so explorer URLs work even on unsupported chains.
7. **Proper TypeScript Usage** -- The codebase consistently uses proper type imports (`import type`), interface definitions, and discriminated union patterns for state machines (e.g., `TxStatus`).
8. **Good Security Practices** -- MintForm validates recipient is not `ethers.ZeroAddress`, checks mint amount against document value, and provides clear error messages for contract reverts.

---

## Recommended Priority Actions

1. **Immediate** -- Fix the `refreshToken` type mismatch (C-1). This is a potential silent failure in production.
2. **Immediate** -- Add granular error boundaries around charts, exchange panels, and route pages (C-2).
3. **Short-term** -- Extract duplicated code (M-6, M-7, M-8, M-9, m-8, m-9, m-10) into shared utilities and hooks.
4. **Short-term** -- Fix the PoolInfo auto-refresh bug (m-14) and ActivityFeed hardcoded etherscan URL (M-16).
5. **Medium-term** -- Decompose god components into smaller, testable units (M-1 through M-5, M-18).
6. **Medium-term** -- Add cleanup for all `setTimeout` calls (M-10) and the FileReader pattern (m-19).
7. **Long-term** -- Introduce React Context for `contractService` to eliminate prop drilling (M-14).
8. **Long-term** -- Normalize Zustand store collections from arrays to maps (M-12).

---

*End of audit report.*
