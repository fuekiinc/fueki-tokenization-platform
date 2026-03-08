/**
 * Security token integration tests (Hardhat).
 *
 * Covers factory deployment, transfer-rule restriction paths,
 * restricted swap completion, and dividend claim flow.
 */
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';

const { ethers } = hre;

const ROLE_WALLETS_ADMIN = 4;
const ROLE_TRANSFER_ADMIN = 8;

describe('Security token integration', () => {
  async function deployFixture() {
    const [owner, alice, bob] = await ethers.getSigners();

    const Deployer = await ethers.getContractFactory('SecurityTokenDeployer');
    const deployer = await Deployer.deploy();

    const Factory = await ethers.getContractFactory('SecurityTokenFactory');
    const factory = await Factory.deploy(await deployer.getAddress());

    const args = [
      'Fueki Security Token',
      'FST',
      18,
      ethers.parseUnits('1000000', 18),
      ethers.parseUnits('5000000', 18),
      ethers.keccak256(ethers.toUtf8Bytes('ppm-v1')),
      'PPM',
      1_000_000,
      1,
      365 * 24 * 60 * 60,
    ];

    const [tokenAddress] = await factory.createSecurityToken.staticCall(...args);
    await factory.createSecurityToken(...args);

    const token = await ethers.getContractAt('RestrictedSwap', tokenAddress);

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    const quote = await MockERC20.deploy('Quote USD', 'QUSD', 18);
    await quote.mint(bob.address, ethers.parseUnits('100000', 18));
    await quote.mint(owner.address, ethers.parseUnits('100000', 18));

    return { owner, alice, bob, factory, token, quote };
  }

  it('registers token deployment and enforces transfer restrictions by code', async () => {
    const { owner, alice, factory, token } = await loadFixture(deployFixture);

    expect(await factory.getTotalTokens()).to.equal(1n);
    expect(await factory.isFactoryToken(await token.getAddress())).to.equal(true);

    await token.grantRole(owner.address, ROLE_WALLETS_ADMIN | ROLE_TRANSFER_ADMIN);

    await token.setTransferGroup(owner.address, 1);
    await token.setTransferGroup(alice.address, 2);

    const amount = ethers.parseUnits('10', 18);

    // Not approved group transfer.
    expect(await token.detectTransferRestriction(owner.address, alice.address, amount)).to.equal(7n);

    // Approved but locked until future.
    const future = (await time.latest()) + 3600;
    await token.setAllowGroupTransfer(1, 2, future);
    expect(await token.detectTransferRestriction(owner.address, alice.address, amount)).to.equal(8n);

    // Transfer allowed after lock expires.
    await token.setAllowGroupTransfer(1, 2, (await time.latest()) - 1);
    expect(await token.detectTransferRestriction(owner.address, alice.address, amount)).to.equal(0n);

    // Max balance exceeded.
    await token.setMaxBalance(alice.address, ethers.parseUnits('1', 18));
    expect(await token.detectTransferRestriction(owner.address, alice.address, amount)).to.equal(1n);

    // Frozen sender.
    await token.freeze(owner.address, true);
    expect(await token.detectTransferRestriction(owner.address, alice.address, amount)).to.equal(5n);

    await token.freeze(owner.address, false);
    await token.pause();
    expect(await token.detectTransferRestriction(owner.address, alice.address, amount)).to.equal(6n);
  });

  it('completes restricted swap and allows dividend claiming from snapshot', async () => {
    const { owner, bob, token, quote } = await loadFixture(deployFixture);

    await token.grantRole(owner.address, ROLE_WALLETS_ADMIN | ROLE_TRANSFER_ADMIN);
    await token.setTransferGroup(owner.address, 1);
    await token.setTransferGroup(bob.address, 2);
    await token.setAllowGroupTransfer(1, 2, (await time.latest()) - 1);
    await token.setAllowGroupTransfer(2, 1, (await time.latest()) - 1);

    const restrictedAmount = ethers.parseUnits('100', 18);
    const quoteAmount = ethers.parseUnits('250', 18);

    await token.configureSell(restrictedAmount, await quote.getAddress(), bob.address, quoteAmount);

    const ownerQuoteBefore = await quote.balanceOf(owner.address);
    const bobRestrictedBefore = await token.balanceOf(bob.address);

    await quote.connect(bob).approve(await token.getAddress(), quoteAmount);
    await token.connect(bob).completeSwapWithPaymentToken(1);

    const ownerQuoteAfter = await quote.balanceOf(owner.address);
    const bobRestrictedAfter = await token.balanceOf(bob.address);

    expect(ownerQuoteAfter - ownerQuoteBefore).to.equal(quoteAmount);
    expect(bobRestrictedAfter - bobRestrictedBefore).to.equal(restrictedAmount);

    // Dividend distribution and claim.
    const transferAmount = ethers.parseUnits('1000', 18);
    await token.transfer(bob.address, transferAmount);

    const snapshotId = await token.snapshot.staticCall();
    await token.snapshot();

    const dividendAmount = ethers.parseUnits('1000', 18);
    await quote.connect(owner).approve(await token.getAddress(), dividendAmount);
    await token.fundDividend(await quote.getAddress(), dividendAmount, snapshotId);

    const claimable = await token.unclaimedBalanceAt(await quote.getAddress(), bob.address, snapshotId);
    expect(claimable).to.be.greaterThan(0n);

    const bobQuoteBefore = await quote.balanceOf(bob.address);
    await token.connect(bob).claimDividend(await quote.getAddress(), snapshotId);
    const bobQuoteAfter = await quote.balanceOf(bob.address);

    expect(bobQuoteAfter).to.be.greaterThan(bobQuoteBefore);
  });
});
