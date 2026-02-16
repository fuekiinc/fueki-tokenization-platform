# Fueki Tokenization Platform -- Microcopy Audit Report

**Agent:** 8 / MicrocopySpecialist
**Audit Date:** 2026-02-16
**Scope:** All user-facing text across `src/pages/` and `src/components/`
**Objective:** Assess clarity, consistency, tone, and terminology across the entire platform UI

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Tone and Voice Assessment](#2-tone-and-voice-assessment)
3. [Category-by-Category Findings](#3-category-by-category-findings)
   - 3.1 [Button Labels](#31-button-labels)
   - 3.2 [Error Messages](#32-error-messages)
   - 3.3 [Empty States](#33-empty-states)
   - 3.4 [Loading States](#34-loading-states)
   - 3.5 [Success Confirmations](#35-success-confirmations)
   - 3.6 [Tooltips and Help Text](#36-tooltips-and-help-text)
   - 3.7 [Navigation Labels](#37-navigation-labels)
   - 3.8 [Form Labels and Placeholders](#38-form-labels-and-placeholders)
   - 3.9 [Tone and Voice Consistency](#39-tone-and-voice-consistency)
   - 3.10 [Terminology Consistency](#310-terminology-consistency)
4. [Terminology Glossary Recommendation](#4-terminology-glossary-recommendation)
5. [Content Style Guide](#5-content-style-guide)
6. [Priority Matrix](#6-priority-matrix)

---

## 1. Executive Summary

The Fueki Tokenization Platform contains approximately 200+ distinct pieces of user-facing microcopy across 8 page files and 13+ component files. The overall quality is solid -- most copy is functional and comprehensible. However, several systemic issues undermine the professional credibility expected of a financial tokenization platform:

**Critical Issues (5):**
- Terminology inconsistency: "wrapped asset," "tokenized asset," and "token" used interchangeably without definition
- Casual tone in financial contexts ("Hang tight!", "New here?")
- Hardcoded Etherscan URL in ActivityFeed bypasses dynamic chain configuration
- Missing success confirmations for Transfer and Burn operations
- No tooltips or contextual help for blockchain-specific terminology

**Major Issues (12):**
- Inconsistent capitalization across button labels and headings
- Empty subtitle on MintPage step 3
- "Burn" action lacks inline explanation of permanence before the modal
- Error messages mix technical jargon with user-friendly language
- Several raw contract error names surface to users

**Minor Issues (18):**
- Placeholder text inconsistencies
- Redundant or overly verbose empty state descriptions
- "Fueki v1.0" in navbar footer -- version strings should not be user-facing copy
- Various small capitalization and punctuation inconsistencies

**Files Audited:**
- `src/pages/LoginPage.tsx`
- `src/pages/SignupPage.tsx`
- `src/pages/DashboardPage.tsx`
- `src/pages/PortfolioPage.tsx`
- `src/pages/ExchangePage.tsx`
- `src/pages/MintPage.tsx`
- `src/pages/OrbitalAMMPage.tsx`
- `src/pages/PendingApprovalPage.tsx`
- `src/components/Common/EmptyState.tsx`
- `src/components/Common/Modal.tsx`
- `src/components/Common/Button.tsx`
- `src/components/Layout/Navbar.tsx`
- `src/components/Exchange/TradeForm.tsx`
- `src/components/Exchange/OrderBook.tsx`
- `src/components/Exchange/UserOrders.tsx`
- `src/components/Mint/MintForm.tsx`
- `src/components/Mint/MintHistory.tsx`
- `src/components/Upload/FileUploader.tsx`
- `src/components/Upload/TransactionPreview.tsx`
- `src/components/Dashboard/ActivityFeed.tsx`
- `src/components/Dashboard/PortfolioChart.tsx`

---

## 2. Tone and Voice Assessment

### Current State

The platform's tone is **inconsistent**, oscillating between three distinct registers:

| Register | Examples | Where Used |
|----------|----------|------------|
| **Marketing/Aspirational** | "Institutional-Grade Asset Tokenization", "Concentrated multi-token liquidity with power-mean invariants" | Dashboard hero, Orbital AMM |
| **Casual/Friendly** | "Hang tight!", "New here?", "You're Approved!" | PendingApproval, Login |
| **Technical/Neutral** | "Approve {symbol} for Exchange", "EmptyName", "Insufficient balance" | Exchange, Mint errors |

### Assessment

For a financial tokenization platform, the tone should be:
- **Confident but not boastful** -- users trust platforms that sound competent, not ones that oversell
- **Clear and precise** -- financial operations require unambiguous language
- **Reassuring without being casual** -- "Hang tight!" trivializes a KYC review that determines account access
- **Consistent across all surfaces** -- the dashboard should not read like a marketing site while the exchange reads like a developer console

### Recommended Voice Profile

| Attribute | Guideline |
|-----------|-----------|
| **Personality** | Professional, knowledgeable, supportive |
| **Register** | Formal-neutral (not stiff, not casual) |
| **Contractions** | Acceptable in non-critical contexts; avoid in warnings, errors, and legal-adjacent copy |
| **Exclamation marks** | Use sparingly; never in error states or status updates |
| **Humor/slang** | Not appropriate for a financial platform |
| **Technical terms** | Always define on first use or provide a tooltip |

---

## 3. Category-by-Category Findings

### 3.1 Button Labels

#### Inventory

| Location | Current Label | Loading State |
|----------|--------------|---------------|
| LoginPage | "Sign In" | "Signing in..." |
| SignupPage (steps 1-3) | "Continue" | -- |
| SignupPage (step 4) | "Submit Verification" | "Creating account..." |
| PortfolioPage | "Mint New Asset" | -- |
| PortfolioPage (empty) | "Mint Your First Asset" | -- |
| PortfolioPage | "Transfer" / "Burn" | -- |
| PortfolioPage (transfer modal) | "Send Tokens" | -- |
| PortfolioPage (burn modal) | "Confirm Burn" | -- |
| PortfolioPage | "MAX" | -- |
| ExchangePage | "Connect Wallet" | -- |
| TradeForm | "Place Buy Order" / "Place Sell Order" | "Creating order..." |
| TradeForm | "Approve {symbol} for Exchange" | "Approving token spend..." |
| TradeForm | "Swap via AMM" | "Swapping via AMM..." |
| UserOrders | "Cancel Order" | -- |
| UserOrders | "Withdraw" | -- |
| MintForm | "Mint Token" | "Confirm in your wallet..." |
| FileUploader | "Parse & Analyze Document" | "Analyzing document..." |
| FileUploader | "Try Again" / "Upload Another File" | -- |
| MintForm | "Use my address" | -- |
| DashboardPage | "Upload & Mint" / "View Portfolio" / "Exchange" | -- |
| PendingApprovalPage | "Check Status" / "Contact Support" / "Sign Out" / "Go to Dashboard" | -- |
| Navbar | "Connect Wallet" / "Disconnect Wallet" | "Connecting..." |
| LoginPage | "Create an account" | -- |

#### Issues Found

**Issue B-01: Inconsistent capitalization in button labels**
- File: Multiple
- Current: "Sign In" (button) vs "Sign in" (implied by context) vs "Sign Out" (PendingApprovalPage)
- Problem: Title Case vs Sentence case is not applied consistently. "Sign In" uses Title Case while "Create an account" uses Sentence case.
- Suggested fix: Adopt a single convention. For a financial platform, **Sentence case** is recommended for all buttons (e.g., "Sign in", "Create an account", "Sign out"). Title Case can feel dated. Exception: proper nouns and product names.

**Issue B-02: "Swap via AMM" exposes internal jargon**
- File: `src/components/Exchange/TradeForm.tsx`
- Current: "Swap via AMM"
- Problem: Users may not know what "AMM" means. Button labels should describe the action, not the mechanism.
- Suggested fix: "Swap tokens" or "Instant swap"

**Issue B-03: "Approve {symbol} for Exchange" is a two-step surprise**
- File: `src/components/Exchange/TradeForm.tsx`
- Current: "Approve {symbol} for Exchange"
- Problem: Users unfamiliar with ERC-20 token approvals may not understand why they need to "approve" before trading. The button appears without prior explanation.
- Suggested fix: Keep the button label but add a brief inline explanation above it: "Before trading, you must authorize the exchange contract to access your {symbol} tokens. This is a one-time approval per token." Also consider: "Authorize {symbol} for trading"

**Issue B-04: "MAX" button has no accessible label**
- File: `src/pages/PortfolioPage.tsx`
- Current: `<button>MAX</button>` (no aria-label)
- Problem: Screen readers will announce "MAX" without context. The button should clarify what it does.
- Suggested fix: Add `aria-label="Set maximum amount"` and consider changing display text to "Max" (sentence case).

**Issue B-05: "Mint Token" vs "Mint New Asset" vs "Mint Your First Asset"**
- File: `src/components/Mint/MintForm.tsx`, `src/pages/PortfolioPage.tsx`
- Current: Three different labels for the same fundamental action
- Problem: Inconsistent terminology for the core platform action. "Token" vs "Asset" confusion.
- Suggested fix: Standardize to "Mint asset" as the primary action label. Use "Mint your first asset" only in the empty state CTA.

**Issue B-06: "Submit Verification" is ambiguous**
- File: `src/pages/SignupPage.tsx`
- Current: "Submit Verification"
- Problem: Could mean "submit for verification" or "submit the verification." The gerund/noun ambiguity is confusing.
- Suggested fix: "Submit for review" or "Complete sign-up"

**Issue B-07: "Confirm Burn" lacks emotional weight for destructive action**
- File: `src/pages/PortfolioPage.tsx`
- Current: "Confirm Burn"
- Problem: For an irreversible, destructive action, the button label should communicate finality more clearly.
- Suggested fix: "Permanently burn tokens" with danger/red styling (which is already applied)

---

### 3.2 Error Messages

#### Inventory

| Location | Error Message |
|----------|--------------|
| LoginPage | "Login failed" (generic catch-all) |
| SignupPage | "File must be under 10 MB" |
| SignupPage | "Only JPG, PNG, and PDF files are accepted" |
| SignupPage | "Please upload an identity document" |
| SignupPage | "Missing information from a previous step" |
| PortfolioPage | "Invalid recipient address" |
| PortfolioPage | "Enter a valid positive number" |
| PortfolioPage | "Insufficient balance. You have {X} {SYMBOL}" |
| PortfolioPage | "Wallet provider not available" |
| PortfolioPage | "Transfer failed" / "Burn failed" |
| ExchangePage | "Failed to load your asset list" |
| ExchangePage | "Failed to load {X} asset(s). Some assets may be missing." |
| ExchangePage | "Failed to load wrapped assets" |
| TradeForm | "Sell and buy tokens must be different" |
| TradeForm | "Please approve the sell token first" |
| TradeForm | "Insufficient balance" |
| TradeForm | "You cannot fill your own order" |
| TradeForm | "This order is already fully filled" |
| MintForm | Various contract error mappings |
| FileUploader | "No valid transactions found in this file. Please check the file structure." |
| FileUploader | "File exceeds the 10 MB size limit. Please upload a smaller file." |
| Validation (zod) | "Email is required", "Enter a valid email address", "Password must be at least 8 characters", etc. |

#### Issues Found

**Issue E-01: "Login failed" is too vague**
- File: `src/pages/LoginPage.tsx` (line 72)
- Current: `const message = err instanceof Error ? err.message : 'Login failed';`
- Problem: When the server returns a non-Error object, the user sees "Login failed" with no guidance on what to do. Even the Error.message path may surface server-side messages like "401 Unauthorized."
- Suggested fix: "Unable to sign in. Please check your email and password and try again." For network errors: "Unable to connect. Please check your internet connection."

**Issue E-02: Contract errors leak technical names to users**
- File: `src/components/Mint/MintForm.tsx`
- Current: Error mapping includes entries like `EmptyName`, `EmptySymbol`, `ZeroAmount`, `InvalidRecipient`, `DocumentAlreadyTokenized`
- Problem: While the component does map these to friendly messages, the fallback path (`default`) may surface raw revert strings. The mapped messages are generally good, but some could be improved.
- Current mapping examples:
  - `EmptyName` -> "Token name cannot be empty."
  - `DocumentAlreadyTokenized` -> "This document has already been tokenized."
  - `NameTooLong` -> "Token name exceeds the maximum length (32 characters)."
- Suggested improvement: Add a catch-all that never surfaces technical details: "Something went wrong while minting. Please try again or contact support." Ensure `error.reason`, `error.data`, or raw revert strings never reach the toast.

**Issue E-03: "Wallet provider not available" is opaque**
- File: `src/pages/PortfolioPage.tsx`
- Current: "Wallet provider not available"
- Problem: Users may not understand what a "wallet provider" is. This typically means MetaMask or similar is not installed.
- Suggested fix: "No wallet detected. Please install MetaMask or another Web3 wallet to continue."

**Issue E-04: "Transfer failed" and "Burn failed" provide no recovery guidance**
- File: `src/pages/PortfolioPage.tsx`
- Current: "Transfer failed" / "Burn failed"
- Problem: These generic messages give users no information about why the operation failed or what to do next. The actual error from the blockchain is swallowed.
- Suggested fix: Parse the error for common cases:
  - User rejected: "Transaction cancelled."
  - Insufficient gas: "Insufficient funds for gas. Please add ETH to your wallet."
  - Generic: "Transfer could not be completed. Please try again."

**Issue E-05: "Sell and buy tokens must be different" uses developer framing**
- File: `src/components/Exchange/TradeForm.tsx`
- Current: "Sell and buy tokens must be different"
- Problem: The phrasing reads like a validation rule, not guidance. Users think in terms of what they are doing, not what the system requires.
- Suggested fix: "You are trying to swap the same token. Please select a different token to receive."

**Issue E-06: "Please approve the sell token first" lacks context**
- File: `src/components/Exchange/TradeForm.tsx`
- Current: "Please approve the sell token first"
- Problem: Users unfamiliar with token approvals will not understand this instruction.
- Suggested fix: "Before placing this order, you need to authorize the exchange to access your tokens. Click the 'Authorize' button above."

**Issue E-07: Validation messages inconsistently use "required" vs instructive phrasing**
- File: `src/pages/SignupPage.tsx`, `src/pages/LoginPage.tsx`
- Current: Mix of "Email is required" (declarative) and "Enter a valid email address" (instructive)
- Problem: Both styles appear in the same form. Declarative ("X is required") is abrupt; instructive ("Enter a valid X") guides the user.
- Suggested fix: Standardize on instructive phrasing:
  - "Email is required" -> "Enter your email address"
  - "Password is required" -> "Enter your password"
  - "First name is required" -> "Enter your first name"
  - Keep constraint messages as-is: "Password must be at least 8 characters"

**Issue E-08: "Missing information from a previous step" is too vague**
- File: `src/pages/SignupPage.tsx`
- Current: "Missing information from a previous step"
- Problem: Does not tell the user which step or which field. They are left guessing.
- Suggested fix: "Some required fields from an earlier step are missing. Please go back and complete all fields." Ideally, programmatically identify the missing step.

---

### 3.3 Empty States

#### Inventory

| Location | Title | Description | CTA |
|----------|-------|-------------|-----|
| PortfolioPage | "No tokenized assets yet" | "Upload a document and mint your first wrapped asset to get started." | "Mint Your First Asset" |
| PortfolioPage (search) | "No assets match your search" | "Try adjusting your search query or clearing filters." | -- |
| ExchangePage | "No wrapped assets found" | "Mint some wrapped assets first, then return here to trade them." | -- |
| OrderBook | "No orders for this pair" | -- | -- |
| OrderBook (no selection) | "Select both tokens to view the order book" | -- | -- |
| UserOrders | "No orders yet" | "Create your first order using the trade form." | -- |
| MintHistory | "No minting activity yet" | "When you mint wrapped assets, your transaction history will appear here" | -- |
| ActivityFeed | "No recent activity" | "Your transactions will appear here once you start trading" | -- |
| PortfolioChart | "No assets to display" | "Tokenize your first asset to see your portfolio allocation" | -- |
| TransactionPreview | "No transactions to display" | "Upload and parse a document to preview its transaction data here" | -- |

#### Issues Found

**Issue ES-01: Terminology mismatch in Portfolio empty state**
- File: `src/pages/PortfolioPage.tsx`
- Current: Title says "tokenized assets" but description says "wrapped asset"
- Problem: Two different terms for the same concept in the same empty state. This is confusing.
- Suggested fix: "No assets yet" / "Upload a document and mint your first asset to get started."

**Issue ES-02: Exchange empty state uses imperative tone without a CTA**
- File: `src/pages/ExchangePage.tsx`
- Current: "Mint some wrapped assets first, then return here to trade them."
- Problem: Tells the user what to do but does not provide a button or link to do it.
- Suggested fix: Add a CTA button: "Go to Mint" linking to `/mint`. Revise copy to: "You don't have any assets to trade yet. Mint your first asset, then come back to start trading."

**Issue ES-03: Missing punctuation consistency in empty state descriptions**
- File: Multiple components
- Current: Some descriptions end with periods, others do not:
  - "When you mint wrapped assets, your transaction history will appear here" (no period)
  - "Try adjusting your search query or clearing filters." (period)
- Problem: Inconsistent punctuation looks unpolished.
- Suggested fix: All empty state descriptions should end with a period.

**Issue ES-04: "No orders for this pair" could be more helpful**
- File: `src/components/Exchange/OrderBook.tsx`
- Current: "No orders for this pair"
- Problem: Does not guide the user on what to do.
- Suggested fix: "No orders for this pair yet. You can place the first order using the trade form."

**Issue ES-05: PortfolioChart empty state uses yet another term**
- File: `src/components/Dashboard/PortfolioChart.tsx`
- Current: "Tokenize your first asset to see your portfolio allocation"
- Problem: Uses "tokenize" as a verb, while elsewhere the action is "mint." This is the third variation.
- Suggested fix: "Mint your first asset to see your portfolio allocation."

---

### 3.4 Loading States

#### Inventory

| Location | Loading Text | Mechanism |
|----------|-------------|-----------|
| ExchangePage | "Loading wrapped assets..." | Spinner |
| TradeForm | "Approving token spend..." | Button text |
| TradeForm | "Creating order..." | Button text |
| TradeForm | "Swapping via AMM..." | Button text |
| OrderBook | (no text) | Skeleton rows (8 rows) |
| UserOrders | (no text) | Skeleton cards (3 cards) |
| PortfolioPage | (no text) | SkeletonCard / SkeletonStatCard |
| MintForm | "Confirm in your wallet..." | Status text |
| MintForm (subtext) | "Your wallet will prompt you to sign the transaction." | Helper text |
| FileUploader | "Analyzing document..." | Spinner + text |
| LoginPage | "Signing in..." | Button text |
| SignupPage | "Creating account..." | Button text |
| Navbar | "Connecting..." | Button text |

#### Issues Found

**Issue L-01: "Swapping via AMM..." exposes implementation detail**
- File: `src/components/Exchange/TradeForm.tsx`
- Current: "Swapping via AMM..."
- Problem: The user does not need to know the swap is routed through an AMM during the loading state.
- Suggested fix: "Swapping tokens..." or "Processing swap..."

**Issue L-02: "Approving token spend..." is technical**
- File: `src/components/Exchange/TradeForm.tsx`
- Current: "Approving token spend..."
- Problem: "Token spend" is developer terminology for the ERC-20 `approve()` function.
- Suggested fix: "Authorizing tokens..." or "Requesting token access..."

**Issue L-03: Skeleton loaders have no accessible announcement**
- File: `src/components/Exchange/OrderBook.tsx`, `src/components/Exchange/UserOrders.tsx`, `src/pages/PortfolioPage.tsx`
- Current: Animated placeholder elements with no `aria-busy`, `aria-live`, or screen-reader text
- Problem: Screen reader users have no indication that content is loading.
- Suggested fix: Wrap skeleton regions in `aria-busy="true"` and add a visually hidden "Loading..." text. When content loads, announce via `aria-live="polite"`.

**Issue L-04: "Confirm in your wallet..." could add reassurance**
- File: `src/components/Mint/MintForm.tsx`
- Current: "Confirm in your wallet..." with subtext "Your wallet will prompt you to sign the transaction."
- Problem: This is actually well-written. However, it could benefit from a timeout message if the wallet prompt does not appear within a few seconds: "Don't see the wallet prompt? Check if your wallet extension is open."
- Suggested fix: Add a delayed (5-second) helper message for unresponsive wallets.

---

### 3.5 Success Confirmations

#### Inventory

| Location | Success Message | Mechanism |
|----------|----------------|-----------|
| LoginPage | "Welcome back!" | Toast |
| SignupPage | "Account created! Your identity verification is being reviewed." | Toast |
| MintForm | "Wrapped asset minted successfully!" | Toast + inline status |
| ExchangePage | "Order created successfully!" | Toast |
| ExchangePage | "Token approved for exchange" | Toast |
| ExchangePage | "Order filled successfully!" | Toast |
| FileUploader | "Parsed {X} transaction(s) successfully" | Toast |
| PendingApprovalPage | "Your identity has been verified!" | Toast |
| PortfolioPage (Transfer) | (none) | Modal closes silently |
| PortfolioPage (Burn) | (none) | Modal closes silently |

#### Issues Found

**Issue S-01: Transfer and Burn have NO success confirmation**
- File: `src/pages/PortfolioPage.tsx`
- Current: After a successful transfer or burn, the modal simply closes. No toast, no inline confirmation.
- Problem: This is a critical UX failure. Users who just sent tokens or permanently destroyed them receive no feedback that the operation succeeded. They may repeat the action thinking it failed.
- Suggested fix:
  - Transfer success: "Tokens sent successfully. Transaction may take a moment to confirm."
  - Burn success: "Tokens burned permanently. Your balance has been updated."
  - Both should include a link to view the transaction on the block explorer.

**Issue S-02: "Welcome back!" is too casual for a financial platform**
- File: `src/pages/LoginPage.tsx`
- Current: "Welcome back!"
- Problem: The exclamation mark and casual phrasing is inconsistent with the professional tone a financial platform should maintain.
- Suggested fix: "Signed in successfully." or "You have been signed in."

**Issue S-03: "Wrapped asset minted successfully!" uses inconsistent terminology**
- File: `src/components/Mint/MintForm.tsx`
- Current: "Wrapped asset minted successfully!"
- Problem: "Wrapped asset" is used here but "tokenized asset" and "token" are used elsewhere.
- Suggested fix: "Asset minted successfully." (Standardize on "asset" without the "wrapped" qualifier in user-facing text. The term "wrapped" is an implementation detail.)

**Issue S-04: "Token approved for exchange" is ambiguous**
- File: `src/pages/ExchangePage.tsx`
- Current: "Token approved for exchange"
- Problem: Could be read as "the token has been approved (by someone) for the exchange (listing)" rather than "you have authorized the exchange contract to spend your token."
- Suggested fix: "{SYMBOL} authorized for trading." or "You can now trade {SYMBOL}."

**Issue S-05: Success toasts lack transaction links**
- File: Multiple
- Current: Most success toasts are plain text with no link to the transaction
- Problem: Users want to verify their transaction on the blockchain. Only MintForm provides a tx hash link; others do not.
- Suggested fix: All blockchain-related success toasts should include a "View transaction" link pointing to the block explorer.

---

### 3.6 Tooltips and Help Text

#### Inventory

| Location | Help Text |
|----------|-----------|
| LoginPage | "Secured with end-to-end encryption" (security badge) |
| SignupPage | "Your data is encrypted and secure" (security badge) |
| MintForm | "Your wallet will prompt you to sign the transaction." |
| TradeForm | "A small amount of ETH is reserved for gas fees." (gas reserve note) |
| TradeForm | Slippage tolerance explanation |
| FileUploader | "Drag and drop your file here, or click to browse" |
| FileUploader | Format badges: JSON, CSV, XML, PDF, PNG, JPG |

#### Issues Found

**Issue T-01: No tooltips exist for blockchain terminology**
- File: Platform-wide
- Current: Terms like "gas fees," "ERC-20," "token approval," "burn," "mint," "wrapped asset," "AMM," "liquidity pool," "slippage," and "order book" appear without explanation.
- Problem: Users who are new to blockchain or DeFi will encounter these terms with no guidance. A financial platform should be accessible to non-technical investors.
- Suggested fix: Implement a tooltip component that shows definitions on hover/tap for the following minimum set:
  - **Gas fees**: "A small fee paid to the blockchain network to process your transaction."
  - **Token approval**: "A one-time authorization allowing the exchange contract to access your tokens for trading."
  - **Burn**: "Permanently destroy tokens, removing them from circulation. This action cannot be undone."
  - **Mint**: "Create new tokens backed by the uploaded document."
  - **Slippage**: "The maximum difference between the expected price and the actual price of your trade."
  - **AMM**: "Automated Market Maker -- a decentralized protocol that provides liquidity for token swaps."
  - **Order book**: "A list of open buy and sell orders for a trading pair."
  - **Liquidity pool**: "A pool of tokens locked in a smart contract, used to facilitate decentralized trading."

**Issue T-02: "Secured with end-to-end encryption" may be misleading**
- File: `src/pages/LoginPage.tsx`
- Current: "Secured with end-to-end encryption"
- Problem: A web application using HTTPS is not truly "end-to-end encrypted" in the way that term is commonly understood (e.g., Signal). This claim could be considered misleading from a compliance perspective.
- Suggested fix: "Secured with TLS encryption" or "Your connection is encrypted." Alternatively, if the platform does implement true E2E encryption, clarify what is encrypted end-to-end.

**Issue T-03: No help text for the token approval flow**
- File: `src/components/Exchange/TradeForm.tsx`
- Current: The "Approve {symbol} for Exchange" button appears with a step indicator (1/2) but no explanation of what approval means or why it is needed.
- Problem: Token approvals are a blockchain-specific concept that confuses new users. The step indicator helps, but an explanation would be more effective.
- Suggested fix: Add an info banner above the approval step: "Step 1 of 2: Authorize the exchange to access your {symbol} tokens. This is a standard one-time permission required by the blockchain."

**Issue T-04: "A small amount of ETH is reserved for gas fees" lacks specifics**
- File: `src/components/Exchange/TradeForm.tsx`
- Current: "A small amount of ETH is reserved for gas fees."
- Problem: "Small amount" is vague. Users want to know how much.
- Suggested fix: If the gas estimate is available, show it: "Estimated gas: ~{amount} ETH". If not, at minimum say: "Your wallet will show the exact gas fee before you confirm."

---

### 3.7 Navigation Labels

#### Inventory

| Label | Location |
|-------|----------|
| "Dashboard" | Navbar |
| "Mint" | Navbar |
| "Portfolio" | Navbar |
| "Exchange" | Navbar |
| "Orbital AMM" | Navbar |
| "Exchange Pro" | ExchangePage title |
| "Fueki" | Navbar brand |
| "Fueki v1.0" | Navbar footer (mobile) |
| "Select Network" | NetworkSelector dropdown |

#### Issues Found

**Issue N-01: "Exchange" (nav) vs "Exchange Pro" (page title) mismatch**
- File: `src/components/Layout/Navbar.tsx`, `src/pages/ExchangePage.tsx`
- Current: Navigation says "Exchange" but the page title says "Exchange Pro"
- Problem: Users click "Exchange" and land on "Exchange Pro." The "Pro" suffix implies there is a non-Pro version, which does not exist.
- Suggested fix: Either rename the nav item to "Exchange Pro" or remove "Pro" from the page title. Given there is no basic exchange, removing "Pro" is simpler and less confusing.

**Issue N-02: "Orbital AMM" is jargon**
- File: `src/components/Layout/Navbar.tsx`
- Current: "Orbital AMM"
- Problem: "AMM" is not widely understood outside DeFi circles. The navigation label should be immediately comprehensible.
- Suggested fix: "Liquidity Pools" or "Swap & Pools" as the nav label. Keep "Orbital AMM" as the page title/subtitle if the brand name is important.

**Issue N-03: "Fueki v1.0" should not be user-facing**
- File: `src/components/Layout/Navbar.tsx`
- Current: "Fueki v1.0" displayed in the mobile navigation footer
- Problem: Version numbers are internal metadata. They mean nothing to users and can create confusion when the version changes.
- Suggested fix: Remove the version string, or move it to a settings/about page.

**Issue N-04: "Mint" as a nav label is ambiguous**
- File: `src/components/Layout/Navbar.tsx`
- Current: "Mint"
- Problem: "Mint" alone does not communicate the full workflow (upload, parse, configure, mint). Users may not realize this is where they upload documents.
- Suggested fix: "Tokenize" or "Mint Asset" would be slightly more descriptive. However, "Mint" is concise and works if the page itself has a clear title. Low priority.

---

### 3.8 Form Labels and Placeholders

#### Inventory

| Form | Field | Label | Placeholder |
|------|-------|-------|-------------|
| Login | Email | "Email address" | "you@example.com" |
| Login | Password | "Password" | "Enter your password" |
| Signup (Step 1) | Email | "Email" | "you@example.com" |
| Signup (Step 1) | Password | "Password" | "At least 8 characters" |
| Signup (Step 1) | Confirm | "Confirm password" | "Re-enter your password" |
| Signup (Step 2) | First name | "First name" | "John" |
| Signup (Step 2) | Last name | "Last name" | "Doe" |
| Signup (Step 2) | DOB | "Date of birth" | "YYYY-MM-DD" |
| Signup (Step 2) | Phone | "Phone number" | "+1 (555) 000-0000" |
| Signup (Step 3) | Address fields | Various | Various |
| Signup (Step 3) | SSN | "Social Security Number" | "XXX-XX-XXXX" |
| MintForm | Token name | "Token Name" | "e.g., US Treasury Bond 2025" |
| MintForm | Token symbol | "Token Symbol" | "e.g., USTB25" |
| MintForm | Mint amount | "Mint Amount" | -- |
| MintForm | Recipient | "Recipient Address" | "0x..." |
| Portfolio Search | -- | -- | "Search by name, symbol, or document hash..." |
| TradeForm | Amount | -- | "0.00" |
| TradeForm | Price | "Price per token" | "0.00" |
| TradeForm | Slippage | "Slippage tolerance" | -- |

#### Issues Found

**Issue F-01: "Email address" (Login) vs "Email" (Signup) inconsistency**
- File: `src/pages/LoginPage.tsx`, `src/pages/SignupPage.tsx`
- Current: Login uses "Email address" as label; Signup uses "Email"
- Problem: Inconsistent labeling across forms that users encounter sequentially.
- Suggested fix: Standardize to "Email address" across both forms.

**Issue F-02: Placeholder names "John" and "Doe" are culturally narrow**
- File: `src/pages/SignupPage.tsx`
- Current: First name placeholder "John", last name placeholder "Doe"
- Problem: "John Doe" is a Western/English-language convention. For an international financial platform, these placeholders may feel exclusionary.
- Suggested fix: Use instructive placeholders instead: "Enter your first name" / "Enter your last name". Alternatively, use empty placeholders with the label being sufficient.

**Issue F-03: "YYYY-MM-DD" date format placeholder**
- File: `src/pages/SignupPage.tsx`
- Current: "YYYY-MM-DD"
- Problem: This is ISO 8601 format, not the format most users (particularly US-based) are accustomed to. Additionally, if the field is a text input rather than a date picker, users may enter dates in various formats.
- Suggested fix: Use a native date picker (`type="date"`) which handles formatting automatically. If a text input must be used, specify the expected format in the label: "Date of birth (YYYY-MM-DD)".

**Issue F-04: SSN field shows "XXX-XX-XXXX" placeholder**
- File: `src/pages/SignupPage.tsx`
- Current: Placeholder "XXX-XX-XXXX"
- Problem: The "XXX" pattern does not communicate that the field expects numbers. Also, displaying the SSN format as a placeholder means it disappears once the user starts typing.
- Suggested fix: Use a persistent format hint below the field: "Format: 000-00-0000". Add input masking so the dashes are inserted automatically.

**Issue F-05: "e.g., US Treasury Bond 2025" in MintForm token name**
- File: `src/components/Mint/MintForm.tsx`
- Current: Placeholder "e.g., US Treasury Bond 2025"
- Problem: This is a helpful example but could be interpreted as a default value. The "e.g.," prefix mitigates this, but the example is very specific to US government bonds.
- Suggested fix: "e.g., Real Estate Deed NYC" or provide multiple examples in helper text below the field rather than in the placeholder.

**Issue F-06: "Search by name, symbol, or document hash..." is excellent**
- File: `src/pages/PortfolioPage.tsx`
- Current: "Search by name, symbol, or document hash..."
- Assessment: This is well-written. It tells users exactly what they can search by. No change needed.

**Issue F-07: MintForm "Token Name" and "Token Symbol" use Title Case for labels**
- File: `src/components/Mint/MintForm.tsx`
- Current: "Token Name", "Token Symbol", "Mint Amount", "Recipient Address"
- Problem: Labels should use Sentence case for consistency with the rest of the platform.
- Suggested fix: "Token name", "Token symbol", "Mint amount", "Recipient address"

---

### 3.9 Tone and Voice Consistency

The following are specific instances where tone is inappropriate for a financial tokenization platform:

**Issue TV-01: "Hang tight!" in KYC pending state**
- File: `src/pages/PendingApprovalPage.tsx`
- Current: "Still under review. Hang tight!"
- Problem: "Hang tight" is slang. A user waiting for their identity to be verified -- which determines their ability to use the platform and manage assets -- deserves more respectful language.
- Suggested fix: "Your verification is still being reviewed. We will notify you when the review is complete."

**Issue TV-02: "You're Approved!" heading**
- File: `src/pages/PendingApprovalPage.tsx`
- Current: "You're Approved!"
- Problem: Contraction + exclamation mark is too informal for a status change that has financial and regulatory implications.
- Suggested fix: "Your Account Has Been Verified" or "Identity Verification Complete"

**Issue TV-03: "New here?" divider on login page**
- File: `src/pages/LoginPage.tsx`
- Current: "New here?" as a divider between sign-in and sign-up
- Problem: Slightly too casual. Functional but not consistent with the "institutional-grade" positioning.
- Suggested fix: "Don't have an account?" or simply "Create account"

**Issue TV-04: Dashboard hero section reads like marketing copy**
- File: `src/pages/DashboardPage.tsx`
- Current: "Institutional-Grade Asset Tokenization" / "Transform real-world assets into blockchain-native tokens..."
- Problem: Once a user is logged in and on their dashboard, they do not need to be sold on the platform. The hero section should show actionable information, not marketing.
- Suggested fix: Replace the hero section with a welcome message and quick status overview: "Welcome, {name}. Here is your portfolio overview." If the marketing hero is retained for empty-state dashboards, ensure it transitions to functional content after the user's first action.

**Issue TV-05: "Concentrated multi-token liquidity with power-mean invariants"**
- File: `src/pages/OrbitalAMMPage.tsx`
- Current: Page subtitle: "Concentrated multi-token liquidity with power-mean invariants"
- Problem: This is highly technical jargon that reads like an academic paper abstract. It means nothing to the vast majority of users.
- Suggested fix: "Provide liquidity and earn fees by depositing tokens into shared pools." The technical details can be linked to documentation for interested users.

---

### 3.10 Terminology Consistency

This is the most pervasive issue across the platform. The following terms are used interchangeably for the same concepts:

#### Core Asset Terminology

| Term | Usage Location | Meaning |
|------|---------------|---------|
| "wrapped asset" | ExchangePage, MintForm success, MintHistory, empty states | A token created by the platform |
| "tokenized asset" | PortfolioPage empty state, DashboardPage | A token created by the platform |
| "token" | MintForm, TradeForm, button labels | A token created by the platform |
| "asset" | PortfolioPage, DashboardPage stats, empty states | A token created by the platform |

**Problem:** All four terms refer to the same thing -- an ERC-20 token minted on-chain to represent a real-world document. Using four different terms creates confusion about whether these are different things.

**Suggested fix:** Standardize on **"asset"** as the primary user-facing term. Use "token" only in technical contexts (e.g., "Token symbol", "Token name" in the mint form where the user is configuring the on-chain token). Reserve "wrapped asset" for developer documentation only. Never use "tokenized asset" -- it is redundant (the platform is a tokenization platform; everything on it is tokenized).

#### Action Terminology

| Term | Usage Location | Meaning |
|------|---------------|---------|
| "Mint" | Navbar, MintPage, MintForm, buttons | Create a new asset |
| "Tokenize" | PortfolioChart empty state | Create a new asset |
| "Upload & Mint" | DashboardPage quick action | Create a new asset |

**Problem:** "Mint" and "Tokenize" describe the same action. "Upload & Mint" is the most accurate since the process involves uploading a document and then minting.

**Suggested fix:** Use **"Mint"** as the primary action verb across the platform. Use "Upload & Mint" only when describing the full workflow. Remove "Tokenize" entirely.

#### Value Terminology

| Term | Usage Location | Meaning |
|------|---------------|---------|
| "Total Value Locked" | DashboardPage | Sum of all asset values |
| "Portfolio Value" | PortfolioPage | Sum of all asset values |
| "Total Value" | PortfolioChart center label | Sum of all asset values |
| "Total Locked" | PortfolioPage stat card | Unclear meaning |

**Problem:** "Total Value Locked" (TVL) is a DeFi term that typically refers to assets deposited in a protocol. Using it on the dashboard to describe a user's portfolio value is misleading. "Total Locked" on the portfolio page is ambiguous -- does it mean locked in smart contracts? Locked as collateral? Simply held?

**Suggested fix:**
- Dashboard: "Total portfolio value" (not "Total Value Locked" unless it genuinely refers to protocol TVL)
- Portfolio: "Portfolio value" (stat card)
- Portfolio: Rename "Total Locked" to "Locked in orders" or remove if it duplicates another stat
- PortfolioChart: "Total value" is fine as a chart center label

#### Platform Section Names

| User sees | URL | Page title |
|-----------|-----|------------|
| "Exchange" | /exchange | "Exchange Pro" |
| "Orbital AMM" | /orbital-amm | "Orbital AMM" |
| "Mint" | /mint | "Upload & Mint" |

**Problem:** Navigation labels do not match page titles in two out of five cases.

**Suggested fix:** Navigation label and page title should match exactly. If the page title is "Upload & Mint," the nav should say the same (or both should be simplified to "Mint").

---

## 4. Terminology Glossary Recommendation

The following glossary should be implemented as a shared constants file (e.g., `src/constants/glossary.ts`) and used for tooltips, help modals, and onboarding:

```typescript
export const GLOSSARY = {
  asset: {
    term: 'Asset',
    definition: 'A digital token on the blockchain that represents a real-world document or value.',
    usage: 'Primary term for user-facing copy. Replaces "wrapped asset," "tokenized asset," and "token" in general contexts.',
  },
  mint: {
    term: 'Mint',
    definition: 'The process of creating a new asset on the blockchain, backed by an uploaded document.',
    usage: 'Primary verb for asset creation.',
  },
  burn: {
    term: 'Burn',
    definition: 'Permanently destroy tokens, removing them from circulation. This action cannot be reversed.',
    usage: 'Always accompany with a warning about irreversibility.',
  },
  gasFee: {
    term: 'Gas fee',
    definition: 'A small fee paid to the blockchain network to process your transaction. Gas fees vary based on network congestion.',
    usage: 'Show estimated cost when available.',
  },
  tokenApproval: {
    term: 'Token authorization',
    definition: 'A one-time permission you grant to a smart contract, allowing it to access your tokens for trading. You remain in control of your tokens at all times.',
    usage: 'Use "authorize" instead of "approve" in user-facing copy to avoid confusion with KYC/admin approval.',
  },
  slippage: {
    term: 'Slippage tolerance',
    definition: 'The maximum acceptable difference between the expected price and the actual execution price of your trade.',
    usage: 'Show with a percentage input and a brief explanation.',
  },
  orderBook: {
    term: 'Order book',
    definition: 'A list of pending buy and sell orders for a specific trading pair, organized by price.',
    usage: 'Use as a section title on the exchange page.',
  },
  liquidityPool: {
    term: 'Liquidity pool',
    definition: 'A collection of tokens locked in a smart contract that enables decentralized trading. Liquidity providers earn fees from trades.',
    usage: 'Use as a label for the AMM feature.',
  },
  amm: {
    term: 'Automated Market Maker (AMM)',
    definition: 'A protocol that uses liquidity pools instead of order books to facilitate token swaps at algorithmically determined prices.',
    usage: 'Spell out on first use. Use "instant swap" as a simplified alternative in button labels.',
  },
  kyc: {
    term: 'Identity verification (KYC)',
    definition: 'A regulatory requirement to verify your identity before you can use the platform. This helps protect against fraud and money laundering.',
    usage: 'Use "identity verification" in user-facing copy. Use "KYC" only in technical/admin contexts.',
  },
  wallet: {
    term: 'Wallet',
    definition: 'A browser extension (such as MetaMask) that stores your blockchain credentials and allows you to sign transactions.',
    usage: 'Always specify what wallet software is supported when prompting connection.',
  },
} as const;
```

---

## 5. Content Style Guide

### Voice and Tone

| Principle | Do | Don't |
|-----------|-----|-------|
| Be professional | "Your verification is under review." | "Hang tight!" |
| Be clear | "Permanently destroy 50 USTB tokens" | "Confirm Burn" |
| Be helpful | "No wallet detected. Install MetaMask to continue." | "Wallet provider not available" |
| Be concise | "Signed in successfully." | "Welcome back! Great to see you again!" |
| Be consistent | Always use "asset" for user-facing references | Alternate between "wrapped asset," "token," and "tokenized asset" |

### Capitalization Rules

| Element | Rule | Example |
|---------|------|---------|
| Page titles | Title Case | "Upload & Mint" |
| Navigation items | Title Case | "Portfolio" |
| Buttons (primary) | Sentence case | "Place buy order" |
| Buttons (secondary/link) | Sentence case | "Create an account" |
| Form labels | Sentence case | "Email address" |
| Headings (card/section) | Sentence case | "Your portfolio" |
| Toast messages | Sentence case | "Asset minted successfully." |
| Error messages | Sentence case | "Enter a valid email address." |
| Empty state titles | Sentence case | "No assets yet" |

### Punctuation Rules

| Element | Rule |
|---------|------|
| Buttons | No punctuation |
| Toast messages | End with a period |
| Error messages | End with a period |
| Empty state titles | No punctuation |
| Empty state descriptions | End with a period |
| Headings | No punctuation |
| Tooltips | End with a period |
| Placeholder text | No punctuation |

### Numbers and Formatting

| Element | Rule | Example |
|---------|------|---------|
| Token amounts | Use locale formatting with appropriate decimals | "1,234.56 USTB" |
| Percentages | One decimal place | "2.5%" |
| Addresses | Truncate with ellipsis | "0x1234...5678" |
| Dates | Relative for recent, absolute for older | "2 hours ago" / "Feb 14, 2026" |
| Currency | Always show symbol/code | "0.05 ETH" |

### Error Message Pattern

All error messages should follow this structure:

```
[What happened]. [What to do about it].
```

Examples:
- "Unable to sign in. Please check your email and password and try again."
- "Insufficient balance. You need at least {amount} {symbol} to complete this transaction."
- "Transaction could not be completed. Please check your wallet and try again."

### Success Message Pattern

All success messages should follow this structure:

```
[What succeeded]. [What happens next / what to expect].
```

Examples:
- "Asset minted successfully. Your transaction is being confirmed on the blockchain."
- "Order placed. It will appear in the order book when confirmed."
- "Tokens transferred. The recipient should see them shortly."

### Empty State Pattern

All empty states should follow this structure:

```
Title: [What is missing]
Description: [Why it is empty + what to do about it].
CTA: [Action to resolve the empty state]
```

Examples:
- Title: "No assets yet"
- Description: "Upload a document and mint your first asset to get started."
- CTA: "Mint your first asset"

---

## 6. Priority Matrix

### Critical (Fix Immediately)

| ID | Issue | Impact |
|----|-------|--------|
| S-01 | Transfer and Burn have no success confirmation | Users may repeat destructive actions |
| T-01 | No tooltips for blockchain terminology | Blocks non-technical users |
| ES-01 | Terminology mismatch in same empty state | Confuses users about what "assets" are |
| E-01 | "Login failed" too vague | Users cannot troubleshoot |
| E-03 | "Wallet provider not available" is opaque | Users cannot resolve the issue |

### High (Fix This Sprint)

| ID | Issue | Impact |
|----|-------|--------|
| 3.10 | Terminology inconsistency (all instances) | Platform-wide confusion |
| S-05 | Success toasts lack transaction links | Users cannot verify operations |
| E-02 | Contract errors may leak technical names | Degrades trust |
| E-04 | Transfer/Burn errors provide no recovery guidance | Users feel stuck |
| T-02 | "End-to-end encryption" claim may be inaccurate | Compliance risk |
| B-03 | Token approval button has no explanation | Blocks non-technical users |
| TV-01 | "Hang tight!" in KYC pending state | Unprofessional tone |

### Medium (Fix Next Sprint)

| ID | Issue | Impact |
|----|-------|--------|
| B-01 | Inconsistent button capitalization | Unpolished appearance |
| B-02 | "Swap via AMM" exposes jargon | Confusing for non-DeFi users |
| N-01 | Exchange vs Exchange Pro mismatch | Confusing navigation |
| N-02 | "Orbital AMM" jargon in nav | Inaccessible to newcomers |
| F-01 | "Email address" vs "Email" inconsistency | Minor confusion |
| F-02 | "John Doe" placeholder is culturally narrow | Inclusivity concern |
| L-01 | "Swapping via AMM..." loading state | Minor jargon exposure |
| L-02 | "Approving token spend..." is technical | Minor jargon exposure |
| L-03 | Skeleton loaders lack accessibility | Screen reader users affected |
| TV-04 | Dashboard hero is marketing copy | Misuse of dashboard space |
| TV-05 | "Power-mean invariants" subtitle | Incomprehensible to most users |

### Low (Backlog)

| ID | Issue | Impact |
|----|-------|--------|
| B-04 | "MAX" button lacks aria-label | Accessibility gap |
| B-06 | "Submit Verification" ambiguity | Minor confusion |
| N-03 | "Fueki v1.0" user-facing | Minor clutter |
| N-04 | "Mint" nav label could be more descriptive | Minor discoverability |
| F-03 | Date format placeholder | Minor UX friction |
| F-04 | SSN placeholder pattern | Minor UX friction |
| F-05 | Mint form example too specific | Minor |
| F-07 | Title Case in MintForm labels | Capitalization inconsistency |
| ES-03 | Missing punctuation in empty states | Polish |
| ES-04 | "No orders for this pair" lacks guidance | Minor help gap |
| TV-02 | "You're Approved!" too informal | Tone issue |
| TV-03 | "New here?" too casual | Minor tone issue |

---

## Appendix: Bug Found During Audit

**BUG: Hardcoded Etherscan URL in ActivityFeed**
- File: `src/components/Dashboard/ActivityFeed.tsx`
- Current: `https://etherscan.io/tx/` is hardcoded as the block explorer URL
- Problem: If the platform deploys on a chain other than Ethereum mainnet (e.g., Sepolia, Polygon, Arbitrum), all transaction links will point to the wrong block explorer.
- Fix: Use the dynamic block explorer URL from the wallet/chain configuration (the same pattern used in MintForm which correctly uses `blockExplorerUrl`).

---

*End of Microcopy Audit Report -- Agent 8 / MicrocopySpecialist*
