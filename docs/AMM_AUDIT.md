# AMM Security & Optimization Audit

**Audit Date:** 2026-02-17
**Auditor:** AMM-OPTIMIZER
**Scope:** LiquidityPoolAMM.sol, Orbital AMM contracts (OrbitalMath.sol, OrbitalPool.sol, OrbitalFactory.sol, OrbitalRouter.sol), and all frontend AMM components
**Solidity Version:** ^0.8.20

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [LiquidityPoolAMM.sol -- Findings](#2-liquiditypoolammsol----findings)
3. [Orbital AMM Contracts -- Findings](#3-orbital-amm-contracts----findings)
4. [Frontend Components -- Findings](#4-frontend-components----findings)
5. [Cross-Cutting Concerns](#5-cross-cutting-concerns)
6. [Optimization Recommendations](#6-optimization-recommendations)
7. [Prioritized Action Items](#7-prioritized-action-items)

---

## 1. Executive Summary

The Fueki AMM implementation comprises two distinct AMM systems: a Uniswap V2-style constant-product AMM (`LiquidityPoolAMM.sol`) and a novel multi-token superellipse AMM (Orbital AMM). Both implementations demonstrate solid fundamentals -- reentrancy guards, slippage protection, minimum liquidity burning -- but contain several issues ranging from critical security vulnerabilities to gas optimization opportunities.

### Severity Summary

| Severity | LiquidityPoolAMM | Orbital AMM | Frontend |
|----------|:--:|:--:|:--:|
| Critical | 2 | 2 | 2 |
| High     | 3 | 3 | 1 |
| Medium   | 4 | 4 | 3 |
| Low      | 3 | 3 | 2 |
| Gas Opt  | 4 | 5 | -- |

---

## 2. LiquidityPoolAMM.sol -- Findings

**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/contracts/LiquidityPoolAMM.sol`

---

### CRITICAL-LP-01: No Deadline Parameter on Swap and Liquidity Functions

**Severity:** CRITICAL
**Category:** MEV Resistance
**Lines:** 367-392, 400-419, 428-451, 194-222, 231-260

The `swap()`, `swapETHForToken()`, `swapTokenForETH()`, `addLiquidity()`, and `addLiquidityETH()` functions have no `deadline` parameter. A transaction can be held in the mempool indefinitely and executed at any future time when the price has moved adversely.

```solidity
// CURRENT -- no deadline parameter
function swap(
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 minAmountOut  // only slippage, no deadline
) external nonReentrant returns (uint256 amountOut) { ... }
```

**Impact:** Miners or MEV bots can hold transactions and execute them at an unfavorable time. Even with `minAmountOut`, the user could get a fill that was acceptable at submission time but undesirable hours or days later due to changed market conditions.

**Recommendation:** Add a `deadline` parameter to all swap and liquidity functions:

```solidity
modifier ensure(uint256 deadline) {
    if (block.timestamp > deadline) revert DeadlineExpired();
    _;
}

function swap(
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 minAmountOut,
    uint256 deadline
) external nonReentrant ensure(deadline) returns (uint256 amountOut) { ... }
```

---

### CRITICAL-LP-02: Fee-on-Transfer Token Incompatibility

**Severity:** CRITICAL
**Category:** Fee Model
**Lines:** 382-389, 615-644

The contract uses the user-specified `amountIn` for swap calculations rather than measuring the actual amount received. For fee-on-transfer (deflationary) tokens, the contract will receive less than `amountIn` but update reserves as if the full amount was received, leading to a persistent reserve inflation.

```solidity
// Line 383: Transfer input token
_transferTokenIn(tokenIn, msg.sender, amountIn);

// Line 385: Swap uses amountIn (the requested amount, not received)
amountOut = _executeSwap(pool, tokenIn, amountIn);
```

**Impact:** If any fee-on-transfer token is paired in a pool, the reserves will gradually diverge from actual contract balances. This can be exploited to drain the pool by repeatedly swapping with the inflated reserves.

**Recommendation:** Measure balance before and after transfers:

```solidity
function _executeSwapSafe(
    Pool storage pool,
    address tokenIn,
    uint256 expectedAmountIn
) private returns (uint256 amountOut) {
    uint256 balanceBefore = IERC20(tokenIn).balanceOf(address(this));
    _transferTokenIn(tokenIn, msg.sender, expectedAmountIn);
    uint256 actualAmountIn = IERC20(tokenIn).balanceOf(address(this)) - balanceBefore;
    amountOut = _executeSwap(pool, tokenIn, actualAmountIn);
}
```

---

### HIGH-LP-01: Direct ETH Transfer in _transferTokenOut Allows Reentrancy Vector

**Severity:** HIGH
**Category:** Reentrancy
**Lines:** 659-667

While the `nonReentrant` modifier protects the entry point, `_transferTokenOut` sends ETH via a low-level `call` before the `Swap` event is emitted. If the ETH recipient is a contract, it could invoke other non-reentrant functions on different contracts within the protocol during the callback.

```solidity
function _transferTokenOut(address token, address to, uint256 amount) private {
    if (token == ETH_ADDRESS) {
        (bool sent,) = payable(to).call{value: amount}("");  // external call
        if (!sent) revert TransferFailed();
        return;
    }
    // ...
}
```

**Impact:** While the reentrancy guard prevents re-entry into this contract, cross-contract reentrancy is possible if other protocol contracts rely on the state of this contract.

**Recommendation:** Use the pull pattern consistently for all ETH distributions (as already done in `swapTokenForETH` and `removeLiquidityETH`), or adopt CEI (Checks-Effects-Interactions) pattern by moving `_transferTokenOut` calls to after all state updates.

---

### HIGH-LP-02: Pool Can Be Drained Below Economic Viability

**Severity:** HIGH
**Category:** Liquidity Depth
**Lines:** 593-609, 615-644

After initial liquidity is established with `MINIMUM_LIQUIDITY = 1000`, there is no check preventing reserves from being reduced to near-zero through repeated swaps. The only protection is `amount0 == 0 || amount1 == 0` (line 602) for removals, but swaps can drain reserves to 1 wei.

```solidity
// _burnLiquidity: only checks for zero, not minimum
if (amount0 == 0 || amount1 == 0) revert InsufficientLiquidity();
```

**Impact:** An attacker who controls a large share of LP tokens can remove liquidity until reserves are so small that the pool is effectively non-functional, producing extremely imprecise pricing due to integer rounding.

**Recommendation:** Enforce a minimum reserve threshold:

```solidity
uint256 public constant MIN_RESERVE = 1000;

// In _burnLiquidity, after computing amounts:
if (pool.reserve0 - amount0 < MIN_RESERVE || pool.reserve1 - amount1 < MIN_RESERVE) {
    revert InsufficientLiquidity();
}
```

---

### HIGH-LP-03: Missing K-Invariant Validation After Swaps

**Severity:** HIGH
**Category:** Overflow / Correctness
**Lines:** 615-644

While `kLast` is updated after swaps, there is no assertion that the new `k` is greater than or equal to the pre-swap `k`. The constant-product invariant should only increase (or remain equal) after a swap with fees.

```solidity
// Line 643: kLast is updated but never validated
pool.kLast = pool.reserve0 * pool.reserve1;
// Missing: assert(pool.kLast >= oldK)
```

**Impact:** Any rounding error or logic bug that causes `k` to decrease would go undetected, silently eroding pool value.

**Recommendation:**

```solidity
uint256 oldK = pool.kLast;
pool.kLast = pool.reserve0 * pool.reserve1;
if (pool.kLast < oldK) revert InvalidK();
```

---

### MEDIUM-LP-01: Unused InvalidK Error

**Severity:** MEDIUM
**Category:** Code Quality
**Line:** 128

The error `InvalidK()` is declared but never used in the contract.

---

### MEDIUM-LP-02: Redundant Storage Reads in _executeSwap

**Severity:** MEDIUM
**Category:** Gas Efficiency
**Lines:** 615-644

`_executeSwap` reads `pool.token0` twice (lines 623 and 635) for the same comparison. The function also reads `pool.reserve0` and `pool.reserve1` into local variables, then writes them back, which is fine. However, `pool.kLast` at line 643 performs two SLOADs (`pool.reserve0` and `pool.reserve1`) that were just written -- the compiler may not optimize these away.

**Recommendation:** Cache the new reserves in local variables:

```solidity
uint256 newReserve0;
uint256 newReserve1;
if (tokenIn == pool.token0) {
    newReserve0 = reserveIn + amountIn;
    newReserve1 = reserveOut - amountOut;
} else {
    newReserve1 = reserveIn + amountIn;
    newReserve0 = reserveOut - amountOut;
}
pool.reserve0 = newReserve0;
pool.reserve1 = newReserve1;
pool.kLast = newReserve0 * newReserve1;
```

**Gas saved:** ~200 gas per swap (2 SLOADs avoided).

---

### MEDIUM-LP-03: Overflow Risk in getAmountOut Multiplication

**Severity:** MEDIUM
**Category:** Overflow
**Lines:** 522-525

```solidity
uint256 amountInWithFee = amountIn * (FEE_DENOMINATOR - FEE_NUMERATOR); // amountIn * 997
uint256 numerator = amountInWithFee * reserveOut;                        // could overflow
```

While Solidity 0.8.x has built-in overflow checks, an overflow will cause a revert rather than silently wrapping. For very large token amounts (e.g., tokens with 0 decimals and large supplies), `amountInWithFee * reserveOut` can overflow `uint256` if both are in the range of ~10^38.

**Impact:** Legitimate swaps of large amounts could unexpectedly revert.

**Recommendation:** Use a helper that checks and handles the overflow gracefully, or document the maximum supported token amounts. Consider mulDiv for safe rounding:

```solidity
amountOut = FullMath.mulDiv(amountInWithFee, reserveOut, denominator);
```

---

### MEDIUM-LP-04: addLiquidity Does Not Enforce Proportional Deposits

**Severity:** MEDIUM
**Category:** Liquidity Depth
**Lines:** 194-222

For existing pools, `_mintLiquidity` takes the minimum of two ratios (lines 579-581), but the contract transfers in both `amount0` and `amount1` as specified by the user (lines 215-216). Any excess tokens (beyond the proportional ratio) are donated to the pool -- the depositor receives LP tokens based only on the smaller ratio.

```solidity
// Transfers full user-specified amounts
_transferTokenIn(token0, msg.sender, amount0);
_transferTokenIn(token1, msg.sender, amount1);

// But LP tokens are based on min ratio
liquidity = liquidity0 < liquidity1 ? liquidity0 : liquidity1;
```

**Impact:** Users who supply disproportionate amounts silently donate the excess. This is by design in Uniswap V2 but the UI should calculate optimal amounts or warn users about excess donation.

**Recommendation:** Either (a) refund excess tokens to the user (as Uniswap V2 Router does), or (b) add clear frontend warnings about proportional deposit requirements.

---

### LOW-LP-01: _status Not Using Transient Storage

**Severity:** LOW
**Category:** Gas Efficiency
**Lines:** 70-72

On EVM chains supporting EIP-1153, using `TSTORE`/`TLOAD` for the reentrancy guard reduces cost from 5000/2100 gas (SSTORE/SLOAD) to 100 gas per slot per transaction.

---

### LOW-LP-02: Missing Event for Pool State Changes

**Severity:** LOW
**Category:** Code Quality

The `kLast` value is stored but there is no event emitting the current invariant value. Off-chain indexers must re-derive it from reserves.

---

### LOW-LP-03: Sqrt Function Gas Optimization

**Severity:** LOW
**Category:** Gas Efficiency
**Lines:** 684-695

The Babylonian square root implementation iterates until convergence. A faster approach using Newton's method with a better initial guess (based on the bit-length of the input) would reduce iterations.

**Recommendation:** Use the OpenZeppelin or Solmate sqrt implementation which uses a lookup-based initial guess.

---

## 3. Orbital AMM Contracts -- Findings

### 3.1 OrbitalMath.sol

**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/contracts/orbital/OrbitalMath.sol`

---

#### CRITICAL-OM-01: wadSqrt Overflow for Large Values

**Severity:** CRITICAL
**Category:** Overflow
**Line:** 132

```solidity
function wadSqrt(uint256 x) internal pure returns (uint256) {
    if (x == 0) return 0;
    return sqrt(x * WAD);  // x * 1e18 overflows when x > ~1.15e59
}
```

When `x > type(uint256).max / WAD` (approximately 1.15e59), the multiplication `x * WAD` overflows. Since Solidity 0.8.x reverts on overflow, any `wadSqrt` call with a large input silently fails.

**Impact:** The `wadRoot` family of functions calls `wadSqrt` recursively. For pools with very large reserves or high concentration powers, the invariant computations will revert entirely, locking funds.

**Recommendation:** Use a two-step approach that avoids the overflow:

```solidity
function wadSqrt(uint256 x) internal pure returns (uint256) {
    if (x == 0) return 0;
    if (x <= type(uint256).max / WAD) {
        return sqrt(x * WAD);
    }
    // For large x: sqrt(x * WAD) = sqrt(x) * sqrt(WAD) = sqrt(x) * ~3.16e10
    // But this loses precision. Better: sqrt(x * WAD) = sqrt(x) * sqrt(WAD)
    // only if we compute sqrt(x) first at full precision.
    return sqrt(x) * sqrt(WAD);
}
```

Or use a more precise approach: `sqrt(x) * 1e9` when `x * 1e18` would overflow (since `sqrt(1e18) = 1e9`).

---

#### HIGH-OM-01: Precision Loss in Chained WAD Root Operations

**Severity:** HIGH
**Category:** Overflow
**Lines:** 141-158

`wadRoot4`, `wadRoot8`, `wadRoot16`, and `wadRoot32` chain multiple `wadSqrt` calls. Each call introduces truncation error from integer division. For `wadRoot32` (5 chained sqrt operations), the cumulative precision loss can be significant.

```solidity
function wadRoot32(uint256 x) internal pure returns (uint256) {
    return wadSqrt(wadSqrt(wadSqrt(wadSqrt(wadSqrt(x)))));
    // 5 levels of truncation
}
```

**Impact:** At concentration power 32, the output of `computeSwapOutput` may deviate from the true mathematical value by more than 0.1%, causing the invariant to be violated after several swaps.

**Recommendation:** Add an invariant validation check after swap output computation. Consider using higher-precision intermediate calculations (e.g., 256-bit multiplication via `mulmod`).

---

#### MEDIUM-OM-01: computeInvariant Loop Not Bounded by Constant

**Severity:** MEDIUM
**Category:** Gas Efficiency
**Lines:** 186-194

The loop in `computeInvariant` iterates over `normalizedReserves.length`. While the pool limits tokens to 8, this function is a library function and does not enforce the bound itself.

**Recommendation:** Add a maximum bound check or document the assumption.

---

### 3.2 OrbitalPool.sol

**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/contracts/orbital/OrbitalPool.sol`

---

#### CRITICAL-OP-01: Swap Executes External Calls Before State Updates (CEI Violation)

**Severity:** CRITICAL
**Category:** Reentrancy
**Lines:** 313-324

```solidity
// Transfer input tokens from caller to pool (EXTERNAL CALL)
_safeTransferFrom(tokens[tokenInIndex], msg.sender, address(this), amountIn);

// Update reserves (STATE UPDATE -- after external call)
reserves[tokenInIndex] += amountInAfterFee;
reserves[tokenOutIndex] -= amountOut;

// Accumulate fees (STATE UPDATE)
accumulatedFees[tokenInIndex] += feeAmount;

// Transfer output tokens to caller (EXTERNAL CALL)
_safeTransfer(tokens[tokenOutIndex], msg.sender, amountOut);
```

The pattern here is: external call -> state update -> external call. While the `nonReentrant` modifier prevents re-entry into this specific function, the intermediate state between the first `_safeTransferFrom` and the reserve update is inconsistent.

More critically, the output transfer at line 324 happens after state updates, which is correct for that direction. However, if the input token's `transferFrom` triggers a callback (ERC-777 `tokensReceived` hook), the reserves have not yet been updated, enabling read-based exploits on view functions during the callback.

**Impact:** Contracts or off-chain systems that read `reserves` during a transfer callback will see stale (pre-swap) values. While direct fund theft is prevented by the reentrancy guard, oracle-dependent contracts could be misled.

**Recommendation:** Reorder to CEI:

```solidity
// 1. Checks (already done above)
// 2. Effects
reserves[tokenInIndex] += amountInAfterFee;
reserves[tokenOutIndex] -= amountOut;
accumulatedFees[tokenInIndex] += feeAmount;

// 3. Interactions
_safeTransferFrom(tokens[tokenInIndex], msg.sender, address(this), amountIn);
_safeTransfer(tokens[tokenOutIndex], msg.sender, amountOut);
```

---

#### HIGH-OP-01: Fee Model Does Not Benefit LPs

**Severity:** HIGH
**Category:** Fee Model
**Lines:** 286-287, 317-321

Swap fees are accumulated in `accumulatedFees[tokenInIndex]` (line 321) but these fees are separate from the reserves. The fees are paid entirely to the `feeCollector` (line 586) and LPs receive zero trading fees.

```solidity
// Fees go to accumulatedFees, not to reserves
reserves[tokenInIndex] += amountInAfterFee;  // fees excluded from reserves
accumulatedFees[tokenInIndex] += feeAmount;   // fees collected separately
```

In contrast, Uniswap V2 (and the LiquidityPoolAMM in this codebase) add the full input amount to reserves, effectively distributing fees to LPs proportionally.

**Impact:** LPs bear impermanent loss risk but receive no fee compensation. This creates no economic incentive for providing liquidity to Orbital pools.

**Recommendation:** Either:
1. Add fees to reserves (so LPs benefit from trading activity), or
2. Split fees between a protocol fee and LP rewards, or
3. Document clearly that this is a protocol-fee-only model and ensure the fee rate reflects this.

---

#### HIGH-OP-02: addLiquidity Emits Incorrect Amounts

**Severity:** HIGH
**Category:** Code Quality / Off-chain Indexing
**Lines:** 399-404

For subsequent deposits (not first deposit), the function transfers proportional amounts (line 389: `actual = (reserves[i] * minRatio) / WAD`) but emits the user-specified `amounts` array (line 403), not the actual deposited amounts.

```solidity
// The actual transferred amounts may differ from the user-supplied 'amounts'
uint256[] memory depositedAmounts = new uint256[](n);
for (uint256 i = 0; i < n; ++i) {
    depositedAmounts[i] = amounts[i];  // BUG: should be 'actual' amounts
}
emit LiquidityAdded(msg.sender, depositedAmounts, liquidity);
```

**Impact:** Off-chain indexers and frontends that rely on the event data will display incorrect deposit amounts.

**Recommendation:** Track actual deposited amounts and emit those:

```solidity
uint256[] memory actualAmounts = new uint256[](n);
for (uint256 i = 0; i < n; ++i) {
    uint256 actual = (reserves[i] * minRatio) / WAD;
    if (actual == 0) revert ZeroAmount();
    _safeTransferFrom(tokens[i], msg.sender, address(this), actual);
    reserves[i] += actual;
    actualAmounts[i] = actual;
}
emit LiquidityAdded(msg.sender, actualAmounts, liquidity);
```

---

#### HIGH-OP-03: No Invariant Check Post-Swap

**Severity:** HIGH
**Category:** Correctness
**Lines:** 273-327

After computing swap output and updating reserves, there is no validation that the new invariant K' >= K. Given the precision loss in `OrbitalMath`, the invariant could decrease over many swaps.

**Recommendation:** Add a post-swap invariant check:

```solidity
// After updating reserves
(uint256[] memory newNormalized,) = OrbitalMath.normalizeReserves(reserves, n);
uint256 newK = OrbitalMath.computeInvariant(newNormalized, concentration);
// Allow for small rounding errors (e.g., 0.01% tolerance)
if (newK < K * 9999 / 10000) revert InvariantViolated();
```

---

#### MEDIUM-OP-01: Redundant Storage Reads in swap()

**Severity:** MEDIUM
**Category:** Gas Efficiency
**Lines:** 280-327

`numTokens` is read from storage on line 290, and `reserves` is read as a storage array in `normalizeReserves`. These are each SLOADs. The function should cache `numTokens` and copy `reserves` into memory once.

```solidity
uint256 n = numTokens;  // 1 SLOAD
// ... normalizeReserves reads reserves[] which does n SLOADs
// ... then reserves[tokenInIndex] and reserves[tokenOutIndex] are SLOADed again
```

**Recommendation:** Read `reserves` into a memory array once and work with it throughout:

```solidity
uint256 n = numTokens;
uint256[] memory _reserves = new uint256[](n);
for (uint256 i = 0; i < n; ++i) {
    _reserves[i] = reserves[i];
}
// Use _reserves for computation, then write back only changed indices
```

**Gas saved:** ~400-800 gas per swap depending on pool size.

---

#### MEDIUM-OP-02: getTokenIndex Linear Search

**Severity:** MEDIUM
**Category:** Gas Efficiency
**Lines:** 466-471

`getTokenIndex` performs a linear scan of the `tokens` array. The OrbitalRouter calls this multiple times per swap.

```solidity
function getTokenIndex(address token) external view returns (uint256) {
    for (uint256 i = 0; i < numTokens; ++i) {
        if (tokens[i] == token) return i;
    }
    return numTokens; // Not found sentinel
}
```

**Recommendation:** Add a `mapping(address => uint256)` for O(1) index lookup:

```solidity
mapping(address => uint256) private tokenIndex;
// Set during initialize()
```

---

#### MEDIUM-OP-03: collectFees Error Message Reuses NotFactory

**Severity:** MEDIUM
**Category:** Code Quality
**Line:** 576

```solidity
if (msg.sender != feeCollector) revert NotFactory();  // Should be a dedicated error
```

The error name is misleading since this check is about the `feeCollector`, not the factory.

**Recommendation:** Add a dedicated `NotFeeCollector()` error.

---

#### MEDIUM-OP-04: No Maximum Token-Amount Guard for Numerical Safety

**Severity:** MEDIUM
**Category:** Overflow
**Lines:** 273-327

The normalization step `(n * amountInAfterFee * WAD) / D` (line 295) can overflow if `n * amountInAfterFee * WAD` exceeds `uint256.max`. For 8 tokens and WAD = 1e18, this overflows when `amountInAfterFee > ~1.44e58`. While extreme, this should be explicitly guarded.

---

#### LOW-OP-01: initialize Token Duplicate Check is O(n^2)

**Severity:** LOW
**Category:** Gas Efficiency
**Lines:** 235-240

The nested loop for duplicate checking is O(n^2). For max 8 tokens this is 28 comparisons -- acceptable but could use a sorted-check approach for cleanliness.

---

#### LOW-OP-02: LP Token Does Not Implement ERC-20 decimals() Function

**Severity:** LOW
**Category:** Code Quality

While `lpDecimals` is declared as a public constant, the standard ERC-20 `decimals()` function signature expects a function, not a variable. Some integrations may fail if they call `decimals()` and the ABI does not match.

Note: Solidity does generate a getter for public constants, so this works for most cases. However, the variable name is `lpDecimals`, not `decimals`, so `decimals()` would not be found by standard ERC-20 interfaces.

**Recommendation:** Rename `lpDecimals` to `decimals` or add:

```solidity
function decimals() external pure returns (uint8) {
    return 18;
}
```

---

#### LOW-OP-03: No TWAP Oracle

**Severity:** LOW
**Category:** MEV Resistance

Neither AMM provides a time-weighted average price (TWAP) oracle. While not required for functionality, TWAP oracles are standard for on-chain price feeds and MEV-resistant pricing.

---

### 3.3 OrbitalFactory.sol

**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/contracts/orbital/OrbitalFactory.sol`

---

#### MEDIUM-OF-01: createPool Is Permissionless with No Rate Limiting

**Severity:** MEDIUM
**Category:** Security
**Lines:** 110-148

Anyone can deploy new pools without limit. Each pool deploys a full contract, and there is no fee or access control.

**Impact:** An attacker could spam pool creation to bloat the `_allPools` array, making `getAllPools()` increasingly expensive and potentially causing DoS for frontends that iterate over all pools.

**Recommendation:** Consider a pool creation fee or admin-gated pool creation.

---

#### MEDIUM-OF-02: abi.encodePacked with Dynamic Array in Pool Key

**Severity:** MEDIUM
**Category:** Security
**Line:** 225

```solidity
return keccak256(abi.encodePacked(sorted, _concentration));
```

Using `abi.encodePacked` with a dynamic `address[]` array can cause hash collisions in theory (if addresses happen to align such that concatenated bytes from one set match another). This is extremely unlikely with addresses but is a known anti-pattern.

**Recommendation:** Use `abi.encode` instead:

```solidity
return keccak256(abi.encode(sorted, _concentration));
```

---

### 3.4 OrbitalRouter.sol

**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/contracts/orbital/OrbitalRouter.sol`

---

#### HIGH-OR-01: Router Lacks Reentrancy Guard

**Severity:** HIGH
**Category:** Reentrancy
**Lines:** 98-136, 149-195

The OrbitalRouter has no `nonReentrant` modifier on any function. While it delegates to pools that have guards, the router itself holds tokens temporarily during multi-hop swaps (line 162: transfer in, then iterate through pools). A malicious token with a callback in `transferFrom` could re-enter the router.

```solidity
// Line 162: Transfer initial tokens from user
_safeTransferFrom(tokenPath[0], msg.sender, address(this), amountIn);

// No reentrancy guard on this function
```

**Impact:** During multi-hop swaps, intermediate token balances sit in the router. A reentrant token could exploit this state to drain tokens.

**Recommendation:** Add a reentrancy guard to all swap and liquidity functions in the router.

---

#### MEDIUM-OR-01: Infinite Token Approval from Router to Pools

**Severity:** MEDIUM
**Category:** Security
**Lines:** 325-339

```solidity
function _ensureApproval(address token, address spender, uint256 amount) private {
    uint256 current = IERC20Router(token).allowance(address(this), spender);
    if (current < amount) {
        // ...
        (bool success,) = token.call(
            abi.encodeWithSelector(0x095ea7b3, spender, type(uint256).max)
        );
    }
}
```

The router grants `type(uint256).max` approval to pools. If a pool contract is compromised or has a vulnerability, it could drain all tokens held by the router.

**Impact:** Any tokens accidentally left in the router (from failed transactions or rounding) could be drained through a compromised pool.

**Recommendation:** Approve only the exact needed amount rather than `type(uint256).max`, or ensure the router holds zero balance after every transaction.

---

#### MEDIUM-OR-02: swapMultiHop Passes 0 for Intermediate minAmountOut

**Severity:** MEDIUM
**Category:** Slippage Protection
**Line:** 184

```solidity
// Execute hop
currentAmount = orbPool.swap(
    tokenInIndex,
    tokenOutIndex,
    currentAmount,
    0, // No intermediate slippage check  <-- ISSUE
    deadline
);
```

Each intermediate hop has no minimum output check. Only the final output is checked against `minAmountOut`. While this is a common pattern (Uniswap V3 does the same), it means intermediate pools can be sandwiched within the multi-hop route.

**Impact:** A MEV bot can sandwich one of the intermediate hops, extracting value while the final output still meets the user's minimum.

**Recommendation:** Consider computing and applying intermediate minimums based on the expected route, or document this as a known limitation.

---

## 4. Frontend Components -- Findings

### 4.1 TradeForm.tsx (AMM Swap Mode)

**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/components/Exchange/TradeForm.tsx`

---

#### CRITICAL-FE-01: Zero minAmountOut Passed for Add/Remove Liquidity

**Severity:** CRITICAL
**Category:** Slippage Protection
**Lines:** 273-277 (addLiquidity), 300-304 (removeLiquidity)

```typescript
// addLiquidity passes 0n for minLiquidity
tx = await contractService.addLiquidity(tokenA, tokenB, parsedAmountA, parsedAmountB, 0n);

// removeLiquidity passes 0n for both minimums
tx = await contractService.removeLiquidity(tokenA, tokenB, parsedRemoveAmount, 0n, 0n);
```

Both `addLiquidity` and `removeLiquidity` in the LiquidityPanel pass `0n` for all minimum amounts. This means the user has zero slippage protection and is fully vulnerable to sandwich attacks.

**Impact:** A MEV bot can front-run the liquidity operation, move the price, and the user's transaction will still succeed but with significantly less favorable amounts.

**Recommendation:** Calculate expected LP tokens (or expected token amounts for removal) and apply the user's slippage tolerance before passing to the contract:

```typescript
// For addLiquidity:
const expectedLp = (parsedAmountA * pool.totalLiquidity) / pool.reserve0;
const minLiquidity = expectedLp - (expectedLp * BigInt(slippageBps)) / 10000n;

// For removeLiquidity:
const expectedA = (parsedRemoveAmount * pool.reserve0) / pool.totalLiquidity;
const minA = expectedA - (expectedA * BigInt(slippageBps)) / 10000n;
```

---

#### CRITICAL-FE-02: No Deadline Passed for LiquidityPoolAMM Operations

**Severity:** CRITICAL
**Category:** MEV Resistance
**Lines:** 273-277

The LiquidityPoolAMM contract functions do not accept a deadline (this is CRITICAL-LP-01), and the frontend naturally does not pass one. If/when the contract is fixed to accept deadlines, the frontend must be updated simultaneously.

---

#### HIGH-FE-01: AMM Allowance Check Uses Wrong Spender Address

**Severity:** HIGH
**Category:** Approval Flow
**Lines:** 481-507

In `handleAMMSwap`, the approval check for non-ETH sell tokens fetches the AMM contract address from the network config:

```typescript
const ammAddress = config?.ammAddress;
// ...
const currentAllowance = await contractService.getAssetAllowance(sellToken, userAddr, ammAddress);
if (currentAllowance < parsedSellAmount) {
    const approveTx = await contractService.approveAMM(sellToken, parsedSellAmount);
```

If `ammAddress` is undefined (e.g., network config not loaded), the allowance check is silently skipped and the swap proceeds without approval, causing the on-chain transaction to revert.

**Recommendation:** Add explicit null checks and early return:

```typescript
if (!ammAddress) {
    toast.error('AMM contract address not configured for this network');
    setTxStatus('idle');
    return;
}
```

---

#### MEDIUM-FE-01: Price Impact Not Shown for LiquidityPoolAMM Swaps

**Severity:** MEDIUM
**Category:** Price Impact Calculation
**Lines:** 1100-1167

The AMM swap mode shows a rate and minimum received, but does not calculate or display price impact. Users have no visual warning about large trades that move the price significantly.

```typescript
// Only shows rate and min received, no price impact percentage
<div className="flex items-center justify-between py-2.5 first:pt-0">
    <span>Rate</span>
    <span>1 {sellAsset.symbol} = {formatPrice(...)} {buyAsset.symbol}</span>
</div>
```

**Recommendation:** Calculate price impact by comparing the execution rate to the current pool ratio:

```typescript
const spotRate = Number(pool.reserve1) / Number(pool.reserve0);
const executionRate = Number(ammQuote) / Number(parsedSellAmount);
const priceImpact = Math.abs((spotRate - executionRate) / spotRate) * 100;
```

---

#### MEDIUM-FE-02: Slippage Calculation Precision Issue

**Severity:** MEDIUM
**Category:** Slippage Protection
**Line:** 514

```typescript
const minOut = ammQuote - (ammQuote * BigInt(Math.round(slippage * 10)) / 1000n);
```

The slippage calculation uses `Math.round(slippage * 10) / 1000n`. For a slippage of 0.5%, this computes `Math.round(5) = 5`, then `ammQuote * 5n / 1000n` = 0.5%, which is correct. However, for fractional slippage values like 0.3%, `Math.round(3) = 3`, giving `3/1000 = 0.3%`, which is also correct.

The real issue is that `BigInt(Math.round(slippage * 10))` could be 0 for very small slippage values (< 0.05%), making minOut equal to ammQuote (i.e., zero tolerance).

**Recommendation:** Use basis points consistently:

```typescript
const slippageBps = BigInt(Math.round(slippage * 100)); // Convert % to bps
const minOut = ammQuote - (ammQuote * slippageBps) / 10000n;
```

---

#### MEDIUM-FE-03: Quote Staleness During Swap Execution

**Severity:** MEDIUM
**Category:** Quote Accuracy
**Lines:** 442-473

The AMM quote is fetched with a 300ms debounce when the sell amount changes, but there is no staleness check or refresh before swap execution. The quote could be minutes old if the user pauses between entering an amount and clicking swap.

```typescript
const timer = setTimeout(() => void fetchQuote(), 300);
```

**Recommendation:** Re-fetch the quote immediately before executing the swap, or add a staleness timer that warns users if the quote is older than 30 seconds.

---

#### LOW-FE-01: PoolInfo Rate Calculation Uses JavaScript Floating Point

**Severity:** LOW
**Category:** Price Impact Calculation
**Lines:** 136-146 (PoolInfo.tsx)

```typescript
const rate0to1 =
    pool && pool.reserve0 > 0n
        ? Number(ethers.formatUnits(pool.reserve1, 18)) /
          Number(ethers.formatUnits(pool.reserve0, 18))
        : null;
```

Converting BigInt reserves to `Number` (IEEE 754 double) introduces floating-point precision errors for very large or very precise token amounts (beyond 2^53).

**Impact:** Displayed rates could be slightly inaccurate for pools with very large reserves.

---

#### LOW-FE-02: Auto-Refresh in PoolInfo Does Not Actually Trigger Re-fetch

**Severity:** LOW
**Category:** Code Quality
**Lines:** 117-132 (PoolInfo.tsx)

```typescript
intervalRef.current = setInterval(() => {
    setLoading((prev) => {
        return prev;  // This is a no-op -- setting state to same value won't trigger re-render
    });
}, 15000);
```

The auto-refresh mechanism is broken. Setting state to its current value does not trigger a re-render in React.

**Recommendation:** Use a counter state to force re-fetch:

```typescript
const [autoRefreshKey, setAutoRefreshKey] = useState(0);

useEffect(() => {
    const interval = setInterval(() => {
        setAutoRefreshKey(k => k + 1);
    }, 15000);
    return () => clearInterval(interval);
}, [contractService, tokenA, tokenB]);
```

---

### 4.2 OrbitalAMM/SwapInterface.tsx

**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/components/OrbitalAMM/SwapInterface.tsx`

This component is well-implemented with several strong patterns:
- Proper deadline calculation (20 minutes)
- Slippage tolerance with configurable basis points
- Price impact calculation using spot price comparison
- Quote debouncing (300ms)
- Proper approval flow through the router

One notable issue:

#### MEDIUM-FE-04: Deadline Too Long (20 Minutes)

**Severity:** MEDIUM
**Category:** MEV Resistance
**Line:** 400

```typescript
const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 minutes
```

A 20-minute deadline is generous and gives MEV bots a wide window to sandwich the transaction.

**Recommendation:** Default to 5 minutes (300 seconds), with a user-configurable option.

---

### 4.3 OrbitalAMM/LiquidityPanel.tsx

**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/components/OrbitalAMM/LiquidityPanel.tsx`

This component properly calculates `minLiquidity` and `minAmounts` using the user's slippage tolerance (lines 346-363 and 439-444). This is correctly implemented, unlike the LiquidityPoolAMM's LiquidityPanel which passes 0n.

---

### 4.4 OrbitalAMM/CreatePoolForm.tsx

**File:** `/Users/apple/Documents/GitHub/fueki-tokenization-platform/src/components/OrbitalAMM/CreatePoolForm.tsx`

No critical issues. The form properly validates token count, duplicates, balances, and handles the two-step flow (create pool, then add initial liquidity). The approval flow correctly targets the router address.

---

## 5. Cross-Cutting Concerns

### 5.1 Impermanent Loss

**LiquidityPoolAMM:** No impermanent loss mitigation. This is standard for constant-product AMMs and is an accepted trade-off.

**OrbitalPool:** The superellipse invariant with higher concentration powers inherently increases impermanent loss exposure. When `p > 2`, the curve is flatter near equilibrium, meaning price movements cause proportionally larger reserve imbalances. Additionally, since fees go to the protocol (not LPs), there is no fee income to offset impermanent loss.

**Recommendation:** At minimum, display estimated impermanent loss on the frontend for both AMMs based on current reserve ratios vs. deposit ratios.

### 5.2 Flash Loan Considerations

Neither AMM implements flash loan functionality or flash loan protection. An attacker could:

1. Flash-borrow a large amount of one token
2. Swap through the AMM to manipulate the price
3. Execute an action dependent on the manipulated price
4. Swap back and repay the flash loan

The LiquidityPoolAMM's `kLast` provides no protection since it is an unreliable snapshot.

### 5.3 ERC-777 Token Compatibility

Both AMMs use `transferFrom` without checking for ERC-777 hooks. The reentrancy guards protect against direct re-entry, but ERC-777 `tokensToSend` and `tokensReceived` hooks could enable cross-contract exploits.

### 5.4 Consistent Token Decimal Handling

Both AMMs assume 18-decimal tokens throughout. The OrbitalPool has a `decimals()` call in its IERC20 interface but never uses it. If tokens with non-18 decimals are used, reserve normalization will be incorrect.

**Recommendation:** Either enforce 18-decimal tokens only, or normalize reserves by token decimals in both AMMs.

---

## 6. Optimization Recommendations

### 6.1 Gas Optimizations (Solidity)

| ID | Contract | Optimization | Est. Gas Saved |
|----|----------|-------------|----------------|
| GAS-01 | LiquidityPoolAMM | Cache `pool.token0` comparison result | ~100/swap |
| GAS-02 | LiquidityPoolAMM | Cache new reserves before writing kLast | ~200/swap |
| GAS-03 | LiquidityPoolAMM | Use transient storage for reentrancy guard (EIP-1153) | ~4900/call |
| GAS-04 | LiquidityPoolAMM | Optimize sqrt with better initial guess | ~50-200/call |
| GAS-05 | OrbitalPool | Cache reserves array in memory for swap | ~400-800/swap |
| GAS-06 | OrbitalPool | Add token index mapping for O(1) lookup | ~200-1600/swap |
| GAS-07 | OrbitalPool | Mark `getReserves`, `getTokens`, `getAccumulatedFees` as view (already marked) | 0 |
| GAS-08 | OrbitalPool | Use unchecked arithmetic for fee calculation (checked inputs) | ~80/swap |
| GAS-09 | OrbitalFactory | Use CREATE2 for deterministic pool addresses | Enables address precomputation |
| GAS-10 | OrbitalRouter | Batch approvals for multi-hop to avoid redundant approval checks | ~200/hop |

### 6.2 Architecture Optimizations

1. **Unified Router:** Both AMMs could share a single router contract that routes swaps to the optimal pool automatically.

2. **Oracle Integration:** Add cumulative price tracking (a la Uniswap V2 TWAP) to both AMMs for MEV-resistant on-chain price feeds.

3. **LP Fee Revenue Sharing for Orbital:** Split fees between protocol and LPs (e.g., 80% to LPs, 20% to protocol).

4. **Batch View Functions:** Add a single view function that returns all pool state (reserves, balances, allowances) in one RPC call to reduce frontend round-trips.

---

## 7. Prioritized Action Items

### Immediate (Pre-Deployment Blockers)

- [ ] **CRITICAL-LP-01:** Add deadline parameters to all LiquidityPoolAMM functions
- [ ] **CRITICAL-LP-02:** Add fee-on-transfer token protection (balance-before/after pattern)
- [ ] **CRITICAL-OM-01:** Fix wadSqrt overflow for large values
- [ ] **CRITICAL-OP-01:** Reorder swap to follow CEI pattern
- [ ] **CRITICAL-FE-01:** Pass actual slippage-protected minimums (not 0n) for liquidity operations
- [ ] **CRITICAL-FE-02:** Add deadline parameters to frontend when contracts are updated

### High Priority (Before Mainnet)

- [ ] **HIGH-LP-01:** Use pull pattern consistently for all ETH distributions
- [ ] **HIGH-LP-02:** Add minimum reserve thresholds to prevent pool drainage
- [ ] **HIGH-LP-03:** Validate K invariant after swaps
- [ ] **HIGH-OM-01:** Validate precision of chained wadRoot operations; add tolerance checks
- [ ] **HIGH-OP-01:** Redesign fee model to include LP revenue sharing
- [ ] **HIGH-OP-02:** Fix emitted amounts in addLiquidity event
- [ ] **HIGH-OP-03:** Add post-swap invariant validation
- [ ] **HIGH-OR-01:** Add reentrancy guard to OrbitalRouter
- [ ] **HIGH-FE-01:** Add null-check for ammAddress in handleAMMSwap

### Medium Priority (Recommended)

- [ ] **MEDIUM-LP-02:** Optimize storage reads in _executeSwap
- [ ] **MEDIUM-LP-03:** Document or guard against overflow in getAmountOut
- [ ] **MEDIUM-LP-04:** Refund excess tokens or add frontend warning for disproportionate deposits
- [ ] **MEDIUM-OP-01:** Cache reserves in memory during swap computation
- [ ] **MEDIUM-OP-02:** Add token index mapping for O(1) lookup
- [ ] **MEDIUM-OP-03:** Fix collectFees error to use dedicated error type
- [ ] **MEDIUM-OP-04:** Add maximum amount guard for numerical safety
- [ ] **MEDIUM-OF-01:** Add pool creation fee or rate limiting
- [ ] **MEDIUM-OF-02:** Use abi.encode instead of abi.encodePacked for pool keys
- [ ] **MEDIUM-OR-01:** Approve exact amounts instead of type(uint256).max
- [ ] **MEDIUM-OR-02:** Document intermediate hop slippage limitation
- [ ] **MEDIUM-FE-01:** Add price impact display for LiquidityPoolAMM swaps
- [ ] **MEDIUM-FE-02:** Use basis points consistently for slippage calculation
- [ ] **MEDIUM-FE-03:** Re-fetch quote before swap execution or add staleness timer
- [ ] **MEDIUM-FE-04:** Reduce default deadline to 5 minutes

### Low Priority (Good Practices)

- [ ] **LOW-LP-01:** Evaluate transient storage for reentrancy guard
- [ ] **LOW-LP-02:** Add events for invariant changes
- [ ] **LOW-LP-03:** Optimize sqrt implementation
- [ ] **LOW-OP-01:** Consider sorted-check approach for token duplicates
- [ ] **LOW-OP-02:** Rename lpDecimals to decimals or add decimals() function
- [ ] **LOW-OP-03:** Add TWAP oracle
- [ ] **LOW-FE-01:** Use BigInt arithmetic for rate calculations where precision matters
- [ ] **LOW-FE-02:** Fix broken auto-refresh in PoolInfo component

---

*End of Audit Report*
