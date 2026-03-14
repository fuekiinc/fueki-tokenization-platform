# Fueki Tokenization Platform — Comprehensive Security Audit Report

**Date:** 2026-03-12
**Auditor:** Independent Production Audit
**Scope:** Full-stack (Smart Contracts, Frontend Stores, RPC Infrastructure, Backend Auth/KYC)
**Repository:** github.com/mellis0303/fueki-tokenization-platform
**Commit:** `5a5a932` (main branch)

---

## Executive Summary

This audit examined the entire Fueki tokenization platform across 10 Zustand stores, 6 blockchain infrastructure modules, 5 backend services, 10+ smart contracts, and cross-cutting concerns. The platform handles **real user funds**, processes **sensitive PII** (SSN, government ID), and operates across **11+ EVM chains**.

### Finding Totals

| Severity | Count | Description |
|----------|-------|-------------|
| **CRITICAL** | 9 | Immediate fund loss, credential exposure, or PII leak risk |
| **HIGH** | 24 | Data corruption, silent failures, security gaps |
| **MEDIUM** | 33 | Correctness issues, missing validation |
| **LOW** | 18 | Code quality, documentation gaps |
| **TOTAL** | **84** | |

### Top 5 Immediate Risks

1. **No SafeERC20** — USDT and non-compliant ERC-20 tokens will silently fail, locking user funds in exchange and AMM contracts
2. **Hardcoded Alchemy API Key** — shipped in every frontend build, visible to all users, abusable at scale
3. **Plaintext PII in Email** — KYC review emails contain SSN, DOB, and home address in cleartext
4. **Admin PII Access Without Audit Logging** — decrypts full SSN with zero accountability trail
5. **Fee-on-Transfer Accounting Gap** — `addLiquidityETH()` uses wrong transfer helper, breaking accounting for deflationary tokens

---

## CRITICAL Findings (9)

### C-01: Hardcoded Alchemy API Key in Frontend Bundle
- **File:** `src/lib/rpc/endpoints.ts:46-99`
- **Impact:** API key `zLQgWD7IWFOpSpegWuGje` embedded across all 11 chain configs, shipped in every production build. Any user can extract and abuse it for rate-limited RPC calls billed to the project account.
- **Additional:** Key is also leaked to third-party wallets via `wallet_addEthereumChain` RPC URL parameter.
- **Fix:** Rotate key immediately. Replace hardcoded URLs with public endpoints (publicnode.com, drpc.org). Move operator keys to env vars only.

### C-02: No SafeERC20 in AssetBackedExchange
- **File:** `contracts/AssetBackedExchange.sol` (all `transfer()` and `transferFrom()` calls)
- **Impact:** USDT returns `void` instead of `bool`. All transfer calls assume boolean return and will revert, permanently locking escrowed funds for any order using USDT or similar non-compliant tokens.
- **Fix:** Import and use OpenZeppelin `SafeERC20` for all token transfers.

### C-03: No SafeERC20 in LiquidityPoolAMM
- **File:** `contracts/LiquidityPoolAMM.sol:983-994` (`_transferTokenIn`, `_transferTokenOut`, `_transferETHOut`)
- **Impact:** Same as C-02 — all AMM operations break with USDT-style tokens. LP deposits, swaps, and withdrawals will revert.
- **Fix:** Use `SafeERC20.safeTransfer()` and `SafeERC20.safeTransferFrom()`.

### C-04: Open `receive()` Functions Trap ETH Permanently
- **Files:** `AssetBackedExchange.sol:646`, `LiquidityPoolAMM.sol:1059`
- **Impact:** Both contracts have `receive() external payable {}` with no withdrawal mechanism. Any ETH sent directly (not through a function) is permanently locked.
- **Fix:** Remove `receive()` or add admin withdrawal. Add `revert()` to reject accidental sends.

### C-05: Fee-on-Transfer Accounting Gap in addLiquidityETH
- **File:** `contracts/LiquidityPoolAMM.sol:508,512`
- **Impact:** `addLiquidityETH()` uses `_transferTokenIn()` (line 508) instead of `_safeTransferIn()`. For fee-on-transfer tokens, the contract credits more tokens than it actually received, inflating LP shares and allowing theft of other users' liquidity.
- **Fix:** Use `_safeTransferIn()` consistently (which measures actual balance change).

### C-06: Plaintext PII in KYC Review Emails
- **File:** `backend/src/services/email.ts:244-269`
- **Impact:** Admin review emails contain full name, DOB, nationality, address, and SSN in plaintext email body. Email traverses SMTP relay infrastructure in cleartext (no `requireTLS` enforcement).
- **Fix:** Email should contain only user ID + link to admin panel. Never transmit PII via email.

### C-07: Admin PII Decryption Without Audit Logging
- **File:** `backend/src/routes/admin.ts:170-188`
- **Impact:** `GET /api/admin/users/:id` decrypts ALL PII including full SSN with zero audit trail. No record of who accessed what data or when. Regulatory non-compliance (GDPR, SOC2, CCPA).
- **Fix:** Add comprehensive audit logging for every PII access. Mask SSN (show last 4 only). Log accessor IP, timestamp, and user ID.

### C-08: AUTH_BOOTSTRAP_TIMEOUT kills valid sessions
- **File:** `src/store/authStore.ts`
- **Impact:** `AUTH_BOOTSTRAP_TIMEOUT_MS = 3500ms` — Cloud Run cold starts routinely take 5-10s. On first visit, the timeout fires, calls `clearAuth()`, which wipes the valid refresh cookie. User is permanently logged out despite having a valid session.
- **Fix:** Increase to 10000ms minimum. Add retry with exponential backoff. Don't clear refresh cookie on timeout — just mark state as "loading".

### C-09: KYC Status Fuzzy Matching Creates Privilege Escalation
- **File:** `src/lib/auth/kycStatus.ts`
- **Impact:** `normalizeKycStatus` uses `.includes('verif')` which matches both "verified" AND "unverified" → maps to "approved". Similarly `.includes('complete')` matches "incomplete" → "approved". Users with unverified/incomplete KYC could be treated as approved.
- **Fix:** Use exact string matching or `startsWith()` with strict status enums.

---

## HIGH Findings (24)

### Wallet Store (5 HIGH)
| ID | File | Line | Finding |
|----|------|------|---------|
| W-H1 | `walletStore.ts` | 282-296 | `resetWallet()` does NOT reset `_switchInProgress` — chain switch after logout gets stuck |
| W-H2 | `walletStore.ts` | 251 | `tokenBalances` not scoped by chainId — shows cross-chain stale data |
| W-H3 | `useWallet.ts` | 610-612 | Chain switch guard `_switchInProgress` races with React state batching |
| W-H4 | `useWallet.ts` | — | No AbortController for in-flight chain switches — can't cancel mid-switch |
| W-H5 | `WalletConnectionController.tsx` | — | 2.5s debounced disconnect poisoned by stuck `_switchInProgress` |

### Auth Store (3 HIGH)
| ID | File | Finding |
|----|------|---------|
| A-H1 | `authStore.ts` | `_initPromise` never reset — blocks future re-initialization |
| A-H2 | `client.ts` | `shouldAttemptSilentRefresh` is dead code — hard redirect bypasses Zustand |
| A-H3 | `authSession.ts` | Access token in module-level var — multi-tab invalidation cascade |

### Trade Store (2 HIGH)
| ID | File | Finding |
|----|------|---------|
| T-H1 | `tradeStore.ts` | Pending txs NOT persisted to localStorage — lost on refresh, users double-submit |
| T-H2 | `TradeForm.tsx:109` | Local `useState(0.5)` slippage ignores store's persisted value — store slippage is dead code |

### RPC Infrastructure (6 HIGH)
| ID | File | Finding |
|----|------|---------|
| R-H1 | `endpoints.ts` | Thundering herd: all endpoints exit cooldown simultaneously → burst of probes |
| R-H2 | `endpoints.ts` | Healthy endpoint cache (3 min) expires mid-operation → retry hits different RPC |
| R-H3 | `txExecution.ts` | 21s+ retry delay (1.5+3+4.5+12s) — doc says 3 attempts, code has 4 |
| R-H4 | `txExecution.ts` | 180s confirmation timeout too long for L2 chains (should be 30-60s) |
| R-H5 | `transactionRecovery.ts` | Cross-tab sync claim is false — no `addEventListener('storage')` in module |
| R-H6 | `endpoints.ts` | Alchemy key leaked to wallets via `wallet_addEthereumChain` rpcUrls param |

### Backend (3 HIGH)
| ID | File | Finding |
|----|------|---------|
| B-H1 | `admin.ts` | GET uses hashed token lookup, POST uses raw token — admin approval workflow may be broken |
| B-H2 | `auth.ts` | No per-account lockout — brute force limited only by IP rate limit |
| B-H3 | `auth.ts` | `SameSite=None` default on refresh cookie — CSRF risk if CORS isn't tight |

### Smart Contracts (4 HIGH)
| ID | File | Finding |
|----|------|---------|
| SC-H1 | `RestrictedLockupToken.sol:981` | No timelock on `upgradeTransferRules()` — admin can change rules instantly |
| SC-H2 | `Dividends.sol:35` | `tokenPrecisionDivider = 10000` causes rounding loss + front-run `fundDividend()` |
| SC-H3 | `RestrictedLockupToken.sol:857` | `enforceTransferRestrictions` is `public` should be `internal` — anyone can call |
| SC-H4 | `Dividends.sol:76,162,182` | Unsafe `unchecked` subtractions — underflow possible in edge cases |

### Cross-Cutting (1 HIGH)
| ID | File | Finding |
|----|------|---------|
| X-H1 | `transactionRecovery.ts:76`, `contractDeployerStore.ts:144` | localStorage deserialization uses unsafe `as` cast without schema validation |

---

## MEDIUM Findings (33)

### Wallet Store (7)
- `normalizeWalletState` only downgrades — can't recover from stale `degraded` state
- `hasPersistedConnection()` doesn't validate address format or chainId type
- Persisted connection 24h TTL — corrupted entry crashes or degrades
- `clearPersistedConnection()` not called on all disconnect paths
- RPC preflight blocks chain switch by 3.5s on slow networks
- `wallet_addEthereumChain` uses stale chain config if RPC endpoints rotated
- No impossible-state detection (e.g., `isConnected=true` + `status=disconnected`)

### Auth Store (4)
- `startDemo()` doesn't set `isAuthenticated` — demo mode is partially broken
- `clearAuth()` cannot clear httpOnly refresh cookie from client JS
- Token refresh race — two concurrent 401s may both trigger refresh
- `_initPromise` resolved state blocks future `initialize()` calls

### Exchange/Trade Stores (5)
- Unbounded `orders[]` growth — no pruning of filled/cancelled orders
- Quote cache not scoped by pair — stale quote for wrong pair
- Race between `setOrders()` fetch response and `handleOrderUpdate()` event
- No monotonic order status transition guard (filled → active possible)
- Scope switch doesn't clear pending transactions from previous chain

### RPC Infrastructure (7)
- No duplicate tx submission detection across retries on different RPCs
- No nonce gap handling — stuck predecessor blocks all subsequent txs
- 5-min stuck detection threshold not chain-appropriate (L2 vs L1)
- Two-tab race on stuck tx recovery (both tabs attempt speed-up)
- RPC cache returns pre-transfer balance after transfer (30s stale window)
- Cache sweep timer (60s `setInterval`) never cleaned up
- Provider cache uses FIFO eviction (not LRU) — dead providers never cleaned

### Backend (5)
- Static AES-256-GCM encryption key — no versioning or rotation mechanism
- Support notification emails include IP address and User-Agent
- `buildTokenLookupCandidates` sends raw token to DB query
- SMTP transport doesn't enforce `requireTLS`
- PII in email subject lines

### Smart Contracts (5)
- Rounding dust accumulation in partial order fills (AssetBackedExchange)
- Expired orders lock escrowed funds without auto-reclaim
- TWAP oracle overflow risk in `unchecked` block (LiquidityPoolAMM)
- OrbitalPool events emit wrong deposit amounts (lines 468-470)
- WrappedAssetFactory: permissionless token creation enables phishing

### Cross-Cutting (3)
- Custom Solidity error selectors not decoded — user sees "undefined" revert reason
- No push mechanism (WebSocket/SSE) for KYC approvals or order fills
- Wallet localStorage validation doesn't check address format or chainId type

---

## LOW Findings (18)

### Wallet Store (5)
- Balance field not explicitly cleared on disconnect (shows stale)
- Multiple address case comparisons without consistent checksumming
- `lastSyncAt` not checked before displaying potentially stale balances
- Chain switch timeout values (30s/15s) not configurable
- No telemetry for chain switch failures

### Auth Store (3)
- No structured logging for auth failures
- Demo mode cleanup incomplete on transition to real auth
- Bootstrap timeout not configurable per environment

### Exchange/Trade (5)
- Max 20 pending txs — silent drop of tx #21
- No user notification when trade history reaches 100-entry cap
- Slippage upper bound of 5000 bps (50%) seems intentionally high but undocumented
- `getSlippageDecimal()` correctness depends on bps interpretation
- Display formula inconsistency in TradeForm (line 1386)

### RPC (2)
- Sequential multicall batch execution (should be parallel)
- No Multicall3 deployment pre-check for unsupported chains

### Smart Contracts (3)
- Gas concerns with OrbitalPool 8-token swaps
- `getActiveOrders()` unbounded scan gas cost (1000+ orders)
- Minimum liquidity constant (1000) may not prevent donation attack for all token decimals

---

## Recommendations by Priority

### Immediate (Week 1)
1. **Rotate Alchemy API key** — replace hardcoded defaults with public endpoints
2. **Add SafeERC20** to AssetBackedExchange and LiquidityPoolAMM
3. **Fix/remove open `receive()` functions** in contracts
4. **Fix fee-on-transfer gap** in `addLiquidityETH()`
5. **Remove plaintext PII** from all email notifications
6. **Add audit logging** for admin PII access
7. **Increase AUTH_BOOTSTRAP_TIMEOUT** to 10000ms with retry
8. **Fix KYC normalizeKycStatus** — use exact string matching

### Week 2
9. Fix `resetWallet()` to clear `_switchInProgress`
10. Fix admin action token POST lookup (raw vs hashed)
11. Add per-account lockout for brute force protection
12. Persist pending transactions to localStorage
13. Connect TradeForm slippage to store (or remove store slippage)
14. Add localStorage schema validation (match tradeStore's pattern)
15. Fix cross-tab transaction sync (add StorageEvent listener)

### Week 3-4
16. Add WebSocket/SSE for real-time KYC and order notifications
17. Implement encryption key rotation mechanism
18. Add timelock to `upgradeTransferRules()`
19. Add custom error decoding for contract reverts
20. Implement chain-appropriate transaction timeouts
21. Fix BigInt precision loss in `baseUnitsToNumber()`
22. Add pruning for filled/cancelled orders
23. Enforce SMTP TLS (`requireTLS: true`)

### Ongoing
24. Add structured audit logging across all services
25. Regular dependency audits (`npm audit`, Slither, Mythril)
26. Load testing for RPC infrastructure under failure conditions
27. Fuzz testing for smart contracts (`forge test --fuzz-runs 10000`)

---

## Files Audited

### Frontend Stores (10)
- `src/store/walletStore.ts` (369 lines)
- `src/store/authStore.ts`
- `src/store/exchangeStore.ts`
- `src/store/tradeStore.ts`
- `src/store/contractDeployerStore.ts`
- `src/store/uiStore.ts`
- `src/store/networkStore.ts`
- `src/store/dexStore.ts`
- `src/store/portfolioStore.ts`
- `src/store/analyticsStore.ts`

### Blockchain Infrastructure (6)
- `src/lib/rpc/endpoints.ts` (445 lines)
- `src/lib/blockchain/txExecution.ts`
- `src/lib/transactionRecovery.ts`
- `src/lib/blockchain/rpcCache.ts`
- `src/lib/blockchain/contracts.ts`
- `src/lib/blockchain/multicall.ts`

### Wallet Integration (3)
- `src/hooks/useWallet.ts` (713 lines)
- `src/wallet/WalletConnectionController.tsx` (433 lines)
- `src/lib/tokenAmounts.ts`

### Backend Services (5)
- `backend/src/config.ts`
- `backend/src/routes/auth.ts`
- `backend/src/routes/admin.ts`
- `backend/src/services/kyc.ts`
- `backend/src/services/email.ts`
- `backend/src/services/encryption.ts`
- `backend/src/services/tokenHash.ts`

### Smart Contracts (10)
- `contracts/AssetBackedExchange.sol`
- `contracts/LiquidityPoolAMM.sol`
- `contracts/orbital/OrbitalPool.sol`
- `contracts/WrappedAssetFactory.sol`
- `contracts/security-token/RestrictedLockupToken.sol`
- `contracts/security-token/Dividends.sol`

### Cross-Cutting (4)
- `src/lib/errorUtils.ts`
- `src/lib/auth/kycStatus.ts`
- `src/lib/authSession.ts`
- `src/lib/api/client.ts`

---

**End of Report**
