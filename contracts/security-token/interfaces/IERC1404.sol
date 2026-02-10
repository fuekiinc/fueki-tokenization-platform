// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IERC1404 is IERC20 {
  function detectTransferRestriction(
    address from,
    address to,
    uint256 value
  ) external view returns(uint8);

  function messageForTransferRestriction(
    uint8 restrictionCode
  ) external view returns(string memory);
}