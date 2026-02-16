/**
 * Human-readable ABI for the OrbitalPool multi-token weighted AMM contract.
 *
 * Replaces the original OrbitalPool.json with a compact
 * ethers.js v6 human-readable ABI fragment array.
 */
export const OrbitalPoolABI = [
  // Constructor
  'constructor()',

  // Errors
  'error AlreadyInitialized()',
  'error DeadlineExpired()',
  'error DuplicateToken()',
  'error InsufficientAllowance()',
  'error InsufficientBalance()',
  'error InsufficientLiquidity()',
  'error InvalidConcentration()',
  'error InvalidFee()',
  'error InvalidPower()',
  'error InvalidTokenCount()',
  'error InvalidTokenIndex()',
  'error InvariantViolated()',
  'error InvariantViolation()',
  'error NotFactory()',
  'error NotInitialized()',
  'error ReentrantCall()',
  'error SameToken()',
  'error SlippageExceeded()',
  'error TransferFailed()',
  'error ZeroAddress()',
  'error ZeroAmount()',
  'error ZeroInput()',

  // Events
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
  'event FeesCollected(address indexed collector, uint256[] amounts)',
  'event LiquidityAdded(address indexed provider, uint256[] amounts, uint256 lpMinted)',
  'event LiquidityRemoved(address indexed provider, uint256[] amounts, uint256 lpBurned)',
  'event Swap(address indexed sender, uint256 tokenInIndex, uint256 tokenOutIndex, uint256 amountIn, uint256 amountOut, uint256 feeAmount)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',

  // View functions
  'function FEE_DENOMINATOR() view returns (uint256)',
  'function MAX_FEE_BPS() view returns (uint256)',
  'function MAX_TOKENS() view returns (uint256)',
  'function MINIMUM_LIQUIDITY() view returns (uint256)',
  'function MIN_TOKENS() view returns (uint256)',
  'function WAD() view returns (uint256)',
  'function accumulatedFees(uint256) view returns (uint256)',
  'function allowance(address, address) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function concentration() view returns (uint8)',
  'function factory() view returns (address)',
  'function feeCollector() view returns (address)',
  'function getAccumulatedFees() view returns (uint256[])',
  'function getAmountOut(uint256 tokenInIndex, uint256 tokenOutIndex, uint256 amountIn) view returns (uint256 amountOut, uint256 feeAmount)',
  'function getInvariant() view returns (uint256 K)',
  'function getReserves() view returns (uint256[])',
  'function getSpotPrice(uint256 tokenAIndex, uint256 tokenBIndex) view returns (uint256 price)',
  'function getTokenIndex(address token) view returns (uint256)',
  'function getTokens() view returns (address[])',
  'function initialized() view returns (bool)',
  'function lpDecimals() view returns (uint8)',
  'function name() view returns (string)',
  'function numTokens() view returns (uint256)',
  'function reserves(uint256) view returns (uint256)',
  'function swapFeeBps() view returns (uint256)',
  'function symbol() view returns (string)',
  'function tokens(uint256) view returns (address)',
  'function totalSupply() view returns (uint256)',

  // Write functions
  'function addLiquidity(uint256[] amounts, uint256 minLiquidity, uint256 deadline) returns (uint256 liquidity)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function collectFees()',
  'function initialize(address[] _tokens, uint8 _concentration, uint256 _swapFeeBps, address _feeCollector, string _name, string _symbol)',
  'function removeLiquidity(uint256 liquidity, uint256[] minAmounts, uint256 deadline) returns (uint256[] amounts)',
  'function swap(uint256 tokenInIndex, uint256 tokenOutIndex, uint256 amountIn, uint256 minAmountOut, uint256 deadline) returns (uint256 amountOut)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
] as const;
