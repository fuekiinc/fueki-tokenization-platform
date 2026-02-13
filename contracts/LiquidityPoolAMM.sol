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

    // ---------------------------------------------------------------
    //  Modifiers
    // ---------------------------------------------------------------

    modifier nonReentrant() {
        if (_status == _ENTERED) revert ReentrantCall();
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    // ---------------------------------------------------------------
    //  Constructor
    // ---------------------------------------------------------------

    constructor() {
        _status = _NOT_ENTERED;
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
    function createPool(address tokenA, address tokenB) external returns (bytes32 poolId) {
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
     * @param amountA      Amount of tokenA to deposit
     * @param amountB      Amount of tokenB to deposit
     * @param minLiquidity Minimum LP tokens to receive (slippage protection)
     */
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        uint256 minLiquidity
    ) external nonReentrant returns (uint256 liquidity) {
        if (tokenA == ETH_ADDRESS || tokenB == ETH_ADDRESS) revert ZeroAddress();
        if (amountA == 0 || amountB == 0) revert ZeroAmount();

        (address token0, address token1) = _sortTokens(tokenA, tokenB);
        bytes32 poolId = _getPoolId(token0, token1);
        Pool storage pool = pools[poolId];
        if (pool.token0 == address(0)) revert PoolNotFound();

        // Determine actual deposit amounts (match ratio for existing pools)
        (uint256 amount0, uint256 amount1) = tokenA == token0
            ? (amountA, amountB)
            : (amountB, amountA);

        // Transfer tokens in
        _transferTokenIn(token0, msg.sender, amount0);
        _transferTokenIn(token1, msg.sender, amount1);

        liquidity = _mintLiquidity(poolId, pool, amount0, amount1);
        if (liquidity < minLiquidity) revert InsufficientLiquidity();

        emit LiquidityAdded(poolId, msg.sender, amount0, amount1, liquidity);
    }

    /**
     * @notice Add liquidity to an ETH / ERC-20 pool.
     *
     * @param token        The ERC-20 token (paired with ETH)
     * @param amountToken  Amount of the ERC-20 token to deposit
     * @param minLiquidity Minimum LP tokens to receive
     */
    function addLiquidityETH(
        address token,
        uint256 amountToken,
        uint256 minLiquidity
    ) external payable nonReentrant returns (uint256 liquidity) {
        if (token == address(0) || token == ETH_ADDRESS) revert ZeroAddress();
        if (msg.value == 0 || amountToken == 0) revert ZeroAmount();

        (address token0, address token1) = _sortTokens(ETH_ADDRESS, token);
        bytes32 poolId = _getPoolId(token0, token1);
        Pool storage pool = pools[poolId];
        if (pool.token0 == address(0)) revert PoolNotFound();

        uint256 amount0;
        uint256 amount1;
        if (token0 == ETH_ADDRESS) {
            amount0 = msg.value;
            amount1 = amountToken;
            _transferTokenIn(token1, msg.sender, amount1);
        } else {
            amount0 = amountToken;
            amount1 = msg.value;
            _transferTokenIn(token0, msg.sender, amount0);
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
     */
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 minA,
        uint256 minB
    ) external nonReentrant returns (uint256 amountA, uint256 amountB) {
        if (tokenA == ETH_ADDRESS || tokenB == ETH_ADDRESS) revert ZeroAddress();
        if (liquidity == 0) revert ZeroAmount();

        (address token0, address token1) = _sortTokens(tokenA, tokenB);
        bytes32 poolId = _getPoolId(token0, token1);
        Pool storage pool = pools[poolId];
        if (pool.token0 == address(0)) revert PoolNotFound();

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

        // Transfer tokens out
        _transferTokenOut(token0, msg.sender, amount0);
        _transferTokenOut(token1, msg.sender, amount1);

        emit LiquidityRemoved(poolId, msg.sender, amount0, amount1, liquidity);
    }

    /**
     * @notice Remove liquidity from an ETH / ERC-20 pool.
     *
     * @param token     The ERC-20 token (paired with ETH)
     * @param liquidity Amount of LP tokens to burn
     * @param minToken  Minimum ERC-20 tokens to receive
     * @param minETH    Minimum ETH to receive
     */
    function removeLiquidityETH(
        address token,
        uint256 liquidity,
        uint256 minToken,
        uint256 minETH
    ) external nonReentrant returns (uint256 amountToken, uint256 amountETH) {
        if (token == address(0) || token == ETH_ADDRESS) revert ZeroAddress();
        if (liquidity == 0) revert ZeroAmount();

        (address token0, address token1) = _sortTokens(ETH_ADDRESS, token);
        bytes32 poolId = _getPoolId(token0, token1);
        Pool storage pool = pools[poolId];
        if (pool.token0 == address(0)) revert PoolNotFound();

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
     */
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) external nonReentrant returns (uint256 amountOut) {
        if (tokenIn == ETH_ADDRESS || tokenOut == ETH_ADDRESS) revert ZeroAddress();
        if (amountIn == 0) revert ZeroAmount();
        if (tokenIn == tokenOut) revert SameToken();

        (address token0, address token1) = _sortTokens(tokenIn, tokenOut);
        bytes32 poolId = _getPoolId(token0, token1);
        Pool storage pool = pools[poolId];
        if (pool.token0 == address(0)) revert PoolNotFound();

        // Transfer input token
        _transferTokenIn(tokenIn, msg.sender, amountIn);

        amountOut = _executeSwap(pool, tokenIn, amountIn);
        if (amountOut < minAmountOut) revert InsufficientOutput();

        // Transfer output token
        _transferTokenOut(tokenOut, msg.sender, amountOut);

        emit Swap(poolId, msg.sender, tokenIn, tokenOut, amountIn, amountOut);
    }

    /**
     * @notice Swap native ETH for an ERC-20 token.
     *
     * @param token        The ERC-20 token to buy
     * @param minAmountOut Minimum token output
     */
    function swapETHForToken(
        address token,
        uint256 minAmountOut
    ) external payable nonReentrant returns (uint256 amountOut) {
        if (token == address(0) || token == ETH_ADDRESS) revert ZeroAddress();
        if (msg.value == 0) revert ZeroAmount();

        (address token0, address token1) = _sortTokens(ETH_ADDRESS, token);
        bytes32 poolId = _getPoolId(token0, token1);
        Pool storage pool = pools[poolId];
        if (pool.token0 == address(0)) revert PoolNotFound();

        amountOut = _executeSwap(pool, ETH_ADDRESS, msg.value);
        if (amountOut < minAmountOut) revert InsufficientOutput();

        // Transfer ERC-20 token out
        _transferTokenOut(token, msg.sender, amountOut);

        emit Swap(poolId, msg.sender, ETH_ADDRESS, token, msg.value, amountOut);
    }

    /**
     * @notice Swap an ERC-20 token for native ETH.
     *
     * @param token   The ERC-20 token to sell
     * @param amountIn Amount of token to sell
     * @param minETH  Minimum ETH output
     */
    function swapTokenForETH(
        address token,
        uint256 amountIn,
        uint256 minETH
    ) external nonReentrant returns (uint256 amountOut) {
        if (token == address(0) || token == ETH_ADDRESS) revert ZeroAddress();
        if (amountIn == 0) revert ZeroAmount();

        (address token0, address token1) = _sortTokens(ETH_ADDRESS, token);
        bytes32 poolId = _getPoolId(token0, token1);
        Pool storage pool = pools[poolId];
        if (pool.token0 == address(0)) revert PoolNotFound();

        // Transfer ERC-20 in
        _transferTokenIn(token, msg.sender, amountIn);

        amountOut = _executeSwap(pool, token, amountIn);
        if (amountOut < minETH) revert InsufficientOutput();

        // Credit ETH via pull pattern
        ethBalances[msg.sender] += amountOut;

        emit Swap(poolId, msg.sender, token, ETH_ADDRESS, amountIn, amountOut);
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

        amountOut = getAmountOut(amountIn, reserveIn, reserveOut);
        if (amountOut == 0) revert InsufficientOutput();

        // Update reserves
        if (tokenIn == pool.token0) {
            pool.reserve0 += amountIn;
            pool.reserve1 -= amountOut;
        } else {
            pool.reserve1 += amountIn;
            pool.reserve0 -= amountOut;
        }

        pool.kLast = pool.reserve0 * pool.reserve1;
    }

    // ---------------------------------------------------------------
    //  Internal: Token transfers
    // ---------------------------------------------------------------

    function _transferTokenIn(address token, address from, uint256 amount) private {
        if (token == ETH_ADDRESS) {
            // ETH already received via msg.value -- no-op
            return;
        }
        bool ok = IERC20(token).transferFrom(from, address(this), amount);
        if (!ok) revert TransferFailed();
    }

    function _transferTokenOut(address token, address to, uint256 amount) private {
        if (token == ETH_ADDRESS) {
            (bool sent,) = payable(to).call{value: amount}("");
            if (!sent) revert TransferFailed();
            return;
        }
        bool ok = IERC20(token).transfer(to, amount);
        if (!ok) revert TransferFailed();
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

    receive() external payable {}
}
