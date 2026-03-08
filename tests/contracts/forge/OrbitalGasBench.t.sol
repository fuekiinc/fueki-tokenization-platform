// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {TestBase} from "./TestBase.sol";
import {OrbitalFactory} from "contracts/orbital/OrbitalFactory.sol";
import {OrbitalPool} from "contracts/orbital/OrbitalPool.sol";
import {OrbitalRouter} from "contracts/orbital/OrbitalRouter.sol";
import {MockERC20} from "contracts/test/MockERC20.sol";

contract OrbitalGasBenchTest is TestBase {
    MockERC20 internal tokenA;
    MockERC20 internal tokenB;
    MockERC20 internal tokenC;
    OrbitalFactory internal factory;
    OrbitalPool internal poolAB;
    OrbitalPool internal poolBC;
    OrbitalRouter internal router;

    function setUp() public {
        tokenA = new MockERC20("Token A", "TKA", 18);
        tokenB = new MockERC20("Token B", "TKB", 18);
        tokenC = new MockERC20("Token C", "TKC", 18);

        tokenA.mint(address(this), 5_000_000 ether);
        tokenB.mint(address(this), 5_000_000 ether);
        tokenC.mint(address(this), 5_000_000 ether);

        factory = new OrbitalFactory(address(this), address(this), 30);
        router = new OrbitalRouter(address(factory), address(this));

        address[] memory pairAB = new address[](2);
        pairAB[0] = address(tokenA);
        pairAB[1] = address(tokenB);
        factory.createPool(pairAB, 2, 30, "AB", "ABLP");

        address[] memory pairBC = new address[](2);
        pairBC[0] = address(tokenB);
        pairBC[1] = address(tokenC);
        factory.createPool(pairBC, 2, 30, "BC", "BCLP");

        address[] memory pools = factory.getAllPools();
        poolAB = OrbitalPool(pools[0]);
        poolBC = OrbitalPool(pools[1]);

        tokenA.approve(address(poolAB), type(uint256).max);
        tokenB.approve(address(poolAB), type(uint256).max);
        tokenB.approve(address(poolBC), type(uint256).max);
        tokenC.approve(address(poolBC), type(uint256).max);

        poolAB.addLiquidity(_pair(1_000_000 ether, 1_000_000 ether), 0, block.timestamp + 1 hours);
        poolBC.addLiquidity(_pair(1_000_000 ether, 1_000_000 ether), 0, block.timestamp + 1 hours);

        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        tokenC.approve(address(router), type(uint256).max);
    }

    function testGas_swap2Token() public {
        (uint256 out,) = poolAB.getAmountOut(0, 1, 1_000 ether);
        poolAB.swap(0, 1, 1_000 ether, out - 1, block.timestamp + 1 hours);
    }

    function testGas_tickCrossingSwap() public {
        uint256 largeAmountIn = 100_000 ether;
        (uint256 out,) = poolAB.getAmountOut(0, 1, largeAmountIn);
        poolAB.swap(0, 1, largeAmountIn, out - 1, block.timestamp + 1 hours);
    }

    function testGas_quote() public {
        poolAB.getAmountOut(0, 1, 1_000 ether);
    }

    function testGas_addLiquidity() public {
        poolAB.addLiquidity(_pair(10_000 ether, 10_000 ether), 0, block.timestamp + 1 hours);
    }

    function testGas_removeLiquidity() public {
        uint256 lp = poolAB.balanceOf(address(this)) / 10;
        poolAB.removeLiquidity(lp, _pair(0, 0), block.timestamp + 1 hours);
    }

    function testGas_routerMultiHop2() public {
        address[] memory pools = new address[](2);
        pools[0] = address(poolAB);
        pools[1] = address(poolBC);

        address[] memory path = new address[](3);
        path[0] = address(tokenA);
        path[1] = address(tokenB);
        path[2] = address(tokenC);

        router.swapMultiHop(pools, path, 1_000 ether, 1, block.timestamp + 1 hours);
    }

    function _pair(uint256 a, uint256 b) internal pure returns (uint256[] memory arr) {
        arr = new uint256[](2);
        arr[0] = a;
        arr[1] = b;
    }
}
