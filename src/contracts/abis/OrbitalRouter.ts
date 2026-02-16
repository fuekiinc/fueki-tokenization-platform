/**
 * Human-readable ABI for the OrbitalRouter contract.
 *
 * Replaces the original OrbitalRouter.json with a compact
 * ethers.js v6 human-readable ABI fragment array.
 */
export const OrbitalRouterABI = [
  // Constructor
  'constructor(address _factory)',

  // Errors
  'error DeadlineExpired()',
  'error InsufficientAllowance()',
  'error InvalidPath()',
  'error PoolNotFound()',
  'error SlippageExceeded()',
  'error TokenNotInPool()',
  'error TransferFailed()',
  'error ZeroAmount()',

  // Events
  'event LiquidityAdded(address indexed sender, address indexed pool, uint256 lpMinted)',
  'event LiquidityRemoved(address indexed sender, address indexed pool, uint256 lpBurned)',
  'event SwapExecuted(address indexed sender, address indexed pool, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)',

  // View functions
  'function getAmountOut(address pool, address tokenIn, address tokenOut, uint256 amountIn) view returns (uint256 amountOut, uint256 feeAmount)',
  'function getAmountOutMultiHop(address[] pools, address[] tokenPath, uint256 amountIn) view returns (uint256 amountOut)',
  'function orbitalFactory() view returns (address)',

  // Write functions
  'function addLiquidity(address pool, uint256[] amounts, uint256 minLiquidity, uint256 deadline) returns (uint256 liquidity)',
  'function removeLiquidity(address pool, uint256 liquidity, uint256[] minAmounts, uint256 deadline) returns (uint256[] amounts)',
  'function swap(address pool, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint256 deadline) returns (uint256 amountOut)',
  'function swapMultiHop(address[] pools, address[] tokenPath, uint256 amountIn, uint256 minAmountOut, uint256 deadline) returns (uint256 amountOut)',
] as const;
