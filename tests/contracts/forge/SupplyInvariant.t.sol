// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {TestBase} from "./TestBase.sol";
import {TransferRules} from "contracts/security-token/TransferRules.sol";
import {RestrictedSwap} from "contracts/security-token/RestrictedSwap.sol";

contract SupplyInvariantTest is TestBase {
    TransferRules internal rules;
    RestrictedSwap internal token;

    address internal a;
    address internal b;

    function setUp() public {
        rules = new TransferRules();
        token = new RestrictedSwap(
            address(rules),
            address(this),
            address(this),
            "FST",
            "Fueki Security Token",
            18,
            1_000_000 ether,
            5_000_000 ether,
            1,
            365 days
        );

        a = makeAddr("a");
        b = makeAddr("b");

        token.grantRole(address(this), 4 | 8);
        token.setTransferGroup(address(this), 1);
        token.setTransferGroup(a, 2);
        token.setTransferGroup(b, 2);
        token.setAllowGroupTransfer(1, 2, block.timestamp);
        token.setAllowGroupTransfer(2, 2, block.timestamp);

        token.transfer(a, 100_000 ether);
    }

    function testInvariant_supplyConservationAfterTransfers() public {
        uint256 total = token.totalSupply();

        vm.prank(a);
        token.transfer(b, 1 ether);

        vm.prank(b);
        token.transfer(a, 0.5 ether);

        assertEq(token.totalSupply(), total, "total supply changed across transfers");
    }

    function testInvariant_restrictionCodeNonZeroBlocks() public {
        token.freeze(a, true);
        uint8 code = token.detectTransferRestriction(a, b, 1 ether);
        assertTrue(code != 0, "expected non-zero restriction for frozen sender");
    }
}
