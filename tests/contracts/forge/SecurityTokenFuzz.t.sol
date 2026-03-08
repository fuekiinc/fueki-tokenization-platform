// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {TestBase} from "./TestBase.sol";
import {TransferRules} from "contracts/security-token/TransferRules.sol";
import {RestrictedSwap} from "contracts/security-token/RestrictedSwap.sol";

contract SecurityTokenFuzzTest is TestBase {
    TransferRules internal rules;
    RestrictedSwap internal token;

    address internal userA;
    address internal userB;

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

        userA = makeAddr("userA");
        userB = makeAddr("userB");

        token.grantRole(address(this), 4 | 8);
        token.setTransferGroup(address(this), 1);
        token.setTransferGroup(userA, 2);
        token.setTransferGroup(userB, 2);
        token.setAllowGroupTransfer(1, 2, block.timestamp);
        token.setAllowGroupTransfer(2, 1, block.timestamp);
        token.setAllowGroupTransfer(2, 2, block.timestamp);

        token.transfer(userA, 10_000 ether);
    }

    function testFuzz_transferConservesSupply(uint96 rawAmount) public {
        uint256 amount = (uint256(rawAmount) % 1_000 ether) + 1;
        uint256 fromBalance = token.balanceOf(userA);
        vm.assume(fromBalance >= amount);

        uint256 totalBefore = token.totalSupply();

        vm.prank(userA);
        token.transfer(userB, amount);

        uint256 totalAfter = token.totalSupply();
        assertEq(totalBefore, totalAfter, "supply changed during transfer");
    }

    function testFuzz_mintBurnSupplyInvariant(uint96 rawMint, uint96 rawBurn) public {
        uint256 mintAmount = (uint256(rawMint) % 100_000 ether) + 1;
        uint256 burnAmount = uint256(rawBurn) % (mintAmount + 1);

        uint256 beforeSupply = token.totalSupply();

        token.mint(userA, mintAmount);
        if (burnAmount > 0) {
            token.burn(userA, burnAmount);
        }

        uint256 afterSupply = token.totalSupply();
        assertEq(afterSupply, beforeSupply + mintAmount - burnAmount, "mint/burn invariant failed");
        assertTrue(afterSupply <= token.maxTotalSupply(), "max supply exceeded");
    }

    function testFuzz_vestingMonotonicity(uint32 t1, uint32 t2) public view {
        uint256 start = block.timestamp;
        uint256 amount = 1_000 ether;

        uint256 timeA = start + (uint256(t1) % 30 days);
        uint256 timeB = start + (uint256(t2) % 60 days);
        if (timeB < timeA) {
            uint256 temp = timeA;
            timeA = timeB;
            timeB = temp;
        }

        uint256 unlockedA = token.calculateUnlocked(start, timeA, amount, 6, 5 days, 1000, 5 days);
        uint256 unlockedB = token.calculateUnlocked(start, timeB, amount, 6, 5 days, 1000, 5 days);

        assertTrue(unlockedB >= unlockedA, "unlocked amount is not monotonic");
        assertTrue(unlockedB <= amount, "unlocked amount exceeds total");
    }

    function testInvariant_frozenSenderCannotTransfer() public {
        token.freeze(userA, true);
        uint8 code = token.detectTransferRestriction(userA, userB, 1 ether);
        assertEq(code, 5, "expected frozen sender restriction code");
    }
}
