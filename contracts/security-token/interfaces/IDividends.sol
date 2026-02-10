// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;



interface IDividends  {

  /************************
   * Functions
   ************************/

  /// @dev Get unused ERC-20 tokens on snapshot
  /// @param token ERC-20 token address
  /// @param snapshotId Snapshot ID
  /// @return amount of ERC-20 tokens
  function tokensAt(address token, uint256 snapshotId) external view returns (uint256);

  /// @dev Withdrawal remains of unused ERC-20 tokens at snapshot
  /// @param token ERC-20 token address
  /// @param snapshotId Snapshot ID
  function withdrawalRemains(address token, uint256 snapshotId) external;

  /**
   * @dev Fund any ERC-20 tokens into current contract
   * Tokens can be claimed by holders of RestrictedSwap Token uses claimDividends method
   * @param token ERC-20 token address
   * @param amount amount of tokens to fund
   * @param snapshotId snapshot ID of RestrictedSwap Token
   */
  function fundDividend(address token, uint256 amount, uint256 snapshotId) external;

  /**
   * @dev Get balance of ERC-20 tokens funded at snapshot
   * @param token ERC-20 token address
   * @param snapshotId snapshot ID of RestrictedSwap Token
   * @return amount of ERC-20 tokens
   */
  function fundsAt(address token, uint256 snapshotId) external view returns (uint256);

  /**
   * @dev Amount of ERC-20 tokens distributed to the holder of RestrictedSwap Token at snapshot
   * @param token ERC-20 token address
   * @param receiver RestrictedSwap Token's holder address
   * @param snapshotId snapshot ID of RestrictedSwap Token
   * @return amount of total ERC-20 tokens distributed to the receiver
   */
  function totalAwardedBalanceAt(address token, address receiver, uint256 snapshotId) external view returns (uint256);

  /**
   * @dev Amount of ERC-20 tokens claimed by the holder of RestrictedSwap Token at snapshot
   * @param token ERC-20 token address
   * @param receiver RestrictedSwap Token's holder address
   * @param snapshotId snapshot ID of RestrictedSwap Token
   * @return amount of claimed ERC-20 tokens
   */
  function claimedBalanceAt(address token, address receiver, uint256 snapshotId) external view returns (uint256);

  /**
   * @dev Amount of ERC-20 tokens that can be claimed by the holder of RestrictedSwap Token at snapshot
   * @param token ERC-20 token address
   * @param receiver RestrictedSwap Token's holder address
   * @param snapshotId snapshot ID of RestrictedSwap Token
   * @return amount of can be claimed ERC-20 tokens
   */
  function unclaimedBalanceAt(address token, address receiver, uint256 snapshotId) external view returns (uint256);

  /**
   * @dev Claim ERC-20 tokens (dividends) by RestrictedSwap Tokens holder
   * Tokens can be claimed when its allowed by unclaimedBalanceAt
   * @param token ERC-20 token address
   * @param snapshotId snapshot ID of RestrictedSwap Token
   */
  function claimDividend(address token, uint256 snapshotId) external;

  /****************************
   * Events
   ****************************/

  event Funded (address indexed payer, address indexed token, uint256 amount, uint256 indexed snapshotId);
  event Claimed (address indexed payee, address indexed token, uint256 amount, uint256 indexed snapshotId);
  event Withdrawn (address indexed payee, address indexed token, uint256 amount, uint256 indexed snapshotId);
}