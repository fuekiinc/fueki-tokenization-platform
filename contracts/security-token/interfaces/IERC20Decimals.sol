// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// enhanced ERC20 interface with decimals
interface IERC20Decimals is IERC20 {

    function decimals() external view returns (uint8);
}