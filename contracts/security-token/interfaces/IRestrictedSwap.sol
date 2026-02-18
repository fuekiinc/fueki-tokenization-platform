// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

interface IRestrictedSwap {

  /************************
   * Data Structures
   ************************/

  enum SwapStatus {
    SellConfigured,
    BuyConfigured,
    Complete,
    Canceled
  }

  struct Swap {
    address restrictedTokenSender;
    address quoteTokenSender;
    address quoteToken;
    uint256 restrictedTokenAmount;
    uint256 quoteTokenAmount;
    SwapStatus status;
  }

  /************************
   * Functions
   ************************/

  /**
   *  @dev Configure swap and emit an event with new swap number
   *  @param restrictedTokenAmount the required amount for the erc1404Sender to send
   *  @param quoteToken the address of an erc1404 or erc20 that will be swapped
   *  @param token2Address the address that is approved to fund quoteToken
   *  @param quoteTokenAmount the required amount of quoteToken to swap
   */
  function configureSell(
    uint restrictedTokenAmount,
    address quoteToken,
    address token2Address,
    uint quoteTokenAmount
  ) external;

  /**
   *  @dev Configure swap and emit an event with new swap number
   *  @param restrictedTokenAmount the required amount for the erc1404Sender to send
   *  @param restrictedTokenSender restricted token sender
   *  @param quoteToken the address of an erc1404 or erc20 that will be swapped
   *  @param quoteTokenAmount the required amount of quoteToken to swap
   */
  function configureBuy(
    uint256 restrictedTokenAmount,
    address restrictedTokenSender,
    address quoteToken,
    uint256 quoteTokenAmount
  ) external;

  /**
   *  @dev Complete swap with quote token
   *  @param swapNumber swap number
   */
  function completeSwapWithPaymentToken(uint swapNumber) external;

  /**
   *  @dev Complete swap with restricted token
   *  @param swapNumber swap number
   */
  function completeSwapWithRestrictedToken(uint swapNumber) external;

  /**
   *  @dev cancel swap
   *  @param swapNumber swap number
   */
  function cancelSell(uint swapNumber) external;

  /**
   * @dev Returns the swap status if exists
   * @param swapNumber swap number
   * @return SwapStatus status of the swap record
   */
  function swapStatus(uint256 swapNumber) external view returns (SwapStatus);

  /****************************
   * Events
   * Gas optimization: indexed parameters on addresses/IDs for efficient log filtering
   ****************************/

  event SwapCanceled(address indexed sender, uint256 indexed swapNumber);

  event SwapConfigured(
    uint256 indexed swapNumber,
    address indexed restrictedTokenSender,
    uint256 restrictedTokenAmount,
    address quoteToken,
    address indexed quoteTokenSender,
    uint256 quoteTokenAmount
  );

  event SwapComplete(
    uint256 indexed swapNumber,
    address indexed restrictedTokenSender,
    uint256 restrictedTokenAmount,
    address indexed quoteTokenSender,
    address quoteToken,
    uint256 quoteTokenAmount
  );
}
