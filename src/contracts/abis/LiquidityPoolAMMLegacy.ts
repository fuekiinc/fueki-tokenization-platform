/**
 * Legacy LiquidityPoolAMM ABI fragments used on older deployments
 * (for example Ethereum mainnet) that predate deadline/min-amount
 * parameters in swap/liquidity methods.
 *
 * Keep this minimal: only legacy write functions used by the app.
 */
export const LiquidityPoolAMMLegacyABI = [
  'function addLiquidity(address tokenA, address tokenB, uint256 amountA, uint256 amountB, uint256 minLiquidity) returns (uint256 liquidity)',
  'function addLiquidityETH(address token, uint256 amountToken, uint256 minLiquidity) payable returns (uint256 liquidity)',
  'function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 minA, uint256 minB) returns (uint256 amountA, uint256 amountB)',
  'function removeLiquidityETH(address token, uint256 liquidity, uint256 minToken, uint256 minETH) returns (uint256 amountToken, uint256 amountETH)',
  'function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut) returns (uint256 amountOut)',
  'function swapETHForToken(address token, uint256 minAmountOut) payable returns (uint256 amountOut)',
  'function swapTokenForETH(address token, uint256 amountIn, uint256 minETH) returns (uint256 amountOut)',
] as const;
