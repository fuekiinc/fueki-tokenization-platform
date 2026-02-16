/**
 * Human-readable ABI for the AssetExchange contract.
 *
 * Replaces the original AssetExchange.json with a compact
 * ethers.js v6 human-readable ABI fragment array.
 */
export const AssetExchangeABI = [
  // Errors
  'error FillAmountTooLarge()',
  'error NotOrderMaker()',
  'error OrderAlreadyCancelled()',
  'error OrderDoesNotExist()',
  'error OrderFullyFilled()',
  'error ReentrancyDetected()',
  'error SameToken()',
  'error TransferFailed()',
  'error ZeroAddress()',
  'error ZeroAmount()',

  // Events
  'event OrderCancelled(uint256 indexed orderId, address indexed maker)',
  'event OrderCreated(uint256 indexed orderId, address indexed maker, address tokenSell, address tokenBuy, uint256 amountSell, uint256 amountBuy)',
  'event OrderFilled(uint256 indexed orderId, address indexed taker, uint256 fillAmountSell, uint256 fillAmountBuy)',

  // Functions
  'function cancelOrder(uint256 orderId)',
  'function createOrder(address tokenSell, address tokenBuy, uint256 amountSell, uint256 amountBuy) returns (uint256 orderId)',
  'function fillOrder(uint256 orderId, uint256 fillAmountBuy)',
  'function getOrder(uint256 orderId) view returns (tuple(uint256 id, address maker, address tokenSell, address tokenBuy, uint256 amountSell, uint256 amountBuy, uint256 filledSell, uint256 filledBuy, bool cancelled))',
  'function getOrders(address tokenSell, address tokenBuy) view returns (tuple(uint256 id, address maker, address tokenSell, address tokenBuy, uint256 amountSell, uint256 amountBuy, uint256 filledSell, uint256 filledBuy, bool cancelled)[])',
  'function nextOrderId() view returns (uint256)',
  'function orders(uint256) view returns (uint256 id, address maker, address tokenSell, address tokenBuy, uint256 amountSell, uint256 amountBuy, uint256 filledSell, uint256 filledBuy, bool cancelled)',
] as const;
