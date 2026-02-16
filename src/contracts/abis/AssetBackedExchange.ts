/**
 * Human-readable ABI for the AssetBackedExchange contract.
 *
 * Replaces the original AssetBackedExchange.json with a compact
 * ethers.js v6 human-readable ABI fragment array.
 */
export const AssetBackedExchangeABI = [
  // Errors
  'error InsufficientEth()',
  'error InsufficientFill()',
  'error NotMaker()',
  'error NothingToWithdraw()',
  'error OrderNotActive()',
  'error SameToken()',
  'error TransferFailed()',
  'error ZeroAddress()',
  'error ZeroAmount()',

  // Events
  'event EthWithdrawn(address indexed to, uint256 amount)',
  'event OrderCancelled(uint256 indexed orderId, address indexed maker)',
  'event OrderCreated(uint256 indexed orderId, address indexed maker, address tokenSell, address tokenBuy, uint256 amountSell, uint256 amountBuy)',
  'event OrderFilled(uint256 indexed orderId, address indexed taker, uint256 fillAmountSell, uint256 fillAmountBuy)',

  // Functions
  'function ETH_ADDRESS() view returns (address)',
  'function cancelOrder(uint256 orderId)',
  'function createOrder(address tokenSell, address tokenBuy, uint256 amountSell, uint256 amountBuy) returns (uint256 orderId)',
  'function createOrderSellETH(address tokenBuy, uint256 amountBuy) payable returns (uint256 orderId)',
  'function ethBalances(address) view returns (uint256)',
  'function fillOrder(uint256 orderId, uint256 fillAmountBuy)',
  'function fillOrderWithETH(uint256 orderId) payable',
  'function getActiveOrders(address tokenSell, address tokenBuy) view returns (tuple(uint256 id, address maker, address tokenSell, address tokenBuy, uint256 amountSell, uint256 amountBuy, uint256 filledSell, uint256 filledBuy, bool cancelled)[])',
  'function getOrder(uint256 orderId) view returns (tuple(uint256 id, address maker, address tokenSell, address tokenBuy, uint256 amountSell, uint256 amountBuy, uint256 filledSell, uint256 filledBuy, bool cancelled))',
  'function getOrderCount() view returns (uint256)',
  'function getUserOrders(address user) view returns (uint256[])',
  'function nextOrderId() view returns (uint256)',
  'function withdrawEth()',

  // Receive
  'receive() payable',
] as const;
