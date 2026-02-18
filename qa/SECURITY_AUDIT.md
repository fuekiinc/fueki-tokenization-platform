# Fueki Tokenization Platform -- Comprehensive Security Audit

**Audit Date:** 2026-02-17
**Auditor:** SECURITY-AUDITOR (Automated Deep Analysis)
**Scope:** All Solidity smart contracts in `/contracts/`
**Solidity Versions:** ^0.8.4 (security-token), ^0.8.20 (all others)
**Total Contracts Reviewed:** 21 files (including interfaces)

---

## Executive Summary

This audit covers the entire Fueki Tokenization Platform smart contract suite, encompassing the WrappedAsset ERC-20 token system, two exchange contracts (AssetExchange and AssetBackedExchange), a Uniswap V2-style AMM (LiquidityPoolAMM), the Orbital superellipse AMM system (OrbitalPool, OrbitalFactory, OrbitalRouter, OrbitalMath), and the security-token subsystem (RestrictedLockupToken, Dividends, RestrictedSwap, TransferRules, EasyAccessControl, and deployment factories).

**21 contracts were reviewed. 31 findings were identified:**

| Severity       | Count |
|----------------|-------|
| Critical       | 4     |
| High           | 8     |
| Medium         | 10    |
| Low            | 6     |
| Informational  | 3     |

---

## Table of Contents

1. [Critical Findings](#critical-findings)
2. [High Findings](#high-findings)
3. [Medium Findings](#medium-findings)
4. [Low Findings](#low-findings)
5. [Informational Findings](#informational-findings)
6. [Contract-by-Contract Summary](#contract-by-contract-summary)

---

## Critical Findings

### C-01: Reentrancy in AssetBackedExchange `fillOrder()` -- ETH sent before state is finalized

**Severity:** Critical
**File:** `/contracts/AssetBackedExchange.sol`
**Lines:** 221-227

**Description:**
When `order.tokenSell == ETH_ADDRESS`, the `fillOrder()` function sends ETH to `msg.sender` via a low-level `.call{value}` at line 222 **before** the function completes all state changes. Although the `nonReentrant` modifier protects against direct re-entry into `fillOrder`, a malicious taker's `receive()` function could call *other* non-guarded functions on this contract or related contracts, creating cross-function or cross-contract reentrancy. More critically, the `createOrder()` function at line 129 is **NOT** protected by `nonReentrant`, meaning a malicious taker receiving ETH could re-enter `createOrder()` to manipulate state.

```solidity
// Line 221-223: ETH sent to msg.sender mid-function
if (order.tokenSell == ETH_ADDRESS) {
    (bool sent,) = payable(msg.sender).call{value: fillAmountSell}("");
    if (!sent) revert TransferFailed();
}
```

**Remediation:**
Add `nonReentrant` to `createOrder()` and `createOrderSellETH()`, or use a pull-based pattern for ETH disbursement to takers as well.

```solidity
// FIX: Add nonReentrant to createOrder
function createOrder(
    address tokenSell,
    address tokenBuy,
    uint256 amountSell,
    uint256 amountBuy
) external nonReentrant returns (uint256 orderId) {
    // ... existing logic
}

// FIX: Add nonReentrant to createOrderSellETH
function createOrderSellETH(
    address tokenBuy,
    uint256 amountBuy
) external payable nonReentrant returns (uint256 orderId) {
    // ... existing logic
}
```

---

### C-02: Reentrancy in AssetBackedExchange `fillOrderWithETH()` -- multiple external calls to untrusted addresses

**Severity:** Critical
**File:** `/contracts/AssetBackedExchange.sol`
**Lines:** 237-268

**Description:**
`fillOrderWithETH()` performs **three** external calls to potentially untrusted addresses in sequence: (1) sends ETH to `order.maker` (line 254), (2) sends ERC-20 tokens to `msg.sender` (line 258), and (3) refunds excess ETH to `msg.sender` (line 263). The maker's address is attacker-controlled. If the maker is a malicious contract, its `receive()` callback could exploit the fact that `order.status` is still marked active at that point (only `filledBuy`/`filledSell` are updated). While `nonReentrant` blocks direct re-entry into `fillOrderWithETH`, the maker's callback could call `cancelOrder()` or interact with other contracts in harmful ways.

Furthermore, if the ERC-20 token at line 258 is a malicious token that calls back to the exchange, the `nonReentrant` guard protects this contract but the order state may be inconsistent from the perspective of other contracts reading it.

```solidity
// Line 254: ETH sent to maker (potentially malicious)
(bool sentToMaker,) = payable(order.maker).call{value: fillAmountBuy}("");
if (!sentToMaker) revert TransferFailed();

// Line 258: Token sent to taker
bool ok = IERC20(order.tokenSell).transfer(msg.sender, fillAmountSell);

// Line 263: Refund excess ETH to taker
(bool refund,) = payable(msg.sender).call{value: msg.value - fillAmountBuy}("");
```

**Remediation:**
Use a pull pattern for all ETH transfers instead of direct sends. Credit both maker and taker's `ethBalances` and let them withdraw.

```solidity
function fillOrderWithETH(uint256 orderId) external payable nonReentrant {
    // ... validation and calculation ...

    order.filledBuy += fillAmountBuy;
    order.filledSell += fillAmountSell;

    // Credit ETH to maker via pull pattern instead of direct send
    ethBalances[order.maker] += fillAmountBuy;

    // Send sell tokens to taker (ERC-20 only, since tokenSell cannot be ETH here)
    bool ok = IERC20(order.tokenSell).transfer(msg.sender, fillAmountSell);
    if (!ok) revert TransferFailed();

    // Credit refund to taker via pull pattern
    if (msg.value > fillAmountBuy) {
        ethBalances[msg.sender] += (msg.value - fillAmountBuy);
    }

    emit OrderFilled(orderId, msg.sender, fillAmountSell, fillAmountBuy);
}
```

---

### C-03: Dividends `claimDividend()` -- state update after external call (Checks-Effects-Interactions violation)

**Severity:** Critical
**File:** `/contracts/security-token/Dividends.sol`
**Lines:** 154-166

**Description:**
The `claimDividend()` function transfers tokens to `msg.sender` at line 159 **before** updating the `claimedTokens` mapping at line 161 and `tokensFunded[].unused` at line 163. Although the `nonReentrant` modifier from OpenZeppelin is applied, this violates the Checks-Effects-Interactions pattern. If any future refactoring removes the reentrancy guard or if the token being claimed has callbacks (e.g., ERC-777 tokens with `tokensReceived` hooks), the claimer could re-enter and drain the entire dividend fund.

```solidity
function claimDividend(address token, uint256 snapshotId) override public nonReentrant {
    uint256 unclaimedBalance = unclaimedBalanceAt(token, msg.sender, snapshotId);
    require(unclaimedBalance > 0, "YOU CAN`T RECEIVE MORE TOKENS");

    // EXTERNAL CALL FIRST
    IERC20(token).safeTransfer(msg.sender, unclaimedBalance);

    // STATE UPDATE AFTER
    claimedTokens[snapshotId][token][msg.sender] += unclaimedBalance;
    tokensFunded[snapshotId][token].unused -= unclaimedBalance;
}
```

**Remediation:**
Move state updates before the external transfer.

```solidity
function claimDividend(address token, uint256 snapshotId) override public nonReentrant {
    uint256 unclaimedBalance = unclaimedBalanceAt(token, msg.sender, snapshotId);
    require(unclaimedBalance > 0, "YOU CAN`T RECEIVE MORE TOKENS");

    // STATE UPDATE FIRST (Checks-Effects-Interactions)
    claimedTokens[snapshotId][token][msg.sender] += unclaimedBalance;
    tokensFunded[snapshotId][token].unused -= unclaimedBalance;

    // EXTERNAL CALL LAST
    IERC20(token).safeTransfer(msg.sender, unclaimedBalance);

    emit Claimed(msg.sender, token, unclaimedBalance, snapshotId);
}
```

---

### C-04: Dividends `withdrawalRemains()` -- state update after external call

**Severity:** Critical
**File:** `/contracts/security-token/Dividends.sol`
**Lines:** 60-69

**Description:**
Same CEI violation as C-03. The `withdrawalRemains()` function transfers tokens at line 65 before decrementing `tokensFunded[snapshotId][token].unused` at line 67. With an ERC-777 dividend token, the admin could be re-entered through the `tokensReceived` hook, though the `nonReentrant` guard currently prevents this.

```solidity
function withdrawalRemains(address token, uint256 snapshotId) override public onlyContractAdmin nonReentrant {
    require(token != address(0), "BAD TOKEN ADDRESS");
    uint256 amount = tokensAt(token, snapshotId);

    // EXTERNAL CALL FIRST
    IERC20(token).safeTransfer(msg.sender, amount);

    // STATE UPDATE AFTER
    tokensFunded[snapshotId][token].unused -= amount;
}
```

**Remediation:**
Move the state update before the transfer.

```solidity
function withdrawalRemains(address token, uint256 snapshotId) override public onlyContractAdmin nonReentrant {
    require(token != address(0), "BAD TOKEN ADDRESS");
    uint256 amount = tokensAt(token, snapshotId);
    require(amount > 0, "Nothing to withdraw");

    // STATE UPDATE FIRST
    tokensFunded[snapshotId][token].unused -= amount;

    // EXTERNAL CALL LAST
    IERC20(token).safeTransfer(msg.sender, amount);

    emit Withdrawn(msg.sender, token, amount, snapshotId);
}
```

---

## High Findings

### H-01: LiquidityPoolAMM `_transferTokenOut()` sends ETH directly, enabling reentrancy in `swap()` and `removeLiquidity()`

**Severity:** High
**File:** `/contracts/LiquidityPoolAMM.sol`
**Lines:** 659-667

**Description:**
The `_transferTokenOut()` function sends ETH via `.call{value}` to the recipient. This is called inside `swap()` (line 389) and `removeLiquidity()` (line 305-306) within the `nonReentrant` guard. While the reentrancy guard prevents re-entry into the same contract, the `receive()` callback on the recipient gives them execution control to interact with **other** contracts that read state from this AMM (cross-contract reentrancy). If another contract relies on `pool.reserve0` or `pool.reserve1` for pricing, the reserves may be in a temporarily manipulated state during the callback because the external transfer happens **after** reserves are updated.

However, the `swapETHForToken()` and `swapTokenForETH()` functions correctly use a pull pattern for ETH output (`ethBalances[msg.sender] += amountOut`), which is inconsistent -- `removeLiquidity()` line 305-306 can call `_transferTokenOut` for ETH directly.

```solidity
function _transferTokenOut(address token, address to, uint256 amount) private {
    if (token == ETH_ADDRESS) {
        (bool sent,) = payable(to).call{value: amount}("");  // Direct ETH send
        if (!sent) revert TransferFailed();
        return;
    }
    // ...
}
```

**Remediation:**
Use the pull pattern for all ETH outputs consistently. In `removeLiquidity()`, credit `ethBalances` rather than directly sending ETH, similar to how `removeLiquidityETH()` already does it.

```solidity
// In removeLiquidity, for token0 or token1 that is ETH_ADDRESS,
// credit ethBalances instead of calling _transferTokenOut with ETH:
function removeLiquidity(
    address tokenA,
    address tokenB,
    uint256 liquidity,
    uint256 minA,
    uint256 minB
) external nonReentrant returns (uint256 amountA, uint256 amountB) {
    // ... existing validation and burn ...

    // Transfer tokens out -- handle ETH via pull pattern
    if (token0 == ETH_ADDRESS) {
        ethBalances[msg.sender] += amount0;
    } else {
        _transferTokenOut(token0, msg.sender, amount0);
    }
    if (token1 == ETH_ADDRESS) {
        ethBalances[msg.sender] += amount1;
    } else {
        _transferTokenOut(token1, msg.sender, amount1);
    }

    emit LiquidityRemoved(poolId, msg.sender, amount0, amount1, liquidity);
}
```

---

### H-02: LiquidityPoolAMM `addLiquidity()` does not enforce proportional deposit for existing pools

**Severity:** High
**File:** `/contracts/LiquidityPoolAMM.sol`
**Lines:** 194-222

**Description:**
The `addLiquidity()` function accepts arbitrary `amountA` and `amountB` from the caller and transfers both amounts in full. For an existing pool, the LP minted is `min(liquidity0, liquidity1)`, meaning any excess tokens beyond the pool's ratio are donated to existing LPs. This is a known issue in Uniswap V2 that requires a router to mitigate, but here there is no router for the `LiquidityPoolAMM`. Users calling `addLiquidity()` directly will lose funds if they provide tokens in the wrong ratio.

```solidity
// Tokens are transferred at the caller-specified amounts
_transferTokenIn(token0, msg.sender, amount0);
_transferTokenIn(token1, msg.sender, amount1);

// But only the minimum ratio determines LP tokens minted
uint256 liquidity0 = (amount0 * pool.totalLiquidity) / pool.reserve0;
uint256 liquidity1 = (amount1 * pool.totalLiquidity) / pool.reserve1;
liquidity = liquidity0 < liquidity1 ? liquidity0 : liquidity1;
```

**Remediation:**
Calculate the optimal deposit amounts and only transfer what is needed. Refund excess.

```solidity
function addLiquidity(
    address tokenA,
    address tokenB,
    uint256 amountADesired,
    uint256 amountBDesired,
    uint256 amountAMin,
    uint256 amountBMin,
    uint256 minLiquidity
) external nonReentrant returns (uint256 liquidity) {
    // ... existing validation ...

    uint256 amount0;
    uint256 amount1;

    if (pool.totalLiquidity == 0) {
        amount0 = tokenA == token0 ? amountADesired : amountBDesired;
        amount1 = tokenA == token0 ? amountBDesired : amountADesired;
    } else {
        // Calculate optimal amounts
        uint256 amount1Optimal = (amountADesired * pool.reserve1) / pool.reserve0;
        if (amount1Optimal <= amountBDesired) {
            require(amount1Optimal >= amountBMin, "Insufficient B amount");
            amount0 = amountADesired;
            amount1 = amount1Optimal;
        } else {
            uint256 amount0Optimal = (amountBDesired * pool.reserve0) / pool.reserve1;
            require(amount0Optimal >= amountAMin, "Insufficient A amount");
            amount0 = amount0Optimal;
            amount1 = amountBDesired;
        }
    }

    _transferTokenIn(token0, msg.sender, amount0);
    _transferTokenIn(token1, msg.sender, amount1);
    liquidity = _mintLiquidity(poolId, pool, amount0, amount1);
    // ...
}
```

---

### H-03: Flash loan attack vector on LiquidityPoolAMM -- no invariant check post-swap

**Severity:** High
**File:** `/contracts/LiquidityPoolAMM.sol`
**Lines:** 615-643

**Description:**
The `_executeSwap()` function updates reserves based on the computed `amountOut` from the constant-product formula but does **not** verify that the post-swap invariant `k_new >= k_old` still holds. While the `getAmountOut()` formula should mathematically guarantee this, any rounding errors could cause `k` to decrease over time, slowly draining pool value. Uniswap V2 explicitly checks `k` after every swap.

Additionally, because `createPool` and `addLiquidity` are permissionless and there is no flash-loan protection, an attacker could:
1. Flash-borrow a large amount of token
2. Add liquidity at a manipulated ratio (H-02)
3. Swap at an advantageous price
4. Remove liquidity
5. Repay the flash loan

```solidity
function _executeSwap(Pool storage pool, address tokenIn, uint256 amountIn)
    private returns (uint256 amountOut) {
    // ... compute amountOut ...

    pool.reserve0 += amountIn;  // or reserve1
    pool.reserve1 -= amountOut; // or reserve0

    pool.kLast = pool.reserve0 * pool.reserve1;
    // NO CHECK: kLast >= old kLast
}
```

**Remediation:**
Add an invariant check after every swap.

```solidity
function _executeSwap(Pool storage pool, address tokenIn, uint256 amountIn)
    private returns (uint256 amountOut) {
    uint256 kBefore = pool.reserve0 * pool.reserve1;

    // ... existing swap logic ...

    uint256 kAfter = pool.reserve0 * pool.reserve1;
    if (kAfter < kBefore) revert InvalidK();

    pool.kLast = kAfter;
}
```

---

### H-04: EasyAccessControl `revokeRole()` uses XOR instead of AND-NOT, allowing role re-grant bypass

**Severity:** High
**File:** `/contracts/security-token/EasyAccessControl.sol`
**Lines:** 65-73

**Description:**
The `revokeRole()` function uses XOR (`^=`) to remove a role. If the address does not actually have the specific bit set in their role bitmask, XOR will **add** the role instead of removing it. The `require(hasRole(addr, role))` check at line 66 only verifies that at least one bit in the `role` bitmask overlaps with the address's roles. If `role` is a multi-bit bitmask (e.g., `3` = CONTRACT_ADMIN | RESERVE_ADMIN), and the address only has one of those roles, the `hasRole` check passes but XOR will toggle bits -- removing the role they have and **granting** the role they don't have.

```solidity
function revokeRole(address addr, uint8 role) public validRole(role) validAddress(addr) onlyContractAdmin {
    require(hasRole(addr, role), "CAN NOT REVOKE ROLE");
    if (role & CONTRACT_ADMIN_ROLE > 0) {
        require(contractAdminCount > 1, "Must have at least one contract admin");
        contractAdminCount--;
    }
    admins[addr] ^= role; // XOR can GRANT roles if not all bits match
}
```

Example attack:
- Address has role `0b0001` (CONTRACT_ADMIN only)
- Admin calls `revokeRole(addr, 3)` intending to revoke CONTRACT_ADMIN + RESERVE_ADMIN
- `hasRole(addr, 3)` returns true (because `0b0001 & 0b0011 > 0`)
- `admins[addr] ^= 3` results in `0b0001 ^ 0b0011 = 0b0010` (RESERVE_ADMIN granted!)

**Remediation:**
Use AND-NOT (`&= ~role`) instead of XOR. Also verify all bits are set before revoking.

```solidity
function revokeRole(address addr, uint8 role) public validRole(role) validAddress(addr) onlyContractAdmin {
    require(admins[addr] & role == role, "Address does not have all specified roles");
    if (role & CONTRACT_ADMIN_ROLE > 0) {
        require(contractAdminCount > 1, "Must have at least one contract admin");
        contractAdminCount--;
    }
    admins[addr] &= ~role; // AND-NOT correctly clears only the specified bits
}
```

---

### H-05: OrbitalPool `swap()` transfers tokens before updating reserves (CEI violation)

**Severity:** High
**File:** `/contracts/orbital/OrbitalPool.sol`
**Lines:** 273-327

**Description:**
In `OrbitalPool.swap()`, the input token is transferred from the user to the pool at line 314 **before** reserves are updated at lines 317-318, and the output token is transferred at line 324 **after** the reserve update. This means that between lines 314 and 317, the actual token balance of the pool does not match `reserves[]`. A fee-on-transfer token would cause the actual received amount to be less than `amountIn`, but the contract adds the full `amountInAfterFee` to `reserves[tokenInIndex]`, creating an accounting discrepancy that grows with each swap.

```solidity
// Line 314: Transfer FIRST
_safeTransferFrom(tokens[tokenInIndex], msg.sender, address(this), amountIn);

// Line 317-318: Reserves updated AFTER transfer
reserves[tokenInIndex] += amountInAfterFee;
reserves[tokenOutIndex] -= amountOut;

// Line 324: Output transferred
_safeTransfer(tokens[tokenOutIndex], msg.sender, amountOut);
```

**Remediation:**
Measure actual received amount for fee-on-transfer token compatibility, and update reserves before any outbound transfer.

```solidity
// Transfer input tokens
uint256 balanceBefore = IERC20(tokens[tokenInIndex]).balanceOf(address(this));
_safeTransferFrom(tokens[tokenInIndex], msg.sender, address(this), amountIn);
uint256 actualIn = IERC20(tokens[tokenInIndex]).balanceOf(address(this)) - balanceBefore;

// Recalculate fee based on actual received
uint256 feeAmount = (actualIn * swapFeeBps) / FEE_DENOMINATOR;
uint256 amountInAfterFee = actualIn - feeAmount;

// ... compute output using amountInAfterFee ...

// Update reserves BEFORE outbound transfer
reserves[tokenInIndex] += amountInAfterFee;
reserves[tokenOutIndex] -= amountOut;
accumulatedFees[tokenInIndex] += feeAmount;

// Transfer output tokens LAST
_safeTransfer(tokens[tokenOutIndex], msg.sender, amountOut);
```

---

### H-06: RestrictedSwap `completeSwapWithRestrictedToken()` incorrect balance check

**Severity:** High
**File:** `/contracts/security-token/RestrictedSwap.sol`
**Lines:** 209-236

**Description:**
The `completeSwapWithRestrictedToken()` function checks the balance change of `swap.restrictedTokenSender` after transferring quote tokens to `msg.sender` (who IS `swap.restrictedTokenSender`). Lines 218-222 read `balanceBefore` and `balanceAfter` for `swap.restrictedTokenSender`, but the transfer at line 219 sends tokens to `msg.sender`. Since `msg.sender == swap.restrictedTokenSender`, the balance check `balanceBefore + swap.quoteTokenAmount == balanceAfter` would fail if any fee-on-transfer is applied, because the sender is also the receiver. More importantly, this check is checking the **wrong** account entirely -- it should check that the tokens were received by `msg.sender`, but since sender == receiver here, this is a tautological check that just verifies the contract's own outgoing transfer was successful.

```solidity
function completeSwapWithRestrictedToken(uint256 swapNumber) external override onlyValidSwap(swapNumber) {
    Swap storage swap = _swap[swapNumber];
    require(swap.restrictedTokenSender == msg.sender, "...");

    // Checking restrictedTokenSender's balance, but sending to msg.sender (same address)
    uint256 balanceBefore = IERC20(swap.quoteToken).balanceOf(swap.restrictedTokenSender);
    IERC20(swap.quoteToken).safeTransfer(msg.sender, swap.quoteTokenAmount);
    uint256 balanceAfter = IERC20(swap.quoteToken).balanceOf(swap.restrictedTokenSender);

    // This is checking sender==receiver, which is always true (minus fee-on-transfer)
    require(balanceBefore + swap.quoteTokenAmount == balanceAfter, "...");
}
```

**Remediation:**
The balance check should verify the quoteTokenSender originally deposited the correct amount. Since `safeTransfer` already reverts on failure, the redundant balance check can be removed or made meaningful.

```solidity
function completeSwapWithRestrictedToken(uint256 swapNumber) external override onlyValidSwap(swapNumber) {
    Swap storage swap = _swap[swapNumber];
    require(swap.restrictedTokenSender == msg.sender, "You are not appropriate token sender for this swap");

    swap.status = SwapStatus.Complete;

    // Transfer quote tokens to restricted token sender (msg.sender)
    IERC20(swap.quoteToken).safeTransfer(msg.sender, swap.quoteTokenAmount);

    // Transfer restricted tokens to quote token sender
    _transfer(msg.sender, swap.quoteTokenSender, swap.restrictedTokenAmount);

    emit SwapComplete(swapNumber, swap.restrictedTokenSender, swap.restrictedTokenAmount,
                      swap.quoteTokenSender, swap.quoteToken, swap.quoteTokenAmount);
}
```

---

### H-07: RestrictedSwap functions lack `nonReentrant` modifier

**Severity:** High
**File:** `/contracts/security-token/RestrictedSwap.sol`
**Lines:** 121-263

**Description:**
The `configureSell()`, `configureBuy()`, `completeSwapWithPaymentToken()`, `completeSwapWithRestrictedToken()`, and `cancelSell()` functions all perform external token transfers but none of them have the `nonReentrant` modifier. While `RestrictedSwap` inherits from `RestrictedLockupToken` which inherits `ReentrancyGuard`, the modifier is not applied to these swap functions. If the quote token is a token with callbacks (ERC-777, or a malicious token), reentrancy is possible.

**Remediation:**
Add `nonReentrant` to all swap-related functions.

```solidity
function configureSell(...) external nonReentrant { ... }
function configureBuy(...) external nonReentrant { ... }
function completeSwapWithPaymentToken(uint256 swapNumber) external override onlyValidSwap(swapNumber) nonReentrant { ... }
function completeSwapWithRestrictedToken(uint256 swapNumber) external override onlyValidSwap(swapNumber) nonReentrant { ... }
function cancelSell(uint256 swapNumber) external override onlyValidSwap(swapNumber) nonReentrant { ... }
```

---

### H-08: AssetBackedExchange `getActiveOrders()` unbounded loop -- Denial of Service

**Severity:** High
**File:** `/contracts/AssetBackedExchange.sol`
**Lines:** 333-362

**Description:**
The `getActiveOrders()` function iterates over **all** orders ever created (`nextOrderId` times, twice). As the number of orders grows, this function will exceed the block gas limit and become uncallable. While this is a `view` function and doesn't affect on-chain state, off-chain integrations and frontends relying on this function will break. An attacker could create many dust orders cheaply to accelerate the DoS.

```solidity
function getActiveOrders(address tokenSell, address tokenBuy) external view returns (Order[] memory) {
    uint256 count = 0;
    for (uint256 i = 0; i < nextOrderId; i++) { // unbounded O(n)
        // ...
    }
    Order[] memory result = new Order[](count);
    for (uint256 i = 0; i < nextOrderId; i++) { // unbounded O(n) again
        // ...
    }
    return result;
}
```

**Remediation:**
Add pagination or maintain per-pair order lists (similar to AssetExchange's `_pairOrderIds` pattern).

```solidity
// Maintain a per-pair mapping like AssetExchange does:
mapping(bytes32 => uint256[]) private _pairOrderIds;

function _pairKey(address tokenSell, address tokenBuy) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(tokenSell, tokenBuy));
}

// In _createOrder():
_pairOrderIds[_pairKey(tokenSell, tokenBuy)].push(orderId);

// Then getActiveOrders only iterates pair-specific orders
function getActiveOrders(address tokenSell, address tokenBuy, uint256 offset, uint256 limit)
    external view returns (Order[] memory) {
    // iterate only _pairOrderIds[pairKey] with pagination
}
```

---

## Medium Findings

### M-01: LiquidityPoolAMM `_transferTokenIn()` does not handle fee-on-transfer tokens

**Severity:** Medium
**File:** `/contracts/LiquidityPoolAMM.sol`
**Lines:** 650-657

**Description:**
The `_transferTokenIn()` function calls `IERC20(token).transferFrom()` and assumes the full `amount` was received. Fee-on-transfer tokens (e.g., USDT with fee, deflationary tokens) will transfer less than `amount`, but the pool will add the full `amount` to its reserves. Over time, the pool's recorded reserves will exceed its actual token balance, causing withdrawals to fail.

```solidity
function _transferTokenIn(address token, address from, uint256 amount) private {
    if (token == ETH_ADDRESS) return;
    bool ok = IERC20(token).transferFrom(from, address(this), amount);
    if (!ok) revert TransferFailed();
    // No check for actual received amount
}
```

**Remediation:**
Measure actual received amount by checking balance before and after.

```solidity
function _transferTokenIn(address token, address from, uint256 amount)
    private returns (uint256 received) {
    if (token == ETH_ADDRESS) return amount;
    uint256 balBefore = IERC20(token).balanceOf(address(this));
    bool ok = IERC20(token).transferFrom(from, address(this), amount);
    if (!ok) revert TransferFailed();
    received = IERC20(token).balanceOf(address(this)) - balBefore;
    if (received == 0) revert ZeroAmount();
}
```

---

### M-02: OrbitalRouter approves `type(uint256).max` to arbitrary pool addresses

**Severity:** Medium
**File:** `/contracts/orbital/OrbitalRouter.sol`
**Lines:** 325-340

**Description:**
The `_ensureApproval()` function sets infinite approval (`type(uint256).max`) from the router to any address passed as `pool`. Since `swap()`, `swapMultiHop()`, and `addLiquidity()` accept arbitrary `pool` addresses as parameters (they don't verify the pool was created by `orbitalFactory`), a malicious caller could pass a fake pool address that, when given infinite approval, drains all tokens held by the router.

```solidity
function _ensureApproval(address token, address spender, uint256 amount) private {
    // ... sets type(uint256).max approval to ANY spender
    (bool success,) = token.call(
        abi.encodeWithSelector(0x095ea7b3, spender, type(uint256).max)
    );
}
```

**Remediation:**
Verify that the pool was created by the factory before interacting with it. Alternatively, approve only the exact amount needed.

```solidity
function _validatePool(address pool) private view {
    // Verify pool is registered in factory
    // This requires factory to expose a mapping; alternatively check pool.factory() == address(orbitalFactory)
    require(OrbitalPool(pool).factory() == address(orbitalFactory), "Invalid pool");
}

function swap(address pool, ...) external returns (uint256 amountOut) {
    _validatePool(pool);
    // ... rest of function
}

// Also approve exact amount instead of max:
function _ensureApproval(address token, address spender, uint256 amount) private {
    (bool success,) = token.call(
        abi.encodeWithSelector(0x095ea7b3, spender, amount)
    );
    if (!success) revert TransferFailed();
}
```

---

### M-03: OrbitalMath `wadSqrt()` overflow for large inputs

**Severity:** Medium
**File:** `/contracts/orbital/OrbitalMath.sol`
**Lines:** 130-133

**Description:**
`wadSqrt(x)` computes `sqrt(x * WAD)`. For `x > type(uint256).max / WAD` (approximately 1.15e59), the multiplication `x * WAD` will overflow. While Solidity 0.8+ will revert, this means `wadSqrt` cannot be called with large values, which could occur with high-value reserves in the Orbital AMM causing unexpected transaction reverts.

```solidity
function wadSqrt(uint256 x) internal pure returns (uint256) {
    if (x == 0) return 0;
    return sqrt(x * WAD); // Overflow if x > ~1.15e59
}
```

**Remediation:**
Use a mulDiv pattern or adjust the computation to avoid overflow.

```solidity
function wadSqrt(uint256 x) internal pure returns (uint256) {
    if (x == 0) return 0;
    // For large x, use: sqrt(x) * sqrt(WAD) to avoid overflow
    if (x > type(uint256).max / WAD) {
        return sqrt(x) * sqrt(WAD);
    }
    return sqrt(x * WAD);
}
```

---

### M-04: AssetExchange `fillOrder()` rounding truncation allows dust extraction

**Severity:** Medium
**File:** `/contracts/AssetExchange.sol`
**Lines:** 187-194

**Description:**
The proportional sell amount calculation `fillAmountSell = (fillAmountBuy * order.amountSell) / order.amountBuy` rounds down. By making many small fills with carefully chosen `fillAmountBuy` values, a taker can accumulate rounding errors in their favor, extracting slightly more `tokenSell` than they should receive proportionally. Over many fills, the cumulative error drains the order's escrowed tokens beyond what the maker intended.

Similarly, `filledSell` is tracked cumulatively but the rounding truncation compounds: `sum(floor(fi * S / B)) <= floor(sum(fi) * S / B)`.

**Remediation:**
For the final fill (when `fillAmountBuy == remainingBuy`), set `fillAmountSell = order.amountSell - order.filledSell` to ensure no residual dust.

```solidity
uint256 fillAmountSell;
if (fillAmountBuy == remainingBuy) {
    // Final fill: use exact remaining to prevent dust accumulation
    fillAmountSell = order.amountSell - order.filledSell;
} else {
    fillAmountSell = (fillAmountBuy * order.amountSell) / order.amountBuy;
}
if (fillAmountSell == 0) revert ZeroAmount();
```

---

### M-05: LiquidityPoolAMM `_mintLiquidity()` first-deposit manipulation (inflation attack)

**Severity:** Medium
**File:** `/contracts/LiquidityPoolAMM.sol`
**Lines:** 563-591

**Description:**
For the first deposit, `liquidity = sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY` where `MINIMUM_LIQUIDITY = 1000`. An attacker can:
1. Create a pool
2. Deposit 1 wei of each token (gets 0 LP since `sqrt(1) = 1 < 1000`, reverts)
3. Or deposit 1001 wei of each token, get 1 LP
4. Then "donate" a large amount of one token by transferring directly to the contract (not through `addLiquidity`)
5. The next legitimate depositor will get very few LP tokens due to the inflated reserves vs low totalLiquidity

While `MINIMUM_LIQUIDITY = 1000` mitigates this to some extent (Uniswap V2 uses the same value), the attack cost is still very low for low-decimal or low-value tokens.

**Remediation:**
Increase `MINIMUM_LIQUIDITY` and/or require a minimum initial deposit size.

```solidity
uint256 public constant MINIMUM_LIQUIDITY = 10000; // Increase from 1000
uint256 public constant MINIMUM_INITIAL_DEPOSIT = 1e15; // Require meaningful first deposit

function _mintLiquidity(...) private returns (uint256 liquidity) {
    if (pool.totalLiquidity == 0) {
        require(amount0 >= MINIMUM_INITIAL_DEPOSIT && amount1 >= MINIMUM_INITIAL_DEPOSIT,
                "Initial deposit too small");
        liquidity = _sqrt(amount0 * amount1);
        // ...
    }
}
```

---

### M-06: Front-running / MEV vulnerability in all exchange and AMM contracts

**Severity:** Medium
**Files:** `/contracts/AssetExchange.sol`, `/contracts/AssetBackedExchange.sol`, `/contracts/LiquidityPoolAMM.sol`, `/contracts/orbital/OrbitalPool.sol`

**Description:**
All exchange and swap operations are susceptible to front-running (sandwich attacks). While `LiquidityPoolAMM` and `OrbitalPool` provide `minAmountOut` slippage parameters, and `OrbitalPool` provides a `deadline` parameter:

1. `AssetExchange.fillOrder()` has no deadline parameter -- a transaction can sit in the mempool indefinitely and be filled at a stale price
2. `AssetBackedExchange.fillOrder()` and `fillOrderWithETH()` have no deadline parameter
3. `LiquidityPoolAMM.swap()` has no deadline parameter
4. A MEV bot can observe pending `createOrder` transactions and front-run them with their own orders at manipulated prices

**Remediation:**
Add `deadline` parameters to all functions that involve price-sensitive operations.

```solidity
// For AssetExchange and AssetBackedExchange:
function fillOrder(uint256 orderId, uint256 fillAmountBuy, uint256 deadline)
    external nonReentrant {
    require(block.timestamp <= deadline, "Transaction expired");
    // ... existing logic
}

// For LiquidityPoolAMM:
function swap(
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 minAmountOut,
    uint256 deadline  // ADD THIS
) external nonReentrant returns (uint256 amountOut) {
    require(block.timestamp <= deadline, "Transaction expired");
    // ... existing logic
}
```

---

### M-07: Dividends `totalAwardedBalanceAt()` precision loss with low `tokenPrecisionDivider`

**Severity:** Medium
**File:** `/contracts/security-token/Dividends.sol`
**Lines:** 119-124

**Description:**
The dividend share calculation uses `tokenPrecisionDivider = 10000`, which means any holder with less than 0.01% of the total supply at the snapshot will receive 0 tokens due to integer truncation. This could result in unclaimable dust remaining in the contract.

```solidity
function totalAwardedBalanceAt(address token, address receiver, uint256 snapshotId) override public view returns (uint256) {
    uint256 secTokenBalance = this.balanceOfAt(receiver, snapshotId);
    uint256 totalSupply = this.totalSupplyAt(snapshotId);
    uint256 share = (secTokenBalance * tokenPrecisionDivider) / totalSupply; // Truncates for small holders
    return (tokensFunded[snapshotId][token].total * share) / tokenPrecisionDivider;
}
```

**Remediation:**
Use a higher precision divider or compute the share in a single division to minimize truncation.

```solidity
uint256 public constant tokenPrecisionDivider = 1e18; // Much higher precision

// Or compute in a single step:
function totalAwardedBalanceAt(address token, address receiver, uint256 snapshotId)
    override public view returns (uint256) {
    uint256 secTokenBalance = this.balanceOfAt(receiver, snapshotId);
    uint256 totalSup = this.totalSupplyAt(snapshotId);
    if (totalSup == 0) return 0;
    // Single multiplication then division to minimize truncation
    return (tokensFunded[snapshotId][token].total * secTokenBalance) / totalSup;
}
```

---

### M-08: `WrappedAssetFactory` allows duplicate document hashes

**Severity:** Medium
**File:** `/contracts/WrappedAssetFactory.sol`
**Lines:** 68-116

**Description:**
There is no check preventing the same `_documentHash` from being used to create multiple `WrappedAsset` tokens. This means the same underlying document can be tokenized multiple times, potentially creating conflicting claims on the same real-world asset. While off-chain processes may catch this, on-chain enforcement is absent.

**Remediation:**
Add a mapping to track used document hashes.

```solidity
mapping(bytes32 => bool) private _usedDocumentHashes;
error DocumentAlreadyTokenized();

function createWrappedAsset(...) external returns (address asset) {
    // ... existing validation ...
    if (_usedDocumentHashes[_documentHash]) revert DocumentAlreadyTokenized();
    _usedDocumentHashes[_documentHash] = true;
    // ... rest of function
}
```

---

### M-09: OrbitalRouter lacks reentrancy guard

**Severity:** Medium
**File:** `/contracts/orbital/OrbitalRouter.sol`
**Lines:** 28-364

**Description:**
The `OrbitalRouter` contract does not have a reentrancy guard on any of its functions (`swap`, `swapMultiHop`, `addLiquidity`, `removeLiquidity`). While the underlying `OrbitalPool` has its own `nonReentrant` modifier, the router itself holds tokens transiently during operations. A malicious token's `transfer`/`transferFrom` callback could re-enter the router and manipulate the multi-hop swap state.

**Remediation:**
Add a reentrancy guard to the router.

```solidity
uint256 private _status = 1;
uint256 private constant _NOT_ENTERED = 1;
uint256 private constant _ENTERED = 2;

modifier nonReentrant() {
    require(_status != _ENTERED, "ReentrantCall");
    _status = _ENTERED;
    _;
    _status = _NOT_ENTERED;
}

function swap(...) external nonReentrant returns (uint256 amountOut) { ... }
function swapMultiHop(...) external nonReentrant returns (uint256 amountOut) { ... }
function addLiquidity(...) external nonReentrant returns (uint256 liquidity) { ... }
function removeLiquidity(...) external nonReentrant returns (uint256[] memory amounts) { ... }
```

---

### M-10: OrbitalFactory `createPool()` is permissionless with no fee validation when caller specifies fee

**Severity:** Medium
**File:** `/contracts/orbital/OrbitalFactory.sol`
**Lines:** 110-148

**Description:**
While the factory validates `_defaultSwapFeeBps > 100` in the constructor and `setDefaultSwapFee`, the `createPool()` function uses the caller-provided `_swapFeeBps` without checking it against `MAX_FEE_BPS`. The validation happens inside `OrbitalPool.initialize()`, but this means any user can create a pool with a fee between 0 and 100 bps. A fee of 0 creates a pool where liquidity providers earn nothing, and there is no minimum fee enforcement. This could be used to create no-fee competing pools that steal volume from legitimate pools.

```solidity
function createPool(
    address[] calldata _tokens,
    uint8 _concentration,
    uint256 _swapFeeBps, // No validation here
    string calldata _name,
    string calldata _symbol
) external returns (address pool) {
    uint256 feeBps = _swapFeeBps == 0 ? defaultSwapFeeBps : _swapFeeBps;
    // feeBps is not validated before passing to initialize
}
```

**Remediation:**
Add fee validation in the factory.

```solidity
function createPool(...) external returns (address pool) {
    uint256 feeBps = _swapFeeBps == 0 ? defaultSwapFeeBps : _swapFeeBps;
    if (feeBps > 100) revert InvalidFee();
    // Or enforce a minimum: if (feeBps < 1) revert InvalidFee();
    // ... rest of function
}
```

---

## Low Findings

### L-01: WrappedAsset `burn()` does not use `unchecked` consistently

**Severity:** Low
**File:** `/contracts/WrappedAsset.sol`
**Lines:** 188-197

**Description:**
The `burn()` function uses `unchecked` for `balanceOf[msg.sender] -= amount` (safe since balance was checked), but `totalSupply -= amount` at line 194 is NOT in an unchecked block. Since `totalSupply >= balanceOf[msg.sender] >= amount`, this is safe but wastes a small amount of gas compared to also putting it in unchecked. This is a consistency issue rather than a bug.

---

### L-02: LiquidityPoolAMM has an open `receive()` function

**Severity:** Low
**File:** `/contracts/LiquidityPoolAMM.sol`
**Line:** 701

**Description:**
The `receive() external payable {}` function accepts ETH from any sender without restriction. ETH sent directly to the contract (not through `addLiquidityETH` or `swapETHForToken`) will be trapped forever and will not be reflected in any pool's reserves. This is not a security vulnerability per se, but it can lead to fund loss for users who mistakenly send ETH directly.

**Remediation:**
Restrict `receive()` to only accept ETH during legitimate operations, or remove it and require all ETH to be sent through the proper functions.

```solidity
// Option 1: Remove receive() entirely and use proper payable functions
// Option 2: Track expected ETH and revert unexpected deposits
receive() external payable {
    // Only accept ETH during active operations (when reentrancy guard is set)
    if (_status != _ENTERED) revert("Direct ETH not accepted");
}
```

---

### L-03: `AssetBackedExchange` also has open `receive()`

**Severity:** Low
**File:** `/contracts/AssetBackedExchange.sol`
**Line:** 377

**Description:**
Same issue as L-02. Direct ETH transfers to the contract are accepted but will be locked forever.

---

### L-04: `WrappedAsset` ERC-20 does not implement `increaseAllowance` / `decreaseAllowance`

**Severity:** Low
**File:** `/contracts/WrappedAsset.sol`

**Description:**
The ERC-20 `approve()` function is vulnerable to the well-known "approve race condition" where changing an allowance from N to M allows the spender to spend N+M. The standard mitigation is `increaseAllowance()`/`decreaseAllowance()`, which is not implemented. Similarly, the OrbitalPool LP token implementation lacks these functions.

**Remediation:**
Add `increaseAllowance` and `decreaseAllowance` functions.

```solidity
function increaseAllowance(address spender, uint256 addedValue) external returns (bool) {
    allowance[msg.sender][spender] += addedValue;
    emit Approval(msg.sender, spender, allowance[msg.sender][spender]);
    return true;
}

function decreaseAllowance(address spender, uint256 subtractedValue) external returns (bool) {
    uint256 current = allowance[msg.sender][spender];
    require(current >= subtractedValue, "Decreased allowance below zero");
    unchecked {
        allowance[msg.sender][spender] = current - subtractedValue;
    }
    emit Approval(msg.sender, spender, allowance[msg.sender][spender]);
    return true;
}
```

---

### L-05: `SecurityTokenFactory` first token gets index 0, colliding with default mapping value

**Severity:** Low
**File:** `/contracts/security-token/SecurityTokenFactory.sol`
**Lines:** 148-167

**Description:**
The `_tokenIndex` mapping returns 0 for any non-existent token address (Solidity default). The first token created gets index 0 as well. Although `_tokenExists` is checked separately, any code that reads `_tokenIndex` without checking `_tokenExists` first could confuse a non-existent token with the first created token.

**Remediation:**
Start indices at 1, or always check `_tokenExists` before reading `_tokenIndex` (which is currently done correctly).

---

### L-06: `RestrictedLockupToken.transferTimelock()` does not enforce transfer restrictions

**Severity:** Low
**File:** `/contracts/security-token/RestrictedLockupToken.sol`
**Lines:** 593-598

**Description:**
The `transferTimelock()` function allows direct transfer of unlocked timelock tokens via `IERC20(this).safeTransfer(to, value)` without calling `enforceTransferRestrictions()`. This bypasses the ERC-1404 compliance checks (frozen addresses, transfer group rules, max balance, pause state).

```solidity
function transferTimelock(address to, uint value, uint timelockId) public returns (bool) {
    require(unlockedAmountOfTimelock(msg.sender, timelockId) >= value, "amount > unlocked");
    timelocks[msg.sender][timelockId].tokensTransferred += value;
    IERC20(this).safeTransfer(to, value); // NO transfer restriction check!
    return true;
}
```

**Remediation:**
Add transfer restriction enforcement.

```solidity
function transferTimelock(address to, uint value, uint timelockId) public returns (bool) {
    require(unlockedAmountOfTimelock(msg.sender, timelockId) >= value, "amount > unlocked");
    enforceTransferRestrictions(msg.sender, to, value); // ADD THIS
    timelocks[msg.sender][timelockId].tokensTransferred += value;
    IERC20(this).safeTransfer(to, value);
    return true;
}
```

---

## Informational Findings

### I-01: Solidity version inconsistency across contracts

**Severity:** Informational
**Files:** All

**Description:**
The core platform contracts (WrappedAsset, AssetExchange, LiquidityPoolAMM, Orbital) use `pragma solidity ^0.8.20`, while the security-token subsystem uses `pragma solidity ^0.8.4`. This version inconsistency may lead to compilation issues when deploying from a single compiler version and creates maintenance burden. Solidity 0.8.20 introduced important optimizations and the `PUSH0` opcode.

**Remediation:**
Standardize on a single Solidity version (recommend `^0.8.20` or higher) across all contracts.

---

### I-02: Missing `indexed` parameters in some events

**Severity:** Informational
**Files:** `/contracts/orbital/OrbitalPool.sol`, `/contracts/security-token/RestrictedSwap.sol`

**Description:**
Several events could benefit from additional `indexed` parameters for efficient off-chain filtering:
- `OrbitalPool.Swap` should index `tokenInIndex` and `tokenOutIndex`
- `RestrictedSwap.SwapConfigured` should index `swapNumber`

---

### I-03: `OrbitalFactory._computePoolKey()` uses `abi.encodePacked` with dynamic array

**Severity:** Informational
**File:** `/contracts/orbital/OrbitalFactory.sol`
**Lines:** 214-226

**Description:**
Using `abi.encodePacked` with a dynamic array of addresses is not collision-resistant in theory (though in practice addresses are fixed-length so it works correctly). Using `abi.encode` would be slightly more robust. This is not exploitable in practice since addresses are always 20 bytes.

---

## Contract-by-Contract Summary

### `/contracts/WrappedAsset.sol`
- Well-structured ERC-20 with proper access control via immutable factory
- Uses `unchecked` blocks correctly where underflow is pre-validated
- Missing `increaseAllowance`/`decreaseAllowance` (L-04)
- No critical issues

### `/contracts/WrappedAssetFactory.sol`
- Good input validation (zero address, zero mint, empty name/symbol)
- On-chain enforcement of `_mintAmount <= _originalValue`
- Missing duplicate document hash check (M-08)
- No reentrancy concerns (no external calls besides deploying new contracts)

### `/contracts/AssetExchange.sol`
- Proper reentrancy guard on all mutative functions
- Correct Checks-Effects-Interactions pattern throughout
- Safe token transfer helpers handle non-compliant ERC-20s
- Rounding truncation in partial fills (M-04)
- Missing deadline parameter (M-06)
- Well-designed overall

### `/contracts/AssetBackedExchange.sol`
- Critical reentrancy risks in ETH-based fills (C-01, C-02)
- `createOrder()` missing `nonReentrant` (C-01)
- Unbounded loop DoS in `getActiveOrders()` (H-08)
- Missing deadline parameter (M-06)
- Pull pattern correctly used for cancel/withdraw but not for fill

### `/contracts/LiquidityPoolAMM.sol`
- Proper reentrancy guard
- Correct constant-product formula
- ETH pull pattern used inconsistently (H-01)
- No proportional deposit enforcement (H-02)
- No post-swap K invariant check (H-03)
- Fee-on-transfer incompatibility (M-01)
- First-deposit inflation attack possible (M-05)
- Open `receive()` traps ETH (L-02)

### `/contracts/orbital/OrbitalMath.sol`
- Clean library implementation
- Potential overflow in `wadSqrt` for large inputs (M-03)
- All power/root functions correctly chain multiplications
- No external state or access control concerns

### `/contracts/orbital/OrbitalPool.sol`
- Comprehensive access control and validation
- Deadline and slippage protection on all operations
- CEI violation in swap (H-05)
- Fee-on-transfer token incompatibility
- No post-swap invariant verification

### `/contracts/orbital/OrbitalFactory.sol`
- Proper admin access control with zero-address checks
- Deterministic pool key prevents most duplicates
- Permissionless pool creation with insufficient fee validation (M-10)
- No critical issues

### `/contracts/orbital/OrbitalRouter.sol`
- Stateless design is good
- Infinite approval to unvalidated pool addresses (M-02)
- Missing reentrancy guard (M-09)
- Multi-hop swaps with intermediate 0 slippage could be sandwiched

### `/contracts/security-token/EasyAccessControl.sol`
- Role revocation uses XOR instead of AND-NOT (H-04)
- `hasRole` uses bitwise AND which is correct for checking
- Role system is simple but functional

### `/contracts/security-token/RestrictedLockupToken.sol`
- Complex timelock system with many edge cases
- `transferTimelock()` bypasses transfer restrictions (L-06)
- `enforceTransferRestrictions` is marked `public` but noted as `/*private*/`
- Batch funding lacks individual reentrancy protection (relies on per-call nonReentrant)
- Well-tested OpenZeppelin base contracts

### `/contracts/security-token/Dividends.sol`
- CEI violations in `claimDividend` and `withdrawalRemains` (C-03, C-04)
- Low precision divider causes dust issues (M-07)
- `nonReentrant` modifier present but CEI should be fixed regardless

### `/contracts/security-token/RestrictedSwap.sol`
- Swap functions lack `nonReentrant` (H-07)
- Incorrect balance verification in `completeSwapWithRestrictedToken` (H-06)
- Swap number shadowing (function parameter `swapNumber` shadows state variable `swapNumber`)
- No event emission for all state changes
- ERC-1404 compliance check in `_configureSwap` is good

### `/contracts/security-token/TransferRules.sol`
- Clean implementation of ERC-1404 transfer restriction logic
- All restriction codes properly defined
- No access control issues

### `/contracts/security-token/SecurityTokenDeployer.sol`
- Simple deployer pattern, no security concerns
- Anyone can call `deployTransferRules()` and `deployRestrictedSwap()` but this is by design

### `/contracts/security-token/SecurityTokenFactory.sol`
- Good input validation
- Proper registry management
- Index 0 collision potential (L-05)
- No reentrancy concerns

---

## Recommendations Summary

### Immediate Actions (Critical/High)
1. Fix CEI violations in Dividends.sol (C-03, C-04)
2. Add `nonReentrant` to AssetBackedExchange `createOrder` functions (C-01)
3. Convert ETH sends to pull pattern in AssetBackedExchange fills (C-02)
4. Fix EasyAccessControl `revokeRole` XOR bug (H-04)
5. Add `nonReentrant` to RestrictedSwap functions (H-07)
6. Add post-swap K invariant check in LiquidityPoolAMM (H-03)
7. Fix proportional deposit enforcement in LiquidityPoolAMM (H-02)
8. Add pagination to AssetBackedExchange `getActiveOrders` (H-08)

### Short-term Actions (Medium)
9. Add fee-on-transfer token support (M-01, H-05)
10. Validate pool addresses in OrbitalRouter (M-02)
11. Add deadline parameters to exchange fills (M-06)
12. Fix overflow in OrbitalMath `wadSqrt` (M-03)
13. Add reentrancy guard to OrbitalRouter (M-09)
14. Add duplicate document hash check to WrappedAssetFactory (M-08)
15. Increase precision in Dividends calculation (M-07)

### Long-term Improvements (Low/Informational)
16. Add `increaseAllowance`/`decreaseAllowance` (L-04)
17. Fix `transferTimelock` compliance bypass (L-06)
18. Standardize Solidity versions (I-01)
19. Restrict `receive()` functions (L-02, L-03)

---

## Methodology

This audit was conducted through manual line-by-line source code review of all 21 Solidity files in the `/contracts/` directory. The analysis covered:

1. **Reentrancy analysis:** Every external call was traced to verify Checks-Effects-Interactions ordering and reentrancy guard coverage.
2. **Access control review:** Every public/external function was checked for appropriate role/owner restrictions.
3. **Integer arithmetic:** All unchecked blocks, divisions, and multiplications were analyzed for overflow/underflow and precision loss.
4. **Flash loan vectors:** AMM and exchange contracts were evaluated for atomic arbitrage and price manipulation.
5. **Oracle risks:** No external oracle dependencies were found (prices are determined on-chain via order books and AMM formulas).
6. **MEV/Front-running:** All price-sensitive operations were checked for deadline and slippage protection.
7. **DoS vectors:** All loops and dynamic arrays were analyzed for gas consumption bounds.
8. **Token compatibility:** Transfer functions were checked for fee-on-transfer, rebasing, and ERC-777 token support.
9. **Storage patterns:** No proxy contracts were found, so storage collision was not applicable.
10. **Input validation:** All external function parameters were checked for zero-value, zero-address, and bounds validation.

---

*Audit generated on 2026-02-17 by SECURITY-AUDITOR. This is an automated analysis and should be supplemented with formal verification, fuzz testing, and manual expert review before production deployment.*
