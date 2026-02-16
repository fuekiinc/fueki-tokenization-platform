# Fueki Tokenization Platform -- User Flow Audit

**Agent**: FlowAuditor (Agent 5 of 15)
**Date**: 2026-02-16
**Scope**: All user journeys, state transitions, friction points, dead ends

---

## Table of Contents

1. [Routing & Navigation Architecture](#1-routing--navigation-architecture)
2. [Flow 1: Onboarding (Login / Signup / KYC)](#2-flow-1-onboarding)
3. [Flow 2: Token Creation (Mint)](#3-flow-2-token-creation-mint)
4. [Flow 3: Token Purchase / Exchange](#4-flow-3-token-purchase--exchange)
5. [Flow 4: Portfolio Management](#5-flow-4-portfolio-management)
6. [Flow 5: Withdrawal / Redemption (Burn)](#6-flow-5-withdrawal--redemption-burn)
7. [Flow 6: Wallet Connection](#7-flow-6-wallet-connection)
8. [Flow 7: Admin / Approval Flow](#8-flow-7-admin--approval-flow)
9. [Flow 8: Error Recovery](#9-flow-8-error-recovery)
10. [Flow 9: Navigation Structure](#10-flow-9-navigation-structure)
11. [Flow 10: State Transition Map](#11-flow-10-state-transition-map)
12. [Cross-Flow Inconsistencies](#12-cross-flow-inconsistencies)
13. [Severity Summary Table](#13-severity-summary-table)
14. [Recommendations](#14-recommendations)

---

## 1. Routing & Navigation Architecture

### Route Map

```
/                           --> Redirect to /dashboard (protected)
/login                      --> LoginPage (AuthRedirect wrapper)
/signup                     --> SignupPage (AuthRedirect wrapper)
/pending-approval           --> PendingApprovalPage (NO AuthRedirect, NO ProtectedRoute)
/dashboard                  --> DashboardPage (protected)
/mint                       --> MintPage (protected)
/portfolio                  --> PortfolioPage (protected)
/exchange                   --> ExchangePage (protected, lazy)
/advanced                   --> OrbitalAMMPage (protected, lazy)
/*                          --> Redirect to /login
```

### Layout Hierarchy

```
App
  |-- AuthInitializer (runs initialize() once)
  |
  |-- AuthLayout (no navbar)
  |     |-- /login        (AuthRedirect > LoginPage)
  |     |-- /signup       (AuthRedirect > SignupPage)
  |     |-- /pending-approval (PendingApprovalPage, NO AuthRedirect)
  |
  |-- ProtectedRoute (requires auth + KYC approved)
        |-- Layout (navbar, toaster)
              |-- /dashboard
              |-- /mint
              |-- /portfolio
              |-- /exchange
              |-- /advanced
```

### Guard Logic Summary

**ProtectedRoute** (guards all app pages):
1. Not initialized --> full-screen loader
2. Not authenticated --> redirect to /login (preserves `from` location)
3. KYC `not_submitted` --> redirect to /signup with `step: kyc`
4. KYC `pending` or `rejected` --> redirect to /pending-approval
5. KYC `approved` --> render child routes

**AuthRedirect** (guards login/signup):
1. Not initialized --> full-screen loader
2. Authenticated + KYC approved --> redirect to previous location or /dashboard
3. Authenticated + KYC pending/rejected --> redirect to /pending-approval
4. Authenticated + KYC not_submitted + on /login --> redirect to /signup with `step: kyc`
5. Otherwise --> render children

---

## 2. Flow 1: Onboarding

### 2.1 Complete Onboarding Flow Diagram

```
[First Visit]
     |
     v
[/* catch-all] --> Redirect to /login
     |
     v
+------------------+
|   LOGIN PAGE     |
|  email + password|
+------------------+
     |                          |
     | (has account)            | (no account)
     v                          v
  [login()]              +------------------+
     |                   |   SIGNUP PAGE    |
     |                   | 4-step wizard    |
     |                   +------------------+
     |                        |
     |                   Step 1: Account (email, password, confirm)
     |                        |
     |                   Step 2: Personal (first, last, DOB)
     |                        |
     |                   Step 3: Address (street, city, state, zip, country)
     |                        |
     |                   Step 4: Identity (SSN, doc type, doc upload)
     |                        |
     |                   [register() + uploadDocument() + submitKYC()]
     |                        |
     v                        v
+---[Route based on kycStatus]---+
|                                |
| approved    | pending/rejected | not_submitted
v             v                  v
/dashboard   /pending-approval   /signup?step=kyc
              |
              v
     +------------------+
     | PENDING APPROVAL |
     | polls every 30s  |
     +------------------+
     |          |            |
     | approved | rejected   | pending
     v          v            v
  /dashboard  [shows error   [shows clock,
  (auto 3s)   + "Try Again"  check status btn,
               + "Contact     sign out]
               Support"]
```

### 2.2 Findings

#### FINDING F1-01: PendingApprovalPage lacks AuthRedirect guard [SEVERITY: MEDIUM]

**File**: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/App.tsx` (line 46)

The `/pending-approval` route is wrapped in `<Suspense>` but NOT in `<AuthRedirect>`. This means:
- An unauthenticated user can navigate directly to `/pending-approval`
- The page will render with `user` as null, `kycStatus` defaults to `'pending'` (line 71 of PendingApprovalPage.tsx: `user?.kycStatus ?? 'pending'`)
- The user sees a "pending approval" screen with no account context
- The "Check Status" button will fire an API call that will fail (no auth token)
- The "Sign Out" button will attempt logout on a non-authenticated session

**Impact**: Confusing UX for unauthenticated users who land on this URL. No crash, but a dead-end experience.

#### FINDING F1-02: Signup wizard does NOT restore step from location state [SEVERITY: LOW]

**File**: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/SignupPage.tsx`

When `ProtectedRoute` redirects a user with `kycStatus === 'not_submitted'` to `/signup` with `state: { step: 'kyc' }`, the SignupPage ignores this state entirely. It always starts at step 0 (Account). The `useLocation` hook is not called in SignupPage.

**Impact**: A user who already has an account but has not submitted KYC is forced to re-enter account details (email/password) even though they are already registered. This creates a contradictory situation where the registration API call in `handleFinalSubmit` would fail with a "duplicate email" error.

#### FINDING F1-03: Signup wizard data loss risk on browser back button [SEVERITY: LOW]

**File**: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/SignupPage.tsx`

All wizard data is stored in React local state (`accountData`, `personalData`, `addressData`). If the user navigates away from `/signup` via the browser back button or by clicking "Sign in" at the bottom, all entered data is lost. There is no confirmation dialog and no persistence to sessionStorage.

The in-wizard "Back" button (lines 418-425) correctly preserves form data to state before decrementing the step counter. However, the browser's native back button bypasses this logic entirely.

#### FINDING F1-04: Three sequential API calls in signup with no rollback [SEVERITY: HIGH]

**File**: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/SignupPage.tsx` (lines 457-490)

The final submission performs three sequential API calls:
1. `authRegister()` -- creates the account
2. `uploadDocument()` -- uploads identity document
3. `submitKYC()` -- submits KYC data

If step 2 or 3 fails, the account is already created but the user sees a generic error toast. The user is NOT redirected to any recovery path. If they try to submit again, step 1 will fail because the email is now taken. The user is stuck.

**Impact**: Users can get into an unrecoverable state requiring manual backend intervention.

#### FINDING F1-05: Login post-redirect does not use `location.state.from` [SEVERITY: LOW]

**File**: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/LoginPage.tsx` (lines 56-74)

After successful login, the page checks `kycStatus` and navigates accordingly:
- `approved` --> `/dashboard` (hardcoded)
- `pending` --> `/pending-approval`
- else --> `/signup`

However, if the user was redirected to `/login` from a deep link (e.g., `/exchange`), the `ProtectedRoute` passes `location.state.from` but LoginPage never reads it. The user always lands on `/dashboard` rather than their intended destination.

Note: `AuthRedirect` DOES read `location.state.from` (line 71 of ProtectedRoute.tsx), but that only fires if the user is ALREADY authenticated when visiting `/login`. On a fresh login submission, the navigate in `onSubmit` fires first.

#### FINDING F1-06: No "Forgot Password" flow [SEVERITY: MEDIUM]

**File**: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/LoginPage.tsx`

The login page has no "Forgot password?" link or password reset functionality. Users who forget their password have no self-service recovery option.

#### FINDING F1-07: PendingApproval "Try Again" creates contradictory flow for rejected users [SEVERITY: MEDIUM]

**File**: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/PendingApprovalPage.tsx` (line 312)

When KYC is rejected, the "Try Again" button navigates to `/signup` with `state: { step: 'kyc' }`. But as noted in F1-02, SignupPage ignores this state and starts at Step 1 (Account creation). The user would need to re-register, which would fail because their email already exists.

**Impact**: Rejected users have no viable path to resubmit KYC through the UI.

---

## 3. Flow 2: Token Creation (Mint)

### 3.1 Mint Flow Diagram

```
+-------------------+
|    MINT PAGE      |
| (4-step workflow) |
+-------------------+
         |
   [Step 1: Upload Document]
         |
    +----v----+
    | FileUploader |
    | drop zone    |
    | JSON/CSV/XML |
    | PDF/PNG/JPG  |
    +----+----+
         |
    [Select file]
         |
    [Click "Parse & Analyze"]
         |
    [parseFile() runs locally]
         |
    +----v---------+         +----------+
    | Success:     |         | Error:   |
    | sets         |         | shows    |
    | currentDoc   |         | error +  |
    +--------------+         | retry    |
         |                   +----------+
         v
   [Step 2: Review Data]
   (TransactionPreview shows parsed transactions)
         |
         v
   [Step 3: Configure Token]
         |
    +----v--------+
    | MintForm    |
    | - name      |
    | - symbol    |
    | - amount    |
    | - recipient |
    +----+--------+
         |
    [Wallet connected?]--NO--> [Connect Wallet prompt]
         |YES
    [Network supported?]--NO--> [Switch Network banner]
         |YES
    [Document loaded?]--NO--> [No Document prompt]
         |YES
    [Validate fields]
         |
    [Click "Mint Token"]
         |
    +----v-----------+
    | TX pending     |
    | shimmer bar    |
    | wallet prompt  |
    +----+-----------+
         |
    +----v-----------+         +----------+
    | TX confirmed   |         | TX failed|
    | success card   |         | error    |
    | tx hash link   |         | "Try     |
    | "Mint Another" |         |  Again"  |
    +----------------+         +----------+
         |
   [Step 4: Mint History]
   (MintHistory shows past mints)
```

### 3.2 Findings

#### FINDING F2-01: Mint page has no explicit back navigation between steps [SEVERITY: LOW]

**File**: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/MintPage.tsx`

The MintPage uses a derived `activeStep` based on state (whether `currentDocument` exists and whether a mint has been confirmed). There are no "Back" buttons. The step transitions are implicit:
- Step 1 -> 2 happens automatically when a document is parsed
- Step 2 -> 3 requires filling out the MintForm (shown simultaneously on desktop)
- Step 3 -> 4 happens on successful mint

If the user wants to go back from step 3 to step 1 (upload a different document), they must click "Upload Another File" in the FileUploader success state. This is available but not obvious.

#### FINDING F2-02: No data preservation on premature exit [SEVERITY: LOW]

**File**: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/MintPage.tsx`

If the user navigates away from the Mint page mid-flow (e.g., clicks "Portfolio" in the nav), all form data and the parsed document are lost. The `currentDocument` in the Zustand store persists across navigation, but the MintForm's local state (tokenName, tokenSymbol, etc.) does not.

**Impact**: Mild friction -- user must re-enter token configuration if they navigate away.

#### FINDING F2-03: Mint amount pre-filled with document value but editable [SEVERITY: INFO]

**File**: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/components/Mint/MintForm.tsx` (lines 156-158)

The mint amount is pre-filled with `document.totalValue` and capped at that value. The validation at line 157 prevents minting more than the document value, with defense-in-depth re-validation at line 226 before submitting. This is well-implemented.

#### FINDING F2-04: Two-step upload + parse requires explicit "Parse" button click [SEVERITY: LOW]

**File**: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/components/Upload/FileUploader.tsx`

After dropping/selecting a file, the user must click "Parse & Analyze Document" as a separate action. The file is NOT auto-parsed. While this gives the user a chance to remove the wrong file before parsing, it adds an extra step. Many competing platforms auto-parse on drop.

#### FINDING F2-05: No confirmation dialog before minting on-chain transaction [SEVERITY: MEDIUM]

**File**: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/components/Mint/MintForm.tsx` (line 169)

Clicking "Mint Token" immediately initiates the blockchain transaction with no intermediary confirmation dialog showing a summary of what will be minted. The wallet popup acts as the confirmation, but users may not fully review the details in the MetaMask popup.

---

## 4. Flow 3: Token Purchase / Exchange

### 4.1 Exchange Flow Diagram

```
+---------------------+
|   EXCHANGE PAGE     |
| (requires wallet)   |
+---------------------+
         |
    [Wallet connected?]--NO--> [Connect Wallet hero]
         |YES
    [Network supported?]--NO--> [Network Not Supported card]
         |YES
    [Assets loaded?]--NO--> [Loading spinner / No assets warning]
         |YES
         v
+------------------------------------------+
| Three-column layout (desktop)            |
| Mobile: tabbed (book/trade/orders)       |
|                                          |
| +----------+ +----------+ +----------+  |
| |Order Book| |Trade Form| |My Orders |  |
| |           | | sell tok | |          |  |
| |           | | buy tok  | |          |  |
| |           | | amounts  | |          |  |
| +----------+ +----------+ +----------+  |
|                                          |
| +----------+ +----------+               |
| |Liquidity | |Pool Info |               |
| |Panel     | |          |               |
| +----------+ +----------+               |
+------------------------------------------+
```

### 4.2 Findings

#### FINDING F3-01: No token browsing/discovery mechanism [SEVERITY: MEDIUM]

**File**: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/ExchangePage.tsx`

The exchange only shows tokens the user already owns (fetched via `getUserAssets`). There is no marketplace view, token search, or discovery mechanism for browsing all available tokens on the platform. A user who wants to buy a token they do not already own has no way to find it.

**Impact**: The exchange is effectively limited to users who already hold tokens. New users cannot purchase tokens from the exchange.

#### FINDING F3-02: Pair selection state not synchronized with TradeForm [SEVERITY: LOW]

**File**: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/ExchangePage.tsx` (lines 127-128)

The page maintains `selectedSellToken` and `selectedBuyToken` for the OrderBook, but these are separate from the token selections inside TradeForm. The TradeForm manages its own internal token selections. Changes in the page-level pair selectors do not propagate to TradeForm and vice versa.

**Impact**: The OrderBook may show orders for a different pair than what the user is configuring in the TradeForm.

#### FINDING F3-03: No purchase confirmation flow [SEVERITY: MEDIUM]

The exchange uses limit orders (create order / fill order). There is no guided "purchase flow" with:
- Token details/description page
- Price comparison
- Confirmation summary before signing

The user must understand limit orders and fill amounts. This is a high barrier for non-DeFi-native users.

---

## 5. Flow 4: Portfolio Management

### 5.1 Portfolio Flow Diagram

```
+---------------------+
|  PORTFOLIO PAGE     |
| (requires wallet)   |
+---------------------+
         |
    [Wallet connected?]--NO--> [Connect Wallet prompt]
         |YES
         v
+------------------------------------------+
| Summary Stats (4 cards)                  |
| Portfolio Value | Assets | Locked | Types|
+------------------------------------------+
         |
+------------------------------------------+
| Search / Sort / View Toggle              |
| [search] [name|balance|value] [grid|list]|
+------------------------------------------+
         |
+------------------------------------------+
| Asset Cards Grid/List                    |
| Each card:                               |
|   - name, symbol, doc type badge         |
|   - balance, original value              |
|   - document hash                        |
|   - [Transfer] [Burn] [Explorer]         |
|   - expandable: contract, supply, value  |
+------------------------------------------+
         |
    [Transfer] --> Transfer Modal
    [Burn]     --> Burn Modal (with warning)
    [Explorer] --> opens block explorer
```

### 5.2 Findings

#### FINDING F4-01: No transaction history view in Portfolio [SEVERITY: MEDIUM]

**File**: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/PortfolioPage.tsx`

The Portfolio page shows assets and allows transfer/burn operations, but there is no transaction history panel. Users cannot see past transfers, burns, or other activity related to their portfolio from this page. The Dashboard has an ActivityFeed, but Portfolio does not.

#### FINDING F4-02: Portfolio value calculation uses `originalValue` not market value [SEVERITY: MEDIUM]

**File**: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/PortfolioPage.tsx` (line 84)

`computePortfolioValue` sums `originalValue` (the value from the document at mint time). There is no price feed, oracle, or market value tracking. The "Portfolio Value" stat card is misleading because it shows the mint-time document value, not current market value.

#### FINDING F4-03: Transfer and Burn modals properly prevent closure during loading [SEVERITY: INFO -- positive]

**File**: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/PortfolioPage.tsx` (lines 1048-1053, 1173-1179)

Both modals check the loading state before allowing `onClose`. This prevents accidental closure during blockchain transactions. Well-implemented.

#### FINDING F4-04: Burn modal has proper irreversibility warning [SEVERITY: INFO -- positive]

**File**: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/PortfolioPage.tsx` (lines 1200-1214)

The burn modal displays a clear "Irreversible Action" warning with an AlertTriangle icon. This is good UX for a destructive action.

---

## 6. Flow 5: Withdrawal / Redemption (Burn)

### 6.1 Burn Flow Diagram

```
[Portfolio Page] --> [Click "Burn" on asset card]
         |
         v
+---------------------+
|    BURN MODAL       |
| - Available balance |
| - Warning banner    |
| - Amount input      |
| - MAX button        |
| - Contract address  |
| - [Confirm Burn]    |
+---------------------+
         |
    [Validate amount]
         |
    [Send burnAsset tx]
         |
    +----v-----------+         +----------+
    | TX confirmed   |         | TX failed|
    | modal closes   |         | error    |
    | optimistic     |         | shown in |
    | balance update |         | modal    |
    | bg refresh     |         +----------+
    +----------------+
```

### 6.2 Findings

#### FINDING F5-01: No explicit confirmation step after clicking "Confirm Burn" [SEVERITY: LOW]

**File**: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/pages/PortfolioPage.tsx` (line 408)

While the burn modal has a warning banner, clicking "Confirm Burn" immediately submits the transaction. There is no "Are you absolutely sure?" secondary confirmation. The wallet popup serves as the final gate, but a double-confirmation pattern would be safer for an irreversible action.

#### FINDING F5-02: No concept of "redemption" (asset-to-underlying conversion) [SEVERITY: MEDIUM]

The platform supports burning tokens (destroying them) but has no concept of redeeming tokens for the underlying asset value. Burning simply removes tokens from circulation with no payout mechanism. Users may expect that burning redeems value, but it does not.

**Impact**: Users might burn tokens expecting to receive ETH or the underlying asset value, only to find the tokens are simply destroyed.

---

## 7. Flow 6: Wallet Connection

### 7.1 Wallet Connection Flow Diagram

```
[Any page requiring wallet]
         |
    [isConnected?]--NO--> [Connect Wallet button/hero]
         |                          |
         |                    [Click Connect]
         |                          |
         |                    [getEthereumProvider()]
         |                          |
         |              +-----NO----+-----YES----+
         |              |                         |
         |         [Error: No wallet]    [eth_requestAccounts]
         |              |                         |
         |              v                    +----v----+
         |         [toast error]             | Success | Fail (4001: rejected)
         |                                   +---------+    |
         |                                        |    [wallet_requestPermissions]
         |                                        |         |
         |                                   [BrowserProvider]
         |                                   [getSigner]
         |                                   [getAddress]
         |                                   [getBalance]
         |                                        |
         |                                   [Update store]
         |                                   [toast success]
         |                                        |
         v                                        v
    [Page renders with wallet data]

--- Event Listeners (registered once globally) ---

accountsChanged:
  accounts.length === 0 --> resetWallet()
  different account    --> reinitialize provider/signer/balance

chainChanged:
  update chainId in store
  if connected: re-run connectWallet()

disconnect:
  resetWallet()
```

### 7.2 Findings

#### FINDING F6-01: Wallet disconnection is client-side only [SEVERITY: LOW]

**File**: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/hooks/useWallet.ts` (lines 323-326)

`disconnectWallet` only resets the Zustand store. It does not call `wallet_revokePermissions` (EIP-2255) on the provider. This means MetaMask still considers the dApp "connected" and will auto-connect on next page load if the user's wallet is unlocked.

#### FINDING F6-02: No wallet selection UI for multi-wallet environments [SEVERITY: LOW]

**File**: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/hooks/useWallet.ts` (lines 163-191)

While `getEthereumProvider()` implements sophisticated discovery (EIP-6963, multi-provider arrays), it always auto-selects the "best" wallet (MetaMask preferred). There is no UI for the user to choose which wallet to connect if multiple are installed. The `discoveredProviders` array is exposed but never consumed by any component.

#### FINDING F6-03: Network switch triggers full wallet reconnection [SEVERITY: LOW]

**File**: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/hooks/useWallet.ts` (line 486)

On `chainChanged`, the code calls `connectWalletRef.current()` which re-runs the full connection flow including `eth_requestAccounts`. This is heavier than needed -- a simpler approach would be to just re-create the provider/signer for the new chain without requesting accounts again.

#### FINDING F6-04: Two-system auth: API auth + wallet auth are completely independent [SEVERITY: HIGH]

**Files**: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/store/authStore.ts`, `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/hooks/useWallet.ts`

The platform has TWO completely independent authentication systems:
1. **API Auth** (authStore): email/password login, JWT tokens, KYC status
2. **Wallet Auth** (useWallet): MetaMask connection, on-chain identity

These systems never interact:
- `User.walletAddress` in the auth types is never populated or validated
- A user can log in with email, pass KYC, then connect ANY wallet
- There is no binding between the KYC-verified identity and the wallet address
- The wallet address used for minting/trading is not tied to the authenticated user

**Impact**: The KYC system provides no meaningful compliance guarantee because wallet addresses are not bound to verified identities. This is a fundamental architectural gap for a regulated tokenization platform.

---

## 8. Flow 7: Admin / Approval Flow

### 8.1 Findings

#### FINDING F7-01: No admin interface exists [SEVERITY: HIGH]

There is NO admin panel, admin routes, admin components, or admin role in the codebase. The KYC review process is entirely dependent on the backend API:
- `POST /api/kyc/submit` -- submits KYC
- `GET /api/kyc/status` -- checks status

The frontend has no mechanism for:
- Reviewing submitted KYC applications
- Approving or rejecting users
- Viewing user lists
- Managing token listings
- System configuration

The PendingApprovalPage polls `GET /api/kyc/status` and reacts to status changes, but there is no frontend UI for an admin to change that status.

---

## 9. Flow 8: Error Recovery

### 9.1 Network Error Mid-Transaction

```
[MintForm: handleMint()]
         |
    [TX submitted, waiting for receipt]
         |
    [Network error / timeout]
         |
    [catch block: sets txState='failed']
    [toast.error with message]
    ["Try Again" button resets form]

    PROBLEM: If the TX was actually submitted to the network
    but the client lost connection before receiving the receipt,
    the user sees "failed" but the TX may confirm on-chain.
    No mechanism to check pending TX status on reconnection.
```

**FINDING F8-01: No pending transaction recovery [SEVERITY: HIGH]**

**Files**: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/components/Mint/MintForm.tsx`

If the user's connection drops after a transaction is submitted but before confirmation:
- The `txHash` is available in state (set at line 255)
- But the component shows "Transaction Failed" and offers "Try Again"
- There is no mechanism to check the status of the pending TX
- If the user clicks "Try Again", they may mint a second token
- There is no localStorage persistence of pending TX hashes

### 9.2 Wallet Disconnect During Signing

```
[User clicks "Mint Token"]
         |
    [Wallet popup appears]
         |
    [User disconnects wallet / locks wallet]
         |
    [MetaMask fires accountsChanged with empty array]
    [resetWallet() clears all wallet state]
         |
    [MintForm: still in 'pending' state]
    [Eventually: ethers throws error]
    [catch block: "Transaction was rejected by the user" or similar]
    [txState='failed', user sees error]

    REASONABLE: The error recovery works here, though the error
    message may be misleading ("rejected" vs "disconnected").
```

### 9.3 Session Expiry During Form Filling

```
[User filling out SignupPage wizard at step 3]
         |
    [JWT access token expires]
         |
    [User has not made any API call yet]
    [NO IMPACT -- form filling is client-side only]
         |
    [User clicks "Submit Verification" at step 4]
         |
    [register() API call]
    [401 response]
    [Axios interceptor attempts token refresh]
    [If refresh fails: redirect to /login]
    [User loses ALL wizard data]
```

**FINDING F8-02: Session expiry during long signup flow causes total data loss [SEVERITY: MEDIUM]**

The signup wizard can take several minutes to complete. If the session expires during form filling, the submission at step 4 will trigger the axios 401 interceptor, which:
1. Attempts token refresh (line 80 of client.ts)
2. On failure: clears localStorage and redirects to `/login` (line 112)
3. All wizard state is lost

However, this is an edge case because new users do not have tokens yet (registration is the first API call). The risk is higher for the "Try Again" flow where a rejected user already has a session.

### 9.4 Browser Back Button

```
/dashboard --> /mint --> [user fills out form] --> [browser back]
         |
    [React Router navigates to /dashboard]
    [MintPage unmounts]
    [All local state (tokenName, tokenSymbol, etc.) lost]
    [currentDocument persists in Zustand store]
         |
    [User navigates back to /mint]
    [MintForm starts with empty tokenName/tokenSymbol]
    [BUT currentDocument is still set]
    [TransactionPreview shows old parsed data]
    [Step indicator shows step 2 (confusing)]
```

**FINDING F8-03: Partial state persistence on navigation creates confusing half-state [SEVERITY: LOW]**

The `currentDocument` persists in Zustand but `MintForm` local state does not. This creates a situation where returning to `/mint` shows the transaction preview from a previous session but the mint form is empty.

---

## 10. Flow 9: Navigation Structure

### 10.1 Navigation Items

```
Navbar (desktop): Dashboard | Mint | Portfolio | Exchange | Orbital AMM
Navbar (mobile):  Same items in slide-over panel

Quick Actions (Dashboard):
  - Upload & Mint --> /mint
  - View Portfolio --> /portfolio
  - Exchange --> /exchange
```

### 10.2 Findings

#### FINDING F9-01: "Orbital AMM" route is `/advanced` -- unclear naming [SEVERITY: LOW]

**File**: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/components/Layout/Navbar.tsx` (line 94)

The nav item says "Orbital AMM" but the route is `/advanced`. This creates a disconnect between the visible label and the URL. Users who try to navigate by URL would not know to go to `/advanced` for AMM features.

#### FINDING F9-02: No breadcrumbs or contextual navigation [SEVERITY: LOW]

None of the pages have breadcrumb navigation. On mobile, the only way to know which page you are on is the highlighted nav item in the slide-over (which requires opening the menu). There is no page title in the header area on some pages.

#### FINDING F9-03: No 404 page [SEVERITY: LOW]

**File**: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/App.tsx` (line 62)

The catch-all route `<Route path="*" element={<Navigate to="/login" replace />} />` silently redirects unknown URLs to `/login`. There is no 404 page. Users who mistype a URL will be redirected without explanation.

#### FINDING F9-04: No settings/profile page [SEVERITY: MEDIUM]

There is no user settings or profile page. Users cannot:
- View their KYC status after approval
- Update their email or personal information
- Change their password
- Link their wallet address to their profile
- View account creation date
- Manage notification preferences

#### FINDING F9-05: Navbar shows wallet button even on desktop but NetworkSelector only in mobile menu [SEVERITY: LOW]

**File**: `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/components/Layout/Navbar.tsx`

On desktop, the Navbar shows: NetworkBadge (read-only) + ThemeToggle + WalletButton. The NetworkSelector (with ability to switch networks) only appears in the mobile slide-over menu. Desktop users must switch networks through their wallet extension directly, or through the MintForm's "Switch to Ethereum" inline buttons.

---

## 11. Flow 10: State Transition Map

### 11.1 Authentication States

```
+------------------+     initialize()     +------------------+
| NOT_INITIALIZED  | ------------------> | INITIALIZED      |
| isInitialized=F  |                     | isInitialized=T  |
+------------------+                     +------------------+
                                                |
                                    +-----------+-----------+
                                    |                       |
                              (no tokens)            (tokens found)
                                    |                       |
                                    v                       v
                          +------------------+   +------------------+
                          | UNAUTHENTICATED  |   | AUTHENTICATED    |
                          | isAuthenticated=F|   | isAuthenticated=T|
                          +------------------+   +------------------+
                                    |                       |
                               login()                 logout()
                               register()              clearAuth()
                                    |                       |
                                    +----------++-----------+
                                               ||
                                               vv
                                    (bidirectional transitions)
```

### 11.2 KYC States

```
not_submitted --> pending --> approved
                         \-> rejected --> (no path back to not_submitted)
```

**FINDING F10-01: No transition from `rejected` back to `not_submitted` [SEVERITY: HIGH]**

Once KYC is rejected, the `kycStatus` remains `rejected`. The "Try Again" button navigates to `/signup` but:
1. The user is already authenticated
2. `AuthRedirect` on `/signup` does NOT redirect them away (because `kycStatus` is `rejected`, and the code at line 76-77 of ProtectedRoute.tsx only redirects `pending` or `rejected` to `/pending-approval`)

Wait -- examining more carefully: `AuthRedirect` (line 76) DOES redirect `rejected` users to `/pending-approval`. So clicking "Try Again" on the PendingApprovalPage navigates to `/signup`, but `AuthRedirect` immediately bounces them back to `/pending-approval`. This is an infinite redirect loop that React Router likely catches with a warning.

**Corrected impact**: The "Try Again" path for rejected users is a navigation dead end that bounces between `/signup` and `/pending-approval`.

### 11.3 Wallet States

```
+------------------+     connectWallet()     +------------------+
| DISCONNECTED     | ---------------------> | CONNECTED        |
| isConnected=F    |                        | isConnected=T    |
+------------------+                        +------------------+
       ^                                           |
       |              disconnectWallet()           |
       |              resetWallet()                |
       |              accountsChanged([])          |
       +-------------------------------------------+
                                                   |
                                          chainChanged(hex)
                                                   |
                                                   v
                                         +------------------+
                                         | CHAIN_CHANGED    |
                                         | (re-connect)     |
                                         +------------------+
```

### 11.4 Combined State Matrix

| Auth State | KYC Status | Wallet | Result |
|---|---|---|---|
| Unauthenticated | N/A | N/A | Sees login page |
| Authenticated | not_submitted | N/A | Redirected to /signup |
| Authenticated | pending | N/A | Sees pending approval |
| Authenticated | rejected | N/A | Sees rejection + dead-end "Try Again" |
| Authenticated | approved | Disconnected | Sees dashboard hero (connect wallet) |
| Authenticated | approved | Connected (wrong network) | Sees "Network Not Supported" on Exchange/AMM |
| Authenticated | approved | Connected (supported) | Full platform access |

---

## 12. Cross-Flow Inconsistencies

### FINDING F12-01: Inconsistent "not connected" handling across pages [SEVERITY: MEDIUM]

Each page handles the "wallet not connected" state differently:

| Page | Behavior |
|---|---|
| DashboardPage | Shows marketing hero with features -- NO connect button |
| MintPage (MintForm) | Shows "Wallet not connected" with Connect Wallet button |
| PortfolioPage | Shows "Connect Your Wallet" with Connect Wallet button |
| ExchangePage | Shows hero with Connect Wallet button |
| OrbitalAMMPage | Shows hero with Connect Wallet button |

The Dashboard is the most problematic: when the wallet is not connected, it shows a full marketing page with NO connect wallet button. The user must find the "Connect Wallet" button in the Navbar. Every other page has its own connect wallet CTA.

### FINDING F12-02: Inconsistent error display patterns [SEVERITY: LOW]

- Login/Signup: Uses `react-hot-toast` for errors
- MintForm: Uses toast AND inline state (`txError`)
- PortfolioPage: Uses inline state in modals (`transferError`, `burnError`)
- ExchangePage: Uses toast
- PendingApprovalPage: Uses toast AND inline state (`rejectionReason`)

While not breaking, the inconsistency means users cannot predict where error information will appear.

### FINDING F12-03: Inconsistent loading patterns [SEVERITY: LOW]

- App initialization: FullScreenLoader (centered spinner)
- Lazy page loads: PageLoader (centered spinner, different styling)
- Portfolio assets: SkeletonCard shimmer
- Exchange assets: Loader2 spinner in GlassCard
- Auth operations: Button loading state (Loader2 icon in button)
- Mint TX: Custom shimmer progress bar

### FINDING F12-04: Duplicate asset-fetching logic [SEVERITY: LOW]

Asset fetching is duplicated across three pages:
- `DashboardPage.fetchData()` (lines 291-466)
- `PortfolioPage.fetchAssets()` (lines 200-234)
- `ExchangePage.fetchAssets()` (lines 177-259)

Each has slightly different logic. DashboardPage also fetches trade history and user orders. PortfolioPage formats values differently (`ethers.formatEther` vs raw `toString`). This creates a risk of data inconsistency between pages.

---

## 13. Severity Summary Table

| ID | Finding | Severity | Category |
|---|---|---|---|
| F1-01 | PendingApprovalPage lacks AuthRedirect guard | MEDIUM | Auth |
| F1-02 | Signup wizard ignores step state from redirect | LOW | Navigation |
| F1-03 | Signup wizard data loss on browser back | LOW | UX |
| F1-04 | Three sequential API calls with no rollback | HIGH | Data Integrity |
| F1-05 | Login does not use `from` location for redirect | LOW | Navigation |
| F1-06 | No "Forgot Password" flow | MEDIUM | Auth |
| F1-07 | "Try Again" from rejected KYC creates dead end | MEDIUM | Navigation |
| F2-01 | No explicit back navigation in mint steps | LOW | UX |
| F2-02 | No data preservation on premature exit | LOW | UX |
| F2-03 | Mint amount capped at document value | INFO+ | Security |
| F2-04 | Two-step upload requires explicit parse click | LOW | UX |
| F2-05 | No confirmation dialog before minting | MEDIUM | UX |
| F3-01 | No token browsing/discovery mechanism | MEDIUM | Feature Gap |
| F3-02 | Pair selection not synced with TradeForm | LOW | UX |
| F3-03 | No guided purchase flow | MEDIUM | UX |
| F4-01 | No transaction history in Portfolio | MEDIUM | Feature Gap |
| F4-02 | Portfolio value uses originalValue not market | MEDIUM | Data |
| F4-03 | Modal prevents closure during loading | INFO+ | UX |
| F4-04 | Burn modal has irreversibility warning | INFO+ | UX |
| F5-01 | No double-confirmation for burn | LOW | UX |
| F5-02 | No redemption mechanism (burn-to-value) | MEDIUM | Feature Gap |
| F6-01 | Wallet disconnect is client-side only | LOW | Wallet |
| F6-02 | No wallet selection UI | LOW | Wallet |
| F6-03 | Network switch triggers full reconnection | LOW | Performance |
| F6-04 | API auth and wallet auth are independent | HIGH | Security/Compliance |
| F7-01 | No admin interface | HIGH | Feature Gap |
| F8-01 | No pending transaction recovery | HIGH | Error Recovery |
| F8-02 | Session expiry causes signup data loss | MEDIUM | Error Recovery |
| F8-03 | Partial state persistence creates half-state | LOW | UX |
| F9-01 | Orbital AMM route name mismatch | LOW | Navigation |
| F9-02 | No breadcrumbs | LOW | Navigation |
| F9-03 | No 404 page | LOW | Navigation |
| F9-04 | No settings/profile page | MEDIUM | Feature Gap |
| F9-05 | NetworkSelector only in mobile menu | LOW | UX |
| F10-01 | Rejected KYC "Try Again" is dead end / loop | HIGH | Navigation |
| F12-01 | Inconsistent "not connected" handling | MEDIUM | Consistency |
| F12-02 | Inconsistent error display patterns | LOW | Consistency |
| F12-03 | Inconsistent loading patterns | LOW | Consistency |
| F12-04 | Duplicate asset-fetching logic | LOW | Maintainability |

### Summary by Severity

| Severity | Count |
|---|---|
| HIGH | 5 |
| MEDIUM | 12 |
| LOW | 17 |
| INFO (positive) | 3 |

---

## 14. Recommendations

### Priority 1: Critical Fixes (HIGH severity)

**R1. Fix the KYC rejection dead end (F10-01, F1-07)**
- Add a new route `/resubmit-kyc` that allows authenticated users with `rejected` status to resubmit KYC without re-registering
- Or update `AuthRedirect` to allow `rejected` users to access `/signup` and skip the Account step
- Update `submitKYC` to handle resubmission (PATCH semantics or a dedicated endpoint)

**R2. Bind wallet address to authenticated user (F6-04)**
- After wallet connection, call an API endpoint to associate the wallet address with the user's account
- On KYC approval, the approved wallet address should be the only one allowed to trade on behalf of that user
- Store `walletAddress` in the User record on the backend

**R3. Add pending transaction recovery (F8-01)**
- Persist pending TX hashes to localStorage with timestamp and type
- On app initialization or wallet reconnection, check any pending TX hashes via `provider.getTransactionReceipt()`
- Show a "pending transactions" banner if unconfirmed TXs are found

**R4. Add atomic registration or rollback logic (F1-04)**
- Option A: Make registration a single API call that handles account creation + document upload + KYC submission atomically on the backend
- Option B: If step 1 (register) succeeds but step 2/3 fails, detect the existing account on retry and skip to step 2/3
- Option C: Store registration progress server-side and resume from where it left off

**R5. Build admin panel (F7-01)**
- Create `/admin` routes behind a role-based guard
- KYC review queue with approve/reject actions
- User management dashboard
- Token registry and analytics

### Priority 2: Important Improvements (MEDIUM severity)

**R6. Guard the /pending-approval route (F1-01)**
- Wrap `/pending-approval` in `AuthRedirect` or add an explicit authentication check
- Redirect unauthenticated users to `/login`

**R7. Add "Forgot Password" flow (F1-06)**
- Add a link on the login page
- Implement email-based password reset flow

**R8. Add confirmation dialog before minting (F2-05)**
- Show a summary modal with token name, symbol, amount, recipient, document details, and estimated gas
- Require explicit confirmation before initiating the blockchain transaction

**R9. Add token discovery to Exchange (F3-01)**
- Fetch all tokens from the factory contract (not just user-owned ones)
- Add a token browser/marketplace view
- Allow users to search for tokens by name, symbol, or contract address

**R10. Add transaction history to Portfolio page (F4-01)**
- Reuse the ActivityFeed component from Dashboard
- Filter to show only transactions for the user's portfolio assets

**R11. Preserve intended destination after login (F1-05)**
- In LoginPage.onSubmit, read `location.state?.from` and navigate there if KYC is approved

**R12. Add a settings/profile page (F9-04)**
- Show user info (email, KYC status, linked wallet)
- Allow password change
- Display account creation date

**R13. Unify Dashboard "not connected" state (F12-01)**
- Add a "Connect Wallet" CTA to the Dashboard hero when wallet is not connected
- Maintain consistency with other pages

### Priority 3: Polish and Consistency (LOW severity)

**R14. Persist signup wizard progress to sessionStorage (F1-03)**
**R15. Make signup wizard respect `state.step` from redirect (F1-02)**
**R16. Auto-parse documents on drop (F2-04)**
**R17. Add breadcrumb navigation (F9-02)**
**R18. Add a proper 404 page (F9-03)**
**R19. Rename `/advanced` route to `/orbital-amm` (F9-01)**
**R20. Centralize asset-fetching logic into a shared hook (F12-04)**
**R21. Standardize error display patterns across all pages (F12-02)**
**R22. Make NetworkSelector available on desktop navbar (F9-05)**
**R23. Add wallet selection UI consuming `discoveredProviders` (F6-02)**
**R24. Use lightweight chain-switch logic instead of full reconnect (F6-03)**

---

*End of FlowAuditor report. 37 findings catalogued across 10 user flow categories.*
