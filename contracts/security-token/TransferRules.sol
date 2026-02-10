// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;
import './RestrictedLockupToken.sol';
import './interfaces/ITransferRules.sol';

contract TransferRules is ITransferRules {
    mapping(uint8 => string) internal errorMessage;

    uint8 public constant SUCCESS = 0;
    uint8 public constant GREATER_THAN_RECIPIENT_MAX_BALANCE = 1;
    uint8 public constant SENDER_TOKENS_TIME_LOCKED = 2;
    uint8 public constant DO_NOT_SEND_TO_TOKEN_CONTRACT = 3;
    uint8 public constant DO_NOT_SEND_TO_EMPTY_ADDRESS = 4;
    uint8 public constant SENDER_ADDRESS_FROZEN = 5;
    uint8 public constant ALL_TRANSFERS_PAUSED = 6;
    uint8 public constant TRANSFER_GROUP_NOT_APPROVED = 7;
    uint8 public constant TRANSFER_GROUP_NOT_ALLOWED_UNTIL_LATER = 8;
    uint8 public constant RECIPIENT_ADDRESS_FROZEN = 9;

  constructor() {
    errorMessage[SUCCESS] = "SUCCESS";
    errorMessage[GREATER_THAN_RECIPIENT_MAX_BALANCE] = "GREATER THAN RECIPIENT MAX BALANCE";
    errorMessage[SENDER_TOKENS_TIME_LOCKED] = "SENDER TOKENS LOCKED";
    errorMessage[DO_NOT_SEND_TO_TOKEN_CONTRACT] = "DO NOT SEND TO TOKEN CONTRACT";
    errorMessage[DO_NOT_SEND_TO_EMPTY_ADDRESS] = "DO NOT SEND TO EMPTY ADDRESS";
    errorMessage[SENDER_ADDRESS_FROZEN] = "SENDER ADDRESS IS FROZEN";
    errorMessage[ALL_TRANSFERS_PAUSED] = "ALL TRANSFERS PAUSED";
    errorMessage[TRANSFER_GROUP_NOT_APPROVED] = "TRANSFER GROUP NOT APPROVED";
    errorMessage[TRANSFER_GROUP_NOT_ALLOWED_UNTIL_LATER] = "TRANSFER GROUP NOT ALLOWED UNTIL LATER";
    errorMessage[RECIPIENT_ADDRESS_FROZEN] = "RECIPIENT ADDRESS IS FROZEN";
  }

  /// @notice Detects if a transfer will be reverted and if so returns an appropriate reference code
  /// @param from Sending address
  /// @param to Receiving address
  /// @param value Amount of tokens being transferred
  /// @return Code by which to reference message for rejection reason
  function detectTransferRestriction(
    address _token,
    address from,
    address to,
    uint256 value
  )
    external
    override
    view
    returns(uint8)
  {
    RestrictedLockupToken token = RestrictedLockupToken(_token);
    if (token.isPaused()) return ALL_TRANSFERS_PAUSED;
    if (to == address(0)) return DO_NOT_SEND_TO_EMPTY_ADDRESS;

    if (to == address(token)) return DO_NOT_SEND_TO_TOKEN_CONTRACT;

    if ((token.getMaxBalance(to) > 0) &&
        (token.balanceOf(to) + value > token.getMaxBalance(to))
       ) return GREATER_THAN_RECIPIENT_MAX_BALANCE;
    if (token.getFrozenStatus(from)) return SENDER_ADDRESS_FROZEN;
    if (token.getFrozenStatus(to)) return RECIPIENT_ADDRESS_FROZEN;

    // @dev Remove it Change it on data on TokenLockup settings
    uint256 lockedUntil = token.getAllowTransferTime(from, to);
    if (0 == lockedUntil) return TRANSFER_GROUP_NOT_APPROVED;
    if (block.timestamp < lockedUntil) return TRANSFER_GROUP_NOT_ALLOWED_UNTIL_LATER;

    if ( token.unlockedBalanceOf(from) < value
        && token.balanceOf(from) > value
    ) return SENDER_TOKENS_TIME_LOCKED;

    return SUCCESS;
  }

  /// @notice Returns a human-readable message for a given restriction code
  /// @param restrictionCode Identifier for looking up a message
  /// @return Text showing the restriction's reasoning
  function messageForTransferRestriction(uint8 restrictionCode)
    external
    override
    view
    returns(string memory)
  {
    require(restrictionCode <= 9, "BAD RESTRICTION CODE");
    return errorMessage[restrictionCode];
  }

  /// @notice a method for checking a response code to determine if a transfer was succesful.
  /// Defining this separately from the token contract allows it to be upgraded.
  /// For instance this method would need to be upgraded if the SUCCESS code was changed to 1
  /// as specified in ERC-1066 instead of 0 as specified in ERC-1404.
  /// @param restrictionCode The code to check.
  /// @return isSuccess A boolean indicating if the code is the SUCCESS code.
  function checkSuccess(uint8 restrictionCode)
    external
    override
    pure
    returns(bool isSuccess)
  {
    return restrictionCode == SUCCESS;
  }
}