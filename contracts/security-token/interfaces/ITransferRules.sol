// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

interface ITransferRules {
    /// @notice Detects if a transfer will be reverted and if so returns an appropriate reference code
    /// @param from Sending address
    /// @param to Receiving address
    /// @param value Amount of tokens being transferred
    /// @return Code by which to reference message for rejection reasoning
    function detectTransferRestriction(
        address token,
        address from,
        address to,
        uint256 value
    ) external view returns (uint8);

    /// @notice Returns a human-readable message for a given restriction code
    /// @param restrictionCode Identifier for looking up a message
    /// @return Text showing the restriction's reasoning
    function messageForTransferRestriction(uint8 restrictionCode)
        external
        view
        returns (string memory);

    function checkSuccess(uint8 restrictionCode) external view returns (bool);
}