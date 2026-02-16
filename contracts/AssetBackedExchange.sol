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
    }

    uint256 public nextOrderId;
    mapping(uint256 => Order) private _orders;

    /// @notice maker address => array of their order IDs
    mapping(address => uint256[]) private _userOrderIds;

    /// @notice Refundable ETH balances (for cancelled ETH-sell orders)
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
        uint256 amountBuy
    );

    event OrderFilled(
        uint256 indexed orderId,
        address indexed taker,
        uint256 fillAmountSell,
        uint256 fillAmountBuy
    );

    event OrderCancelled(uint256 indexed orderId, address indexed maker);

    event EthWithdrawn(address indexed to, uint256 amount);

    // ---------------------------------------------------------------
    //  Errors
    // ---------------------------------------------------------------

    error ZeroAmount();
    error ZeroAddress();
    error SameToken();
    error OrderNotActive();
    error NotMaker();
    error InsufficientFill();
    error TransferFailed();
    error InsufficientEth();
    error NothingToWithdraw();
    error ReentrantCall();

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
     */
    function createOrder(
        address tokenSell,
        address tokenBuy,
        uint256 amountSell,
        uint256 amountBuy
    ) external returns (uint256 orderId) {
        if (amountSell == 0 || amountBuy == 0) revert ZeroAmount();
        if (tokenSell == address(0) || tokenBuy == address(0)) revert ZeroAddress();
        if (tokenSell == tokenBuy) revert SameToken();
        if (tokenSell == ETH_ADDRESS) revert ZeroAddress(); // use createOrderSellETH

        // Transfer sell tokens to this contract
        bool ok = IERC20(tokenSell).transferFrom(msg.sender, address(this), amountSell);
        if (!ok) revert TransferFailed();

        orderId = _createOrder(msg.sender, tokenSell, tokenBuy, amountSell, amountBuy);
    }

    /**
     * @notice Create a limit order selling native ETH for an ERC-20 token.
     *
     * @param tokenBuy   The ERC-20 token wanted in return
     * @param amountBuy  Amount of tokenBuy desired
     */
    function createOrderSellETH(
        address tokenBuy,
        uint256 amountBuy
    ) external payable returns (uint256 orderId) {
        if (msg.value == 0 || amountBuy == 0) revert ZeroAmount();
        if (tokenBuy == address(0) || tokenBuy == ETH_ADDRESS) revert ZeroAddress();

        orderId = _createOrder(msg.sender, ETH_ADDRESS, tokenBuy, msg.value, amountBuy);
    }

    function _createOrder(
        address maker,
        address tokenSell,
        address tokenBuy,
        uint256 amountSell,
        uint256 amountBuy
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
            cancelled: false
        });

        _userOrderIds[maker].push(orderId);

        emit OrderCreated(orderId, maker, tokenSell, tokenBuy, amountSell, amountBuy);
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
    function fillOrder(uint256 orderId, uint256 fillAmountBuy) external nonReentrant {
        Order storage order = _orders[orderId];
        _validateOrderActive(order);
        if (fillAmountBuy == 0) revert ZeroAmount();
        if (order.tokenBuy == ETH_ADDRESS) revert ZeroAddress(); // use fillOrderWithETH

        uint256 remainingBuy = order.amountBuy - order.filledBuy;
        if (fillAmountBuy > remainingBuy) fillAmountBuy = remainingBuy;

        // Calculate proportional sell amount
        uint256 fillAmountSell = (fillAmountBuy * order.amountSell) / order.amountBuy;
        if (fillAmountSell == 0) revert InsufficientFill();

        order.filledBuy += fillAmountBuy;
        order.filledSell += fillAmountSell;

        // Taker sends buy tokens to maker
        bool ok = IERC20(order.tokenBuy).transferFrom(msg.sender, order.maker, fillAmountBuy);
        if (!ok) revert TransferFailed();

        // Taker receives sell tokens from escrow
        if (order.tokenSell == ETH_ADDRESS) {
            (bool sent,) = payable(msg.sender).call{value: fillAmountSell}("");
            if (!sent) revert TransferFailed();
        } else {
            ok = IERC20(order.tokenSell).transfer(msg.sender, fillAmountSell);
            if (!ok) revert TransferFailed();
        }

        emit OrderFilled(orderId, msg.sender, fillAmountSell, fillAmountBuy);
    }

    /**
     * @notice Fill an order where the buy-side is native ETH.
     *
     * @param orderId The order to fill
     */
    function fillOrderWithETH(uint256 orderId) external payable nonReentrant {
        Order storage order = _orders[orderId];
        _validateOrderActive(order);
        if (msg.value == 0) revert ZeroAmount();
        if (order.tokenBuy != ETH_ADDRESS) revert ZeroAddress(); // use fillOrder

        uint256 remainingBuy = order.amountBuy - order.filledBuy;
        uint256 fillAmountBuy = msg.value > remainingBuy ? remainingBuy : msg.value;

        // Calculate proportional sell amount
        uint256 fillAmountSell = (fillAmountBuy * order.amountSell) / order.amountBuy;
        if (fillAmountSell == 0) revert InsufficientFill();

        order.filledBuy += fillAmountBuy;
        order.filledSell += fillAmountSell;

        // Send ETH to maker
        (bool sentToMaker,) = payable(order.maker).call{value: fillAmountBuy}("");
        if (!sentToMaker) revert TransferFailed();

        // Send sell tokens to taker
        bool ok = IERC20(order.tokenSell).transfer(msg.sender, fillAmountSell);
        if (!ok) revert TransferFailed();

        // Refund excess ETH to taker
        if (msg.value > fillAmountBuy) {
            (bool refund,) = payable(msg.sender).call{value: msg.value - fillAmountBuy}("");
            if (!refund) revert TransferFailed();
        }

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
        _validateOrderActive(order);
        if (msg.sender != order.maker) revert NotMaker();

        order.cancelled = true;

        // Return unfilled sell tokens
        uint256 remaining = order.amountSell - order.filledSell;
        if (remaining > 0) {
            if (order.tokenSell == ETH_ADDRESS) {
                // Credit ETH balance for pull-based withdrawal
                ethBalances[order.maker] += remaining;
            } else {
                bool ok = IERC20(order.tokenSell).transfer(order.maker, remaining);
                if (!ok) revert TransferFailed();
            }
        }

        emit OrderCancelled(orderId, msg.sender);
    }

    /**
     * @notice Withdraw credited ETH (from cancelled ETH-sell orders).
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
     * @notice Get all active (non-cancelled, not fully filled) orders
     *         for a specific trading pair.
     */
    function getActiveOrders(
        address tokenSell,
        address tokenBuy
    ) external view returns (Order[] memory) {
        // Count matching orders first
        uint256 count = 0;
        for (uint256 i = 0; i < nextOrderId; i++) {
            Order storage o = _orders[i];
            if (o.tokenSell == tokenSell &&
                o.tokenBuy == tokenBuy &&
                !o.cancelled &&
                o.filledSell < o.amountSell) {
                count++;
            }
        }

        // Build result array
        Order[] memory result = new Order[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < nextOrderId; i++) {
            Order storage o = _orders[i];
            if (o.tokenSell == tokenSell &&
                o.tokenBuy == tokenBuy &&
                !o.cancelled &&
                o.filledSell < o.amountSell) {
                result[idx++] = o;
            }
        }
        return result;
    }

    // ---------------------------------------------------------------
    //  Internal
    // ---------------------------------------------------------------

    function _validateOrderActive(Order storage order) private view {
        if (order.cancelled) revert OrderNotActive();
        if (order.filledSell >= order.amountSell) revert OrderNotActive();
    }

    // ---------------------------------------------------------------
    //  Receive ETH
    // ---------------------------------------------------------------

    receive() external payable {}
}
