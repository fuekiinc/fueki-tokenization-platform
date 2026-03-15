# ADR-001: SafeERC20 via Inline Low-Level Call

## Status
Implemented

## Context
Some ERC-20 tokens (notably USDT) don't return a boolean from `transfer()` and `transferFrom()`. Using the standard interface causes silent failures on these tokens.

## Decision
Use inline SafeERC20 pattern with low-level `call` and `abi.encodeWithSelector` instead of importing OpenZeppelin's SafeERC20 library. This keeps contracts self-contained.

```solidity
function _safeTransfer(IERC20 token, address to, uint256 amount) internal {
    (bool success, bytes memory data) = address(token).call(
        abi.encodeWithSelector(token.transfer.selector, to, amount)
    );
    require(success && (data.length == 0 || abi.decode(data, (bool))), "Transfer failed");
}
```

## Consequences
- All 6 transfer sites in AssetBackedExchange.sol use this pattern
- LiquidityPoolAMM.sol emergency withdrawal uses this pattern
- Must be applied to any new contract that handles ERC-20 transfers
- Slightly more gas than direct calls, but required for USDT compatibility
