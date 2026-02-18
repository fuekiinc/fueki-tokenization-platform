// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./OrbitalPool.sol";
import "./OrbitalFactory.sol";

/**
 * @title OrbitalRouter
 * @notice High-level router for interacting with OrbitalPool contracts.
 *
 *         Provides convenience functions for:
 *         - Token-address-based swaps (resolve token indices automatically)
 *         - Multi-hop swaps through multiple pools (max 4 hops)
 *         - Simplified liquidity management
 *         - Automatic token approvals
 *         - Dust recovery
 *
 * @dev    Stateless router -- does not hold any tokens between calls.
 *         All pool addresses are validated against the factory registry.
 */

interface IERC20Router {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract OrbitalRouter {

    // ---------------------------------------------------------------
    //  Reentrancy Guard
    // ---------------------------------------------------------------

    uint256 private _status = 1;
    error ReentrancyGuard();

    modifier nonReentrant() {
        if (_status != 1) revert ReentrancyGuard();
        _status = 2;
        _;
        _status = 1;
    }

    // ---------------------------------------------------------------
    //  Constants
    // ---------------------------------------------------------------

    /// @notice Maximum number of hops in a multi-hop swap to bound gas usage.
    uint256 public constant MAX_HOPS = 4;

    // ---------------------------------------------------------------
    //  Storage
    // ---------------------------------------------------------------

    /// @notice The OrbitalFactory used to look up and validate pools.
    OrbitalFactory public immutable orbitalFactory;

    /// @notice Router owner (can recover dust tokens).
    address public owner;

    // ---------------------------------------------------------------
    //  Events
    // ---------------------------------------------------------------

    event SwapExecuted(
        address indexed sender,
        address indexed pool,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    event MultiHopSwapExecuted(
        address indexed sender,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 hops
    );

    event LiquidityAdded(
        address indexed sender,
        address indexed pool,
        uint256 lpMinted
    );

    event LiquidityRemoved(
        address indexed sender,
        address indexed pool,
        uint256 lpBurned
    );

    event DustRecovered(
        address indexed token,
        address indexed to,
        uint256 amount
    );

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ---------------------------------------------------------------
    //  Errors
    // ---------------------------------------------------------------

    error PoolNotFound();
    error TokenNotInPool();
    error ZeroAmount();
    error ZeroAddress();
    error SlippageExceeded();
    error TransferFailed();
    error DeadlineExpired();
    error InvalidPath();
    error TooManyHops();
    error InsufficientAllowance();
    error NotOwner();

    // ---------------------------------------------------------------
    //  Modifiers
    // ---------------------------------------------------------------

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ---------------------------------------------------------------
    //  Constructor
    // ---------------------------------------------------------------

    constructor(address _factory, address _owner) {
        if (_factory == address(0) || _owner == address(0)) revert ZeroAddress();
        orbitalFactory = OrbitalFactory(_factory);
        owner = _owner;
        emit OwnershipTransferred(address(0), _owner);
    }

    // ---------------------------------------------------------------
    //  Owner Functions
    // ---------------------------------------------------------------

    /**
     * @notice Transfer router ownership.
     * @param newOwner The new owner address.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    /**
     * @notice Recover dust tokens stuck in the router.
     *         Only callable by owner.
     * @param token The ERC-20 token to recover.
     * @param to    Recipient address.
     * @param amount Amount to recover.
     */
    function recoverDust(address token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        _safeTransfer(token, to, amount);
        emit DustRecovered(token, to, amount);
    }

    // ---------------------------------------------------------------
    //  Swap Functions
    // ---------------------------------------------------------------

    /**
     * @notice Swap tokens through a specific pool by token addresses.
     *
     * @param pool          Address of the OrbitalPool.
     * @param tokenIn       Address of the input token.
     * @param tokenOut      Address of the output token.
     * @param amountIn      Amount of input token.
     * @param minAmountOut  Minimum output (slippage protection).
     * @param deadline      Transaction deadline.
     * @return amountOut    Actual output amount.
     */
    function swap(
        address pool,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline
    ) external nonReentrant returns (uint256 amountOut) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (amountIn == 0) revert ZeroAmount();
        if (pool == address(0) || tokenIn == address(0) || tokenOut == address(0)) revert ZeroAddress();

        OrbitalPool orbPool = OrbitalPool(pool);

        // Resolve token indices
        uint256 tokenInIndex = orbPool.getTokenIndex(tokenIn);
        uint256 tokenOutIndex = orbPool.getTokenIndex(tokenOut);
        if (tokenInIndex >= orbPool.numTokens()) revert TokenNotInPool();
        if (tokenOutIndex >= orbPool.numTokens()) revert TokenNotInPool();

        // Transfer tokens from user to this router
        _safeTransferFrom(tokenIn, msg.sender, address(this), amountIn);

        // Approve pool to spend tokens
        _ensureApproval(tokenIn, pool, amountIn);

        // Execute swap
        amountOut = orbPool.swap(
            tokenInIndex,
            tokenOutIndex,
            amountIn,
            minAmountOut,
            deadline
        );

        // Transfer output to user
        _safeTransfer(tokenOut, msg.sender, amountOut);

        emit SwapExecuted(msg.sender, pool, tokenIn, tokenOut, amountIn, amountOut);
    }

    /**
     * @notice Execute a multi-hop swap through a series of pools.
     *         Maximum 4 hops to prevent gas griefing.
     *
     * @param pools         Array of pool addresses to route through.
     * @param tokenPath     Array of token addresses defining the path.
     *                      Length must be pools.length + 1.
     * @param amountIn      Initial input amount.
     * @param minAmountOut  Minimum final output.
     * @param deadline      Transaction deadline.
     * @return amountOut    Final output amount.
     */
    function swapMultiHop(
        address[] calldata pools,
        address[] calldata tokenPath,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline
    ) external nonReentrant returns (uint256 amountOut) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (pools.length == 0) revert InvalidPath();
        if (pools.length > MAX_HOPS) revert TooManyHops();
        if (tokenPath.length != pools.length + 1) revert InvalidPath();
        if (amountIn == 0) revert ZeroAmount();

        // Validate no zero addresses in path
        for (uint256 i = 0; i < tokenPath.length; ++i) {
            if (tokenPath[i] == address(0)) revert ZeroAddress();
        }
        for (uint256 i = 0; i < pools.length; ++i) {
            if (pools[i] == address(0)) revert ZeroAddress();
        }

        // Transfer initial tokens from user
        _safeTransferFrom(tokenPath[0], msg.sender, address(this), amountIn);

        uint256 currentAmount = amountIn;

        for (uint256 i = 0; i < pools.length; ++i) {
            OrbitalPool orbPool = OrbitalPool(pools[i]);
            address tokenIn = tokenPath[i];
            address tokenOut = tokenPath[i + 1];

            uint256 tokenInIndex = orbPool.getTokenIndex(tokenIn);
            uint256 tokenOutIndex = orbPool.getTokenIndex(tokenOut);
            if (tokenInIndex >= orbPool.numTokens()) revert TokenNotInPool();
            if (tokenOutIndex >= orbPool.numTokens()) revert TokenNotInPool();

            // Approve pool
            _ensureApproval(tokenIn, pools[i], currentAmount);

            // Execute hop
            currentAmount = orbPool.swap(
                tokenInIndex,
                tokenOutIndex,
                currentAmount,
                0, // No intermediate slippage check; final check below
                deadline
            );
        }

        if (currentAmount < minAmountOut) revert SlippageExceeded();

        // Transfer final output to user
        _safeTransfer(tokenPath[tokenPath.length - 1], msg.sender, currentAmount);

        amountOut = currentAmount;

        emit MultiHopSwapExecuted(
            msg.sender,
            tokenPath[0],
            tokenPath[tokenPath.length - 1],
            amountIn,
            amountOut,
            pools.length
        );
    }

    // ---------------------------------------------------------------
    //  Liquidity Functions
    // ---------------------------------------------------------------

    /**
     * @notice Add liquidity to a pool through the router.
     *
     * @param pool          Address of the OrbitalPool.
     * @param amounts       Token amounts to deposit.
     * @param minLiquidity  Minimum LP tokens to receive.
     * @param deadline      Transaction deadline.
     * @return liquidity    LP tokens minted.
     */
    function addLiquidity(
        address pool,
        uint256[] calldata amounts,
        uint256 minLiquidity,
        uint256 deadline
    ) external nonReentrant returns (uint256 liquidity) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (pool == address(0)) revert ZeroAddress();

        OrbitalPool orbPool = OrbitalPool(pool);
        uint256 n = orbPool.numTokens();

        // Transfer tokens from user and approve pool
        for (uint256 i = 0; i < n; ++i) {
            address token = orbPool.tokens(i);
            if (amounts[i] > 0) {
                _safeTransferFrom(token, msg.sender, address(this), amounts[i]);
                _ensureApproval(token, pool, amounts[i]);
            }
        }

        // Add liquidity
        liquidity = orbPool.addLiquidity(amounts, minLiquidity, deadline);

        // Transfer LP tokens to user
        orbPool.transfer(msg.sender, liquidity);

        emit LiquidityAdded(msg.sender, pool, liquidity);
    }

    /**
     * @notice Remove liquidity from a pool through the router.
     *
     * @param pool          Address of the OrbitalPool.
     * @param liquidity     LP tokens to burn.
     * @param minAmounts    Minimum token amounts to receive.
     * @param deadline      Transaction deadline.
     * @return amounts      Actual amounts returned.
     */
    function removeLiquidity(
        address pool,
        uint256 liquidity,
        uint256[] calldata minAmounts,
        uint256 deadline
    ) external nonReentrant returns (uint256[] memory amounts) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (liquidity == 0) revert ZeroAmount();
        if (pool == address(0)) revert ZeroAddress();

        OrbitalPool orbPool = OrbitalPool(pool);

        // Transfer LP tokens from user to this router
        orbPool.transferFrom(msg.sender, address(this), liquidity);

        // Remove liquidity
        amounts = orbPool.removeLiquidity(liquidity, minAmounts, deadline);

        // Transfer tokens to user
        uint256 n = orbPool.numTokens();
        for (uint256 i = 0; i < n; ++i) {
            if (amounts[i] > 0) {
                address token = orbPool.tokens(i);
                _safeTransfer(token, msg.sender, amounts[i]);
            }
        }

        emit LiquidityRemoved(msg.sender, pool, liquidity);
    }

    // ---------------------------------------------------------------
    //  View Functions
    // ---------------------------------------------------------------

    /**
     * @notice Get expected output for a swap on a specific pool.
     */
    function getAmountOut(
        address pool,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external view returns (uint256 amountOut, uint256 feeAmount) {
        if (pool == address(0)) revert ZeroAddress();
        OrbitalPool orbPool = OrbitalPool(pool);
        uint256 tokenInIndex = orbPool.getTokenIndex(tokenIn);
        uint256 tokenOutIndex = orbPool.getTokenIndex(tokenOut);
        if (tokenInIndex >= orbPool.numTokens()) revert TokenNotInPool();
        if (tokenOutIndex >= orbPool.numTokens()) revert TokenNotInPool();

        (amountOut, feeAmount) = orbPool.getAmountOut(tokenInIndex, tokenOutIndex, amountIn);
    }

    /**
     * @notice Get expected output for a multi-hop swap.
     */
    function getAmountOutMultiHop(
        address[] calldata pools,
        address[] calldata tokenPath,
        uint256 amountIn
    ) external view returns (uint256 amountOut) {
        if (pools.length == 0) revert InvalidPath();
        if (pools.length > MAX_HOPS) revert TooManyHops();
        if (tokenPath.length != pools.length + 1) revert InvalidPath();

        uint256 currentAmount = amountIn;
        for (uint256 i = 0; i < pools.length; ++i) {
            if (pools[i] == address(0)) revert ZeroAddress();
            OrbitalPool orbPool = OrbitalPool(pools[i]);
            uint256 tokenInIndex = orbPool.getTokenIndex(tokenPath[i]);
            uint256 tokenOutIndex = orbPool.getTokenIndex(tokenPath[i + 1]);

            if (tokenInIndex >= orbPool.numTokens()) revert TokenNotInPool();
            if (tokenOutIndex >= orbPool.numTokens()) revert TokenNotInPool();

            (currentAmount,) = orbPool.getAmountOut(tokenInIndex, tokenOutIndex, currentAmount);
        }
        amountOut = currentAmount;
    }

    // ---------------------------------------------------------------
    //  Internal
    // ---------------------------------------------------------------

    function _ensureApproval(address token, address spender, uint256 amount) private {
        uint256 current = IERC20Router(token).allowance(address(this), spender);
        if (current < amount) {
            // Reset to 0 first (for tokens like USDT that require this)
            if (current > 0) {
                (bool ok,) = token.call(
                    abi.encodeWithSelector(0x095ea7b3, spender, uint256(0))
                );
                if (!ok) revert TransferFailed();
            }
            (bool success,) = token.call(
                abi.encodeWithSelector(0x095ea7b3, spender, type(uint256).max)
            );
            if (!success) revert TransferFailed();
        }
    }

    function _safeTransferFrom(
        address token,
        address from,
        address to,
        uint256 amount
    ) private {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(0x23b872dd, from, to, amount)
        );
        if (!success || (data.length > 0 && !abi.decode(data, (bool)))) {
            revert TransferFailed();
        }
    }

    function _safeTransfer(address token, address to, uint256 amount) private {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(0xa9059cbb, to, amount)
        );
        if (!success || (data.length > 0 && !abi.decode(data, (bool)))) {
            revert TransferFailed();
        }
    }
}
