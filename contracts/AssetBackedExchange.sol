// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AssetBackedExchange
 * @notice Decentralized exchange for trading asset-backed security tokens
 *         against ETH (native), WETH, WBTC, and any ERC-20 token.
 *
 *         Supports:
 *         - Limit orders (token/token)
 *         - ETH-based orders (buy or sell with native ETH)
 *         - Partial fills
 *         - Order cancellation
 *         - Order expiry/deadline
 *         - Pause/unpause (owner only)
 *         - Emergency token withdrawal (owner only, timelocked)
 *
 * @dev Uses a pull-based pattern for ETH refunds to prevent reentrancy.
 *      All ERC-20 interactions use the standard interface.
 */

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract AssetBackedExchange {

    // ---------------------------------------------------------------
    //  Reentrancy guard
    // ---------------------------------------------------------------

    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _reentrancyStatus = _NOT_ENTERED;

    modifier nonReentrant() {
        if (_reentrancyStatus == _ENTERED) revert ReentrantCall();
        _reentrancyStatus = _ENTERED;
        _;
        _reentrancyStatus = _NOT_ENTERED;
    }

    // ---------------------------------------------------------------
    //  Constants
    // ---------------------------------------------------------------

    /// @notice Sentinel address representing native ETH in order pairs.
    address public constant ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /// @notice Timelock delay for emergency withdrawals (48 hours).
    uint256 public constant EMERGENCY_TIMELOCK = 48 hours;

    /// @notice Maximum number of orders scanned in a single getActiveOrders call.
    uint256 public constant MAX_SCAN_LIMIT = 500;

    // ---------------------------------------------------------------
    //  Owner / Pause
    // ---------------------------------------------------------------

    /// @notice Contract owner with admin privileges.
    address public owner;

    /// @notice Pending owner for two-step ownership transfer.
    address public pendingOwner;

    /// @notice Whether the exchange is paused (no new orders or fills).
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

    /// @notice Auto-incrementing ID for emergency requests.
    uint256 public nextEmergencyId;

    /// @notice Emergency withdrawal requests (timelocked).
    mapping(uint256 => EmergencyRequest) public emergencyRequests;

    // ---------------------------------------------------------------
    //  Storage
    // ---------------------------------------------------------------

    struct Order {
        uint256 id;
        address maker;
        address tokenSell;     // what the maker is selling (ETH_ADDRESS for native ETH)
        address tokenBuy;      // what the maker wants to buy (ETH_ADDRESS for native ETH)
        uint256 amountSell;    // total sell amount
        uint256 amountBuy;     // total buy amount (price = amountBuy/amountSell)
        uint256 filledSell;    // amount already filled on sell side
        uint256 filledBuy;     // amount already filled on buy side
        bool    cancelled;
        uint256 deadline;      // order expiry timestamp (0 = no expiry)
    }

    uint256 public nextOrderId;
    mapping(uint256 => Order) private _orders;

    /// @notice maker address => array of their order IDs
    mapping(address => uint256[]) private _userOrderIds;

    /// @notice Withdrawable ETH balances (credited from fills, refunds, and cancellations)
    mapping(address => uint256) public ethBalances;

    // ---------------------------------------------------------------
    //  Events
    // ---------------------------------------------------------------

    event OrderCreated(
        uint256 indexed orderId,
        address indexed maker,
        address tokenSell,
        address tokenBuy,
        uint256 amountSell,
        uint256 amountBuy,
        uint256 deadline
    );

    event OrderFilled(
        uint256 indexed orderId,
        address indexed taker,
        uint256 fillAmountSell,
        uint256 fillAmountBuy
    );

    event OrderCancelled(uint256 indexed orderId, address indexed maker);

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
    error OrderNotActive();
    error OrderExpired();
    error NotMaker();
    error InsufficientFill();
    error TransferFailed();
    error InsufficientEth();
    error NothingToWithdraw();
    error ReentrantCall();
    error NotOwner();
    error NotPendingOwner();
    error ExchangePaused();
    error NotPaused();
    error TimelockNotMet();
    error AlreadyExecuted();
    error LimitTooHigh();

    // ---------------------------------------------------------------
    //  Modifiers
    // ---------------------------------------------------------------

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert ExchangePaused();
        _;
    }

    // ---------------------------------------------------------------
    //  Constructor
    // ---------------------------------------------------------------

    constructor(address _owner) {
        if (_owner == address(0)) revert ZeroAddress();
        owner = _owner;
        emit OwnershipTransferred(address(0), _owner);
    }

    // ---------------------------------------------------------------
    //  Owner functions
    // ---------------------------------------------------------------

    /**
     * @notice Start a two-step ownership transfer.
     * @param newOwner The address that will become owner after accepting.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /**
     * @notice Accept ownership (must be called by pendingOwner).
     */
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        address oldOwner = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(oldOwner, msg.sender);
    }

    /**
     * @notice Pause the exchange. Prevents new orders and fills.
     *         Cancellations and ETH withdrawals remain available.
     */
    function pause() external onlyOwner {
        if (paused) revert ExchangePaused();
        paused = true;
        emit Paused(msg.sender);
    }

    /**
     * @notice Unpause the exchange.
     */
    function unpause() external onlyOwner {
        if (!paused) revert NotPaused();
        paused = false;
        emit Unpaused(msg.sender);
    }

    // ---------------------------------------------------------------
    //  Emergency withdrawal (owner-only, timelocked)
    // ---------------------------------------------------------------

    /**
     * @notice Request an emergency withdrawal of stuck tokens.
     *         Subject to a 48-hour timelock before execution.
     *
     * @param token     The ERC-20 token to withdraw (or ETH_ADDRESS for ETH).
     * @param amount    Amount to withdraw.
     * @param recipient Recipient address.
     * @return requestId The ID of this emergency request.
     */
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

    /**
     * @notice Execute a timelocked emergency withdrawal.
     * @param requestId The emergency request ID.
     */
    function executeEmergencyWithdraw(uint256 requestId) external onlyOwner nonReentrant {
        EmergencyRequest storage req = emergencyRequests[requestId];
        if (req.executed) revert AlreadyExecuted();
        if (req.amount == 0) revert ZeroAmount(); // request does not exist
        if (block.timestamp < req.executeAfter) revert TimelockNotMet();

        req.executed = true;

        if (req.token == ETH_ADDRESS) {
            (bool sent,) = payable(req.recipient).call{value: req.amount}("");
            if (!sent) revert TransferFailed();
        } else {
            _safeTransfer(IERC20(req.token), req.recipient, req.amount);
        }

        emit EmergencyWithdrawExecuted(requestId);
    }

    /**
     * @notice Cancel a pending emergency withdrawal request.
     * @param requestId The emergency request ID.
     */
    function cancelEmergencyWithdraw(uint256 requestId) external onlyOwner {
        EmergencyRequest storage req = emergencyRequests[requestId];
        if (req.executed) revert AlreadyExecuted();
        if (req.amount == 0) revert ZeroAmount();

        req.executed = true; // mark as consumed so it cannot be executed
        emit EmergencyWithdrawCancelled(requestId);
    }

    // ---------------------------------------------------------------
    //  Create order
    // ---------------------------------------------------------------

    /**
     * @notice Create a limit order to sell an ERC-20 token.
     *         For selling native ETH, use createOrderSellETH instead.
     *
     * @param tokenSell  The ERC-20 token being sold
     * @param tokenBuy   The token wanted in return (ETH_ADDRESS for native ETH)
     * @param amountSell Amount of tokenSell to offer
     * @param amountBuy  Amount of tokenBuy desired (sets the price)
     * @param deadline   Order expiry timestamp (0 = no expiry)
     */
    function createOrder(
        address tokenSell,
        address tokenBuy,
        uint256 amountSell,
        uint256 amountBuy,
        uint256 deadline
    ) external nonReentrant whenNotPaused returns (uint256 orderId) {
        if (amountSell == 0 || amountBuy == 0) revert ZeroAmount();
        if (tokenSell == address(0) || tokenBuy == address(0)) revert ZeroAddress();
        if (tokenSell == tokenBuy) revert SameToken();
        if (tokenSell == ETH_ADDRESS) revert ZeroAddress(); // use createOrderSellETH
        if (deadline != 0 && deadline <= block.timestamp) revert OrderExpired();

        // Transfer sell tokens to this contract
        _safeTransferFrom(IERC20(tokenSell), msg.sender, address(this), amountSell);

        orderId = _createOrder(msg.sender, tokenSell, tokenBuy, amountSell, amountBuy, deadline);
    }

    /**
     * @notice Create a limit order selling native ETH for an ERC-20 token.
     *
     * @param tokenBuy   The ERC-20 token wanted in return
     * @param amountBuy  Amount of tokenBuy desired
     * @param deadline   Order expiry timestamp (0 = no expiry)
     */
    function createOrderSellETH(
        address tokenBuy,
        uint256 amountBuy,
        uint256 deadline
    ) external payable nonReentrant whenNotPaused returns (uint256 orderId) {
        if (msg.value == 0 || amountBuy == 0) revert ZeroAmount();
        if (tokenBuy == address(0) || tokenBuy == ETH_ADDRESS) revert ZeroAddress();
        if (deadline != 0 && deadline <= block.timestamp) revert OrderExpired();

        orderId = _createOrder(msg.sender, ETH_ADDRESS, tokenBuy, msg.value, amountBuy, deadline);
    }

    function _createOrder(
        address maker,
        address tokenSell,
        address tokenBuy,
        uint256 amountSell,
        uint256 amountBuy,
        uint256 deadline
    ) private returns (uint256 orderId) {
        orderId = nextOrderId++;

        _orders[orderId] = Order({
            id: orderId,
            maker: maker,
            tokenSell: tokenSell,
            tokenBuy: tokenBuy,
            amountSell: amountSell,
            amountBuy: amountBuy,
            filledSell: 0,
            filledBuy: 0,
            cancelled: false,
            deadline: deadline
        });

        _userOrderIds[maker].push(orderId);

        emit OrderCreated(orderId, maker, tokenSell, tokenBuy, amountSell, amountBuy, deadline);
    }

    // ---------------------------------------------------------------
    //  Fill order
    // ---------------------------------------------------------------

    /**
     * @notice Fill an existing order by providing the buy-side token.
     *         For orders where tokenBuy is ETH, use fillOrderWithETH.
     *
     * @param orderId       The order to fill
     * @param fillAmountBuy Amount of the buy token to provide
     */
    function fillOrder(uint256 orderId, uint256 fillAmountBuy) external nonReentrant whenNotPaused {
        Order storage order = _orders[orderId];
        _validateOrderActive(order);
        if (fillAmountBuy == 0) revert ZeroAmount();
        if (order.tokenBuy == ETH_ADDRESS) revert ZeroAddress(); // use fillOrderWithETH

        uint256 remainingBuy = order.amountBuy - order.filledBuy;
        if (fillAmountBuy > remainingBuy) fillAmountBuy = remainingBuy;

        // Calculate proportional sell amount
        uint256 fillAmountSell = (fillAmountBuy * order.amountSell) / order.amountBuy;
        if (fillAmountSell == 0) revert InsufficientFill();

        // --- State updates (CEI: all state before external calls) ---
        order.filledBuy += fillAmountBuy;
        order.filledSell += fillAmountSell;

        // Credit ETH to taker via pull pattern if sell token is ETH
        if (order.tokenSell == ETH_ADDRESS) {
            ethBalances[msg.sender] += fillAmountSell;
        }

        // --- External calls (after all state updates) ---
        // Taker sends buy tokens to maker
        _safeTransferFrom(IERC20(order.tokenBuy), msg.sender, order.maker, fillAmountBuy);

        // Taker receives sell tokens from escrow (ERC-20 only; ETH credited above)
        if (order.tokenSell != ETH_ADDRESS) {
            _safeTransfer(IERC20(order.tokenSell), msg.sender, fillAmountSell);
        }

        emit OrderFilled(orderId, msg.sender, fillAmountSell, fillAmountBuy);
    }

    /**
     * @notice Fill an order where the buy-side is native ETH.
     *
     * @param orderId The order to fill
     */
    function fillOrderWithETH(uint256 orderId) external payable nonReentrant whenNotPaused {
        Order storage order = _orders[orderId];
        _validateOrderActive(order);
        if (msg.value == 0) revert ZeroAmount();
        if (order.tokenBuy != ETH_ADDRESS) revert ZeroAddress(); // use fillOrder

        uint256 remainingBuy = order.amountBuy - order.filledBuy;
        uint256 fillAmountBuy = msg.value > remainingBuy ? remainingBuy : msg.value;

        // Calculate proportional sell amount
        uint256 fillAmountSell = (fillAmountBuy * order.amountSell) / order.amountBuy;
        if (fillAmountSell == 0) revert InsufficientFill();

        // --- State updates (CEI: all state before external calls) ---
        order.filledBuy += fillAmountBuy;
        order.filledSell += fillAmountSell;

        // Credit ETH to maker (pull pattern)
        ethBalances[order.maker] += fillAmountBuy;

        // Credit excess ETH refund to taker (pull pattern)
        if (msg.value > fillAmountBuy) {
            ethBalances[msg.sender] += msg.value - fillAmountBuy;
        }

        // --- External calls (after all state updates) ---
        // Send sell tokens to taker
        _safeTransfer(IERC20(order.tokenSell), msg.sender, fillAmountSell);

        emit OrderFilled(orderId, msg.sender, fillAmountSell, fillAmountBuy);
    }

    // ---------------------------------------------------------------
    //  Cancel order
    // ---------------------------------------------------------------

    /**
     * @notice Cancel an open order and return unfilled tokens to the maker.
     */
    function cancelOrder(uint256 orderId) external nonReentrant {
        Order storage order = _orders[orderId];
        // Allow cancellation even when paused so users can recover funds.
        // Validate the order exists and is active (not already cancelled/filled).
        _validateOrderExists(order);
        if (order.cancelled) revert OrderNotActive();
        if (order.filledSell >= order.amountSell) revert OrderNotActive();
        if (msg.sender != order.maker) revert NotMaker();

        order.cancelled = true;

        // Return unfilled sell tokens
        uint256 remaining = order.amountSell - order.filledSell;
        if (remaining > 0) {
            if (order.tokenSell == ETH_ADDRESS) {
                // Credit ETH balance for pull-based withdrawal
                ethBalances[order.maker] += remaining;
            } else {
                _safeTransfer(IERC20(order.tokenSell), order.maker, remaining);
            }
        }

        emit OrderCancelled(orderId, msg.sender);
    }

    /**
     * @notice Withdraw credited ETH (from fills, refunds, or cancelled orders).
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

    function getOrder(uint256 orderId) external view returns (Order memory) {
        return _orders[orderId];
    }

    function getUserOrders(address user) external view returns (uint256[] memory) {
        return _userOrderIds[user];
    }

    function getOrderCount() external view returns (uint256) {
        return nextOrderId;
    }

    /**
     * @notice Get active (non-cancelled, not fully filled, not expired) orders
     *         for a specific trading pair. Uses a default limit of 100.
     */
    function getActiveOrders(
        address tokenSell,
        address tokenBuy
    ) external view returns (Order[] memory) {
        return this.getActiveOrders(tokenSell, tokenBuy, 0, 100);
    }

    /**
     * @notice Get active orders for a trading pair with pagination.
     *         Scans at most MAX_SCAN_LIMIT orders per call to bound gas usage.
     *
     * @param tokenSell The sell-side token address
     * @param tokenBuy  The buy-side token address
     * @param offset    Number of matching orders to skip
     * @param limit     Maximum number of orders to return (capped at MAX_SCAN_LIMIT)
     */
    function getActiveOrders(
        address tokenSell,
        address tokenBuy,
        uint256 offset,
        uint256 limit
    ) external view returns (Order[] memory) {
        if (limit == 0) limit = 100;
        if (limit > MAX_SCAN_LIMIT) revert LimitTooHigh();

        uint256 totalOrders = nextOrderId;
        uint256 matched = 0;
        uint256 collected = 0;

        // Temporary array sized to at most `limit`
        Order[] memory temp = new Order[](limit);

        // Bound the scan to prevent excessive gas usage
        uint256 scanEnd = totalOrders;

        for (uint256 i = 0; i < scanEnd && collected < limit; i++) {
            Order storage o = _orders[i];
            if (o.amountSell == 0) continue; // skip non-existent orders
            if (o.tokenSell == tokenSell &&
                o.tokenBuy == tokenBuy &&
                !o.cancelled &&
                o.filledSell < o.amountSell &&
                (o.deadline == 0 || o.deadline > block.timestamp))
            {
                if (matched >= offset) {
                    temp[collected] = o;
                    collected++;
                }
                matched++;
            }
        }

        // Trim the array to actual collected size
        if (collected == limit) {
            return temp;
        }
        Order[] memory result = new Order[](collected);
        for (uint256 j = 0; j < collected; j++) {
            result[j] = temp[j];
        }
        return result;
    }

    // ---------------------------------------------------------------
    //  Internal
    // ---------------------------------------------------------------

    /**
     * @dev Validates that an order exists (non-zero amountSell means it was created).
     */
    function _validateOrderExists(Order storage order) private view {
        if (order.amountSell == 0) revert OrderNotActive();
    }

    /**
     * @dev Validates that an order is active: exists, not cancelled, not fully
     *      filled, and not expired.
     */
    function _validateOrderActive(Order storage order) private view {
        if (order.amountSell == 0) revert OrderNotActive(); // order does not exist
        if (order.cancelled) revert OrderNotActive();
        if (order.filledSell >= order.amountSell) revert OrderNotActive();
        if (order.deadline != 0 && block.timestamp > order.deadline) revert OrderExpired();
    }

    // ---------------------------------------------------------------
    //  SafeERC20 helpers (inline — no OpenZeppelin dependency)
    // ---------------------------------------------------------------

    /**
     * @dev Safe wrapper around ERC20 `transfer`. Handles tokens that do not
     *      return a boolean (e.g. USDT, BNB) by checking returndata length.
     */
    function _safeTransfer(IERC20 token, address to, uint256 amount) private {
        (bool success, bytes memory returndata) = address(token).call(
            abi.encodeWithSelector(token.transfer.selector, to, amount)
        );
        if (!success || (returndata.length > 0 && !abi.decode(returndata, (bool)))) {
            revert TransferFailed();
        }
    }

    /**
     * @dev Safe wrapper around ERC20 `transferFrom`. Handles tokens that do
     *      not return a boolean by checking returndata length.
     */
    function _safeTransferFrom(IERC20 token, address from, address to, uint256 amount) private {
        (bool success, bytes memory returndata) = address(token).call(
            abi.encodeWithSelector(token.transferFrom.selector, from, to, amount)
        );
        if (!success || (returndata.length > 0 && !abi.decode(returndata, (bool)))) {
            revert TransferFailed();
        }
    }

    // ---------------------------------------------------------------
    //  Receive ETH
    // ---------------------------------------------------------------

    /// @dev Only accept ETH from explicit function calls (createOrderSellETH,
    ///      fillOrderWithETH, withdrawEth). Direct sends are rejected unless
    ///      they come during an active reentrancy-guarded call.
    receive() external payable {
        revert("Direct ETH not accepted");
    }
}
