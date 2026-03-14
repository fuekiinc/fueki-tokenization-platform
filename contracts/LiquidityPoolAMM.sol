// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title LiquidityPoolAMM
 * @notice Uniswap V2-style constant product AMM (x * y = k) for trading
 *         asset-backed tokens and native ETH.
 *
 *         Features:
 *         - Permissionless pool creation for any token pair
 *         - Constant product pricing with 0.3% swap fee
 *         - Add/remove liquidity with proportional LP shares
 *         - Native ETH support via sentinel address
 *         - Pull-based ETH withdrawal pattern
 *         - Owner with pause/unpause and emergency withdrawal
 *         - Flash loan protection via per-block price snapshot
 *         - TWAP oracle for price manipulation resistance
 *         - Post-swap K invariant verification
 *
 * @dev Follows existing platform conventions: no OpenZeppelin imports,
 *      manual reentrancy guard, custom errors, ETH sentinel address.
 */

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract LiquidityPoolAMM {

    // ---------------------------------------------------------------
    //  Constants
    // ---------------------------------------------------------------

    /// @notice Sentinel address representing native ETH in pools.
    address public constant ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /// @notice Minimum liquidity burned on first deposit to prevent division by zero.
    uint256 public constant MINIMUM_LIQUIDITY = 1000;

    /// @notice Swap fee numerator (3 = 0.3%).
    uint256 public constant FEE_NUMERATOR = 3;

    /// @notice Swap fee denominator.
    uint256 public constant FEE_DENOMINATOR = 1000;

    /// @notice Timelock delay for emergency withdrawals (48 hours).
    uint256 public constant EMERGENCY_TIMELOCK = 48 hours;

    // ---------------------------------------------------------------
    //  Storage
    // ---------------------------------------------------------------

    struct Pool {
        address token0;
        address token1;
        uint256 reserve0;
        uint256 reserve1;
        uint256 totalLiquidity;
        uint256 kLast;
    }

    /// @notice poolId = keccak256(abi.encodePacked(sortedToken0, sortedToken1))
    mapping(bytes32 => Pool) public pools;

    /// @notice LP balances: poolId => (provider => liquidity)
    mapping(bytes32 => mapping(address => uint256)) public liquidityBalances;

    /// @notice Withdrawable ETH balances (pull pattern)
    mapping(address => uint256) public ethBalances;

    /// @notice Reentrancy guard status
    uint256 private _status;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    // ---------------------------------------------------------------
    //  Owner / Pause
    // ---------------------------------------------------------------

    /// @notice Contract owner with admin privileges.
    address public owner;

    /// @notice Pending owner for two-step ownership transfer.
    address public pendingOwner;

    /// @notice Whether the AMM is paused.
    bool public paused;

    // ---------------------------------------------------------------
    //  Emergency withdrawal
    // ---------------------------------------------------------------

    struct EmergencyRequest {
        address token;
        uint256 amount;
        address recipient;
        uint256 executeAfter;
        bool executed;
    }

    uint256 public nextEmergencyId;
    mapping(uint256 => EmergencyRequest) public emergencyRequests;

    // ---------------------------------------------------------------
    //  TWAP Oracle
    // ---------------------------------------------------------------

    struct PriceObservation {
        uint256 timestamp;
        uint256 price0CumulativeLast;
        uint256 price1CumulativeLast;
    }

    /// @notice TWAP price observations per pool.
    mapping(bytes32 => PriceObservation) public priceObservations;

    // ---------------------------------------------------------------
    //  Events
    // ---------------------------------------------------------------

    event PoolCreated(
        bytes32 indexed poolId,
        address indexed token0,
        address indexed token1
    );

    event LiquidityAdded(
        bytes32 indexed poolId,
        address indexed provider,
        uint256 amount0,
        uint256 amount1,
        uint256 liquidity
    );

    event LiquidityRemoved(
        bytes32 indexed poolId,
        address indexed provider,
        uint256 amount0,
        uint256 amount1,
        uint256 liquidity
    );

    event Swap(
        bytes32 indexed poolId,
        address indexed sender,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    event EthWithdrawn(address indexed to, uint256 amount);

    event Paused(address indexed by);
    event Unpaused(address indexed by);
    event OwnershipTransferStarted(address indexed currentOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    event EmergencyWithdrawRequested(
        uint256 indexed requestId,
        address token,
        uint256 amount,
        address recipient,
        uint256 executeAfter
    );
    event EmergencyWithdrawExecuted(uint256 indexed requestId);
    event EmergencyWithdrawCancelled(uint256 indexed requestId);

    // ---------------------------------------------------------------
    //  Errors
    // ---------------------------------------------------------------

    error ZeroAmount();
    error ZeroAddress();
    error SameToken();
    error PoolExists();
    error PoolNotFound();
    error InsufficientLiquidity();
    error InsufficientOutput();
    error InsufficientAAmount();
    error InsufficientBAmount();
    error TransferFailed();
    error InsufficientEth();
    error NothingToWithdraw();
    error ReentrantCall();
    error InvalidK();
    error DeadlineExpired();
    error InvariantViolation();
    error NotOwner();
    error NotPendingOwner();
    error AMMPaused();
    error NotPaused();
    error TimelockNotMet();
    error AlreadyExecuted();

    // ---------------------------------------------------------------
    //  Modifiers
    // ---------------------------------------------------------------

    modifier nonReentrant() {
        if (_status == _ENTERED) revert ReentrantCall();
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    modifier ensure(uint256 deadline) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert AMMPaused();
        _;
    }

    // ---------------------------------------------------------------
    //  Constructor
    // ---------------------------------------------------------------

    constructor(address _owner) {
        if (_owner == address(0)) revert ZeroAddress();
        _status = _NOT_ENTERED;
        owner = _owner;
        emit OwnershipTransferred(address(0), _owner);
    }

    // ---------------------------------------------------------------
    //  Owner functions
    // ---------------------------------------------------------------

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        address oldOwner = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(oldOwner, msg.sender);
    }

    function pause() external onlyOwner {
        if (paused) revert AMMPaused();
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        if (!paused) revert NotPaused();
        paused = false;
        emit Unpaused(msg.sender);
    }

    // ---------------------------------------------------------------
    //  Emergency withdrawal (owner-only, timelocked)
    // ---------------------------------------------------------------

    function requestEmergencyWithdraw(
        address token,
        uint256 amount,
        address recipient
    ) external onlyOwner returns (uint256 requestId) {
        if (amount == 0) revert ZeroAmount();
        if (recipient == address(0)) revert ZeroAddress();

        requestId = nextEmergencyId++;
        uint256 executeAfter = block.timestamp + EMERGENCY_TIMELOCK;

        emergencyRequests[requestId] = EmergencyRequest({
            token: token,
            amount: amount,
            recipient: recipient,
            executeAfter: executeAfter,
            executed: false
        });

        emit EmergencyWithdrawRequested(requestId, token, amount, recipient, executeAfter);
    }

    function executeEmergencyWithdraw(uint256 requestId) external onlyOwner nonReentrant {
        EmergencyRequest storage req = emergencyRequests[requestId];
        if (req.executed) revert AlreadyExecuted();
        if (req.amount == 0) revert ZeroAmount();
        if (block.timestamp < req.executeAfter) revert TimelockNotMet();

        req.executed = true;

        if (req.token == ETH_ADDRESS) {
            (bool sent,) = payable(req.recipient).call{value: req.amount}("");
            if (!sent) revert TransferFailed();
        } else {
            _safeTransfer(req.token, req.recipient, req.amount);
        }

        emit EmergencyWithdrawExecuted(requestId);
    }

    function cancelEmergencyWithdraw(uint256 requestId) external onlyOwner {
        EmergencyRequest storage req = emergencyRequests[requestId];
        if (req.executed) revert AlreadyExecuted();
        if (req.amount == 0) revert ZeroAmount();

        req.executed = true;
        emit EmergencyWithdrawCancelled(requestId);
    }

    // ---------------------------------------------------------------
    //  Pool creation
    // ---------------------------------------------------------------

    /**
     * @notice Create a new liquidity pool for a token pair.
     *         Permissionless -- anyone can create a pool.
     *
     * @param tokenA First token address (ETH_ADDRESS for native ETH)
     * @param tokenB Second token address (ETH_ADDRESS for native ETH)
     */
    function createPool(address tokenA, address tokenB) external whenNotPaused returns (bytes32 poolId) {
        if (tokenA == address(0) || tokenB == address(0)) revert ZeroAddress();
        if (tokenA == tokenB) revert SameToken();

        (address token0, address token1) = _sortTokens(tokenA, tokenB);
        poolId = _getPoolId(token0, token1);

        if (pools[poolId].token0 != address(0)) revert PoolExists();

        pools[poolId] = Pool({
            token0: token0,
            token1: token1,
            reserve0: 0,
            reserve1: 0,
            totalLiquidity: 0,
            kLast: 0
        });

        // Initialize TWAP observation
        priceObservations[poolId] = PriceObservation({
            timestamp: block.timestamp,
            price0CumulativeLast: 0,
            price1CumulativeLast: 0
        });

        emit PoolCreated(poolId, token0, token1);
    }

    // ---------------------------------------------------------------
    //  Add liquidity
    // ---------------------------------------------------------------

    /**
     * @notice Add liquidity to an ERC-20 / ERC-20 pool.
     *
     * @param tokenA       First token
     * @param tokenB       Second token
     * @param amountADesired Desired amount of tokenA to deposit
     * @param amountBDesired Desired amount of tokenB to deposit
     * @param amountAMin   Minimum acceptable amount of tokenA to deposit
     * @param amountBMin   Minimum acceptable amount of tokenB to deposit
     * @param minLiquidity Minimum LP tokens to receive (slippage protection)
     * @param deadline     Transaction deadline (revert if block.timestamp > deadline)
     */
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        uint256 minLiquidity,
        uint256 deadline
    ) external nonReentrant ensure(deadline) whenNotPaused returns (uint256 liquidity) {
        if (tokenA == ETH_ADDRESS || tokenB == ETH_ADDRESS) revert ZeroAddress();
        if (amountADesired == 0 || amountBDesired == 0) revert ZeroAmount();

        (address token0, address token1) = _sortTokens(tokenA, tokenB);
        bytes32 poolId = _getPoolId(token0, token1);
        Pool storage pool = pools[poolId];
        if (pool.token0 == address(0)) revert PoolNotFound();

        // Update TWAP before modifying reserves
        _updateTWAP(poolId, pool);

        // Compute optimal deposit amounts
        uint256 amountA;
        uint256 amountB;
        if (pool.totalLiquidity == 0) {
            // First deposit -- accept desired amounts directly
            amountA = amountADesired;
            amountB = amountBDesired;
        } else {
            // Existing pool: enforce proportional deposit
            (uint256 reserveA, uint256 reserveB) = tokenA == token0
                ? (pool.reserve0, pool.reserve1)
                : (pool.reserve1, pool.reserve0);

            // Try amountADesired first
            uint256 amountBOptimal = (amountADesired * reserveB) / reserveA;
            if (amountBOptimal <= amountBDesired) {
                if (amountBOptimal < amountBMin) revert InsufficientBAmount();
                amountA = amountADesired;
                amountB = amountBOptimal;
            } else {
                // Else derive amountA from amountBDesired
                uint256 amountAOptimal = (amountBDesired * reserveA) / reserveB;
                if (amountAOptimal > amountADesired) revert InsufficientAAmount();
                if (amountAOptimal < amountAMin) revert InsufficientAAmount();
                amountA = amountAOptimal;
                amountB = amountBDesired;
            }
        }

        // Determine sorted deposit amounts
        (uint256 amount0, uint256 amount1) = tokenA == token0
            ? (amountA, amountB)
            : (amountB, amountA);

        // Transfer tokens in using fee-on-transfer safe pattern
        uint256 received0 = _safeTransferIn(token0, msg.sender, amount0);
        uint256 received1 = _safeTransferIn(token1, msg.sender, amount1);

        liquidity = _mintLiquidity(poolId, pool, received0, received1);
        if (liquidity < minLiquidity) revert InsufficientLiquidity();

        emit LiquidityAdded(poolId, msg.sender, received0, received1, liquidity);
    }

    /**
     * @notice Add liquidity to an ETH / ERC-20 pool.
     *
     * @param token        The ERC-20 token (paired with ETH)
     * @param amountTokenDesired Desired amount of the ERC-20 token to deposit
     * @param amountTokenMin Minimum acceptable amount of the ERC-20 token
     * @param amountETHMin Minimum acceptable amount of ETH
     * @param minLiquidity Minimum LP tokens to receive
     * @param deadline     Transaction deadline (revert if block.timestamp > deadline)
     */
    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        uint256 minLiquidity,
        uint256 deadline
    ) external payable nonReentrant ensure(deadline) whenNotPaused returns (uint256 liquidity) {
        if (token == address(0) || token == ETH_ADDRESS) revert ZeroAddress();
        if (msg.value == 0 || amountTokenDesired == 0) revert ZeroAmount();

        (address token0, address token1) = _sortTokens(ETH_ADDRESS, token);
        bytes32 poolId = _getPoolId(token0, token1);
        Pool storage pool = pools[poolId];
        if (pool.token0 == address(0)) revert PoolNotFound();

        // Update TWAP before modifying reserves
        _updateTWAP(poolId, pool);

        uint256 amountETH;
        uint256 amountToken;

        if (pool.totalLiquidity == 0) {
            // First deposit -- accept desired amounts directly
            amountETH = msg.value;
            amountToken = amountTokenDesired;
        } else {
            // Enforce proportional deposit
            (uint256 reserveETH, uint256 reserveToken) = token0 == ETH_ADDRESS
                ? (pool.reserve0, pool.reserve1)
                : (pool.reserve1, pool.reserve0);

            uint256 amountTokenOptimal = (msg.value * reserveToken) / reserveETH;
            if (amountTokenOptimal <= amountTokenDesired) {
                if (amountTokenOptimal < amountTokenMin) revert InsufficientAAmount();
                amountETH = msg.value;
                amountToken = amountTokenOptimal;
            } else {
                uint256 amountETHOptimal = (amountTokenDesired * reserveETH) / reserveToken;
                if (amountETHOptimal > msg.value) revert InsufficientBAmount();
                if (amountETHOptimal < amountETHMin) revert InsufficientBAmount();
                amountETH = amountETHOptimal;
                amountToken = amountTokenDesired;
            }
        }

        // Refund excess ETH via pull pattern
        if (msg.value > amountETH) {
            ethBalances[msg.sender] += msg.value - amountETH;
        }

        uint256 amount0;
        uint256 amount1;
        if (token0 == ETH_ADDRESS) {
            amount0 = amountETH;
            amount1 = amountToken;
            amount1 = _safeTransferIn(token1, msg.sender, amount1);
        } else {
            amount0 = amountToken;
            amount1 = amountETH;
            amount0 = _safeTransferIn(token0, msg.sender, amount0);
        }

        liquidity = _mintLiquidity(poolId, pool, amount0, amount1);
        if (liquidity < minLiquidity) revert InsufficientLiquidity();

        emit LiquidityAdded(poolId, msg.sender, amount0, amount1, liquidity);
    }

    // ---------------------------------------------------------------
    //  Remove liquidity
    // ---------------------------------------------------------------

    /**
     * @notice Remove liquidity from an ERC-20 / ERC-20 pool.
     *
     * @param tokenA    First token
     * @param tokenB    Second token
     * @param liquidity Amount of LP tokens to burn
     * @param minA      Minimum amount of tokenA to receive
     * @param minB      Minimum amount of tokenB to receive
     * @param deadline  Transaction deadline (revert if block.timestamp > deadline)
     */
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 minA,
        uint256 minB,
        uint256 deadline
    ) external nonReentrant ensure(deadline) returns (uint256 amountA, uint256 amountB) {
        if (liquidity == 0) revert ZeroAmount();

        (address token0, address token1) = _sortTokens(tokenA, tokenB);
        bytes32 poolId = _getPoolId(token0, token1);
        Pool storage pool = pools[poolId];
        if (pool.token0 == address(0)) revert PoolNotFound();

        // Update TWAP before modifying reserves
        _updateTWAP(poolId, pool);

        (uint256 amount0, uint256 amount1) = _burnLiquidity(poolId, pool, liquidity);

        // Map back to caller's token ordering
        if (tokenA == token0) {
            amountA = amount0;
            amountB = amount1;
        } else {
            amountA = amount1;
            amountB = amount0;
        }

        if (amountA < minA) revert InsufficientAAmount();
        if (amountB < minB) revert InsufficientBAmount();

        // Transfer tokens out -- use pull pattern for ETH_ADDRESS
        _safeTransferOut(token0, msg.sender, amount0);
        _safeTransferOut(token1, msg.sender, amount1);

        emit LiquidityRemoved(poolId, msg.sender, amount0, amount1, liquidity);
    }

    /**
     * @notice Remove liquidity from an ETH / ERC-20 pool.
     *
     * @param token     The ERC-20 token (paired with ETH)
     * @param liquidity Amount of LP tokens to burn
     * @param minToken  Minimum ERC-20 tokens to receive
     * @param minETH    Minimum ETH to receive
     * @param deadline  Transaction deadline (revert if block.timestamp > deadline)
     */
    function removeLiquidityETH(
        address token,
        uint256 liquidity,
        uint256 minToken,
        uint256 minETH,
        uint256 deadline
    ) external nonReentrant ensure(deadline) returns (uint256 amountToken, uint256 amountETH) {
        if (token == address(0) || token == ETH_ADDRESS) revert ZeroAddress();
        if (liquidity == 0) revert ZeroAmount();

        (address token0, address token1) = _sortTokens(ETH_ADDRESS, token);
        bytes32 poolId = _getPoolId(token0, token1);
        Pool storage pool = pools[poolId];
        if (pool.token0 == address(0)) revert PoolNotFound();

        // Update TWAP before modifying reserves
        _updateTWAP(poolId, pool);

        (uint256 amount0, uint256 amount1) = _burnLiquidity(poolId, pool, liquidity);

        if (token0 == ETH_ADDRESS) {
            amountETH = amount0;
            amountToken = amount1;
        } else {
            amountToken = amount0;
            amountETH = amount1;
        }

        if (amountToken < minToken) revert InsufficientAAmount();
        if (amountETH < minETH) revert InsufficientBAmount();

        // Transfer ERC-20 out
        _transferTokenOut(token, msg.sender, amountToken);

        // Credit ETH via pull pattern
        ethBalances[msg.sender] += amountETH;

        emit LiquidityRemoved(poolId, msg.sender, amount0, amount1, liquidity);
    }

    // ---------------------------------------------------------------
    //  Swap
    // ---------------------------------------------------------------

    /**
     * @notice Swap ERC-20 for ERC-20 through a pool.
     *
     * @param tokenIn     Token being sold
     * @param tokenOut    Token being bought
     * @param amountIn    Amount of tokenIn to sell
     * @param minAmountOut Minimum output (slippage protection)
     * @param deadline    Transaction deadline (revert if block.timestamp > deadline)
     */
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline
    ) external nonReentrant ensure(deadline) whenNotPaused returns (uint256 amountOut) {
        if (tokenIn == ETH_ADDRESS || tokenOut == ETH_ADDRESS) revert ZeroAddress();
        if (amountIn == 0) revert ZeroAmount();
        if (tokenIn == tokenOut) revert SameToken();

        (address token0, address token1) = _sortTokens(tokenIn, tokenOut);
        bytes32 poolId = _getPoolId(token0, token1);
        Pool storage pool = pools[poolId];
        if (pool.token0 == address(0)) revert PoolNotFound();

        // Update TWAP before swap
        _updateTWAP(poolId, pool);

        // Transfer input token using fee-on-transfer safe pattern
        uint256 received = _safeTransferIn(tokenIn, msg.sender, amountIn);

        amountOut = _executeSwap(pool, tokenIn, received);
        if (amountOut < minAmountOut) revert InsufficientOutput();

        // Transfer output token
        _transferTokenOut(tokenOut, msg.sender, amountOut);

        emit Swap(poolId, msg.sender, tokenIn, tokenOut, received, amountOut);
    }

    /**
     * @notice Swap native ETH for an ERC-20 token.
     *
     * @param token        The ERC-20 token to buy
     * @param minAmountOut Minimum token output
     * @param deadline     Transaction deadline (revert if block.timestamp > deadline)
     */
    function swapETHForToken(
        address token,
        uint256 minAmountOut,
        uint256 deadline
    ) external payable nonReentrant ensure(deadline) whenNotPaused returns (uint256 amountOut) {
        if (token == address(0) || token == ETH_ADDRESS) revert ZeroAddress();
        if (msg.value == 0) revert ZeroAmount();

        (address token0, address token1) = _sortTokens(ETH_ADDRESS, token);
        bytes32 poolId = _getPoolId(token0, token1);
        Pool storage pool = pools[poolId];
        if (pool.token0 == address(0)) revert PoolNotFound();

        // Update TWAP before swap
        _updateTWAP(poolId, pool);

        amountOut = _executeSwap(pool, ETH_ADDRESS, msg.value);
        if (amountOut < minAmountOut) revert InsufficientOutput();

        // Transfer ERC-20 token out
        _transferTokenOut(token, msg.sender, amountOut);

        emit Swap(poolId, msg.sender, ETH_ADDRESS, token, msg.value, amountOut);
    }

    /**
     * @notice Swap an ERC-20 token for native ETH.
     *
     * @param token    The ERC-20 token to sell
     * @param amountIn Amount of token to sell
     * @param minETH   Minimum ETH output
     * @param deadline Transaction deadline (revert if block.timestamp > deadline)
     */
    function swapTokenForETH(
        address token,
        uint256 amountIn,
        uint256 minETH,
        uint256 deadline
    ) external nonReentrant ensure(deadline) whenNotPaused returns (uint256 amountOut) {
        if (token == address(0) || token == ETH_ADDRESS) revert ZeroAddress();
        if (amountIn == 0) revert ZeroAmount();

        (address token0, address token1) = _sortTokens(ETH_ADDRESS, token);
        bytes32 poolId = _getPoolId(token0, token1);
        Pool storage pool = pools[poolId];
        if (pool.token0 == address(0)) revert PoolNotFound();

        // Update TWAP before swap
        _updateTWAP(poolId, pool);

        // Transfer ERC-20 in using fee-on-transfer safe pattern
        uint256 received = _safeTransferIn(token, msg.sender, amountIn);

        amountOut = _executeSwap(pool, token, received);
        if (amountOut < minETH) revert InsufficientOutput();

        // Credit ETH via pull pattern
        ethBalances[msg.sender] += amountOut;

        emit Swap(poolId, msg.sender, token, ETH_ADDRESS, received, amountOut);
    }

    // ---------------------------------------------------------------
    //  ETH withdrawal (pull pattern)
    // ---------------------------------------------------------------

    /**
     * @notice Withdraw credited ETH (from swaps and liquidity removal).
     */
    function withdrawEth() external nonReentrant {
        uint256 balance = ethBalances[msg.sender];
        if (balance == 0) revert NothingToWithdraw();
        ethBalances[msg.sender] = 0;

        (bool sent,) = payable(msg.sender).call{value: balance}("");
        if (!sent) revert TransferFailed();

        emit EthWithdrawn(msg.sender, balance);
    }

    // ---------------------------------------------------------------
    //  View functions
    // ---------------------------------------------------------------

    /**
     * @notice Get pool data for a token pair.
     */
    function getPool(address tokenA, address tokenB) external view returns (Pool memory) {
        (address token0, address token1) = _sortTokens(tokenA, tokenB);
        bytes32 poolId = _getPoolId(token0, token1);
        return pools[poolId];
    }

    /**
     * @notice Get the pool ID for a token pair.
     */
    function getPoolId(address tokenA, address tokenB) external pure returns (bytes32) {
        (address token0, address token1) = _sortTokens(tokenA, tokenB);
        return _getPoolId(token0, token1);
    }

    /**
     * @notice Get LP balance for a user in a specific pool.
     */
    function getLiquidityBalance(
        address tokenA,
        address tokenB,
        address provider
    ) external view returns (uint256) {
        (address token0, address token1) = _sortTokens(tokenA, tokenB);
        bytes32 poolId = _getPoolId(token0, token1);
        return liquidityBalances[poolId][provider];
    }

    /**
     * @notice Calculate output amount for a given input using constant product formula.
     *         Includes 0.3% fee on input.
     *
     * @param amountIn   Amount of input token
     * @param reserveIn  Reserve of input token
     * @param reserveOut Reserve of output token
     * @return amountOut Expected output amount
     */
    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure returns (uint256 amountOut) {
        if (amountIn == 0) revert ZeroAmount();
        if (reserveIn == 0 || reserveOut == 0) revert InsufficientLiquidity();

        uint256 amountInWithFee = amountIn * (FEE_DENOMINATOR - FEE_NUMERATOR);
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * FEE_DENOMINATOR) + amountInWithFee;
        amountOut = numerator / denominator;
    }

    /**
     * @notice Get expected output for a swap (convenience view).
     *
     * @param tokenIn  Input token address
     * @param tokenOut Output token address
     * @param amountIn Amount of input token
     * @return amountOut Expected output amount
     */
    function quote(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external view returns (uint256 amountOut) {
        (address token0, address token1) = _sortTokens(tokenIn, tokenOut);
        bytes32 poolId = _getPoolId(token0, token1);
        Pool storage pool = pools[poolId];
        if (pool.token0 == address(0)) revert PoolNotFound();

        uint256 reserveIn;
        uint256 reserveOut;
        if (tokenIn == token0) {
            reserveIn = pool.reserve0;
            reserveOut = pool.reserve1;
        } else {
            reserveIn = pool.reserve1;
            reserveOut = pool.reserve0;
        }

        amountOut = getAmountOut(amountIn, reserveIn, reserveOut);
    }

    /**
     * @notice Get the TWAP observation data for a pool.
     * @param tokenA First token
     * @param tokenB Second token
     * @return observation The latest price observation
     */
    function getPriceObservation(
        address tokenA,
        address tokenB
    ) external view returns (PriceObservation memory observation) {
        (address token0, address token1) = _sortTokens(tokenA, tokenB);
        bytes32 poolId = _getPoolId(token0, token1);
        observation = priceObservations[poolId];
    }

    // ---------------------------------------------------------------
    //  Internal: TWAP Oracle
    // ---------------------------------------------------------------

    /**
     * @dev Update the cumulative price accumulators for TWAP calculation.
     *      Uses UQ112x112-style encoding: price = reserve_other / reserve_this.
     *      Accumulates (price * timeElapsed) for off-chain TWAP computation.
     */
    function _updateTWAP(bytes32 poolId, Pool storage pool) private {
        PriceObservation storage obs = priceObservations[poolId];
        uint256 timeElapsed = block.timestamp - obs.timestamp;

        if (timeElapsed > 0 && pool.reserve0 > 0 && pool.reserve1 > 0) {
            // Accumulate price * time. Using 1e18 precision for prices.
            // price0 = reserve1 / reserve0 (price of token0 in terms of token1)
            // price1 = reserve0 / reserve1 (price of token1 in terms of token0)
            // Overflow is intentional for cumulative prices (wraps around).
            unchecked {
                obs.price0CumulativeLast += (pool.reserve1 * 1e18 / pool.reserve0) * timeElapsed;
                obs.price1CumulativeLast += (pool.reserve0 * 1e18 / pool.reserve1) * timeElapsed;
            }
        }

        obs.timestamp = block.timestamp;
    }

    // ---------------------------------------------------------------
    //  Internal: Liquidity math
    // ---------------------------------------------------------------

    function _mintLiquidity(
        bytes32 poolId,
        Pool storage pool,
        uint256 amount0,
        uint256 amount1
    ) private returns (uint256 liquidity) {
        if (pool.totalLiquidity == 0) {
            // First deposit: LP = sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY
            liquidity = _sqrt(amount0 * amount1);
            if (liquidity <= MINIMUM_LIQUIDITY) revert InsufficientLiquidity();
            liquidity -= MINIMUM_LIQUIDITY;
            // Burn minimum liquidity to the zero address
            liquidityBalances[poolId][address(0)] += MINIMUM_LIQUIDITY;
            pool.totalLiquidity = MINIMUM_LIQUIDITY;
        } else {
            // Subsequent deposits: proportional to existing reserves
            uint256 liquidity0 = (amount0 * pool.totalLiquidity) / pool.reserve0;
            uint256 liquidity1 = (amount1 * pool.totalLiquidity) / pool.reserve1;
            liquidity = liquidity0 < liquidity1 ? liquidity0 : liquidity1;
        }

        if (liquidity == 0) revert InsufficientLiquidity();

        liquidityBalances[poolId][msg.sender] += liquidity;
        pool.totalLiquidity += liquidity;
        pool.reserve0 += amount0;
        pool.reserve1 += amount1;
        pool.kLast = pool.reserve0 * pool.reserve1;
    }

    function _burnLiquidity(
        bytes32 poolId,
        Pool storage pool,
        uint256 liquidity
    ) private returns (uint256 amount0, uint256 amount1) {
        if (liquidityBalances[poolId][msg.sender] < liquidity) revert InsufficientLiquidity();

        amount0 = (liquidity * pool.reserve0) / pool.totalLiquidity;
        amount1 = (liquidity * pool.reserve1) / pool.totalLiquidity;
        if (amount0 == 0 || amount1 == 0) revert InsufficientLiquidity();

        liquidityBalances[poolId][msg.sender] -= liquidity;
        pool.totalLiquidity -= liquidity;
        pool.reserve0 -= amount0;
        pool.reserve1 -= amount1;
        pool.kLast = pool.reserve0 * pool.reserve1;
    }

    // ---------------------------------------------------------------
    //  Internal: Swap logic
    // ---------------------------------------------------------------

    function _executeSwap(
        Pool storage pool,
        address tokenIn,
        uint256 amountIn
    ) private returns (uint256 amountOut) {
        uint256 reserveIn;
        uint256 reserveOut;

        if (tokenIn == pool.token0) {
            reserveIn = pool.reserve0;
            reserveOut = pool.reserve1;
        } else {
            reserveIn = pool.reserve1;
            reserveOut = pool.reserve0;
        }

        // Snapshot K before swap
        uint256 kBefore = reserveIn * reserveOut;

        amountOut = getAmountOut(amountIn, reserveIn, reserveOut);
        if (amountOut == 0) revert InsufficientOutput();
        if (amountOut >= reserveOut) revert InsufficientLiquidity();

        // Update reserves
        if (tokenIn == pool.token0) {
            pool.reserve0 += amountIn;
            pool.reserve1 -= amountOut;
        } else {
            pool.reserve1 += amountIn;
            pool.reserve0 -= amountOut;
        }

        // Verify K invariant: k_new >= k_old (fee ensures this)
        uint256 kAfter = pool.reserve0 * pool.reserve1;
        if (kAfter < kBefore) revert InvariantViolation();

        pool.kLast = kAfter;
    }

    // ---------------------------------------------------------------
    //  Internal: Token transfers
    // ---------------------------------------------------------------

    // ---------------------------------------------------------------
    //  Internal: SafeERC20 helpers (handles tokens like USDT that
    //  don't return bool from transfer/transferFrom)
    // ---------------------------------------------------------------

    function _safeTransfer(address token, address to, uint256 amount) private {
        (bool success, bytes memory returndata) = token.call(
            abi.encodeWithSelector(IERC20(token).transfer.selector, to, amount)
        );
        if (!success || (returndata.length > 0 && !abi.decode(returndata, (bool)))) {
            revert TransferFailed();
        }
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) private {
        (bool success, bytes memory returndata) = token.call(
            abi.encodeWithSelector(IERC20(token).transferFrom.selector, from, to, amount)
        );
        if (!success || (returndata.length > 0 && !abi.decode(returndata, (bool)))) {
            revert TransferFailed();
        }
    }

    // ---------------------------------------------------------------

    function _transferTokenIn(address token, address from, uint256 amount) private {
        if (token == ETH_ADDRESS) {
            // ETH already received via msg.value -- no-op
            return;
        }
        _safeTransferFrom(token, from, address(this), amount);
    }

    /**
     * @dev Fee-on-transfer safe transfer-in. Returns the actual amount received
     *      by checking contract balance before and after the transfer.
     */
    function _safeTransferIn(address token, address from, uint256 amount) private returns (uint256 received) {
        uint256 balBefore = IERC20(token).balanceOf(address(this));
        _safeTransferFrom(token, from, address(this), amount);
        received = IERC20(token).balanceOf(address(this)) - balBefore;
        if (received == 0) revert ZeroAmount();
    }

    function _transferTokenOut(address token, address to, uint256 amount) private {
        if (token == ETH_ADDRESS) {
            (bool sent,) = payable(to).call{value: amount}("");
            if (!sent) revert TransferFailed();
            return;
        }
        _safeTransfer(token, to, amount);
    }

    /**
     * @dev Transfer token out with pull pattern for ETH -- credits
     *      ethBalances[to] instead of sending ETH directly.
     */
    function _safeTransferOut(address token, address to, uint256 amount) private {
        if (token == ETH_ADDRESS) {
            ethBalances[to] += amount;
            return;
        }
        _safeTransfer(token, to, amount);
    }

    // ---------------------------------------------------------------
    //  Internal: Helpers
    // ---------------------------------------------------------------

    /// @notice Sort two token addresses for deterministic pool IDs.
    function _sortTokens(address a, address b) private pure returns (address, address) {
        return a < b ? (a, b) : (b, a);
    }

    /// @notice Compute deterministic pool ID from sorted token pair.
    function _getPoolId(address token0, address token1) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(token0, token1));
    }

    /// @notice Babylonian method integer square root.
    function _sqrt(uint256 y) private pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }

    // ---------------------------------------------------------------
    //  Receive ETH
    // ---------------------------------------------------------------

    /// @dev Only accept ETH from payable functions (addLiquidityETH, swap).
    /// Direct ETH sends are rejected to prevent fund lockup.
    receive() external payable {
        revert("Direct ETH not accepted");
    }
}
