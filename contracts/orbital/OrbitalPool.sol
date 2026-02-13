// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./OrbitalMath.sol";

/**
 * @title OrbitalPool
 * @notice Core AMM pool implementing the Orbital superellipse invariant.
 *
 *         The pool supports 2-8 ERC-20 tokens and uses the invariant:
 *           Sum(xi^p) = K
 *         where xi are WAD-normalized reserves and p is the concentration
 *         parameter. Higher p concentrates liquidity closer to 1:1 pricing.
 *
 *         Features:
 *         - N-token pools (2-8 tokens)
 *         - Configurable concentration power (2, 4, 8, 16, 32)
 *         - Configurable swap fee (in basis points)
 *         - ERC-20 LP token for liquidity positions
 *         - Proportional add/remove liquidity
 *         - Single-sided swap execution
 *
 * @dev    Follows existing Fueki platform conventions: no OpenZeppelin imports,
 *         manual reentrancy guard, custom errors, inline ERC-20 implementation
 *         for LP tokens.
 */

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function decimals() external view returns (uint8);
}

contract OrbitalPool {
    using OrbitalMath for uint256;

    // ---------------------------------------------------------------
    //  Constants
    // ---------------------------------------------------------------

    uint256 public constant WAD = 1e18;
    uint256 public constant MINIMUM_LIQUIDITY = 1000;
    uint256 public constant MAX_TOKENS = 8;
    uint256 public constant MIN_TOKENS = 2;
    uint256 public constant MAX_FEE_BPS = 100; // 1% max fee
    uint256 public constant FEE_DENOMINATOR = 10000;

    // ---------------------------------------------------------------
    //  Pool Configuration (set once at initialization)
    // ---------------------------------------------------------------

    /// @notice Factory that created this pool.
    address public immutable factory;

    /// @notice Ordered array of token addresses in the pool.
    address[] public tokens;

    /// @notice Number of tokens in the pool.
    uint256 public numTokens;

    /// @notice Concentration power (2, 4, 8, 16, 32).
    ///         Higher = more concentrated around equal prices.
    uint8 public concentration;

    /// @notice Swap fee in basis points (e.g., 4 = 0.04%).
    uint256 public swapFeeBps;

    /// @notice Fee collector address (receives accumulated protocol fees).
    address public feeCollector;

    // ---------------------------------------------------------------
    //  Pool State
    // ---------------------------------------------------------------

    /// @notice Current reserve for each token (raw amounts in token decimals).
    uint256[] public reserves;

    /// @notice Whether the pool has been initialized with first liquidity.
    bool public initialized;

    // ---------------------------------------------------------------
    //  LP Token State (ERC-20 inline)
    // ---------------------------------------------------------------

    string public name;
    string public symbol;
    uint8 public constant lpDecimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // ---------------------------------------------------------------
    //  Reentrancy Guard
    // ---------------------------------------------------------------

    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status = _NOT_ENTERED;

    // ---------------------------------------------------------------
    //  Accumulated Fees
    // ---------------------------------------------------------------

    /// @notice Accumulated fees per token (not yet collected).
    uint256[] public accumulatedFees;

    // ---------------------------------------------------------------
    //  Events
    // ---------------------------------------------------------------

    event Swap(
        address indexed sender,
        uint256 tokenInIndex,
        uint256 tokenOutIndex,
        uint256 amountIn,
        uint256 amountOut,
        uint256 feeAmount
    );

    event LiquidityAdded(
        address indexed provider,
        uint256[] amounts,
        uint256 lpMinted
    );

    event LiquidityRemoved(
        address indexed provider,
        uint256[] amounts,
        uint256 lpBurned
    );

    event FeesCollected(
        address indexed collector,
        uint256[] amounts
    );

    // LP token events
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    // ---------------------------------------------------------------
    //  Errors
    // ---------------------------------------------------------------

    error NotFactory();
    error AlreadyInitialized();
    error NotInitialized();
    error InvalidTokenCount();
    error InvalidConcentration();
    error InvalidFee();
    error ZeroAmount();
    error ZeroAddress();
    error DuplicateToken();
    error SameToken();
    error InvalidTokenIndex();
    error SlippageExceeded();
    error InsufficientLiquidity();
    error InsufficientBalance();
    error InsufficientAllowance();
    error TransferFailed();
    error ReentrantCall();
    error DeadlineExpired();
    error InvariantViolated();

    // ---------------------------------------------------------------
    //  Modifiers
    // ---------------------------------------------------------------

    modifier nonReentrant() {
        if (_status == _ENTERED) revert ReentrantCall();
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    modifier onlyFactory() {
        if (msg.sender != factory) revert NotFactory();
        _;
    }

    modifier whenInitialized() {
        if (!initialized) revert NotInitialized();
        _;
    }

    modifier checkDeadline(uint256 deadline) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        _;
    }

    // ---------------------------------------------------------------
    //  Constructor
    // ---------------------------------------------------------------

    constructor() {
        factory = msg.sender;
    }

    // ---------------------------------------------------------------
    //  Initialization (called by factory)
    // ---------------------------------------------------------------

    /**
     * @notice Initialize the pool with token list and parameters.
     *         Called once by the factory immediately after deployment.
     *
     * @param _tokens         Ordered array of token addresses.
     * @param _concentration  Superellipse power (2, 4, 8, 16, 32).
     * @param _swapFeeBps     Swap fee in basis points.
     * @param _feeCollector   Address that receives protocol fees.
     * @param _name           LP token name.
     * @param _symbol         LP token symbol.
     */
    function initialize(
        address[] calldata _tokens,
        uint8 _concentration,
        uint256 _swapFeeBps,
        address _feeCollector,
        string calldata _name,
        string calldata _symbol
    ) external onlyFactory {
        if (initialized) revert AlreadyInitialized();
        if (_tokens.length < MIN_TOKENS || _tokens.length > MAX_TOKENS) revert InvalidTokenCount();
        if (_concentration != 2 && _concentration != 4 && _concentration != 8 &&
            _concentration != 16 && _concentration != 32) revert InvalidConcentration();
        if (_swapFeeBps > MAX_FEE_BPS) revert InvalidFee();
        if (_feeCollector == address(0)) revert ZeroAddress();

        // Validate tokens: no zero address, no duplicates
        for (uint256 i = 0; i < _tokens.length; ++i) {
            if (_tokens[i] == address(0)) revert ZeroAddress();
            for (uint256 j = 0; j < i; ++j) {
                if (_tokens[i] == _tokens[j]) revert DuplicateToken();
            }
        }

        numTokens = _tokens.length;
        concentration = _concentration;
        swapFeeBps = _swapFeeBps;
        feeCollector = _feeCollector;
        name = _name;
        symbol = _symbol;

        // Initialize storage arrays
        for (uint256 i = 0; i < _tokens.length; ++i) {
            tokens.push(_tokens[i]);
            reserves.push(0);
            accumulatedFees.push(0);
        }

        initialized = true;
    }

    // ---------------------------------------------------------------
    //  Swap
    // ---------------------------------------------------------------

    /**
     * @notice Swap tokenIn for tokenOut through the pool.
     *
     * @param tokenInIndex   Index of input token in the pool's token array.
     * @param tokenOutIndex  Index of output token in the pool's token array.
     * @param amountIn       Amount of input token to swap.
     * @param minAmountOut   Minimum output amount (slippage protection).
     * @param deadline       Transaction deadline (block.timestamp).
     * @return amountOut     Actual output amount.
     */
    function swap(
        uint256 tokenInIndex,
        uint256 tokenOutIndex,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline
    ) external nonReentrant whenInitialized checkDeadline(deadline) returns (uint256 amountOut) {
        if (tokenInIndex >= numTokens) revert InvalidTokenIndex();
        if (tokenOutIndex >= numTokens) revert InvalidTokenIndex();
        if (tokenInIndex == tokenOutIndex) revert SameToken();
        if (amountIn == 0) revert ZeroAmount();

        // Apply swap fee
        uint256 feeAmount = (amountIn * swapFeeBps) / FEE_DENOMINATOR;
        uint256 amountInAfterFee = amountIn - feeAmount;

        // Compute normalized reserves
        uint256 n = numTokens;
        (uint256[] memory normalized, uint256 D) =
            OrbitalMath.normalizeReserves(reserves, n);

        // Normalize the input amount
        uint256 dxNorm = (n * amountInAfterFee * WAD) / D;

        // Compute output in normalized terms
        uint256 dyNorm = OrbitalMath.computeSwapOutput(
            normalized,
            tokenInIndex,
            tokenOutIndex,
            dxNorm,
            concentration
        );

        // Convert back to raw token amount
        amountOut = (dyNorm * D) / (n * WAD);

        // Slippage check
        if (amountOut < minAmountOut) revert SlippageExceeded();
        if (amountOut > reserves[tokenOutIndex]) revert InsufficientLiquidity();

        // Transfer input tokens from caller to pool
        _safeTransferFrom(tokens[tokenInIndex], msg.sender, address(this), amountIn);

        // Update reserves
        reserves[tokenInIndex] += amountInAfterFee;
        reserves[tokenOutIndex] -= amountOut;

        // Accumulate fees
        accumulatedFees[tokenInIndex] += feeAmount;

        // Transfer output tokens to caller
        _safeTransfer(tokens[tokenOutIndex], msg.sender, amountOut);

        emit Swap(msg.sender, tokenInIndex, tokenOutIndex, amountIn, amountOut, feeAmount);
    }

    // ---------------------------------------------------------------
    //  Add Liquidity
    // ---------------------------------------------------------------

    /**
     * @notice Add liquidity to the pool. For the first deposit, any ratio
     *         is accepted. Subsequent deposits must be proportional to
     *         current reserves.
     *
     * @param amounts       Array of token amounts to deposit (one per token).
     * @param minLiquidity  Minimum LP tokens to receive.
     * @param deadline      Transaction deadline.
     * @return liquidity    LP tokens minted.
     */
    function addLiquidity(
        uint256[] calldata amounts,
        uint256 minLiquidity,
        uint256 deadline
    ) external nonReentrant whenInitialized checkDeadline(deadline) returns (uint256 liquidity) {
        uint256 n = numTokens;
        if (amounts.length != n) revert InvalidTokenCount();

        // Verify all amounts are non-zero
        for (uint256 i = 0; i < n; ++i) {
            if (amounts[i] == 0) revert ZeroAmount();
        }

        if (totalSupply == 0) {
            // First deposit: accept any ratio
            // Transfer tokens in
            for (uint256 i = 0; i < n; ++i) {
                _safeTransferFrom(tokens[i], msg.sender, address(this), amounts[i]);
                reserves[i] = amounts[i];
            }

            // Compute initial invariant
            (uint256[] memory normalized,) =
                OrbitalMath.normalizeReserves(reserves, n);
            uint256 K = OrbitalMath.computeInvariant(normalized, concentration);

            // LP = K^(1/p) - MINIMUM_LIQUIDITY (burned to zero address)
            liquidity = OrbitalMath.wadRoot(K, concentration);
            if (liquidity <= MINIMUM_LIQUIDITY) revert InsufficientLiquidity();
            liquidity -= MINIMUM_LIQUIDITY;

            // Burn minimum liquidity to prevent share inflation attacks
            _mint(address(0), MINIMUM_LIQUIDITY);
        } else {
            // Subsequent deposits: must be proportional to current reserves
            // Find the minimum ratio across all tokens
            uint256 minRatio = type(uint256).max;
            for (uint256 i = 0; i < n; ++i) {
                uint256 ratio = (amounts[i] * WAD) / reserves[i];
                if (ratio < minRatio) minRatio = ratio;
            }

            // Transfer tokens proportionally and add to reserves
            for (uint256 i = 0; i < n; ++i) {
                uint256 actual = (reserves[i] * minRatio) / WAD;
                if (actual == 0) revert ZeroAmount();
                _safeTransferFrom(tokens[i], msg.sender, address(this), actual);
                reserves[i] += actual;
            }

            // Mint LP proportional to the ratio of increase
            liquidity = (totalSupply * minRatio) / WAD;
        }

        if (liquidity < minLiquidity) revert InsufficientLiquidity();
        _mint(msg.sender, liquidity);

        uint256[] memory depositedAmounts = new uint256[](n);
        for (uint256 i = 0; i < n; ++i) {
            depositedAmounts[i] = amounts[i];
        }
        emit LiquidityAdded(msg.sender, depositedAmounts, liquidity);
    }

    // ---------------------------------------------------------------
    //  Remove Liquidity
    // ---------------------------------------------------------------

    /**
     * @notice Remove liquidity from the pool, receiving proportional
     *         amounts of all tokens.
     *
     * @param liquidity   Number of LP tokens to burn.
     * @param minAmounts  Minimum amounts of each token to receive.
     * @param deadline    Transaction deadline.
     * @return amounts    Actual amounts of each token returned.
     */
    function removeLiquidity(
        uint256 liquidity,
        uint256[] calldata minAmounts,
        uint256 deadline
    ) external nonReentrant whenInitialized checkDeadline(deadline) returns (uint256[] memory amounts) {
        uint256 n = numTokens;
        if (minAmounts.length != n) revert InvalidTokenCount();
        if (liquidity == 0) revert ZeroAmount();
        if (balanceOf[msg.sender] < liquidity) revert InsufficientBalance();

        amounts = OrbitalMath.computeLiquidityBurn(reserves, liquidity, totalSupply);

        // Check minimums
        for (uint256 i = 0; i < n; ++i) {
            if (amounts[i] < minAmounts[i]) revert SlippageExceeded();
            if (amounts[i] == 0) revert ZeroAmount();
        }

        // Burn LP tokens
        _burn(msg.sender, liquidity);

        // Update reserves and transfer tokens out
        for (uint256 i = 0; i < n; ++i) {
            reserves[i] -= amounts[i];
            _safeTransfer(tokens[i], msg.sender, amounts[i]);
        }

        emit LiquidityRemoved(msg.sender, amounts, liquidity);
    }

    // ---------------------------------------------------------------
    //  View Functions
    // ---------------------------------------------------------------

    /// @notice Get the current reserves array.
    function getReserves() external view returns (uint256[] memory) {
        return reserves;
    }

    /// @notice Get the token addresses array.
    function getTokens() external view returns (address[] memory) {
        return tokens;
    }

    /// @notice Get the token index for a given token address.
    ///         Returns numTokens if not found.
    function getTokenIndex(address token) external view returns (uint256) {
        for (uint256 i = 0; i < numTokens; ++i) {
            if (tokens[i] == token) return i;
        }
        return numTokens; // Not found sentinel
    }

    /// @notice Get the accumulated fees array.
    function getAccumulatedFees() external view returns (uint256[] memory) {
        return accumulatedFees;
    }

    /**
     * @notice Get the expected output amount for a swap (view function).
     *
     * @param tokenInIndex  Index of input token.
     * @param tokenOutIndex Index of output token.
     * @param amountIn      Input amount.
     * @return amountOut    Expected output amount after fees.
     * @return feeAmount    Fee deducted from input.
     */
    function getAmountOut(
        uint256 tokenInIndex,
        uint256 tokenOutIndex,
        uint256 amountIn
    ) external view returns (uint256 amountOut, uint256 feeAmount) {
        if (tokenInIndex >= numTokens || tokenOutIndex >= numTokens) revert InvalidTokenIndex();
        if (tokenInIndex == tokenOutIndex) revert SameToken();
        if (amountIn == 0) revert ZeroAmount();

        feeAmount = (amountIn * swapFeeBps) / FEE_DENOMINATOR;
        uint256 amountInAfterFee = amountIn - feeAmount;

        uint256 n = numTokens;
        (uint256[] memory normalized, uint256 D) =
            OrbitalMath.normalizeReserves(reserves, n);

        uint256 dxNorm = (n * amountInAfterFee * WAD) / D;

        uint256 dyNorm = OrbitalMath.computeSwapOutput(
            normalized,
            tokenInIndex,
            tokenOutIndex,
            dxNorm,
            concentration
        );

        amountOut = (dyNorm * D) / (n * WAD);
    }

    /// @notice Get the current invariant K.
    function getInvariant() external view returns (uint256 K) {
        if (!initialized || totalSupply == 0) return 0;
        uint256 n = numTokens;
        (uint256[] memory normalized,) =
            OrbitalMath.normalizeReserves(reserves, n);
        K = OrbitalMath.computeInvariant(normalized, concentration);
    }

    /**
     * @notice Get the current spot price of tokenB in terms of tokenA.
     *         Spot price is the marginal exchange rate for an infinitesimal trade.
     *
     *         For the superellipse: price_A/B = (r_A / r_B)^(p-1)
     *
     * @param tokenAIndex Index of the numeraire token.
     * @param tokenBIndex Index of the priced token.
     * @return price WAD-scaled price (amount of tokenA per tokenB).
     */
    function getSpotPrice(
        uint256 tokenAIndex,
        uint256 tokenBIndex
    ) external view returns (uint256 price) {
        if (tokenAIndex >= numTokens || tokenBIndex >= numTokens) revert InvalidTokenIndex();
        if (reserves[tokenAIndex] == 0 || reserves[tokenBIndex] == 0) return 0;

        // Spot price = (rB / rA)^(p-1) for the superellipse
        // We compute this as rB^(p-1) / rA^(p-1)
        // In WAD: wadPow(rB_norm, p) / wadPow(rA_norm, p) * rA_norm / rB_norm
        // Simplified: (rB/rA)^(p-1) = rB^p / rA^p * rA / rB

        uint256 n = numTokens;
        (uint256[] memory normalized,) =
            OrbitalMath.normalizeReserves(reserves, n);

        uint256 xA = normalized[tokenAIndex];
        uint256 xB = normalized[tokenBIndex];

        if (concentration == 2) {
            // Price = xB / xA
            price = OrbitalMath.wadDiv(xB, xA);
        } else {
            // Price = (xB / xA)^(p-1)
            // Compute as xB^p / xA^p * xA / xB
            uint256 powA = OrbitalMath.wadPow(xA, concentration);
            uint256 powB = OrbitalMath.wadPow(xB, concentration);
            if (powA == 0) return 0;
            price = OrbitalMath.wadMul(
                OrbitalMath.wadDiv(powB, powA),
                OrbitalMath.wadDiv(xA, xB)
            );
        }
    }

    // ---------------------------------------------------------------
    //  Fee Collection
    // ---------------------------------------------------------------

    /// @notice Collect accumulated fees. Only callable by feeCollector.
    function collectFees() external nonReentrant {
        if (msg.sender != feeCollector) revert NotFactory();

        uint256 n = numTokens;
        uint256[] memory collected = new uint256[](n);

        for (uint256 i = 0; i < n; ++i) {
            uint256 amount = accumulatedFees[i];
            if (amount > 0) {
                accumulatedFees[i] = 0;
                collected[i] = amount;
                _safeTransfer(tokens[i], feeCollector, amount);
            }
        }

        emit FeesCollected(feeCollector, collected);
    }

    // ---------------------------------------------------------------
    //  LP Token (ERC-20 inline)
    // ---------------------------------------------------------------

    function transfer(address to, uint256 amount) external returns (bool) {
        if (to == address(0)) revert ZeroAddress();
        if (balanceOf[msg.sender] < amount) revert InsufficientBalance();
        unchecked { balanceOf[msg.sender] -= amount; }
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        if (spender == address(0)) revert ZeroAddress();
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (to == address(0)) revert ZeroAddress();
        if (balanceOf[from] < amount) revert InsufficientBalance();
        uint256 current = allowance[from][msg.sender];
        if (current != type(uint256).max) {
            if (current < amount) revert InsufficientAllowance();
            unchecked { allowance[from][msg.sender] = current - amount; }
        }
        unchecked { balanceOf[from] -= amount; }
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    // ---------------------------------------------------------------
    //  Internal: LP mint/burn
    // ---------------------------------------------------------------

    function _mint(address to, uint256 amount) private {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function _burn(address from, uint256 amount) private {
        if (balanceOf[from] < amount) revert InsufficientBalance();
        unchecked { balanceOf[from] -= amount; }
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }

    // ---------------------------------------------------------------
    //  Internal: Safe ERC-20 transfers
    // ---------------------------------------------------------------

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
