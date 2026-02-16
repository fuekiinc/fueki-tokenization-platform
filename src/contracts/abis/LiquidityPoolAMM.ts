/**
 * Human-readable ABI for the LiquidityPoolAMM contract.
 *
 * Replaces the original LiquidityPoolAMM.json with a compact
 * ethers.js v6 human-readable ABI fragment array.
 */
export const LiquidityPoolAMMABI = [
  // Constructor
  'constructor()',

  // Errors
  'error InsufficientAAmount()',
  'error InsufficientBAmount()',
  'error InsufficientEth()',
  'error InsufficientLiquidity()',
  'error InsufficientOutput()',
  'error InvalidK()',
  'error NothingToWithdraw()',
  'error PoolExists()',
  'error PoolNotFound()',
  'error ReentrantCall()',
  'error SameToken()',
  'error TransferFailed()',
  'error ZeroAddress()',
  'error ZeroAmount()',

  // Events
  'event EthWithdrawn(address indexed to, uint256 amount)',
  'event LiquidityAdded(bytes32 indexed poolId, address indexed provider, uint256 amount0, uint256 amount1, uint256 liquidity)',
  'event LiquidityRemoved(bytes32 indexed poolId, address indexed provider, uint256 amount0, uint256 amount1, uint256 liquidity)',
  'event PoolCreated(bytes32 indexed poolId, address indexed token0, address indexed token1)',
  'event Swap(bytes32 indexed poolId, address indexed sender, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)',

  // View functions
  'function ETH_ADDRESS() view returns (address)',
  'function FEE_DENOMINATOR() view returns (uint256)',
  'function FEE_NUMERATOR() view returns (uint256)',
  'function MINIMUM_LIQUIDITY() view returns (uint256)',
  'function ethBalances(address) view returns (uint256)',
  'function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) pure returns (uint256 amountOut)',
  'function getLiquidityBalance(address tokenA, address tokenB, address provider) view returns (uint256)',
  'function getPool(address tokenA, address tokenB) view returns (tuple(address token0, address token1, uint256 reserve0, uint256 reserve1, uint256 totalLiquidity, uint256 kLast))',
  'function getPoolId(address tokenA, address tokenB) pure returns (bytes32)',
  'function liquidityBalances(bytes32, address) view returns (uint256)',
  'function pools(bytes32) view returns (address token0, address token1, uint256 reserve0, uint256 reserve1, uint256 totalLiquidity, uint256 kLast)',
  'function quote(address tokenIn, address tokenOut, uint256 amountIn) view returns (uint256 amountOut)',

  // Write functions
  'function addLiquidity(address tokenA, address tokenB, uint256 amountA, uint256 amountB, uint256 minLiquidity) returns (uint256 liquidity)',
  'function addLiquidityETH(address token, uint256 amountToken, uint256 minLiquidity) payable returns (uint256 liquidity)',
  'function createPool(address tokenA, address tokenB) returns (bytes32 poolId)',
  'function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 minA, uint256 minB) returns (uint256 amountA, uint256 amountB)',
  'function removeLiquidityETH(address token, uint256 liquidity, uint256 minToken, uint256 minETH) returns (uint256 amountToken, uint256 amountETH)',
  'function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut) returns (uint256 amountOut)',
  'function swapETHForToken(address token, uint256 minAmountOut) payable returns (uint256 amountOut)',
  'function swapTokenForETH(address token, uint256 amountIn, uint256 minETH) returns (uint256 amountOut)',
  'function withdrawEth()',

  // Receive
  'receive() payable',
] as const;
