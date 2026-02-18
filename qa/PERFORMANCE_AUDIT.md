# Performance Audit Report -- Fueki Tokenization Platform

**Date:** 2026-02-17
**Auditor:** PERFORMANCE-OPTIMIZER (Claude Opus 4.6)
**Scope:** Full frontend profiling and optimization at `/Users/apple/Documents/GitHub/fueki-tokenization-platform/`

---

## Executive Summary

The Fueki tokenization platform has a solid foundation -- lazy-loaded routes, Multicall3 batching for on-chain reads, Zustand stores with fine-grained selectors, and `@tanstack/react-virtual` for the portfolio grid. However, several high-impact opportunities remain around bundle splitting, RPC caching, sequential network calls, rendering inefficiency, and polling strategy.

**Estimated cumulative impact:** 40-55% reduction in initial load time, 60-70% reduction in RPC calls during idle polling, measurably smoother UI interactions.

---

## 1. BUNDLE SIZE

### Current State

Production build output (from `dist/assets/`):

| Chunk | Size | Notes |
|---|---|---|
| `index-DYYiws6q.js` (vendor) | **748 KB** | Main vendor bundle -- ethers, react, react-router, zustand, etc. |
| `AreaChart-DeN2bO7F.js` | **356 KB** | recharts AreaChart tree-shaken chunk |
| `ExchangePage-Cqdavokj.js` | **296 KB** | Exchange page + all Exchange sub-components |
| `PortfolioPage-C1mXqePX.js` | **127 KB** | Portfolio page + sub-components |
| `MintPage-DWkmfQgR.js` | **117 KB** | Mint page (includes parser imports) |
| `OrbitalAMMPage-C-GP2I8E.js` | **76 KB** | Orbital AMM |
| `index-BNGS7RUG.css` | **188 KB** | Tailwind CSS |

**Total JavaScript:** ~1.9 MB uncompressed across all chunks.

### Finding 1.1 -- CRITICAL: `ethers` dominates the vendor bundle

The `ethers` library (v6.16.0) contributes approximately 400-500 KB to the 748 KB vendor bundle. This is loaded on *every* page, including public pages like `/explore` and auth pages that do not interact with the blockchain.

**Fix:** Configure Vite to split `ethers` into its own chunk and load it only when blockchain features are needed.

```typescript
// vite.config.ts -- add manual chunks
build: {
  target: 'es2020',
  sourcemap: false,
  rollupOptions: {
    output: {
      manualChunks: {
        'ethers': ['ethers'],
        'recharts': ['recharts'],
        'lightweight-charts': ['lightweight-charts'],
      },
    },
  },
},
```

**Impact:** Auth pages (login, signup, forgot-password, reset-password) and the explore page load ~400 KB less JavaScript. These are the highest-traffic entry points for new users.

### Finding 1.2 -- HIGH: `recharts` creates a 356 KB chunk even with tree shaking

The `AreaChart` import pulls in the full recharts rendering pipeline. recharts v3 is inherently heavy because it bundles d3 math modules.

**Fix:** For the two charts that use recharts (`PortfolioValueChart.tsx`, `AssetAllocationChart.tsx`), the library is already lazy-loaded through page-level code splitting. However, the 356 KB chunk should be further isolated:

```typescript
// vite.config.ts -- already handled by manualChunks above
// Additional optimization: the 'recharts' manual chunk ensures it is
// loaded only when DashboardPage or PortfolioPage mount.
```

**Long-term:** Consider migrating from recharts to `lightweight-charts` (already in the bundle at ~80 KB) for all chart visualizations, eliminating the recharts dependency entirely.

### Finding 1.3 -- MEDIUM: `tesseract.js` and `pdfjs-dist` are properly lazy-loaded

Both `pdfParser.ts` and `imageParser.ts` use dynamic `import()` to lazy-load their heavy dependencies (`pdfjs-dist` at ~624 KB, `tesseract.js` at ~7 MB WASM). This is correct and no change is needed.

### Finding 1.4 -- MEDIUM: `lucide-react` icon imports are individually tree-shaken

The codebase imports individual icons (e.g., `import { ArrowLeftRight } from 'lucide-react'`), which tree-shakes correctly. Each icon appears as a tiny separate chunk (~100-600 bytes). This is good practice.

### Finding 1.5 -- LOW: `@datadog/browser-rum` and `@datadog/browser-logs` in production

These two packages add monitoring overhead. Ensure they are conditionally loaded only in production:

```typescript
// Wrap Datadog initialization in an environment check
if (import.meta.env.PROD) {
  const { datadogRum } = await import('@datadog/browser-rum');
  datadogRum.init({ /* ... */ });
}
```

### Finding 1.6 -- LOW: CSS bundle is 188 KB

Tailwind v4 with `@tailwindcss/vite` should purge unused utilities. At 188 KB the CSS is slightly large, suggesting some one-off utility strings might be preventing full purging. No immediate action required unless CSS becomes a bottleneck.

---

## 2. LAZY LOADING

### Current State

All page-level routes in `src/App.tsx` use `React.lazy()` via a custom `lazyWithRetry()` wrapper. This is **excellent**. Every page is code-split.

### Finding 2.1 -- GOOD: All pages are lazy-loaded with retry logic

The `lazyWithRetry()` pattern in `src/App.tsx` handles stale chunk errors gracefully by reloading the page. This is a production-ready pattern.

### Finding 2.2 -- MEDIUM: Heavy sub-components within pages are NOT lazy-loaded

Several Exchange page sub-components are statically imported despite being conditionally rendered:

File: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/ExchangePage.tsx` (lines 24-31)
```typescript
import OrderBook from '../components/Exchange/OrderBook';
import TradeForm from '../components/Exchange/TradeForm';
import UserOrders from '../components/Exchange/UserOrders';
import TokenSelector from '../components/Exchange/TokenSelector';
import LiquidityPanel from '../components/Exchange/LiquidityPanel';
import PoolInfo from '../components/Exchange/PoolInfo';
import TradingViewChart from '../components/Exchange/TradingViewChart';
```

The `TradingViewChart` component imports `lightweight-charts` (~80 KB). It should be lazy-loaded since it is only shown when both tokens are selected AND assets exist.

**Fix:**
```typescript
// In ExchangePage.tsx, replace static import:
const TradingViewChart = lazy(() => import('../components/Exchange/TradingViewChart'));

// Wrap usage in Suspense:
<Suspense fallback={<div className="h-[400px] animate-pulse bg-white/[0.02] rounded-2xl" />}>
  <TradingViewChart tokenSell={...} tokenBuy={...} height={400} />
</Suspense>
```

Similarly, `LiquidityPanel` and `PoolInfo` are only shown when assets exist and could be lazy-loaded.

### Finding 2.3 -- MEDIUM: Charts sub-components in PortfolioPage

File: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/PortfolioPage.tsx` (lines 46-49)
```typescript
import AssetAllocationChart from '../components/Charts/AssetAllocationChart.tsx';
import PortfolioValueChart from '../components/Charts/PortfolioValueChart.tsx';
import HoldingsTable from '../components/DataViz/HoldingsTable.tsx';
import TransactionHistory from '../components/DataViz/TransactionHistory.tsx';
```

These pull in recharts. Since they are only rendered when `wrappedAssets.length > 0`, they should be lazy-loaded:

```typescript
const PortfolioValueChart = lazy(() => import('../components/Charts/PortfolioValueChart'));
const AssetAllocationChart = lazy(() => import('../components/Charts/AssetAllocationChart'));
```

**Impact:** Reduces PortfolioPage initial chunk by ~356 KB (recharts) for users with no assets.

---

## 3. CACHING

### Current State

There is **no caching layer** for blockchain reads. Every call to `getAssetDetails()`, `getOrders()`, `getAMMPool()`, etc. results in a fresh RPC call. The stores (`assetStore`, `exchangeStore`, `tradeStore`) hold data in memory but have no TTL or staleness concept.

### Finding 3.1 -- CRITICAL: No RPC result caching

Every time a user navigates between pages (Dashboard -> Portfolio -> Exchange -> Dashboard), the same assets are re-fetched from the blockchain. Each page independently calls:
- `getTotalAssets()` + `getUserAssets()` + `getAssetDetails()` per asset + `getAssetBalance()` per asset

For a user with 10 assets, this is 23+ RPC calls *per page navigation*.

**Fix:** Implement a simple in-memory cache with TTL for read-only blockchain data:

```typescript
// src/lib/blockchain/rpcCache.ts
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const DEFAULT_TTL_MS = 30_000; // 30 seconds

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > DEFAULT_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCache<T>(key: string, data: T, ttlMs = DEFAULT_TTL_MS): void {
  cache.set(key, { data, timestamp: Date.now() });
  // Prevent unbounded growth
  if (cache.size > 500) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
```

Then wrap key ContractService reads:

```typescript
// In ContractService.getAssetDetails()
async getAssetDetails(assetAddress: string): Promise<AssetDetails> {
  const cacheKey = `asset:${assetAddress}:details`;
  const cached = getCached<AssetDetails>(cacheKey);
  if (cached) return cached;

  // ... existing multicall logic ...

  setCache(cacheKey, result);
  return result;
}
```

**Impact:** Eliminates ~80% of redundant RPC calls during normal navigation. With 10 assets and a 30-second TTL, switching between 3 pages within 30 seconds fires 23 calls instead of 69.

### Finding 3.2 -- HIGH: Duplicate asset fetching across pages

Three pages independently fetch the same asset data:

1. **DashboardPage** (`src/pages/DashboardPage.tsx` line 130-199): Fetches all assets + balances
2. **ExchangePage** (`src/pages/ExchangePage.tsx` line 183-265): Fetches all assets + balances
3. **PortfolioPage** (`src/pages/PortfolioPage.tsx` line 532-567): Fetches all assets + balances

**Fix:** The asset data is already stored in `useAssetStore`. Pages should check if the store already has fresh data before re-fetching:

```typescript
// In each page's fetchAssets():
const existingAssets = useAssetStore.getState().wrappedAssets;
const lastFetchTime = useAssetStore.getState().lastFetchTimestamp; // add this field
if (existingAssets.length > 0 && Date.now() - lastFetchTime < 30_000) {
  return; // Use cached store data
}
```

### Finding 3.3 -- MEDIUM: Polling intervals are aggressive

| Component | Interval | RPC calls per poll | File |
|---|---|---|---|
| OrderBook | 15s | 2 calls (`getExchangeActiveOrders` x2 directions) | `src/components/Exchange/OrderBook.tsx:40` |
| UserOrders | 15s | 2+ calls (`getExchangeUserOrders` + `getExchangeFilledOrderIds` + N `getExchangeOrder`) | `src/components/Exchange/UserOrders.tsx:93` |
| PoolInfo | 15s | 2 calls (`getAMMPool` + `getAMMLiquidityBalance`) | `src/components/Exchange/PoolInfo.tsx:120` |
| PendingApproval | 30s | 1 call | `src/pages/PendingApprovalPage.tsx:21` |
| PendingTransactions | 10s | N calls (one per pending tx) | `src/components/Layout/PendingTransactions.tsx:48` |

When the ExchangePage is open, **three** components poll simultaneously every 15 seconds = ~6+ RPC calls every 15 seconds = ~24+ calls per minute.

**Fix:**
1. Increase idle polling intervals to 30 seconds (from 15).
2. Pause polling when the browser tab is not visible:

```typescript
// Add to each polling useEffect:
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.hidden) {
      if (intervalRef.current) clearInterval(intervalRef.current);
    } else {
      void fetchOrders(); // Immediate refresh on tab focus
      intervalRef.current = setInterval(() => void fetchOrders(), 30_000);
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
}, [fetchOrders]);
```

**Impact:** Reduces RPC calls by ~50-75% for users who switch between tabs (the majority use case).

---

## 4. RPC CALL BATCHING

### Current State

The codebase already uses Multicall3 extensively (`src/lib/blockchain/multicall.ts`) for batching property reads on single contracts (e.g., `name`, `symbol`, `totalSupply` in one call). This is **excellent**.

### Finding 4.1 -- HIGH: `getAssetDetails()` + `getAssetBalance()` called sequentially per asset

File: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/ExchangePage.tsx` (lines 221-223)
```typescript
const [details, balance] = await Promise.all([
  contractService.getAssetDetails(addr),
  contractService.getAssetBalance(addr, address),
]);
```

While `Promise.all` parallelizes the two calls *per asset*, each asset's `getAssetDetails()` is already a multicall, but `getAssetBalance()` is a separate RPC call. With 10 assets, this results in 10 separate `balanceOf` calls.

**Fix:** Add the `balanceOf` call into the multicall batch in `getMultipleAssetDetails`:

```typescript
// In ContractService, add a new method:
async getMultipleAssetDetailsWithBalances(
  assetAddresses: string[],
  userAddress: string,
): Promise<(AssetDetails & { balance: bigint } | null)[]> {
  if (assetAddresses.length === 0) return [];

  const fields = ['name', 'symbol', 'totalSupply', 'documentHash',
                  'documentType', 'originalValue'] as const;
  const requests: MulticallRequest[] = [];

  for (const addr of assetAddresses) {
    for (const fn of fields) {
      requests.push({ target: addr, abi: WrappedAssetABI, functionName: fn });
    }
    // Add balanceOf in the same batch
    requests.push({
      target: addr,
      abi: WrappedAssetABI,
      functionName: 'balanceOf',
      args: [userAddress],
    });
  }

  const results = await multicall(this.provider, requests);
  const fieldsPerAsset = fields.length + 1; // +1 for balanceOf
  // ... decode results ...
}
```

**Impact:** Reduces N+1 separate RPC calls for balances down to 1 single Multicall3 call. For 10 assets: from 11 RPC calls to 1.

### Finding 4.2 -- HIGH: Sequential pool + LP balance fetch in PoolInfo

File: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/components/Exchange/PoolInfo.tsx` (lines 87-105)
```typescript
const poolData = await contractService.getAMMPool(tokenA, tokenB);
// ... check result ...
const lp = await contractService.getAMMLiquidityBalance(tokenA, tokenB, userAddress);
```

These two calls are sequential when they could be parallel:

```typescript
const [poolData, lp] = await Promise.all([
  contractService.getAMMPool(tokenA, tokenB),
  contractService.getAMMLiquidityBalance(tokenA, tokenB, userAddress),
]);
```

### Finding 4.3 -- MEDIUM: Sequential order detail fetching in UserOrders

File: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/components/Exchange/UserOrders.tsx` (lines 240-243)
```typescript
const orderDetails = await Promise.all(
  allIds.map((id) =>
    contractService.getExchangeOrder(id).catch(() => null),
  ),
);
```

This already uses `Promise.all` which is good. However, each `getExchangeOrder()` is a separate RPC call. A multicall approach would batch all order reads into one:

```typescript
// Batch all getOrder calls via Multicall3
const requests = allIds.map((id) => ({
  target: exchangeAddress,
  abi: AssetBackedExchangeABI,
  functionName: 'getOrder',
  args: [id],
}));
const results = await multicall(provider, requests);
```

### Finding 4.4 -- MEDIUM: DashboardPage makes sequential event queries

File: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/DashboardPage.tsx` (lines 250-264)
```typescript
const takerFilter = exchange.filters.OrderFilled(null, address);
const takerFillEvents = await exchange.queryFilter(takerFilter);
const makerFilter = exchange.filters.OrderCreated(null, address);
const makerEvents = await exchange.queryFilter(makerFilter);
```

These three `queryFilter` calls are sequential. They should be parallelized:

```typescript
const [takerFillEvents, makerEvents] = await Promise.all([
  exchange.queryFilter(exchange.filters.OrderFilled(null, address)),
  exchange.queryFilter(exchange.filters.OrderCreated(null, address)),
]);
```

---

## 5. CONTRACT GAS COSTS

### Current State

Both `ContractService` and `OrbitalContractService` use the `executeWrite()` pattern with upfront gas estimation and a 20% buffer.

### Finding 5.1 -- GOOD: Gas estimation with 20% buffer is appropriate

File: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/lib/blockchain/contracts.ts` (lines 1263-1288)
```typescript
const gasEstimate: bigint = await contract[method].estimateGas(...args, overrides ?? {});
const gasLimit = (gasEstimate * 120n) / 100n;
```

The 20% buffer is reasonable for most operations. For complex operations like `createSecurityToken` (which deploys two sub-contracts), a 30% buffer might be safer, but 20% is a good default.

### Finding 5.2 -- MEDIUM: No gas price optimization

The contract service does not set `maxFeePerGas` or `maxPriorityFeePerGas`. On EIP-1559 networks, the wallet's default gas pricing applies. This is generally fine for user-initiated transactions but could be optimized for better UX:

```typescript
// Optional: fetch current base fee and set reasonable maxFeePerGas
const feeData = await this.provider.getFeeData();
const maxFeePerGas = feeData.maxFeePerGas
  ? (feeData.maxFeePerGas * 120n) / 100n  // 20% above current
  : undefined;
```

### Finding 5.3 -- LOW: Approval always approves exact amount

The `approveExchange()`, `approveAssetBackedExchange()`, `approveAMM()`, and `approveRouter()` methods approve the exact amount needed for each operation. This is the *safest* pattern but requires a separate approval transaction for every order/swap. Consider offering users an "Approve Max" option (with clear warnings):

```typescript
// Optional infinite approval (user must opt in)
const MAX_UINT256 = 2n ** 256n - 1n;
await contractService.approveAssetBackedExchange(tokenAddress, MAX_UINT256);
```

This eliminates the approval transaction for subsequent operations, saving ~21,000 gas per order.

---

## 6. RENDERING

### Finding 6.1 -- HIGH: ExchangePage creates inline objects on every render

File: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/ExchangePage.tsx` (lines 55-59)
```typescript
const MOBILE_TABS: { id: MobileTab; label: string; icon: React.ReactNode }[] = [
  { id: 'book', label: 'Order Book', icon: <BookOpen className="h-4 w-4" /> },
  { id: 'trade', label: 'Trade', icon: <ArrowLeftRight className="h-4 w-4" /> },
  { id: 'orders', label: 'My Orders', icon: <Clock className="h-4 w-4" /> },
];
```

This array is defined at module scope, which is correct. However, the JSX elements in the `icon` field create new React elements on every module evaluation. Since this is at module scope (not inside a component), it only runs once. **No issue.**

### Finding 6.2 -- HIGH: `GlassCard` is defined inline in two pages

Both `ExchangePage.tsx` (line 67) and `OrbitalAMMPage.tsx` (line 64) define an identical `GlassCard` component inline. This causes:
1. Code duplication (~30 lines x 2)
2. Each renders creates a new function reference (though React handles this efficiently)

**Fix:** Extract to a shared component:

```typescript
// src/components/Common/GlassCard.tsx
export default function GlassCard({ children, className, gradientFrom, gradientTo }) { ... }
```

### Finding 6.3 -- HIGH: `OrderBook` and `UserOrders` re-render on every refresh key change

File: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/ExchangePage.tsx` (lines 661-662)
```typescript
<OrderBook key={`orderbook-${refreshKey}`} ... />
<UserOrders key={`userorders-${refreshKey}`} ... />
```

Using a changing `key` prop forces React to **unmount and remount** the entire component tree, destroying all internal state (loading indicators, scroll position, expanded rows) and re-running all effects. This is unnecessarily destructive.

**Fix:** Instead of using `key` to force re-fetch, pass `refreshKey` as a prop and use it as a dependency in the fetch effect:

```typescript
// In OrderBook, add refreshKey to the dependency array:
useEffect(() => {
  void fetchOrders();
}, [fetchOrders, refreshKey]); // refreshKey triggers re-fetch without unmount
```

Remove the `key` prop from the parent:
```typescript
<OrderBook refreshKey={refreshKey} ... />
```

**Impact:** Eliminates unnecessary DOM destruction/recreation and preserves component state during refreshes.

### Finding 6.4 -- MEDIUM: `PortfolioPage` computes `performanceMap` on every render when trades change

File: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/PortfolioPage.tsx` (lines 610-616)
```typescript
const performanceMap = useMemo(() => {
  const map = new Map<string, AssetPerformance>();
  for (const asset of filteredAssets) {
    map.set(asset.address, calculateAssetPerformance(asset, tradeHistory));
  }
  return map;
}, [filteredAssets, tradeHistory]);
```

This is correctly memoized with `useMemo`. However, `calculateAssetPerformance` is called for every asset on every trade history change. If `tradeHistory` updates frequently (e.g., during polling), this could be expensive.

**Fix:** The current implementation is acceptable given that `tradeHistory` only changes on page load or after user actions. No immediate change needed.

### Finding 6.5 -- MEDIUM: `MintHistory` re-sorts on every render

File: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/components/Mint/MintHistory.tsx` (lines 101-103)
```typescript
const mintTrades = tradeHistory
  .filter((t) => t.type === 'mint')
  .sort((a, b) => b.timestamp - a.timestamp);
```

This filter + sort runs on every render. It should be wrapped in `useMemo`:

```typescript
const mintTrades = useMemo(
  () => tradeHistory
    .filter((t) => t.type === 'mint')
    .sort((a, b) => b.timestamp - a.timestamp),
  [tradeHistory],
);
```

### Finding 6.6 -- MEDIUM: `useWallet` hook is heavy and called in many components

The `useWallet()` hook in `src/hooks/useWallet.ts` is called in every page component. It uses `useWalletStore` with individual selectors (good), but also returns a new object on every render:

```typescript
return {
  ...wallet,
  error,
  connectWallet,
  disconnectWallet,
  switchNetwork,
  refreshBalance,
  isWalletInstalled: checkIfWalletIsInstalled(),
  discoveredProviders: eip6963Providers,
};
```

The `isWalletInstalled: checkIfWalletIsInstalled()` call runs on every render. Since wallet installation state does not change during a session, this should be memoized:

```typescript
const isWalletInstalled = useMemo(() => checkIfWalletIsInstalled(), [checkIfWalletIsInstalled]);
```

### Finding 6.7 -- LOW: Large lists without virtualization

The **OrderBook** and **UserOrders** components render all orders without virtualization. With `@tanstack/react-virtual` already in the project dependencies, lists exceeding ~50 items should use it.

The **PortfolioPage** already uses virtualization for the asset grid (good).

**Fix for OrderBook:** If order books grow beyond 50 rows, wrap in a virtualizer:

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';
```

Currently order books are typically small (< 20 orders), so this is low priority.

### Finding 6.8 -- LOW: `tokenLabel()` function in PoolInfo does a linear scan

File: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/components/Exchange/PoolInfo.tsx` (lines 61-67)
```typescript
function tokenLabel(address: string): string {
  if (isETH(address)) return 'ETH';
  const found = assets.find(
    (a) => a.address.toLowerCase() === address.toLowerCase(),
  );
  return found ? found.symbol : formatAddress(address);
}
```

This function is defined *inside* the component (not memoized) and does an `O(n)` scan with `.toLowerCase()` on every call. For small asset lists this is negligible, but it should be memoized:

```typescript
const assetSymbolMap = useMemo(() => {
  const map = new Map<string, string>();
  for (const a of assets) {
    map.set(a.address.toLowerCase(), a.symbol);
  }
  return map;
}, [assets]);

function tokenLabel(address: string): string {
  if (isETH(address)) return 'ETH';
  return assetSymbolMap.get(address.toLowerCase()) ?? formatAddress(address);
}
```

---

## 7. IMAGE / ASSET OPTIMIZATION

### Finding 7.1 -- GOOD: Minimal static assets

The `public/` directory contains only `vite.svg` (1.5 KB). The `src/` directory has no image files. The platform is purely UI-driven with no heavy static assets. This is excellent.

### Finding 7.2 -- MEDIUM: No font preloading

If the platform uses custom fonts (Inter, via Google Fonts or local files), they should be preloaded in `index.html`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="preload" as="font" type="font/woff2"
      href="/fonts/Inter-Variable.woff2" crossorigin />
```

### Finding 7.3 -- LOW: No `<link rel="modulepreload">` for critical chunks

Vite generates `<link rel="modulepreload">` tags in production for directly imported modules, but lazy-loaded chunks are not preloaded. For the most likely next-page navigation (login -> dashboard), the DashboardPage chunk could be prefetched:

```html
<!-- In index.html or via a Vite plugin -->
<link rel="prefetch" href="/assets/DashboardPage-[hash].js" />
```

Or programmatically in React after auth:
```typescript
// After successful login, prefetch the dashboard chunk
import('./pages/DashboardPage');
```

---

## 8. ADDITIONAL FINDINGS

### Finding 8.1 -- HIGH: DashboardPage fetches block timestamps sequentially

File: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/DashboardPage.tsx` (line 284)
```typescript
const block = await log.getBlock();
const timestampMs = block ? block.timestamp * 1000 : Date.now();
```

This is inside a `for` loop iterating over fill events. Each `getBlock()` is a separate RPC call. With 20 fill events, this is 20 sequential RPC calls.

**Fix:** Batch block fetches:

```typescript
// Collect unique block numbers
const blockNumbers = new Set(
  [...takerFillEvents, ...makerFillEvents].map((e) => e.blockNumber)
);

// Fetch all blocks in parallel
const blockMap = new Map<number, { timestamp: number }>();
await Promise.all(
  Array.from(blockNumbers).map(async (num) => {
    const block = await provider.getBlock(num);
    if (block) blockMap.set(num, { timestamp: block.timestamp });
  })
);

// Use cached blocks in the loop
for (const evt of [...takerFillEvents, ...makerFillEvents]) {
  const blockData = blockMap.get(evt.blockNumber);
  const timestampMs = blockData ? blockData.timestamp * 1000 : Date.now();
  // ...
}
```

**Impact:** Reduces N sequential RPC calls to ceil(N/unique_blocks) parallel calls.

### Finding 8.2 -- MEDIUM: PoolInfo auto-refresh does not actually work

File: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/components/Exchange/PoolInfo.tsx` (lines 120-127)
```typescript
intervalRef.current = setInterval(() => {
  setLoading((prev) => {
    return prev; // This is a no-op!
  });
}, 15000);
```

The `setLoading(prev => prev)` call returns the same value, so React bails out of the re-render. The auto-refresh interval runs but does nothing. The comment says "Force a re-render to trigger the fetch effect" but this does not work because the state value does not change.

**Fix:** Use a dedicated refresh counter:

```typescript
const [autoRefreshKey, setAutoRefreshKey] = useState(0);

useEffect(() => {
  if (!contractService || !tokenA || !tokenB) return;
  intervalRef.current = setInterval(() => {
    setAutoRefreshKey((k) => k + 1);
  }, 15000);
  return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
}, [contractService, tokenA, tokenB]);

// Add autoRefreshKey to the fetch effect's dependency array
useEffect(() => {
  // ... fetch logic ...
}, [contractService, tokenA, tokenB, userAddress, refreshKey, autoRefreshKey]);
```

### Finding 8.3 -- MEDIUM: `ContractService` is re-instantiated on every page

Each page creates its own `ContractService` instance in a `useEffect`. The class is lightweight (it stores a provider reference and chainId), so this is not expensive. However, a shared instance through context or the wallet store would be cleaner:

```typescript
// In walletStore.ts, add:
let _contractService: ContractService | null = null;
export function getContractService(): ContractService | null {
  return _contractService;
}
```

### Finding 8.4 -- LOW: `PortfolioPage` uses `getAssetDetails` + `getAssetBalance` sequentially per asset

File: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/PortfolioPage.tsx` (lines 543-548)
```typescript
const details = await service.getAssetDetails(addr);
const balanceWei = await service.getAssetBalance(addr, address);
```

These are sequential (no `Promise.all`), unlike the ExchangePage which parallelizes them. This should be:

```typescript
const [details, balanceWei] = await Promise.all([
  service.getAssetDetails(addr),
  service.getAssetBalance(addr, address),
]);
```

**Impact:** Halves the latency for each asset fetch.

---

## Priority Action Items

### P0 -- Critical (implement immediately)
1. **Vite manual chunks** for `ethers`, `recharts`, `lightweight-charts` (Finding 1.1)
2. **RPC caching layer** with 30-second TTL (Finding 3.1)
3. **Fix PoolInfo auto-refresh** -- currently a no-op (Finding 8.2)

### P1 -- High (implement this sprint)
4. **Batch `balanceOf` into multicall** for asset loading (Finding 4.1)
5. **Remove `key=` prop forcing remounts** on OrderBook/UserOrders (Finding 6.3)
6. **Parallelize sequential RPC calls** in PoolInfo and PortfolioPage (Findings 4.2, 8.4)
7. **Batch block timestamp fetches** in DashboardPage (Finding 8.1)
8. **Pause polling when tab is hidden** (Finding 3.3)
9. **Lazy-load TradingViewChart and recharts chart components** (Findings 2.2, 2.3)
10. **Parallelize event queries** in DashboardPage (Finding 4.4)

### P2 -- Medium (implement next sprint)
11. Store-level freshness check to avoid duplicate fetches (Finding 3.2)
12. Memoize `MintHistory` filter+sort (Finding 6.5)
13. Memoize `isWalletInstalled` in `useWallet` (Finding 6.6)
14. Extract shared `GlassCard` component (Finding 6.2)
15. Asset symbol lookup map optimization (Finding 6.8)
16. Font preloading (Finding 7.2)

### P3 -- Low (backlog)
17. Conditional Datadog loading (Finding 1.5)
18. OrderBook virtualization for large books (Finding 6.7)
19. Dashboard chunk prefetching after login (Finding 7.3)
20. Optional infinite token approval (Finding 5.3)

---

## Estimated Impact Summary

| Category | Current | After Optimization | Improvement |
|---|---|---|---|
| Initial JS load (auth pages) | ~748 KB | ~300 KB | **60%** smaller |
| RPC calls per page navigation (10 assets) | ~23 | ~1-3 | **87-96%** fewer |
| Polling RPC calls/minute (Exchange page) | ~24 | ~6-8 | **67-75%** fewer |
| Asset list fetch (10 assets) | ~11 RPC calls | 1 multicall | **91%** fewer |
| Component remount on refresh | Full unmount/remount | In-place update | **No DOM churn** |

---

*Report generated by PERFORMANCE-OPTIMIZER agent. All file paths are absolute. All findings reference specific lines in the source code for traceability.*
