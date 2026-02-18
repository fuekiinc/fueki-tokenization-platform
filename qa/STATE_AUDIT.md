# State Management Audit Report

**Platform:** Fueki Tokenization Platform
**Auditor:** STATE-MANAGEMENT-AUDITOR
**Date:** 2026-02-17
**Scope:** All Zustand stores, hooks, and consuming components under `src/`

---

## Executive Summary

The platform uses 7 Zustand stores (`walletStore`, `authStore`, `documentStore`, `assetStore`, `tradeStore`, `exchangeStore`, `uiStore`), 5 custom hooks (`useWallet`, `useAuth`, `useTransactionRecovery`, `usePriceHistory`, `useTheme`), and approximately 15 page/component consumers. The architecture has been split from a single monolithic store into domain-specific slices, which is a good practice.

This audit identified **6 critical issues**, **8 major issues**, and **11 minor issues** across race conditions, stale data, cache invalidation, wallet sync, memory leaks, re-renders, and hydration.

---

## CRITICAL ISSUES

### C-01: Race Condition -- `chainId` Dependency Cycle in TradeForm Balance Loader

**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/components/Exchange/TradeForm.tsx`
**Lines:** 197-262

The `useEffect` that loads token balances and allowances has `chainId` in its dependency array, but `chainId` is **also set inside this same effect** (line 215). This creates a re-entrancy loop:

1. Effect fires, calls `setChainId(Number(network.chainId))` on line 215.
2. `chainId` state changes, effect fires again.
3. The effect re-reads the chain, potentially calling `setChainId` again with the same value.

While React's state batching prevents an infinite loop (same value set does not trigger re-render), this causes **redundant RPC calls** on every token selection change and is fragile if the chain actually changes mid-effect.

```typescript
// Lines 197-262 -- chainId is both a dependency and set inside the effect
useEffect(() => {
  // ...
  const network = await provider.getNetwork();
  if (!cancelled) setChainId(Number(network.chainId)); // SETS chainId
  // ...
}, [contractService, sellToken, sellIsETH, txStatus, chainId]); // DEPENDS on chainId
```

**Fix:** Remove `chainId` from the dependency array. The chainId resolution is already handled by the separate `useEffect` on lines 266-287. Use a ref for chainId when computing the spender address:

```typescript
const chainIdRef = useRef(chainId);
chainIdRef.current = chainId;

useEffect(() => {
  // ...inside the effect, use chainIdRef.current instead of chainId for spender lookup
  const currentChainId = chainIdRef.current ?? 31337;
  // ...
}, [contractService, sellToken, sellIsETH, txStatus]); // REMOVE chainId
```

---

### C-02: Race Condition -- Concurrent Asset Fetches Overwrite Each Other

**Files:**
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/DashboardPage.tsx` (lines 130-315)
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/ExchangePage.tsx` (lines 183-265)
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/PortfolioPage.tsx` (lines 532-567)

All three pages independently fetch and call `setAssets()` on the shared `assetStore`. When the user navigates between these pages quickly (or when wallet events trigger re-fetches), the following race occurs:

1. DashboardPage fires `fetchData()` -- starts async RPC calls.
2. User navigates to ExchangePage -- fires `fetchAssets()`.
3. ExchangePage finishes first, calls `setAssets(exchangeAssets)`.
4. DashboardPage finishes second, calls `setAssets(dashboardAssets)` -- **overwrites** the exchange data.

The two pages format asset data differently: PortfolioPage uses `ethers.formatEther()` (human-readable decimals) while DashboardPage stores raw `toString()` (wei strings). This means the **same `balance` field holds incompatible formats** depending on which page loaded last.

**Fix:** Centralize asset fetching into a single shared function (ideally an action on `assetStore` itself or a dedicated hook) and ensure consistent formatting. Add an AbortController-like cancellation guard:

```typescript
// In assetStore.ts, add a fetchAssets action:
let fetchGeneration = 0;

fetchAssets: async (service, address) => {
  const gen = ++fetchGeneration;
  set({ isLoadingAssets: true });
  try {
    const assets = await loadAssetsFromChain(service, address);
    if (gen !== fetchGeneration) return; // stale fetch, discard
    set({ wrappedAssets: assets, isLoadingAssets: false, assetsError: null });
  } catch (err) {
    if (gen !== fetchGeneration) return;
    set({ isLoadingAssets: false, assetsError: err.message });
  }
}
```

---

### C-03: Balance Format Inconsistency Creates Silent Data Corruption

**Files:**
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/PortfolioPage.tsx` (lines 543-558)
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/DashboardPage.tsx` (lines 170-193)

PortfolioPage stores balances as **formatted ether** (e.g., `"1.5"`):
```typescript
// PortfolioPage.tsx line 555
balance: ethers.formatEther(balanceWei),
```

DashboardPage stores balances as **raw wei strings** (e.g., `"1500000000000000000"`):
```typescript
// DashboardPage.tsx line 183
balance: balance.toString(),
```

Both call `setAssets()` on the same store. Any component reading `wrappedAssets[n].balance` has no way to know which format it is in. The `computeTotalLocked()` function in PortfolioPage calls `parseFloat(a.balance)`, which produces astronomically wrong numbers when balance is in wei.

**Fix:** Standardize on one format throughout the application. Raw wei strings (`BigInt.toString()`) are recommended for precision; format to human-readable only at the display layer.

---

### C-04: Stale Closure in `handleCancelOrder` Callback

**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/components/Exchange/UserOrders.tsx`
**Lines:** 310-340

The `handleCancelOrder` callback captures `cancellingId` in its closure. Because `cancellingId` is a dependency, the callback is recreated on every state change. However, during the async cancellation flow, the closure may read a stale value:

```typescript
const handleCancelOrder = useCallback(
  async (orderId: bigint) => {
    if (!contractService) return;
    if (cancellingId !== null) return; // <-- reads stale cancellingId
    // ...
  },
  [contractService, cancellingId, onOrderCancelled, fetchUserOrders],
);
```

If two click events fire before React processes the state update from `setCancellingId(orderId)`, both clicks will see `cancellingId === null` and proceed.

**Fix:** Use a ref to guard against concurrent cancellations:

```typescript
const cancellingRef = useRef(false);

const handleCancelOrder = useCallback(
  async (orderId: bigint) => {
    if (!contractService) return;
    if (cancellingRef.current) return;
    cancellingRef.current = true;
    setCancellingId(orderId);
    try {
      // ... cancellation logic
    } finally {
      cancellingRef.current = false;
      setCancellingId(null);
    }
  },
  [contractService, onOrderCancelled, fetchUserOrders],
);
```

---

### C-05: Auth Token Stored in localStorage Vulnerable to Stale Hydration

**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/store/authStore.ts`
**Lines:** 120-177

The `initialize()` function rehydrates auth state from localStorage. If the stored access token has expired, it attempts a refresh. However, there is no guard against **concurrent initialization**. If `<AuthInitializer>` re-renders (e.g., due to a parent state change), `initialize()` fires again while the first call is still in-flight:

```typescript
// App.tsx lines 42-50
function AuthInitializer({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((s) => s.initialize);
  useEffect(() => {
    initialize(); // <-- no guard against double invocation
  }, [initialize]);
  return <>{children}</>;
}
```

In React 18 Strict Mode (development), effects run twice. Two concurrent `initialize()` calls both attempt `authApi.refreshToken()`, potentially invalidating the first token before it can be used.

**Fix:** Add an initialization guard:

```typescript
let _initPromise: Promise<void> | null = null;

initialize: async () => {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    // ... existing initialization logic
  })();
  try {
    await _initPromise;
  } finally {
    _initPromise = null;
  }
},
```

---

### C-06: Provider/Signer Module-Level Refs Not Synchronized with Wallet State

**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/store/walletStore.ts`
**Lines:** 9-18, 60-88

The `_provider` and `_signer` module-level variables are set via `setProvider()` and `setSigner()`, which do **not** call Zustand's `set()`:

```typescript
setProvider: (provider) => {
  _provider = provider;  // module ref updated
  // NO set() call -- no state update, no re-render
},
```

This means:
1. Components subscribing to the wallet store are **never notified** when the provider changes.
2. After a chain change, `getProvider()` may return a provider bound to the old chain until `connectWallet()` finishes re-initializing.
3. Any component that calls `getProvider()` between the chain change event and the reconnection gets a stale provider.

**Fix:** Add a version counter to the store state that increments whenever provider/signer change, so dependent effects can re-run:

```typescript
interface WalletState {
  wallet: { /* ... */ };
  providerVersion: number; // incremented on setProvider/setSigner
}

setProvider: (provider) => {
  _provider = provider;
  set((state) => ({ providerVersion: state.providerVersion + 1 }));
},
```

---

## MAJOR ISSUES

### M-01: Missing Cache Invalidation After Transactions

**Files:**
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/components/Exchange/TradeForm.tsx` (lines 388-414)
- `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/components/Mint/MintForm.tsx` (lines 249-336)

After a successful mint or order creation, the wallet balance is not refreshed. The user sees stale ETH balances in the navbar and trade form until they manually refresh or navigate away:

```typescript
// TradeForm.tsx line 408-414 -- resets form but never refreshes balance
setTimeout(() => {
  setSellAmount('');
  setBuyAmount('');
  setTxStatus('idle');
  setTxHash(null);
  onOrderCreated(); // calls handleRefresh, but doesn't refresh wallet balance
}, 2000);
```

**Fix:** After any transaction confirmation, call `refreshBalance()` from `useWallet`:

```typescript
// In onOrderCreated callback or after tx confirmation:
wallet.refreshBalance();
```

---

### M-02: UserOrders Polling Interval Not Cleared on Dependency Change

**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/components/Exchange/UserOrders.tsx`
**Lines:** 296-306

The periodic refresh effect correctly clears the interval on unmount, but when `fetchUserOrders` changes (due to `contractService` or `userAddress` changing), a new interval is set **without clearing the previous one** during the same render cycle. React's cleanup function only runs before the next effect execution, but if the dependency changes rapidly (e.g., during wallet reconnection), intervals can stack.

```typescript
useEffect(() => {
  void fetchUserOrders();
  intervalRef.current = setInterval(() => {
    void fetchUserOrders();
  }, REFRESH_INTERVAL_MS);
  return () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
  };
}, [fetchUserOrders]);
```

This is **technically correct** because React guarantees the cleanup runs before the new effect. However, `fetchUserOrders` itself is recreated on every `contractService` or `userAddress` change, meaning the interval is torn down and recreated frequently, causing bursts of rapid polling.

**Fix:** Decouple the polling from the callback identity by using a ref:

```typescript
const fetchRef = useRef(fetchUserOrders);
fetchRef.current = fetchUserOrders;

useEffect(() => {
  void fetchRef.current();
  const id = setInterval(() => void fetchRef.current(), REFRESH_INTERVAL_MS);
  return () => clearInterval(id);
}, []); // stable -- only mounts/unmounts once
```

---

### M-03: Wallet Event Listeners May Leak Across Hot Module Reload

**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/hooks/useWallet.ts`
**Lines:** 433-550

The module-level `listenerConsumerCount` counter survives across hot module reloads (HMR) in development. When the module is re-evaluated:
1. `listenerConsumerCount` resets to 0.
2. New listeners are registered.
3. Old listeners (from the previous module version) are never removed because their cleanup closures are gone.

This causes duplicate event handlers in development, leading to:
- Double wallet reconnections on chain change.
- Double state resets on account disconnect.

**Fix:** In development, use a unique key stored on `window` to detect HMR and force cleanup:

```typescript
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    listenerConsumerCount = 0;
    // Remove all listeners from walletProvider
  });
}
```

---

### M-04: EIP-6963 Provider Discovery Array Never Cleaned Up

**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/hooks/useWallet.ts`
**Lines:** 47-66

The `eip6963Providers` array accumulates provider announcements but is never cleared. The `eip6963:announceProvider` event listener is registered at module load time and is never removed. If a wallet extension is disabled/enabled or HMR re-evaluates the module, stale providers persist in the array.

Additionally, the `startEIP6963Discovery()` function uses a module-level `eip6963Listening` boolean that does not reset on HMR.

**Fix:** Add a cleanup mechanism and deduplicate by `info.uuid`:

```typescript
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    eip6963Providers.length = 0;
    eip6963Listening = false;
  });
}
```

---

### M-05: Unnecessary Re-renders from `useWallet()` Hook

**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/hooks/useWallet.ts`
**Lines:** 133-139

The hook selects from the store 5 times, creating 5 separate subscriptions:

```typescript
const wallet = useWalletStore((s) => s.wallet);     // object -- new ref every time wallet changes
const setWallet = useWalletStore((s) => s.setWallet);
const setProvider = useWalletStore((s) => s.setProvider);
const setSigner = useWalletStore((s) => s.setSigner);
const resetWallet = useWalletStore((s) => s.resetWallet);
```

The `wallet` selector returns the entire wallet object. Any change to any wallet field (address, chainId, balance, isConnecting, isConnected) triggers a re-render of **every component** that uses `useWallet()`. Components like `MintHistory` only need `chainId` but re-render when balance changes.

**Fix:** Use granular selectors in components that don't need the full wallet object:

```typescript
// In MintHistory.tsx -- only needs chainId
const chainId = useWalletStore((s) => s.wallet.chainId);
// Instead of:
const { chainId } = useWallet(); // re-renders on any wallet change
```

---

### M-06: Stale Data in Trade History Merge Logic

**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/DashboardPage.tsx`
**Lines:** 244-312

The trade history fetch merges on-chain events with the existing store data using a ref:

```typescript
const existing = tradeHistoryRef.current;
const existingIds = new Set(existing.map((t) => t.id));
const merged = [...existing];
for (const t of trades) {
  if (!existingIds.has(t.id)) merged.push(t);
}
```

Problem: If the user mints a token on the MintPage (which calls `addTrade()`), then navigates to the dashboard, `tradeHistoryRef.current` captures the ref **before** the dashboard's fetch starts. The fetch then appends on-chain events to the stale ref data. If the ref was updated between mount and the async fetch completing, the merge produces duplicates.

**Fix:** Read the current state directly from the store at merge time:

```typescript
const existing = useTradeStore.getState().tradeHistory;
```

---

### M-07: `useAuth()` Hook Creates New Object Reference Every Render

**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/hooks/useAuth.ts`
**Lines:** 37-71

The `useAuth()` hook computes derived state (`kycStatus`, `isKYCApproved`, `userDisplayName`) inline and returns a new object on every render. Any component destructuring `const { isKYCApproved } = useAuth()` will re-render whenever **any** auth state changes, even if `isKYCApproved` hasn't changed.

**Fix:** Memoize the return value or use separate selectors for derived state:

```typescript
export function useIsKYCApproved(): boolean {
  return useAuthStore((s) => s.user?.kycStatus === 'approved');
}
```

---

### M-08: `setProvider`/`setSigner` Actions Are Not Actually Zustand Actions

**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/store/walletStore.ts`
**Lines:** 68-74

These "actions" mutate module-level refs but never call `set()`. This means:
1. Zustand DevTools never logs these mutations.
2. There is no way to subscribe to provider/signer changes.
3. Middleware (like `persist`, `immer`, or `devtools`) cannot intercept these.

This is by design (providers are not serializable), but it creates a hidden coupling where the store's state and the module-level refs can get out of sync if `resetWallet()` fails to clear them.

**Fix:** Document this pattern explicitly and add a version counter as described in C-06. Alternatively, use Zustand's `temporal` middleware approach for non-serializable state.

---

## MINOR ISSUES

### m-01: MintForm `useEffect` Triggers on `txState` Change (Self-Referential)

**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/components/Mint/MintForm.tsx`
**Lines:** 116-123

```typescript
useEffect(() => {
  if (txState !== 'idle' && txState !== 'pending') {
    setTxState('idle');
    // ...
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [document?.documentHash]);
```

The eslint-disable comment hides a potential issue: if `txState` were included as a dependency (as the rule suggests), it would create an infinite loop. The current implementation is correct but the suppression comment should include a brief explanation of why `txState` is intentionally omitted.

---

### m-02: Notification Timer Map May Accumulate Orphaned Entries

**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/store/uiStore.ts`
**Lines:** 42, 59-74

The `_notificationTimers` map is never fully cleared. If the application is long-running and many notifications are added and auto-dismissed, the map correctly cleans up via the `delete` call in the timeout callback. However, if the store is reset or the user logs out, orphaned timers may fire and attempt to update the store.

**Fix:** Add a `clearAllNotifications()` action that clears all timers:

```typescript
clearAllNotifications: () => {
  for (const timer of _notificationTimers.values()) {
    clearTimeout(timer);
  }
  _notificationTimers.clear();
  set({ notifications: [] });
}
```

---

### m-03: `MobileSlideOver` Closes on Any Route Change Including Self-Triggered

**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/components/Layout/Navbar.tsx`
**Lines:** 578-581

```typescript
useEffect(() => {
  onClose();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [location.pathname]);
```

The `onClose` callback is not in the dependency array (suppressed by eslint-disable). If `onClose` changes identity (which it does, since it's `() => setMobileMenuOpen(false)` defined inline in the parent), the effect always uses the stale initial closure. This works by accident because `setMobileMenuOpen(false)` is idempotent, but it is fragile.

**Fix:** Wrap `onClose` in a stable ref or memoize the parent's `onClose`:

```typescript
const onCloseRef = useRef(onClose);
onCloseRef.current = onClose;

useEffect(() => {
  onCloseRef.current();
}, [location.pathname]);
```

---

### m-04: `PendingTransactions` Polling Continues When Dropdown Is Closed

**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/components/Layout/PendingTransactions.tsx`
**Lines:** 216-238

The component polls every 10 seconds regardless of whether the dropdown is visible. This generates unnecessary RPC calls when the user is not looking at pending transactions.

**Fix:** Only poll when the dropdown is open, or reduce the frequency when closed:

```typescript
const interval = isOpen ? POLL_INTERVAL_MS : POLL_INTERVAL_MS * 6;
```

---

### m-05: `useTheme` Hook's `toggleTheme` Has Empty Dependency Array

**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/hooks/useTheme.ts`
**Lines:** 73-75

```typescript
const toggleTheme = useCallback(() => {
  applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
}, []);
```

This reads the module-level `currentTheme` directly (not from React state), so the empty dependency array is actually correct -- `currentTheme` is always up-to-date at the module level. However, this relies on an implicit contract that is not obvious. A future refactor could break this.

**Fix:** Add a comment explaining why this is correct, or pass `currentTheme` through the closure explicitly:

```typescript
const toggleTheme = useCallback(() => {
  // currentTheme is a module-level ref, always current -- no deps needed
  applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
}, []);
```

---

### m-06: `ExchangePage` Duplicates Asset State Between Local and Global Store

**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/ExchangePage.tsx`
**Lines:** 117-125

```typescript
const wrappedAssets = useAssetStore((s) => s.wrappedAssets);
const setAssets = useAssetStore((s) => s.setAssets);
// ...
const [assets, setLocalAssets] = useState<WrappedAsset[]>([]);
```

The page maintains both `wrappedAssets` from the global store and `assets` in local state. After fetching, it writes to both:

```typescript
setLocalAssets(assetList);
setAssets(assetList);
```

This creates two sources of truth. If another component modifies the global store (e.g., MintForm adding a new asset), `assets` (local) goes stale while `wrappedAssets` (global) is current.

**Fix:** Remove the local `assets` state and use `wrappedAssets` from the store exclusively.

---

### m-07: `handleAMMSwap` Callback Has 13 Dependencies

**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/components/Exchange/TradeForm.tsx`
**Line:** 560

```typescript
], [contractService, sellToken, buyToken, parsedSellAmount, ammQuote, slippage, txStatus,
    sellIsETH, buyIsETH, chainId, onOrderCreated, addTrade, assets, sellAmount]);
```

This callback is recreated on virtually every state change, defeating the purpose of `useCallback`. It also makes the closure fragile -- any of these 13 values could be stale if the callback fires during a batch state update.

**Fix:** Move the frequently-changing values into refs:

```typescript
const stateRef = useRef({ sellToken, buyToken, parsedSellAmount, ammQuote, slippage, /* etc */ });
stateRef.current = { sellToken, buyToken, parsedSellAmount, ammQuote, slippage, /* etc */ };

const handleAMMSwap = useCallback(async () => {
  const { sellToken, buyToken, /* ... */ } = stateRef.current;
  // ...
}, [contractService]); // only recreated when contractService changes
```

---

### m-08: `ProtectedRoute` Does Not Use Granular Selectors

**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/components/Auth/ProtectedRoute.tsx`
**Line:** 43

```typescript
const { isAuthenticated, isInitialized, user } = useAuthStore();
```

Calling `useAuthStore()` without a selector subscribes to the **entire** store. Every change to any auth state field (including `isLoading`, `tokens`, etc.) triggers a re-render of `ProtectedRoute` and consequently all its children (every protected page).

**Fix:** Use a shallow selector:

```typescript
import { useShallow } from 'zustand/react/shallow';

const { isAuthenticated, isInitialized, user } = useAuthStore(
  useShallow((s) => ({
    isAuthenticated: s.isAuthenticated,
    isInitialized: s.isInitialized,
    user: s.user,
  }))
);
```

---

### m-09: `refreshBalance` Reads Stale `wallet.address` from Closure

**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/hooks/useWallet.ts`
**Lines:** 406-423

```typescript
const refreshBalance = useCallback(async () => {
  if (!wallet.address || !wallet.isConnected) return;
  // ...
  const balance = await provider.getBalance(wallet.address);
  // ...
}, [wallet.address, wallet.isConnected, setWallet, getEthereumProvider]);
```

The `wallet.address` and `wallet.isConnected` values are captured in the closure when `refreshBalance` is created. If the wallet address changes between when the callback is created and when it's invoked (e.g., queued in a setTimeout), it will read the old address. The function already uses `walletRef` for event handlers, but `refreshBalance` doesn't use it.

**Fix:** Read from the ref or from the store directly:

```typescript
const refreshBalance = useCallback(async () => {
  const { address, isConnected } = walletRef.current;
  if (!address || !isConnected) return;
  // ...
}, [setWallet, getEthereumProvider]);
```

---

### m-10: Document Store Has No Persistence and No Loading State

**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/store/documentStore.ts`

The document store holds parsed documents in memory only. If the user parses a document, navigates away, and returns, the parsed document is gone. While this may be intentional (documents are ephemeral), the MintForm depends on `currentDocument` being set, which creates a confusing UX.

**Recommendation:** Either:
- Add `sessionStorage` persistence for parsed documents (with size limits).
- Or clearly communicate to the user that they need to re-upload when navigating back.

---

### m-11: `useTransactionRecovery` Hook Doesn't Re-check After New Transactions

**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/hooks/useTransactionRecovery.ts`
**Lines:** 47-95

The `hasCheckedRef` guard prevents re-checking after the initial connection. If the user creates a new transaction during the session, closes the tab, and reopens it, the new transaction will be checked. But if they stay on the same session and the transaction confirms while they're on another page, there's no mechanism to update the recovery state.

The `PendingTransactions` component handles this separately with its own polling loop, but the `TransactionRecoveryBanner` component that uses this hook won't reflect updates.

**Fix:** Reset `hasCheckedRef` when the pending transaction list changes:

```typescript
useEffect(() => {
  const pending = getPendingTransactions();
  if (pending.length > 0 && isConnected) {
    hasCheckedRef.current = false;
  }
}, [isConnected]); // Also trigger on storage events
```

---

## ARCHITECTURE OBSERVATIONS

### Positive Patterns

1. **Domain-split stores** -- The migration from a single `useAppStore` to granular stores (`walletStore`, `assetStore`, etc.) is well-executed with proper backward-compatibility re-exports.

2. **Ref-based event handlers** -- The `useWallet` hook correctly uses `walletRef` and `connectWalletRef` to avoid stale closures in wallet event handlers (lines 144-145, 319-320).

3. **Module-level provider refs** -- Keeping non-serializable objects (`BrowserProvider`, `JsonRpcSigner`) outside of Zustand state is the correct pattern.

4. **Cancellation guards** -- Most async effects use `let cancelled = false` patterns with cleanup functions.

5. **Notification auto-dismiss** -- The `uiStore` notification timer management is well-implemented with proper cleanup.

### Recommended Improvements

1. **Add Zustand middleware** -- Consider adding `devtools` middleware in development for debugging:
   ```typescript
   import { devtools } from 'zustand/middleware';
   const useWalletStore = create<WalletStore>()(devtools((set) => ({ ... }), { name: 'wallet' }));
   ```

2. **Centralize contract service creation** -- Instead of creating `new ContractService(provider, chainId)` in every page component, create it once in a shared context or store action.

3. **Add `subscribeWithSelector` middleware** -- This would allow components to subscribe to specific state slices without custom selector hooks.

4. **Add error boundaries around store consumers** -- If a store action throws (e.g., localStorage quota exceeded in authStore), it can crash the entire app.

5. **Consider React Query or SWR** for server/chain data -- The manual polling in `UserOrders`, `OrderBook`, and `PendingTransactions` would benefit from a dedicated data-fetching library that handles caching, deduplication, and background refetching.

---

## SUMMARY TABLE

| ID   | Severity | Category              | File                          | Status |
|------|----------|-----------------------|-------------------------------|--------|
| C-01 | Critical | Race Condition        | TradeForm.tsx                 | Open   |
| C-02 | Critical | Race Condition        | DashboardPage/ExchangePage    | Open   |
| C-03 | Critical | Stale Data            | PortfolioPage/DashboardPage   | Open   |
| C-04 | Critical | Race Condition        | UserOrders.tsx                | Open   |
| C-05 | Critical | Hydration             | authStore.ts / App.tsx        | Open   |
| C-06 | Critical | Wallet Sync           | walletStore.ts                | Open   |
| M-01 | Major    | Cache Invalidation    | TradeForm.tsx / MintForm.tsx  | Open   |
| M-02 | Major    | Memory Leak           | UserOrders.tsx                | Open   |
| M-03 | Major    | Memory Leak           | useWallet.ts (HMR)           | Open   |
| M-04 | Major    | Memory Leak           | useWallet.ts (EIP-6963)      | Open   |
| M-05 | Major    | Re-renders            | useWallet.ts                  | Open   |
| M-06 | Major    | Stale Data            | DashboardPage.tsx             | Open   |
| M-07 | Major    | Re-renders            | useAuth.ts                    | Open   |
| M-08 | Major    | Wallet Sync           | walletStore.ts                | Open   |
| m-01 | Minor    | Code Quality          | MintForm.tsx                  | Open   |
| m-02 | Minor    | Memory Leak           | uiStore.ts                    | Open   |
| m-03 | Minor    | Stale Closure         | Navbar.tsx                    | Open   |
| m-04 | Minor    | Performance           | PendingTransactions.tsx       | Open   |
| m-05 | Minor    | Code Quality          | useTheme.ts                   | Open   |
| m-06 | Minor    | Stale Data            | ExchangePage.tsx              | Open   |
| m-07 | Minor    | Re-renders            | TradeForm.tsx                 | Open   |
| m-08 | Minor    | Re-renders            | ProtectedRoute.tsx            | Open   |
| m-09 | Minor    | Stale Closure         | useWallet.ts                  | Open   |
| m-10 | Minor    | Cache Invalidation    | documentStore.ts              | Open   |
| m-11 | Minor    | Stale Data            | useTransactionRecovery.ts     | Open   |
