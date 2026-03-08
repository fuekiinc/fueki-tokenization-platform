/**
 * Orbital AMM integration tests (Hardhat).
 *
 * Covers factory deployment/registry, pool liquidity + swap mechanics,
 * and router multi-hop execution across pools.
 */
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';

const { ethers } = hre;

describe('Orbital AMM integration', () => {
  async function deployFixture() {
    const [owner, trader, feeCollector] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    const tokenA = await MockERC20.deploy('Token A', 'TKA', 18);
    const tokenB = await MockERC20.deploy('Token B', 'TKB', 18);
    const tokenC = await MockERC20.deploy('Token C', 'TKC', 18);

    const mintAmount = ethers.parseUnits('1000000', 18);
    await Promise.all([
      tokenA.mint(owner.address, mintAmount),
      tokenB.mint(owner.address, mintAmount),
      tokenC.mint(owner.address, mintAmount),
      tokenA.mint(trader.address, mintAmount),
      tokenB.mint(trader.address, mintAmount),
      tokenC.mint(trader.address, mintAmount),
    ]);

    const Factory = await ethers.getContractFactory('OrbitalFactory');
    const factory = await Factory.deploy(owner.address, feeCollector.address, 30);

    const Router = await ethers.getContractFactory('OrbitalRouter');
    const router = await Router.deploy(await factory.getAddress(), owner.address);

    return { owner, trader, feeCollector, tokenA, tokenB, tokenC, factory, router };
  }

  it('creates pools and indexes them in factory registry', async () => {
    const { factory, tokenA, tokenB } = await loadFixture(deployFixture);

    await factory.createPool(
      [await tokenA.getAddress(), await tokenB.getAddress()],
      4,
      0,
      'TKA/TKB LP',
      'OTLP',
    );

    const pools = await factory.getAllPools();
    expect(pools).to.have.length(1);

    const indexed = await factory.getPool(
      [await tokenA.getAddress(), await tokenB.getAddress()],
      4,
    );
    expect(indexed).to.equal(pools[0]);

    const byToken = await factory.getPoolsForToken(await tokenA.getAddress());
    expect(byToken).to.include(pools[0]);
  });

  it('adds liquidity and executes direct pool swap with fee deduction', async () => {
    const { owner, trader, factory, tokenA, tokenB } = await loadFixture(deployFixture);

    await factory.createPool(
      [await tokenA.getAddress(), await tokenB.getAddress()],
      4,
      30,
      'TKA/TKB LP',
      'OTLP',
    );

    const poolAddress = (await factory.getAllPools())[0];
    const pool = await ethers.getContractAt('OrbitalPool', poolAddress);

    const initial = ethers.parseUnits('100000', 18);
    await tokenA.connect(owner).approve(poolAddress, initial);
    await tokenB.connect(owner).approve(poolAddress, initial);

    const deadline = (await time.latest()) + 3600;
    await pool.connect(owner).addLiquidity([initial, initial], 0, deadline);

    const amountIn = ethers.parseUnits('1000', 18);
    const quote = await pool.getAmountOut(0, 1, amountIn);

    await tokenA.connect(trader).approve(poolAddress, amountIn);
    const beforeOutBalance = await tokenB.balanceOf(trader.address);

    await pool.connect(trader).swap(0, 1, amountIn, quote[0] - 1n, deadline);

    const afterOutBalance = await tokenB.balanceOf(trader.address);
    expect(afterOutBalance).to.be.greaterThan(beforeOutBalance);

    const reserves = await pool.getReserves();
    expect(reserves[0]).to.be.greaterThan(initial);
    expect(reserves[1]).to.be.lessThan(initial);
    expect(quote[1]).to.equal((amountIn * 30n) / 10000n);
  });

  it('routes a multi-hop swap through two pools', async () => {
    const { owner, trader, factory, router, tokenA, tokenB, tokenC } = await loadFixture(deployFixture);

    await factory.createPool(
      [await tokenA.getAddress(), await tokenB.getAddress()],
      4,
      30,
      'TKA/TKB LP',
      'ABLP',
    );
    await factory.createPool(
      [await tokenB.getAddress(), await tokenC.getAddress()],
      4,
      30,
      'TKB/TKC LP',
      'BCLP',
    );

    const [poolAB, poolBC] = await factory.getAllPools();
    const poolABContract = await ethers.getContractAt('OrbitalPool', poolAB);
    const poolBCContract = await ethers.getContractAt('OrbitalPool', poolBC);

    const liq = ethers.parseUnits('200000', 18);
    const deadline = (await time.latest()) + 3600;

    await tokenA.connect(owner).approve(poolAB, liq);
    await tokenB.connect(owner).approve(poolAB, liq);
    await poolABContract.connect(owner).addLiquidity([liq, liq], 0, deadline);

    await tokenB.connect(owner).approve(poolBC, liq);
    await tokenC.connect(owner).approve(poolBC, liq);
    await poolBCContract.connect(owner).addLiquidity([liq, liq], 0, deadline);

    const amountIn = ethers.parseUnits('500', 18);
    await tokenA.connect(trader).approve(await router.getAddress(), amountIn);

    const before = await tokenC.balanceOf(trader.address);

    await router.connect(trader).swapMultiHop(
      [poolAB, poolBC],
      [await tokenA.getAddress(), await tokenB.getAddress(), await tokenC.getAddress()],
      amountIn,
      1,
      deadline,
    );

    const after = await tokenC.balanceOf(trader.address);
    expect(after).to.be.greaterThan(before);
  });
});
