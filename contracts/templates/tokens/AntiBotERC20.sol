// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AntiBot ERC20
 * @notice ERC20 token with same-block transfer protection to prevent sandwich/bot attacks.
 *         Includes burn, permit, and owner-controlled bot-check toggle.
 */
contract AntiBotERC20 is ERC20, ERC20Burnable, ERC20Permit, Ownable {
    mapping(address => uint256) private _buyBlock;
    bool public checkBot = true;

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 totalSupply_
    ) ERC20(name_, symbol_) ERC20Permit(name_) {
        _mint(msg.sender, totalSupply_);
    }

    function setCheckBot(bool _status) public onlyOwner {
        checkBot = _status;
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override isBot(from, to) {
        _buyBlock[to] = block.number;
    }

    modifier isBot(address from, address to) {
        if (checkBot) require(_buyBlock[from] != block.number, "Bad bot!");
        _;
    }
}
