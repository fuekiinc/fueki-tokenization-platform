// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IRestrictedSwap} from "./interfaces/IRestrictedSwap.sol";
import {IERC1404} from "./interfaces/IERC1404.sol";
import "./Dividends.sol"; //

contract RestrictedSwap is Dividends, IRestrictedSwap {

  using SafeERC20 for IERC20;

  // ---------------------------------------------------------------
  //  Custom Errors (gas optimization: ~200 gas cheaper per revert than require strings)
  // ---------------------------------------------------------------
  error InvalidRestrictedTokenAmount();
  error InvalidQuoteTokenAmount();
  error InvalidQuoteTokenAddress();
  error InvalidQuoteTokenSender();
  error InvalidRestrictedTokenSender();
  error InsufficientRestrictedTokenBalance();
  error SwapAlreadyCanceled();
  error SwapAlreadyCompleted();
  error NotAppropriateTokenSender();
  error DepositAmountMismatch();
  error SwapNotConfigured();
  error OnlyConfiguratorCanCancel();
  error SwapRecordNotExists();

  /// @dev swap number
  uint256 public swapNumber;

  /// @dev swap number => swap
  mapping(uint256 => Swap) private _swap;

  modifier onlyValidSwap(uint256 _swapNumber) {
    // Gas optimization: cache storage read to avoid double SLOAD
    SwapStatus status = _swap[_swapNumber].status;
    if (status == SwapStatus.Canceled) revert SwapAlreadyCanceled();
    if (status == SwapStatus.Complete) revert SwapAlreadyCompleted();
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
    if (restrictedTokenAmount == 0) revert InvalidRestrictedTokenAmount();
    if (quoteTokenAmount == 0) revert InvalidQuoteTokenAmount();
    if (quoteToken == address(0)) revert InvalidQuoteTokenAddress();

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

    // Gas optimization: pre-increment is cheaper than post-increment + avoids initializing to 0
    unchecked {
      ++swapNumber;
    }

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
    if (quoteTokenSender == address(0)) revert InvalidQuoteTokenSender();
    if (balanceOf(msg.sender) < restrictedTokenAmount) revert InsufficientRestrictedTokenBalance();

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
    if (restrictedTokenSender == address(0)) revert InvalidRestrictedTokenSender();

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
   *  @param _swapNumber swap number
   */
  function completeSwapWithPaymentToken(uint256 _swapNumber)
  external
  override
  nonReentrant
  onlyValidSwap(_swapNumber)
  {
    // Gas optimization: cache storage pointer and read fields once to avoid repeated SLOAD
    Swap storage swap = _swap[_swapNumber];

    address _quoteTokenSender = swap.quoteTokenSender;
    address _restrictedTokenSender = swap.restrictedTokenSender;
    address _quoteToken = swap.quoteToken;
    uint256 _quoteTokenAmount = swap.quoteTokenAmount;
    uint256 _restrictedTokenAmount = swap.restrictedTokenAmount;

    if (_quoteTokenSender != msg.sender) revert NotAppropriateTokenSender();

    uint256 balanceBefore = IERC20(_quoteToken).balanceOf(_restrictedTokenSender);
    IERC20(_quoteToken).safeTransferFrom(msg.sender, _restrictedTokenSender, _quoteTokenAmount);
    uint256 balanceAfter = IERC20(_quoteToken).balanceOf(_restrictedTokenSender);

    if (balanceBefore + _quoteTokenAmount != balanceAfter) revert DepositAmountMismatch();

    swap.status = SwapStatus.Complete;

    _transfer(address(this), _quoteTokenSender, _restrictedTokenAmount);

    emit SwapComplete(
      _swapNumber,
      _restrictedTokenSender,
      _restrictedTokenAmount,
      _quoteTokenSender,
      _quoteToken,
      _quoteTokenAmount
    );
  }

  /**
   *  @dev Complete swap with restricted token
   *  @param _swapNumber swap number
   */
  function completeSwapWithRestrictedToken(uint256 _swapNumber)
  external
  override
  nonReentrant
  onlyValidSwap(_swapNumber)
  {
    // Gas optimization: cache storage pointer and read fields once to avoid repeated SLOAD
    Swap storage swap = _swap[_swapNumber];

    address _restrictedTokenSender = swap.restrictedTokenSender;
    address _quoteTokenSender = swap.quoteTokenSender;
    address _quoteToken = swap.quoteToken;
    uint256 _quoteTokenAmount = swap.quoteTokenAmount;
    uint256 _restrictedTokenAmount = swap.restrictedTokenAmount;

    if (_restrictedTokenSender != msg.sender) revert NotAppropriateTokenSender();

    uint256 balanceBefore = IERC20(_quoteToken).balanceOf(_restrictedTokenSender);
    IERC20(_quoteToken).safeTransfer(msg.sender, _quoteTokenAmount);
    uint256 balanceAfter = IERC20(_quoteToken).balanceOf(_restrictedTokenSender);

    if (balanceBefore + _quoteTokenAmount != balanceAfter) revert DepositAmountMismatch();

    swap.status = SwapStatus.Complete;

    _transfer(msg.sender, _quoteTokenSender, _restrictedTokenAmount);

    emit SwapComplete(
      _swapNumber,
      _restrictedTokenSender,
      _restrictedTokenAmount,
      _quoteTokenSender,
      _quoteToken,
      _quoteTokenAmount
    );
  }

  /**
   *  @dev cancel swap
   *  @param _swapNumber swap number
   */
  function cancelSell(uint256 _swapNumber)
  external
  override
  nonReentrant
  onlyValidSwap(_swapNumber)
  {
    // Gas optimization: cache storage reads
    Swap storage swap = _swap[_swapNumber];

    address _restrictedTokenSender = swap.restrictedTokenSender;
    address _quoteTokenSender = swap.quoteTokenSender;

    if (_restrictedTokenSender == address(0)) revert SwapNotConfigured();
    if (_quoteTokenSender == address(0)) revert SwapNotConfigured();

    SwapStatus status = swap.status;
    if (status == SwapStatus.SellConfigured) {
      if (msg.sender != _restrictedTokenSender) revert OnlyConfiguratorCanCancel();
      _transfer(address(this), _restrictedTokenSender, swap.restrictedTokenAmount);
    } else if (status == SwapStatus.BuyConfigured) {
      if (msg.sender != _quoteTokenSender) revert OnlyConfiguratorCanCancel();
      IERC20(swap.quoteToken).safeTransfer(_quoteTokenSender, swap.quoteTokenAmount);
    }

    swap.status = SwapStatus.Canceled;

    emit SwapCanceled(msg.sender, _swapNumber);
  }

  /**
   * @dev Returns the swap status if exists
   * @param _swapNumber swap number
   * @return SwapStatus status of the swap record
   */
  function swapStatus(uint256 _swapNumber)
  external
  override
  view
    /*onlyWalletsAdminOrReserveAdmin*/
  returns
  (SwapStatus)
  {
    if (_swap[_swapNumber].restrictedTokenSender == address(0)) revert SwapRecordNotExists();
    return _swap[_swapNumber].status;
  }
}
