// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IRestrictedSwap} from "./interfaces/IRestrictedSwap.sol";
import {IERC1404} from "./interfaces/IERC1404.sol";
import "./Dividends.sol"; //

contract RestrictedSwap is Dividends, IRestrictedSwap {

  using SafeERC20 for IERC20;

  /// @dev swap number
  uint256 public swapNumber = 0;

  /// @dev swap number => swap
  mapping(uint256 => Swap) private _swap;

  modifier onlyValidSwap(uint256 swapNumber) {
    Swap storage swap = _swap[swapNumber];
    require(swap.status != SwapStatus.Canceled, "Already canceled");
    require(swap.status != SwapStatus.Complete, "Already completed");
    _;
  }

  constructor(
    address transferRules_,
    address contractAdmin_,
    address tokenReserveAdmin_,
    string memory symbol_,
    string memory name_,
    uint8 decimals_,
    uint256 totalSupply_,
    uint256 maxTotalSupply_,
    uint _minTimelockAmount,
    uint _maxReleaseDelay
  ) Dividends (
    transferRules_,
    contractAdmin_,
    tokenReserveAdmin_,
    symbol_,
    name_,
    decimals_,
    totalSupply_,
    maxTotalSupply_,
    _minTimelockAmount,
    _maxReleaseDelay
  ) {}

  /**
   * @dev Configures swap and emits an event. This function does not fund tokens. Only for swap configuration.
   * @param restrictedTokenSender restricted token sender
   * @param quoteTokenSender quote token sender
   * @param quoteToken quote token
   * @param restrictedTokenAmount restricted token amount
   * @param quoteTokenAmount quote token amount
   */
  function _configureSwap(
    address restrictedTokenSender,
    address quoteTokenSender,
    address quoteToken,
    uint256 restrictedTokenAmount,
    uint256 quoteTokenAmount,
    SwapStatus configuror
  ) private {
    require(restrictedTokenAmount > 0, "Invalid restricted token amount");
    require(quoteTokenAmount > 0, "Invalid quote token amount");
    require(quoteToken != address(0), "Invalid quote token address");

    uint8 code = detectTransferRestriction(
      restrictedTokenSender,
      quoteTokenSender,
      restrictedTokenAmount);
    string memory message = messageForTransferRestriction(code);
    require(code == 0, message);
    // 0 == success

    bytes memory data = abi.encodeWithSelector(
      IERC1404(quoteToken).detectTransferRestriction.selector,
      quoteTokenSender,
      restrictedTokenSender,
      quoteTokenAmount);
    (bool isErc1404, bytes memory returnData) = quoteToken.call(data);

    if (isErc1404) {
      code = abi.decode(returnData, (uint8));
      message = IERC1404(quoteToken).messageForTransferRestriction(code);
      require(code == 0, message);
      // 0 == success
    }

    swapNumber += 1;

    Swap storage swap = _swap[swapNumber];
    swap.restrictedTokenSender = restrictedTokenSender;
    swap.restrictedTokenAmount = restrictedTokenAmount;
    swap.quoteTokenSender = quoteTokenSender;
    swap.quoteTokenAmount = quoteTokenAmount;
    swap.quoteToken = quoteToken;
    swap.status = configuror;

    emit SwapConfigured(
      swapNumber,
      restrictedTokenSender,
      restrictedTokenAmount,
      quoteToken,
      quoteTokenSender,
      quoteTokenAmount
    );
  }

  /**
   *  @dev Configure swap and emit an event with new swap number
   *  @param restrictedTokenAmount the required amount for the erc1404Sender to send
   *  @param quoteToken the address of an erc1404 or erc20 that will be swapped
   *  @param quoteTokenSender the address that is approved to fund quoteToken
   *  @param quoteTokenAmount the required amount of quoteToken to swap
   */
  function configureSell(
    uint256 restrictedTokenAmount,
    address quoteToken,
    address quoteTokenSender,
    uint256 quoteTokenAmount
  ) external override nonReentrant {
    require(quoteTokenSender != address(0), "Invalid quote token sender");
    require(balanceOf(msg.sender) >= restrictedTokenAmount, "Insufficient restricted token amount");


    _configureSwap(
      msg.sender,
      quoteTokenSender,
      quoteToken,
      restrictedTokenAmount,
      quoteTokenAmount,
      SwapStatus.SellConfigured
    );

    // fund caller's restricted token into swap
    _transfer(msg.sender, address(this), restrictedTokenAmount);
  }

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
  ) external override nonReentrant {
    require(restrictedTokenSender != address(0), "Invalid restricted token sender");

    _configureSwap(
      restrictedTokenSender,
      msg.sender,
      quoteToken,
      restrictedTokenAmount,
      quoteTokenAmount,
      SwapStatus.BuyConfigured
    );

    // fund caller's quote token into swap
    IERC20(quoteToken).safeTransferFrom(msg.sender, address(this), quoteTokenAmount);
  }

  /**
   *  @dev Complete swap with quote token
   *  @param swapNumber swap number
   */
  function completeSwapWithPaymentToken(uint256 swapNumber)
  external
  override
  nonReentrant
  onlyValidSwap(swapNumber)
  {
    Swap storage swap = _swap[swapNumber];

    require(swap.quoteTokenSender == msg.sender, "You are not appropriate token sender for this swap");

    uint256 balanceBefore = IERC20(swap.quoteToken).balanceOf(swap.restrictedTokenSender);
    IERC20(swap.quoteToken).safeTransferFrom(msg.sender, swap.restrictedTokenSender, swap.quoteTokenAmount);
    uint256 balanceAfter = IERC20(swap.quoteToken).balanceOf(swap.restrictedTokenSender);

    require(balanceBefore + swap.quoteTokenAmount == balanceAfter, "Deposit reverted for incorrect result of deposited amount");

    swap.status = SwapStatus.Complete;

    _transfer(address(this), swap.quoteTokenSender, swap.restrictedTokenAmount);

    emit SwapComplete(
      swapNumber,
      swap.restrictedTokenSender,
      swap.restrictedTokenAmount,
      swap.quoteTokenSender,
      swap.quoteToken,
      swap.quoteTokenAmount
    );
  }

  /**
   *  @dev Complete swap with restricted token
   *  @param swapNumber swap number
   */
  function completeSwapWithRestrictedToken(uint256 swapNumber)
  external
  override
  nonReentrant
  onlyValidSwap(swapNumber)
  {
    Swap storage swap = _swap[swapNumber];

    require(swap.restrictedTokenSender == msg.sender, "You are not appropriate token sender for this swap");

    uint256 balanceBefore = IERC20(swap.quoteToken).balanceOf(swap.restrictedTokenSender);
    IERC20(swap.quoteToken).safeTransfer(msg.sender, swap.quoteTokenAmount);
    uint256 balanceAfter = IERC20(swap.quoteToken).balanceOf(swap.restrictedTokenSender);

    require(balanceBefore + swap.quoteTokenAmount == balanceAfter, "Deposit reverted for incorrect result of deposited amount");

    swap.status = SwapStatus.Complete;

    _transfer(msg.sender, swap.quoteTokenSender, swap.restrictedTokenAmount);

    emit SwapComplete(
      swapNumber,
      swap.restrictedTokenSender,
      swap.restrictedTokenAmount,
      swap.quoteTokenSender,
      swap.quoteToken,
      swap.quoteTokenAmount
    );
  }

  /**
   *  @dev cancel swap
   *  @param swapNumber swap number
   */
  function cancelSell(uint256 swapNumber)
  external
  override
  nonReentrant
  onlyValidSwap(swapNumber)
  {
    Swap storage swap = _swap[swapNumber];

    require(swap.restrictedTokenSender != address(0), "This swap is not configured");
    require(swap.quoteTokenSender != address(0), "This swap is not configured");

    if (swap.status == SwapStatus.SellConfigured) {
      require(msg.sender == swap.restrictedTokenSender, "Only swap configurator can cancel the swap");
      _transfer(address(this), swap.restrictedTokenSender, swap.restrictedTokenAmount);
    } else if (swap.status == SwapStatus.BuyConfigured) {
      require(msg.sender == swap.quoteTokenSender, "Only swap configurator can cancel the swap");
      IERC20(swap.quoteToken).safeTransfer(swap.quoteTokenSender, swap.quoteTokenAmount);
    }

    swap.status = SwapStatus.Canceled;

    emit SwapCanceled(msg.sender, swapNumber);
  }

  /**
   * @dev Returns the swap status if exists
   * @param swapNumber swap number
   * @return SwapStatus status of the swap record
   */
  function swapStatus(uint256 swapNumber)
  external
  override
  view
    /*onlyWalletsAdminOrReserveAdmin*/
  returns
  (SwapStatus)
  {
    require(_swap[swapNumber].restrictedTokenSender != address(0), "Swap record not exists");
    return _swap[swapNumber].status;
  }
}