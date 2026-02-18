# Performance Audit Report -- Fueki Tokenization Platform

**Auditor:** Agent 4 (PerformanceAuditor)
**Date:** 2026-02-16
**Scope:** Full frontend performance audit -- bundle, rendering, network, Web3, assets

---

## 1. Current Metrics (Build Output)

### 1.1 Bundle Sizes (Production Build)

| Chunk | Size (min) | Gzipped | Contents |
|-------|-----------|---------|----------|
| `index-XT4z0Nec.js` | **1,285.54 KB** | 398.81 KB | Main bundle (React, ethers.js, recharts, zustand, router, all eager pages) |
| `pdf-BYpeuycm.js` | 437.17 KB | 129.45 KB | pdfjs-dist core |
| `pdf.worker.min-wgc6bjNh.mjs` | 1,078.61 KB | N/A | PDF.js Web Worker (not gzipped in build output) |
| `index-9LSsVYJM.css` | 171.36 KB | 22.77 KB | All CSS (Tailwind + custom) |
| `schemas-CH1tJe-8.js` | 84.49 KB | 25.50 KB | Zod v4 schemas (react-hook-form/resolvers) |
| `ExchangePage-BwcRSsHe.js` | 85.33 KB | 18.28 KB | Exchange page (lazy) |
| `OrbitalAMMPage-0Gv9zGDH.js` | 88.12 KB | 16.72 KB | Orbital AMM page (lazy) |
| `SignupPage-BI8zM38h.js` | 25.39 KB | 6.49 KB | Signup page (lazy) |
| `index-DglHz0cO.js` | 15.93 KB | 6.90 KB | Shared chunk (Headless UI) |
| `LoginPage-BE8z7-FT.js` | 7.04 KB | 2.37 KB | Login page (lazy) |
| `PendingApprovalPage-Cnq-05lL.js` | 10.44 KB | 2.78 KB | Pending approval (lazy) |

**Total JS:** ~3,119 KB raw / ~608 KB gzipped
**Total CSS:** 171.36 KB raw / 22.77 KB gzipped

### 1.2 Estimated Load Times

| Metric | 3G (1.5 Mbps) | 4G (10 Mbps) | Broadband (50 Mbps) |
|--------|--------------|--------------|---------------------|
| Main JS (gzipped) | ~2.1s | ~0.32s | ~0.06s |
| Total JS (gzipped) | ~3.2s | ~0.49s | ~0.10s |
| CSS (gzipped) | ~0.12s | ~0.02s | ~0.004s |
| Time to Interactive (est.) | ~5-7s | ~1-2s | ~0.5-1s |

### 1.3 Chunk Count

- **Total chunks:** 13 (11 JS + 1 CSS + 1 Worker)
- **Lazy-loaded chunks:** 5 (Exchange, OrbitalAMM, Login, Signup, PendingApproval)
- **Critical path chunks:** 3 (main index.js, CSS, worker)

---

## 2. Critical Bottlenecks

### CRITICAL-01: Monolithic Main Bundle (1,285 KB)

**Impact:** HIGH -- This single chunk accounts for 77% of all JS. It blocks first paint and interactivity.

**Root cause:** The main `index.js` chunk contains all of the following bundled together:
- **ethers.js** (~400 KB minified) -- imported in 15 files across the codebase
- **recharts** (~200 KB minified) -- imported by DashboardPage (eager-loaded)
- **React + React DOM** (~140 KB minified)
- **react-router-dom** (~30 KB)
- **react-hook-form + zod** -- partially in main, partially in schemas chunk
- **All 7 ABI JSON files** imported statically in `contracts.ts`
- **3 eagerly loaded pages:** DashboardPage, MintPage, PortfolioPage
- **All Common components, parsers, hooks, stores**

**Affected files:**
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/App.tsx` (lines 9-11: eager imports)
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/vite.config.ts` (no `manualChunks` config)
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/lib/blockchain/contracts.ts` (lines 11-17: 7 static ABI imports)

### CRITICAL-02: Sequential RPC Calls in Dashboard (N+1 Problem)

**Impact:** HIGH -- DashboardPage makes O(n) sequential RPC calls per asset, plus additional event queries with `getBlock()` calls for each trade event.

**Affected file:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/DashboardPage.tsx`

The dashboard data fetching (lines 291-466) executes:
1. `getTotalAssets()` -- 1 RPC call
2. `getUserAssets(address)` -- 1 RPC call
3. For each asset: `getAssetDetails()` + `getAssetBalance()` -- 2 RPC calls per asset (parallel within group, good)
4. `getExchangeUserOrders()` + `getExchangeFilledOrderIds()` -- 2 RPC calls
5. For each order: `getExchangeOrder()` -- 1 RPC call per order
6. `queryFilter(takerFilter)` -- 1 RPC call (unbounded range)
7. `queryFilter(makerFilter)` -- 1 RPC call (unbounded range)
8. `queryFilter(OrderFilled())` -- 1 RPC call (ALL events, unfiltered)
9. **For each fill event: `log.getBlock()`** -- 1 RPC call PER event (line 437)

The `getBlock()` call per event is the most severe: with 50 trade events, this adds 50 sequential RPC calls just to get timestamps.

### CRITICAL-03: Recharts in Critical Path

**Impact:** MEDIUM-HIGH -- Recharts (~200 KB) is bundled into the main chunk because `DashboardPage` is eagerly loaded and imports `PortfolioChart` and `ValueChart` which use recharts.

**Affected files:**
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/DashboardPage.tsx` (lines 28-30)
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/components/Dashboard/PortfolioChart.tsx`
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/components/Dashboard/ValueChart.tsx`

---

## 3. Detailed Findings

### 3.1 Bundle Analysis

#### PERF-01: No Manual Chunk Splitting Configuration

**Severity:** Critical
**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/vite.config.ts`

The Vite config has zero `rollupOptions.output.manualChunks` configuration. Vite's default splitting only separates dynamic imports and node_modules, resulting in a massive single vendor chunk.

**Current code:**
```typescript
build: {
  target: 'es2020',
  sourcemap: true,
},
```

**Fix:**
```typescript
build: {
  target: 'es2020',
  sourcemap: true,
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-react': ['react', 'react-dom', 'react-router-dom'],
        'vendor-ethers': ['ethers'],
        'vendor-recharts': ['recharts'],
        'vendor-forms': ['react-hook-form', '@hookform/resolvers', 'zod'],
        'vendor-ui': ['@headlessui/react', 'lucide-react', 'clsx'],
        'vendor-parsers': ['papaparse', 'fast-xml-parser'],
      },
    },
  },
},
```

**Estimated impact:** Reduces main chunk from 1,285 KB to ~200 KB. Enables parallel downloads and better caching (vendor chunks change rarely).

#### PERF-02: Eager Loading of Dashboard, Mint, and Portfolio Pages

**Severity:** High
**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/App.tsx` (lines 9-11)

Three pages are statically imported, pulling their full dependency trees into the main bundle:

```typescript
// Eager-load the core pages (small, always used)
import DashboardPage from './pages/DashboardPage'
import MintPage from './pages/MintPage'
import PortfolioPage from './pages/PortfolioPage'
```

These pages are not "small" -- DashboardPage alone pulls in recharts (~200 KB), ethers (already in main), and all chart components.

**Fix:**
```typescript
// Lazy-load ALL pages -- the login/auth flow means users see auth pages first
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const MintPage = lazy(() => import('./pages/MintPage'))
const PortfolioPage = lazy(() => import('./pages/PortfolioPage'))
```

And update the routes:
```tsx
<Route path="dashboard" element={<Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>} />
<Route path="mint" element={<Suspense fallback={<PageLoader />}><MintPage /></Suspense>} />
<Route path="portfolio" element={<Suspense fallback={<PageLoader />}><PortfolioPage /></Suspense>} />
```

**Estimated impact:** Removes ~400-500 KB from the critical path. Dashboard chart components only load when the user navigates to the dashboard.

#### PERF-03: Tesseract.js in the Bundle Graph (~7 MB uncompressed)

**Severity:** Medium
**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/lib/parsers/imageParser.ts`

While Tesseract.js is dynamically imported (good), it is still listed as a production dependency, meaning Vite includes it in the module graph. The lazy import is correct, but the WASM + language data files will be fetched at runtime. The issue is that `tesseract.js` v7 includes its worker and WASM inline by default, adding considerable bundle analysis time and potential inclusion in the chunking graph.

**Fix:** Consider moving Tesseract.js to load from a CDN at runtime, or use `@aspect-build/rules_js`-style externalization:

```typescript
// vite.config.ts -- externalize tesseract worker assets
build: {
  rollupOptions: {
    external: ['tesseract.js/dist/worker.min.js'],
  },
},
```

Or better, lazy-load via a separate entry point that only executes when the user uploads an image file, which is already partially done.

#### PERF-04: Sourcemaps Enabled in Production

**Severity:** Low-Medium
**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/vite.config.ts` (line 17)

```typescript
sourcemap: true,
```

The build output shows source maps totaling over 8 MB (`index-XT4z0Nec.js.map` is 5,618 KB alone). While these do not affect download size for end users (browsers only fetch maps when DevTools are open), they increase build time by ~30-40% and CI artifact size.

**Fix:**
```typescript
sourcemap: process.env.NODE_ENV === 'development' ? true : 'hidden',
```

Use `'hidden'` for production to generate maps for error reporting tools (Sentry) without serving them to clients.

### 3.2 Code Splitting

#### PERF-05: Charts Not Code-Split from DashboardPage

**Severity:** High
**Files:**
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/DashboardPage.tsx` (lines 28-30)
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/components/Dashboard/PortfolioChart.tsx`
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/components/Dashboard/ValueChart.tsx`

Both chart components are statically imported. Since DashboardPage is also eagerly loaded (PERF-02), recharts ends up in the main bundle.

**Fix (if DashboardPage must stay eager):**
```typescript
import { lazy, Suspense } from 'react';

const PortfolioChart = lazy(() => import('../components/Dashboard/PortfolioChart'));
const ValueChart = lazy(() => import('../components/Dashboard/ValueChart'));

// In JSX:
<Suspense fallback={<div className="h-[300px] shimmer rounded-2xl" />}>
  <PortfolioChart assets={wrappedAssets} />
</Suspense>
<Suspense fallback={<div className="h-[320px] shimmer rounded-2xl" />}>
  <ValueChart tradeHistory={tradeHistory} />
</Suspense>
```

**Estimated impact:** Removes ~200 KB (recharts) from the initial bundle.

#### PERF-06: Static Import of All ABI Files

**Severity:** Medium
**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/lib/blockchain/contracts.ts` (lines 11-17)

Seven ABI JSON files are statically imported at the top of `contracts.ts`:

```typescript
import WrappedAssetABI from '../../contracts/abis/WrappedAsset.json';
import WrappedAssetFactoryABI from '../../contracts/abis/WrappedAssetFactory.json';
import AssetExchangeABI from '../../contracts/abis/AssetExchange.json';
import SecurityTokenFactoryABI from '../../contracts/abis/SecurityTokenFactory.json';
import SecurityTokenABI from '../../contracts/abis/SecurityToken.json';
import AssetBackedExchangeABI from '../../contracts/abis/AssetBackedExchange.json';
import LiquidityPoolAMMABI from '../../contracts/abis/LiquidityPoolAMM.json';
```

Since `contracts.ts` is imported by many components, all seven ABIs end up in the main bundle regardless of whether the user interacts with those specific contracts.

**Fix:** Use human-readable ABI fragments instead of full compiled ABI JSON. ethers.js v6 supports this:

```typescript
const WRAPPED_ASSET_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address, uint256) returns (bool)',
  'function approve(address, uint256) returns (bool)',
  'function allowance(address, address) view returns (uint256)',
  'function burn(uint256)',
  'function documentHash() view returns (bytes32)',
  'function documentType() view returns (string)',
  'function originalValue() view returns (uint256)',
] as const;
```

This eliminates the JSON import overhead entirely and is more tree-shakeable.

**Estimated impact:** Reduces ABI data in the main bundle by 50-80 KB depending on ABI sizes.

### 3.3 Render Performance

#### PERF-07: Non-Granular Zustand Store Selectors

**Severity:** Medium
**Files:**
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/MintPage.tsx` (line 220)
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/ExchangePage.tsx` (line 114)
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/OrbitalAMMPage.tsx` (line 110)
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/hooks/useWallet.ts` (line 137)
- Multiple Navbar instances (lines 180, 214, 323)

Several components destructure the entire store or large slices:

```typescript
// MintPage.tsx:220 -- subscribes to ALL store changes
const { currentDocument, tradeHistory } = useAppStore();

// ExchangePage.tsx:114
const { wallet, wrappedAssets, setAssets, setLoadingAssets } = useAppStore();

// useWallet.ts:137
const { wallet, setWallet, setProvider, setSigner, resetWallet } = useAppStore();
```

When any part of the store changes (e.g., a notification is added), these components re-render even if their subscribed slices have not changed. Zustand's `useAppStore()` without a selector creates a subscription to the entire store.

**Fix:** Use individual selectors for each piece of state:

```typescript
// MintPage.tsx -- BEFORE:
const { currentDocument, tradeHistory } = useAppStore();

// AFTER:
const currentDocument = useAppStore((s) => s.currentDocument);
const tradeHistory = useAppStore((s) => s.tradeHistory);
```

```typescript
// useWallet.ts -- BEFORE:
const { wallet, setWallet, setProvider, setSigner, resetWallet } = useAppStore();

// AFTER:
const wallet = useAppStore((s) => s.wallet);
const setWallet = useAppStore((s) => s.setWallet);
const setProvider = useAppStore((s) => s.setProvider);
const setSigner = useAppStore((s) => s.setSigner);
const resetWallet = useAppStore((s) => s.resetWallet);
```

For the Navbar, which renders in every page, this is particularly important. Three instances of `useAppStore()` without selectors means the navbar re-renders on every store update.

**Estimated impact:** Prevents 5-20 unnecessary re-renders per store update across the app. Most impactful on the Navbar and Layout components.

#### PERF-08: Portfolio Page Asset List Without Virtualization

**Severity:** Low-Medium (scales with user asset count)
**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/PortfolioPage.tsx` (lines 854-1040)

The asset grid renders all filtered assets without virtualization:

```typescript
{filteredAssets.map((asset) => {
  // ~170 lines of JSX per asset card
})}
```

Each asset card is ~170 lines of JSX with multiple computed values, event handlers, and conditional rendering. With 50+ assets, this creates significant DOM weight.

**Fix:** For >20 assets, use `react-window` or `@tanstack/virtual`:

```typescript
import { FixedSizeGrid } from 'react-window';

// Only render visible items
<FixedSizeGrid
  columnCount={viewMode === 'grid' ? 3 : 1}
  rowCount={Math.ceil(filteredAssets.length / (viewMode === 'grid' ? 3 : 1))}
  columnWidth={columnWidth}
  rowHeight={380}
  height={800}
  width={containerWidth}
>
  {({ columnIndex, rowIndex, style }) => {
    const index = rowIndex * columns + columnIndex;
    if (index >= filteredAssets.length) return null;
    return <AssetCard asset={filteredAssets[index]} style={style} />;
  }}
</FixedSizeGrid>
```

#### PERF-09: Inline `<style>` Tag with CSS Animations in DashboardPage

**Severity:** Low
**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/DashboardPage.tsx` (lines 592-612)

The DashboardPage embeds a `<style>` tag with keyframe animations directly in JSX:

```tsx
<style>{`
  @keyframes drift-1 { ... }
  @keyframes drift-2 { ... }
  @keyframes drift-3 { ... }
  @keyframes grid-shift { ... }
`}</style>
```

This creates a new style element on every render, and the animations trigger layout calculations via `transform` with `scale()` on large gradient divs with `blur-[120px]`. The combination of large blurred elements + continuous CSS animations can cause GPU memory pressure and increased composite layer count.

**Fix:** Move to the global CSS file (`index.css`) and use `will-change: transform` on the animated elements:

```css
/* In index.css */
@keyframes drift-1 { ... }
.gradient-blob-1 {
  will-change: transform;
  animation: drift-1 20s ease-in-out infinite;
}
```

### 3.4 Network Performance

#### PERF-10: Sequential `getBlock()` Calls in Trade History Fetching

**Severity:** Critical
**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/DashboardPage.tsx` (lines 425-440)

```typescript
for (const evt of [...takerFillEvents, ...makerFillEvents]) {
  const log = evt as ethers.EventLog;
  // ...
  const block = await log.getBlock(); // ONE RPC CALL PER EVENT
  const timestampMs = block ? block.timestamp * 1000 : Date.now();
}
```

This is a sequential loop where each iteration awaits an RPC call. With 20 fill events, this adds 20 sequential `eth_getBlockByHash` calls, each with ~100-300ms latency on public RPCs.

**Fix:** Batch all block fetches in parallel and deduplicate by block number:

```typescript
// Collect unique block numbers
const blockNumbers = new Set<number>();
for (const evt of [...takerFillEvents, ...makerFillEvents]) {
  blockNumbers.add(evt.blockNumber);
}

// Fetch all blocks in parallel
const blockMap = new Map<number, ethers.Block>();
await Promise.all(
  Array.from(blockNumbers).map(async (blockNum) => {
    const block = await provider.getBlock(blockNum);
    if (block) blockMap.set(blockNum, block);
  }),
);

// Use cached block data
for (const evt of [...takerFillEvents, ...makerFillEvents]) {
  const block = blockMap.get(evt.blockNumber);
  const timestampMs = block ? block.timestamp * 1000 : Date.now();
  // ...
}
```

**Estimated impact:** Reduces 20 sequential RPCs (~4-6s) to ~1-2 parallel batches (~300-600ms).

#### PERF-11: Unfiltered `queryFilter(OrderFilled())` Fetches ALL Events

**Severity:** High
**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/DashboardPage.tsx` (lines 413-418)

```typescript
// Get OrderFilled events for the user's maker orders
const allFillEvents = makerOrderIds.size > 0
  ? await exchange.queryFilter(exchange.filters.OrderFilled())
  : [];
```

This queries ALL `OrderFilled` events on the entire exchange contract with no block range limit. On a busy exchange, this could return thousands of events, consuming significant RPC quota and bandwidth.

**Fix:** Filter by order ID on-chain if possible, or add a block range:

```typescript
const provider = exchange.runner?.provider;
const latestBlock = provider ? await provider.getBlockNumber() : undefined;
const fromBlock = latestBlock ? Math.max(0, latestBlock - 50_000) : 0;

// Query per maker order ID instead of fetching all events
const makerFillEvents: ethers.EventLog[] = [];
await Promise.all(
  Array.from(makerOrderIds).map(async (orderId) => {
    const filter = exchange.filters.OrderFilled(BigInt(orderId));
    const events = await exchange.queryFilter(filter, fromBlock);
    makerFillEvents.push(...(events as ethers.EventLog[]));
  }),
);
```

#### PERF-12: Duplicate Asset Fetching Across Pages

**Severity:** Medium
**Files:**
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/DashboardPage.tsx` (lines 291-352)
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/PortfolioPage.tsx` (lines 200-234)
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/ExchangePage.tsx` (lines 177-259)

All three pages independently fetch the same asset data on mount. When a user navigates Dashboard -> Portfolio -> Exchange, the identical `getUserAssets() -> getAssetDetails() -> getAssetBalance()` chain executes three times.

**Fix:** Create a shared `useAssets` hook or middleware that caches results in the Zustand store with a TTL:

```typescript
// hooks/useAssets.ts
const CACHE_TTL = 30_000; // 30 seconds
let lastFetchTime = 0;

export function useAssets() {
  const wrappedAssets = useAppStore((s) => s.wrappedAssets);
  const setAssets = useAppStore((s) => s.setAssets);
  const isLoading = useAppStore((s) => s.isLoadingAssets);

  const fetchIfStale = useCallback(async () => {
    if (Date.now() - lastFetchTime < CACHE_TTL && wrappedAssets.length > 0) {
      return; // Cache still fresh
    }
    lastFetchTime = Date.now();
    // ... fetch logic
  }, [/* deps */]);

  useEffect(() => { void fetchIfStale(); }, [fetchIfStale]);
  return { assets: wrappedAssets, isLoading, refresh: fetchIfStale };
}
```

#### PERF-13: No API Response Caching or Request Deduplication

**Severity:** Medium
**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/lib/api/client.ts`

The Axios client has no caching layer. Every API call (auth profile, KYC status) creates a fresh network request. The auth `initialize()` function in `authStore.ts` can make 2-3 API calls on every page load (profile + potential refresh).

**Fix:** Add a simple request deduplication layer:

```typescript
const pendingRequests = new Map<string, Promise<unknown>>();

apiClient.interceptors.request.use((config) => {
  // Only deduplicate GET requests
  if (config.method?.toLowerCase() === 'get') {
    const key = `${config.method}:${config.url}`;
    const pending = pendingRequests.get(key);
    if (pending) {
      config.adapter = () => pending as Promise<any>;
    }
  }
  return config;
});
```

### 3.5 Asset Optimization

#### PERF-14: Render-Blocking Google Fonts Import

**Severity:** Medium
**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/index.css` (line 1)

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
```

This `@import` in CSS is render-blocking. The browser must:
1. Download the CSS file
2. Parse it and discover the `@import`
3. Make a second request to Google Fonts
4. Download the font CSS
5. Discover and download the actual font files

This creates a 3-request waterfall chain that blocks text rendering.

**Fix:** Use `<link rel="preconnect">` and `<link rel="preload">` in `index.html`:

```html
<!-- index.html -->
<head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link
    rel="preload"
    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
    as="style"
    onload="this.onload=null;this.rel='stylesheet'"
  />
  <noscript>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  </noscript>
</head>
```

Also, note the current import loads 7 font weights (300-900). The codebase only uses `font-medium` (500), `font-semibold` (600), `font-bold` (700), and `font-extrabold` (800) in practice. Reducing to 4 weights saves ~100-200 KB of font data.

**Remove from index.css:**
```css
/* DELETE THIS LINE */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
```

**Estimated impact:** Eliminates 200-400ms of render-blocking time on first load. Reduces font download by ~40%.

#### PERF-15: Large CSS File with Unused Light Mode Overrides

**Severity:** Low
**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/index.css`

The CSS file is 171.36 KB (22.77 KB gzipped). A significant portion (~500 lines, sections 28-29) is light mode overrides using `[data-theme="light"]`. If most users use dark mode (which is the default), this CSS is downloaded but rarely applied.

**Fix:** Split light mode CSS into a separate file loaded conditionally:

```typescript
// In ThemeToggle.tsx or theme initialization
if (theme === 'light') {
  import('./light-theme.css');
}
```

### 3.6 State Management

#### PERF-16: Monolithic Store with All Slices Combined

**Severity:** Medium
**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/store/useAppStore.ts`

The store combines 7 slices (Wallet, Documents, Assets, SecurityTokens, Trades, Exchange, UI) into a single Zustand store with 416 lines. Every `set()` call triggers a re-evaluation of all selectors subscribed to the store. While Zustand uses shallow comparison by default for individual selectors, the non-selector pattern `useAppStore()` (destructuring) is used in 11 locations.

**Fix:** Either enforce selector usage everywhere (see PERF-07) or split into separate stores:

```typescript
// store/walletStore.ts
export const useWalletStore = create<WalletStore>()((set) => ({ ... }));

// store/assetsStore.ts
export const useAssetsStore = create<AssetsStore>()((set) => ({ ... }));

// store/uiStore.ts
export const useUIStore = create<UIStore>()((set) => ({ ... }));
```

This ensures that UI changes (notifications, modal state) never trigger re-renders in asset-heavy components.

### 3.7 Web3 Specific

#### PERF-17: No RPC Call Batching

**Severity:** Medium
**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/lib/blockchain/contracts.ts`

The `ContractService` creates separate RPC calls for each contract interaction. ethers.js v6 does not batch JSON-RPC calls by default. For example, `getAssetDetails()` makes 6 parallel calls, each as a separate HTTP request:

```typescript
const [name, symbol, totalSupply, documentHash, documentType, originalValue] =
  await Promise.all([
    asset.name(),
    asset.symbol(),
    asset.totalSupply(),
    asset.documentHash(),
    asset.documentType(),
    asset.originalValue(),
  ]);
```

While these are parallelized with `Promise.all` (good), each is a separate HTTP request. With HTTP/2, this is tolerable. With HTTP/1.1, 6 requests compete for 6 connection slots.

**Fix:** Use ethers.js `JsonRpcProvider` with `staticNetwork` for read operations, or use a Multicall contract:

```typescript
import { Contract as MulticallContract } from 'ethers-multicall';

// Batch all reads into a single RPC call
const multicall = new MulticallProvider(this.provider);
const assetMulticall = new MulticallContract(assetAddress, WrappedAssetABI);
const [name, symbol, totalSupply, documentHash, documentType, originalValue] =
  await multicall.all([
    assetMulticall.name(),
    assetMulticall.symbol(),
    assetMulticall.totalSupply(),
    assetMulticall.documentHash(),
    assetMulticall.documentType(),
    assetMulticall.originalValue(),
  ]);
```

**Estimated impact:** Reduces 6 HTTP requests to 1. For 10 assets, reduces 60 requests to 10.

#### PERF-18: Unbounded Event Log Queries

**Severity:** Medium-High
**Files:**
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/DashboardPage.tsx` (lines 402-419)
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/lib/blockchain/contracts.ts` (lines 614-626, getUserOrders)

Several event log queries use no block range restriction:

```typescript
// DashboardPage.tsx -- no fromBlock
const takerFilter = exchange.filters.OrderFilled(null, address);
const takerFillEvents = await exchange.queryFilter(takerFilter);
// Scans ALL blocks from genesis
```

Public RPCs (Infura, Alchemy, Ankr) typically limit `eth_getLogs` to 10,000-100,000 blocks per query and may return errors or truncated results for unbounded queries.

Note: `getExchangeFilledOrderIds()` in `contracts.ts` (line 880) correctly limits to 50,000 blocks. This pattern should be applied consistently.

**Fix:** Always provide a fromBlock parameter:

```typescript
const provider = exchange.runner?.provider as ethers.Provider;
const latestBlock = await provider.getBlockNumber();
const fromBlock = Math.max(0, latestBlock - 50_000);

const takerFillEvents = await exchange.queryFilter(takerFilter, fromBlock);
const makerEvents = await exchange.queryFilter(makerFilter, fromBlock);
```

#### PERF-19: ContractService Instance Recreated on Every Render Cycle

**Severity:** Low-Medium
**Files:**
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/ExchangePage.tsx` (lines 147-166)
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/OrbitalAMMPage.tsx` (lines 130-149)

Both pages create a new `ContractService` in a `useEffect` whenever `isConnected` or `wallet.chainId` changes. The service is stored in `useState`, which is correct. However, the contract instances created by getters like `getFactoryContract()` are not cached -- a new `ethers.Contract` object is created on every call.

**Fix:** Cache contract instances within `ContractService`:

```typescript
private contractCache = new Map<string, ethers.Contract>();

getFactoryContract(signerOrProvider?: ethers.Signer | ethers.Provider): ethers.Contract {
  const key = `factory-${signerOrProvider ? 'signer' : 'provider'}`;
  if (!signerOrProvider && this.contractCache.has(key)) {
    return this.contractCache.get(key)!;
  }
  const config = getNetworkConfig(this.chainId);
  if (!config || !config.factoryAddress) {
    throw new Error(`Factory not deployed on chain ${this.chainId}`);
  }
  const contract = new ethers.Contract(
    config.factoryAddress,
    WrappedAssetFactoryABI,
    signerOrProvider || this.provider,
  );
  if (!signerOrProvider) this.contractCache.set(key, contract);
  return contract;
}
```

### 3.8 CSS Delivery

#### PERF-20: Excessive CSS Custom Properties and Utility Definitions

**Severity:** Low
**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/index.css`

The CSS file defines a comprehensive design system (1,553 lines) with many utility classes (.glass, .glass-hover, .gradient-text, etc.) that may overlap with or duplicate Tailwind utilities already in use. The light mode section alone adds ~450 lines of overrides.

This is not a critical issue, but at 171 KB raw CSS, there may be opportunities to reduce by:
1. Removing unused custom utility classes if covered by Tailwind
2. Using Tailwind's `@layer` system to avoid specificity conflicts
3. Leveraging Tailwind's dark mode variant instead of `[data-theme="light"]` attribute selectors

---

## 4. Optimization Roadmap

Prioritized by **impact / effort** ratio. Each item is tagged with estimated bundle/performance impact and implementation effort.

### Phase 1: Quick Wins (1-2 days)

| # | Fix | Impact | Effort | Files |
|---|-----|--------|--------|-------|
| 1 | **PERF-01:** Add `manualChunks` to Vite config | Main chunk -60% (1,285->~500 KB) | 30 min | `vite.config.ts` |
| 2 | **PERF-02:** Lazy-load Dashboard, Mint, Portfolio pages | Critical path -400 KB | 15 min | `App.tsx` |
| 3 | **PERF-14:** Fix render-blocking font import, reduce weights | FCP -200-400ms | 30 min | `index.css`, `index.html` |
| 4 | **PERF-07:** Add granular Zustand selectors everywhere | Prevents ~50% of unnecessary re-renders | 45 min | 11 component files |
| 5 | **PERF-04:** Sourcemap strategy for production | Build time -30% | 5 min | `vite.config.ts` |

### Phase 2: Network Optimization (2-3 days)

| # | Fix | Impact | Effort | Files |
|---|-----|--------|--------|-------|
| 6 | **PERF-10:** Batch `getBlock()` calls | Trade fetch -80% time (~5s -> ~0.5s) | 1 hr | `DashboardPage.tsx` |
| 7 | **PERF-11:** Add block range to all `queryFilter()` calls | Prevents RPC errors/timeouts | 1 hr | `DashboardPage.tsx`, `contracts.ts` |
| 8 | **PERF-12:** Shared `useAssets` hook with caching | Eliminates 2x duplicate fetch chains | 2 hr | New hook + 3 pages |
| 9 | **PERF-05:** Lazy-load chart components | Removes recharts from critical path | 30 min | `DashboardPage.tsx` |

### Phase 3: Architecture Improvements (3-5 days)

| # | Fix | Impact | Effort | Files |
|---|-----|--------|--------|-------|
| 10 | **PERF-06:** Replace ABI JSON imports with human-readable ABIs | Main chunk -50-80 KB | 3 hr | `contracts.ts`, `orbitalContracts.ts` |
| 11 | **PERF-17:** Add Multicall batching for contract reads | 6x fewer HTTP requests per asset | 4 hr | `contracts.ts` |
| 12 | **PERF-16:** Split Zustand store into domain stores | Architectural improvement | 4 hr | Store files + consumers |
| 13 | **PERF-13:** Add request deduplication to API client | Prevents duplicate auth calls | 1 hr | `client.ts` |
| 14 | **PERF-19:** Cache contract instances in ContractService | Fewer object allocations | 1 hr | `contracts.ts` |

### Phase 4: Polish (optional, diminishing returns)

| # | Fix | Impact | Effort | Files |
|---|-----|--------|--------|-------|
| 15 | **PERF-08:** Virtualize portfolio asset list | Only matters with 50+ assets | 3 hr | `PortfolioPage.tsx` |
| 16 | **PERF-09:** Move inline `<style>` to global CSS | Minor GPU improvement | 15 min | `DashboardPage.tsx`, `index.css` |
| 17 | **PERF-15:** Split light mode CSS | Saves ~5 KB gzipped | 2 hr | `index.css` |
| 18 | **PERF-20:** Audit CSS utility overlap with Tailwind | Minor CSS reduction | 2 hr | `index.css` |

---

## 5. Expected Outcomes After Phase 1+2

| Metric | Current | After Optimization |
|--------|---------|-------------------|
| Main bundle (gzipped) | 398.81 KB | ~120-150 KB |
| Total JS (gzipped) | ~608 KB | ~608 KB (same total, better split) |
| Critical path JS | 398.81 KB | ~120 KB |
| Time to Interactive (4G) | ~1-2s | ~0.5-0.8s |
| Dashboard data fetch time | ~5-8s (20 assets, 20 events) | ~1-2s |
| Unnecessary re-renders | ~5-20 per store update | ~0-2 per store update |
| Lighthouse Performance Score (est.) | ~55-65 | ~80-90 |

---

## 6. Summary of All Issues

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| PERF-01 | Critical | Bundle | No manual chunk splitting -- 1,285 KB monolith |
| PERF-02 | High | Code Splitting | 3 pages eagerly loaded pull recharts/ethers into main |
| PERF-03 | High | Bundle | Recharts in critical path via eager DashboardPage |
| PERF-04 | Low-Med | Build | Sourcemaps enabled in production |
| PERF-05 | High | Code Splitting | Charts not lazily loaded from DashboardPage |
| PERF-06 | Medium | Bundle | 7 full ABI JSONs statically imported |
| PERF-07 | Medium | Rendering | Non-granular Zustand selectors in 11 locations |
| PERF-08 | Low-Med | Rendering | No list virtualization for portfolio assets |
| PERF-09 | Low | Rendering | Inline style tag re-created on render |
| PERF-10 | Critical | Network | Sequential getBlock() per trade event |
| PERF-11 | High | Network | Unfiltered queryFilter fetches all exchange events |
| PERF-12 | Medium | Network | Duplicate asset fetching across 3 pages |
| PERF-13 | Medium | Network | No API response caching or request dedup |
| PERF-14 | Medium | Assets | Render-blocking Google Fonts @import |
| PERF-15 | Low | Assets | Large CSS with unused light mode overrides |
| PERF-16 | Medium | State | Monolithic store triggers broad re-renders |
| PERF-17 | Medium | Web3 | No RPC call batching (Multicall) |
| PERF-18 | Med-High | Web3 | Unbounded event log queries |
| PERF-19 | Low-Med | Web3 | Contract instances not cached |
| PERF-20 | Low | CSS | CSS utility overlap with Tailwind |

**Critical issues:** 2 (PERF-01, PERF-10)
**High issues:** 4 (PERF-02, PERF-03, PERF-05, PERF-11)
**Medium issues:** 8
**Low issues:** 6

---

*End of Performance Audit Report*
