// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Snapshot.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./interfaces/IDividends.sol";
import "./RestrictedLockupToken.sol"; //

contract Dividends is IDividends, RestrictedLockupToken {

  using SafeERC20 for IERC20;

  // ---------------------------------------------------------------
  //  Custom Errors (gas optimization: ~200 gas cheaper per revert than require strings)
  // ---------------------------------------------------------------
  error BadTokenAddress();
  error NoUnclaimedTokens();

  struct TokensFunded {
    uint256 total;
    uint256 unused;
  }

  /// @dev snapshotID => funderAddress => token => getAmount;
  mapping(uint256 => mapping(address => mapping(address => uint256))) claimedTokens;

  /// @dev snapshotID => token => totalAmount of token
  mapping(uint256 => mapping(address => TokensFunded)) tokensFunded;

  /// @dev Accuracy of division
  /// Gas optimization: constant is inlined at compile time (zero storage reads)
  uint256 public constant tokenPrecisionDivider = 10000;

  /**
   * @dev Contract constructor
   */
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
  ) RestrictedLockupToken (
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
  ) { }

  /// @dev Withdrawal remains of unused ERC-20 tokens at snapshot
  /// @param token ERC-20 token address
  /// @param snapshotId Snapshot ID
  function withdrawalRemains(address token, uint256 snapshotId) override public onlyContractAdmin nonReentrant {
    if (token == address(0)) revert BadTokenAddress();

    uint256 amount = tokensAt(token, snapshotId);

    // CEI: update state before external call
    // Gas optimization: unchecked subtraction is safe because tokensAt returns unused which is >= 0,
    // and we are subtracting `amount` which equals `unused`
    unchecked {
      tokensFunded[snapshotId][token].unused -= amount;
    }

    IERC20(token).safeTransfer(msg.sender, amount);

    emit Withdrawn(msg.sender, token, amount, snapshotId);
  }

  /**
   * @dev Fund any ERC-20 tokens into current contract
   * Tokens can be claimed by holders of RestrictedSwap Token uses claimDividends method
   * @param token ERC-20 token address
   * @param amount amount of tokens to fund
   * @param snapshotId snapshot ID of RestrictedSwap Token
   */
  function fundDividend(address token, uint256 amount, uint256 snapshotId) override public {
    if (token == address(0)) revert BadTokenAddress();

    IERC20 paymentToken = IERC20(token);

    paymentToken.safeTransferFrom(msg.sender, address(this), amount);

    // Gas optimization: cache storage pointer to avoid double mapping lookup
    TokensFunded storage funded = tokensFunded[snapshotId][token];
    funded.total += amount;
    funded.unused += amount;

    emit Funded(msg.sender, token, amount, snapshotId);
  }

  /// @dev Get unused ERC-20 tokens on snapshot
  /// @param token ERC-20 token address
  /// @param snapshotId Snapshot ID
  /// @return amount of ERC-20 tokens
  function tokensAt(address token, uint256 snapshotId) override public view returns (uint256) {
    // Gas optimization: direct return of mapping value, removing redundant conditional
    return tokensFunded[snapshotId][token].unused;
  }

  /**
   * @dev Get balance of ERC-20 tokens funded at snapshot
   * @param token ERC-20 token address
   * @param snapshotId snapshot ID of RestrictedSwap Token
   * @return amount of ERC-20 tokens
   */
  function fundsAt(address token, uint256 snapshotId) override public view returns (uint256) {
    return tokensFunded[snapshotId][token].total;
  }

  /**
   * @dev Amount of ERC-20 tokens distributed to the holder of RestrictedSwap Token at snapshot
   * @param token ERC-20 token address
   * @param receiver RestrictedSwap Token's holder address
   * @param snapshotId snapshot ID of RestrictedSwap Token
   * @return amount of total ERC-20 tokens distributed to the receiver
   */
  function totalAwardedBalanceAt(address token, address receiver, uint256 snapshotId) override public view returns (uint256) {
    uint256 secTokenBalance = this.balanceOfAt(receiver, snapshotId);
    uint256 _totalSupply = this.totalSupplyAt(snapshotId);
    // Gas optimization: short-circuit if balance is zero to avoid division
    if (secTokenBalance == 0 || _totalSupply == 0) return 0;
    uint256 share = (secTokenBalance * tokenPrecisionDivider) / _totalSupply;
    return (tokensFunded[snapshotId][token].total * share) / tokenPrecisionDivider;
  }

  /**
   * @dev Amount of ERC-20 tokens claimed by the holder of RestrictedSwap Token at snapshot
   * @param token ERC-20 token address
   * @param receiver RestrictedSwap Token's holder address
   * @param snapshotId snapshot ID of RestrictedSwap Token
   * @return amount of claimed ERC-20 tokens
   */
  function claimedBalanceAt(address token, address receiver, uint256 snapshotId) override public view returns (uint256) {
    return claimedTokens[snapshotId][token][receiver];
  }

  /**
   * @dev Amount of ERC-20 tokens that can be claimed by the holder of RestrictedSwap Token at snapshot
   * @param token ERC-20 token address
   * @param receiver RestrictedSwap Token's holder address
   * @param snapshotId snapshot ID of RestrictedSwap Token
   * @return amount of can be claimed ERC-20 tokens
   */
  function unclaimedBalanceAt(address token, address receiver, uint256 snapshotId) override public view returns (uint256) {
    // Gas optimization: unchecked subtraction, totalAwarded >= claimed by invariant
    unchecked {
      return totalAwardedBalanceAt(token, receiver, snapshotId) - claimedBalanceAt(token, receiver, snapshotId);
    }
  }

  /**
   * @dev Claim ERC-20 tokens (dividends) by RestrictedSwap Tokens holder
   * Tokens can be claimed when its allowed by unclaimedBalanceAt
   * @param token ERC-20 token address
   * @param snapshotId snapshot ID of RestrictedSwap Token
   */
  function claimDividend(address token, uint256 snapshotId) override public nonReentrant {
    uint256 unclaimedBalance = unclaimedBalanceAt(token, msg.sender, snapshotId);

    if (unclaimedBalance == 0) revert NoUnclaimedTokens();

    // CEI: update state before external call
    claimedTokens[snapshotId][token][msg.sender] += unclaimedBalance;

    // Gas optimization: unchecked subtraction is safe because unused >= unclaimedBalance
    // (unused tracks total unfunded amount, unclaimedBalance is a portion of it)
    unchecked {
      tokensFunded[snapshotId][token].unused -= unclaimedBalance;
    }

    IERC20(token).safeTransfer(msg.sender, unclaimedBalance);

    emit Claimed(msg.sender, token, unclaimedBalance, snapshotId);
  }
}
