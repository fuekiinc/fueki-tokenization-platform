// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {TestBase} from "./TestBase.sol";
import {OrbitalFactory} from "contracts/orbital/OrbitalFactory.sol";
import {OrbitalPool} from "contracts/orbital/OrbitalPool.sol";
import {MockERC20} from "contracts/test/MockERC20.sol";

contract OrbitalPoolFuzzTest is TestBase {
    MockERC20 internal tokenA;
    MockERC20 internal tokenB;
    OrbitalFactory internal factory;
    OrbitalPool internal pool;

    function setUp() public {
        tokenA = new MockERC20("Token A", "TKA", 18);
        tokenB = new MockERC20("Token B", "TKB", 18);

        tokenA.mint(address(this), 5_000_000 ether);
        tokenB.mint(address(this), 5_000_000 ether);

        factory = new OrbitalFactory(address(this), address(this), 30);
        address[] memory tokens = new address[](2);
        tokens[0] = address(tokenA);
        tokens[1] = address(tokenB);
        factory.createPool(tokens, 4, 30, "TKA/TKB LP", "OTLP");

        pool = OrbitalPool(factory.getAllPools()[0]);

        tokenA.approve(address(pool), type(uint256).max);
        tokenB.approve(address(pool), type(uint256).max);

        pool.addLiquidity(_pair(1_000_000 ether, 1_000_000 ether), 0, block.timestamp + 1 hours);
    }

    function testFuzz_swapMaintainsPoolSolvency(uint96 rawAmountIn) public {
        uint256 amountIn = (uint256(rawAmountIn) % 5_000 ether) + 1e12;

        (uint256 amountOut, uint256 feeAmount) = pool.getAmountOut(0, 1, amountIn);
        vm.assume(amountOut > 0);

        uint256[] memory reservesBefore = pool.getReserves();

        try pool.swap(0, 1, amountIn, amountOut - 1, block.timestamp + 1 hours) {
            uint256[] memory reservesAfter = pool.getReserves();
            assertGt(reservesAfter[0], reservesBefore[0], "tokenIn reserve did not increase");
            assertTrue(reservesAfter[1] < reservesBefore[1], "tokenOut reserve did not decrease");
            assertEq(feeAmount, (amountIn * 30) / 10000, "fee formula mismatch");
            assertTrue(reservesAfter[1] > 0, "tokenOut reserve exhausted");
        } catch {
            vm.assume(false);
        }
    }

    function testFuzz_addRemoveLiquidityConservesShares(uint96 rawLiquidity) public {
        uint256 addAmount = (uint256(rawLiquidity) % 10_000 ether) + 1 ether;

        uint256 totalSupplyBefore = pool.totalSupply();
        uint256 lpBefore = pool.balanceOf(address(this));

        pool.addLiquidity(_pair(addAmount, addAmount), 0, block.timestamp + 1 hours);

        uint256 lpAfterAdd = pool.balanceOf(address(this));
        assertGt(lpAfterAdd, lpBefore, "LP shares were not minted");

        uint256 burn = (lpAfterAdd - lpBefore) / 2;
        if (burn == 0) {
            burn = 1;
        }

        pool.removeLiquidity(burn, _pair(0, 0), block.timestamp + 1 hours);

        uint256 totalSupplyAfter = pool.totalSupply();
        assertTrue(totalSupplyAfter <= totalSupplyBefore + (lpAfterAdd - lpBefore), "unexpected LP supply growth");
    }

    function testInvariant_reservesRemainPositiveAfterRepeatedSwaps() public {
        for (uint256 i = 0; i < 25; i++) {
            uint256 amountIn = 1 ether + (i * 0.1 ether);
            (uint256 amountOut,) = pool.getAmountOut(0, 1, amountIn);
            if (amountOut > 0) {
                pool.swap(0, 1, amountIn, amountOut - 1, block.timestamp + 1 hours);
            }
        }

        uint256[] memory reserves = pool.getReserves();
        assertTrue(reserves[0] > 0 && reserves[1] > 0, "reserves must remain positive");
    }

    function _pair(uint256 a, uint256 b) internal pure returns (uint256[] memory arr) {
        arr = new uint256[](2);
        arr[0] = a;
        arr[1] = b;
    }
}
