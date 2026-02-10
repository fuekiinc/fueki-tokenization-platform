// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AssetExchange
 * @notice A fully on-chain limit-order book for ERC-20 token pairs.
 *
 *         Makers create orders specifying the tokens and amounts they wish to
 *         swap.  Takers fill orders by providing the requested buy-side tokens
 *         and receiving the sell-side tokens held in escrow.
 *
 *         Orders can be partially filled.  Makers may cancel any unfilled
 *         portion of their orders at any time.
 *
 * @dev    Implements a manual reentrancy guard (no external imports).
 *         All token transfers use a safe low-level call wrapper that reverts
 *         on failure, defending against non-compliant ERC-20 implementations.
 */
contract AssetExchange {

    // ---------------------------------------------------------------
    //  Reentrancy guard
    // ---------------------------------------------------------------

    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED     = 2;
    uint256 private _status = _NOT_ENTERED;

    modifier nonReentrant() {
        if (_status == _ENTERED) revert ReentrancyDetected();
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    // ---------------------------------------------------------------
    //  Data structures
    // ---------------------------------------------------------------

    struct Order {
        uint256 id;
        address maker;
        address tokenSell;
        address tokenBuy;
        uint256 amountSell;      // total sell-side amount committed
        uint256 amountBuy;       // total buy-side amount requested
        uint256 filledSell;      // cumulative sell-side tokens transferred out
        uint256 filledBuy;       // cumulative buy-side tokens received by maker
        bool    cancelled;
    }

    // ---------------------------------------------------------------
    //  Storage
    // ---------------------------------------------------------------

    /// @notice Auto-incrementing order counter. First valid id is 1.
    uint256 public nextOrderId = 1;

    /// @notice orderId => Order
    mapping(uint256 => Order) public orders;

    /// @notice Ordered pair key => array of order ids that belong to this pair.
    ///         The key is `keccak256(abi.encodePacked(tokenSell, tokenBuy))`.
    mapping(bytes32 => uint256[]) private _pairOrderIds;

    // ---------------------------------------------------------------
    //  Events
    // ---------------------------------------------------------------

    event OrderCreated(
        uint256 indexed orderId,
        address indexed maker,
        address         tokenSell,
        address         tokenBuy,
        uint256         amountSell,
        uint256         amountBuy
    );

    event OrderFilled(
        uint256 indexed orderId,
        address indexed taker,
        uint256         fillAmountSell,
        uint256         fillAmountBuy
    );

    event OrderCancelled(
        uint256 indexed orderId,
        address indexed maker
    );

    // ---------------------------------------------------------------
    //  Errors
    // ---------------------------------------------------------------

    error ReentrancyDetected();
    error ZeroAddress();
    error ZeroAmount();
    error SameToken();
    error OrderDoesNotExist();
    error OrderAlreadyCancelled();
    error OrderFullyFilled();
    error NotOrderMaker();
    error FillAmountTooLarge();
    error TransferFailed();

    // ---------------------------------------------------------------
    //  External: create order
    // ---------------------------------------------------------------

    /**
     * @notice Create a new limit order.
     *
     *         The maker commits `amountSell` of `tokenSell` (transferred into
     *         escrow immediately) and requests `amountBuy` of `tokenBuy` in
     *         return.
     *
     * @param tokenSell  Address of the ERC-20 being sold.
     * @param tokenBuy   Address of the ERC-20 being bought.
     * @param amountSell Total sell-side amount to escrow.
     * @param amountBuy  Total buy-side amount desired.
     *
     * @return orderId   The id of the newly created order.
     */
    function createOrder(
        address tokenSell,
        address tokenBuy,
        uint256 amountSell,
        uint256 amountBuy
    ) external nonReentrant returns (uint256 orderId) {
        if (tokenSell == address(0) || tokenBuy == address(0)) revert ZeroAddress();
        if (tokenSell == tokenBuy) revert SameToken();
        if (amountSell == 0 || amountBuy == 0) revert ZeroAmount();

        orderId = nextOrderId++;

        orders[orderId] = Order({
            id:         orderId,
            maker:      msg.sender,
            tokenSell:  tokenSell,
            tokenBuy:   tokenBuy,
            amountSell: amountSell,
            amountBuy:  amountBuy,
            filledSell: 0,
            filledBuy:  0,
            cancelled:  false
        });

        bytes32 pairKey = _pairKey(tokenSell, tokenBuy);
        _pairOrderIds[pairKey].push(orderId);

        // Transfer sell tokens from maker into this contract (escrow).
        _safeTransferFrom(tokenSell, msg.sender, address(this), amountSell);

        emit OrderCreated(orderId, msg.sender, tokenSell, tokenBuy, amountSell, amountBuy);
    }

    // ---------------------------------------------------------------
    //  External: fill order
    // ---------------------------------------------------------------

    /**
     * @notice Fill (partially or fully) an existing order.
     *
     *         The taker sends `fillAmountBuy` of the order's `tokenBuy` to the
     *         maker.  In return the taker receives the proportional amount of
     *         the order's `tokenSell` from escrow.
     *
     *         The proportional sell amount is:
     *             fillAmountSell = fillAmountBuy * amountSell / amountBuy
     *
     * @param orderId      The order to fill.
     * @param fillAmountBuy Amount of tokenBuy the taker is providing.
     */
    function fillOrder(
        uint256 orderId,
        uint256 fillAmountBuy
    ) external nonReentrant {
        Order storage order = orders[orderId];
        if (order.maker == address(0)) revert OrderDoesNotExist();
        if (order.cancelled) revert OrderAlreadyCancelled();
        if (fillAmountBuy == 0) revert ZeroAmount();

        uint256 remainingBuy = order.amountBuy - order.filledBuy;
        if (remainingBuy == 0) revert OrderFullyFilled();
        if (fillAmountBuy > remainingBuy) revert FillAmountTooLarge();

        // Calculate the proportional sell amount.
        // Using full-precision multiplication then division to minimize rounding.
        uint256 fillAmountSell = (fillAmountBuy * order.amountSell) / order.amountBuy;
        if (fillAmountSell == 0) revert ZeroAmount();

        // Update state before external calls (checks-effects-interactions).
        order.filledBuy  += fillAmountBuy;
        order.filledSell += fillAmountSell;

        // Taker sends buy-side tokens to the maker.
        _safeTransferFrom(order.tokenBuy, msg.sender, order.maker, fillAmountBuy);

        // Contract sends escrowed sell-side tokens to the taker.
        _safeTransfer(order.tokenSell, msg.sender, fillAmountSell);

        emit OrderFilled(orderId, msg.sender, fillAmountSell, fillAmountBuy);
    }

    // ---------------------------------------------------------------
    //  External: cancel order
    // ---------------------------------------------------------------

    /**
     * @notice Cancel an open order. Only the original maker may cancel.
     *         Any un-filled sell-side tokens are returned from escrow to
     *         the maker.
     *
     * @param orderId The order to cancel.
     */
    function cancelOrder(uint256 orderId) external nonReentrant {
        Order storage order = orders[orderId];
        if (order.maker == address(0)) revert OrderDoesNotExist();
        if (order.cancelled) revert OrderAlreadyCancelled();
        if (order.maker != msg.sender) revert NotOrderMaker();

        order.cancelled = true;

        // Refund un-filled sell tokens.
        uint256 remaining = order.amountSell - order.filledSell;
        if (remaining > 0) {
            _safeTransfer(order.tokenSell, msg.sender, remaining);
        }

        emit OrderCancelled(orderId, msg.sender);
    }

    // ---------------------------------------------------------------
    //  View: order queries
    // ---------------------------------------------------------------

    /**
     * @notice Return all *active* (not cancelled, not fully filled) order ids
     *         for the directed pair (tokenSell => tokenBuy).
     *
     * @param tokenSell Sell-side token address.
     * @param tokenBuy  Buy-side token address.
     *
     * @return activeOrders Array of Order structs that are still active.
     */
    function getOrders(
        address tokenSell,
        address tokenBuy
    ) external view returns (Order[] memory activeOrders) {
        bytes32 pairKey = _pairKey(tokenSell, tokenBuy);
        uint256[] storage ids = _pairOrderIds[pairKey];
        uint256 len = ids.length;

        // First pass: count active orders so we can size the return array.
        uint256 count;
        for (uint256 i; i < len; ++i) {
            Order storage o = orders[ids[i]];
            if (!o.cancelled && o.filledBuy < o.amountBuy) {
                ++count;
            }
        }

        // Second pass: populate the return array.
        activeOrders = new Order[](count);
        uint256 idx;
        for (uint256 i; i < len; ++i) {
            Order storage o = orders[ids[i]];
            if (!o.cancelled && o.filledBuy < o.amountBuy) {
                activeOrders[idx++] = o;
            }
        }
    }

    /**
     * @notice Retrieve a single order by its id.
     * @param orderId The order id.
     */
    function getOrder(uint256 orderId) external view returns (Order memory) {
        if (orders[orderId].maker == address(0)) revert OrderDoesNotExist();
        return orders[orderId];
    }

    // ---------------------------------------------------------------
    //  Internal helpers
    // ---------------------------------------------------------------

    /**
     * @dev Deterministic key for a directed token pair.
     *      (tokenA, tokenB) and (tokenB, tokenA) produce *different* keys.
     *      This is intentional: sell orders A->B are conceptually distinct
     *      from sell orders B->A.
     */
    function _pairKey(address tokenA, address tokenB) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(tokenA, tokenB));
    }

    /**
     * @dev Safely call `IERC20.transferFrom(from, to, amount)`.
     *      Handles tokens that return bool as well as tokens that return
     *      nothing (USDT-style).
     */
    function _safeTransferFrom(
        address token,
        address from,
        address to,
        uint256 amount
    ) internal {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(
                // bytes4(keccak256("transferFrom(address,address,uint256)"))
                0x23b872dd,
                from,
                to,
                amount
            )
        );
        if (!success || (data.length > 0 && !abi.decode(data, (bool)))) {
            revert TransferFailed();
        }
    }

    /**
     * @dev Safely call `IERC20.transfer(to, amount)`.
     */
    function _safeTransfer(
        address token,
        address to,
        uint256 amount
    ) internal {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(
                // bytes4(keccak256("transfer(address,uint256)"))
                0xa9059cbb,
                to,
                amount
            )
        );
        if (!success || (data.length > 0 && !abi.decode(data, (bool)))) {
            revert TransferFailed();
        }
    }
}
