import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';

const { ethers } = hre;

describe('NAVOracle integration', () => {
  async function deployFixture() {
    const [admin, publisher, unauthorized, holder] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    const token = await MockERC20.deploy('Pandora Equity', 'PAND', 18);

    const initialSupply = ethers.parseUnits('1000000', 18);
    await token.mint(holder.address, initialSupply);

    const NAVOracle = await ethers.getContractFactory('NAVOracle');
    const oracle = await NAVOracle.deploy(
      await token.getAddress(),
      'USD',
      24 * 60 * 60,
      5000,
      admin.address,
    );

    await oracle.connect(admin).grantRole(await oracle.NAV_PUBLISHER_ROLE(), publisher.address);

    return {
      admin,
      publisher,
      unauthorized,
      holder,
      token,
      oracle,
      initialSupply,
    };
  }

  it('stores and exposes published attestations', async () => {
    const { oracle, publisher, holder, initialSupply } = await loadFixture(deployFixture);
    const navPerToken = 5_000_000n;
    const totalNav = 5_000_000_000_000n;
    const reportHash = ethers.keccak256(ethers.toUtf8Bytes('report-v1'));

    await expect(
      oracle.connect(publisher).publishNAV(
        navPerToken,
        totalNav,
        initialSupply,
        BigInt(await time.latest()),
        reportHash,
        'ipfs://report-v1',
      ),
    ).to.emit(oracle, 'NAVPublished');

    expect(await oracle.attestationCount()).to.equal(1n);
    expect(await oracle.currentNAVPerToken()).to.equal(navPerToken);
    expect(await oracle.currentTotalNAV()).to.equal(totalNav);

    const latest = await oracle.latestAttestation();
    expect(latest.publisher).to.equal(publisher.address);
    expect(latest.reportHash).to.equal(reportHash);
    expect(latest.reportURI).to.equal('ipfs://report-v1');

    const holderValue = await oracle.holderValue(holder.address);
    expect(holderValue).to.equal(totalNav);
  });

  it('rejects invalid publishes and unauthorized callers', async () => {
    const { oracle, publisher, unauthorized, initialSupply } = await loadFixture(deployFixture);
    const now = BigInt(await time.latest());

    await expect(
      oracle.connect(unauthorized).publishNAV(
        5_000_000n,
        5_000_000_000_000n,
        initialSupply,
        now,
        ethers.keccak256(ethers.toUtf8Bytes('report')),
        'ipfs://report',
      ),
    ).to.be.reverted;

    await expect(
      oracle.connect(publisher).publishNAV(
        0,
        5_000_000_000_000n,
        initialSupply,
        now,
        ethers.keccak256(ethers.toUtf8Bytes('report')),
        'ipfs://report',
      ),
    ).to.be.revertedWithCustomError(oracle, 'InvalidNavPerToken');

    await expect(
      oracle.connect(publisher).publishNAV(
        5_000_000n,
        5_000_000_000_000n,
        initialSupply - 1n,
        now,
        ethers.keccak256(ethers.toUtf8Bytes('report')),
        'ipfs://report',
      ),
    ).to.be.revertedWithCustomError(oracle, 'SupplyMismatch');

    await expect(
      oracle.connect(publisher).publishNAV(
        5_000_000n,
        5_000_000_000_000n,
        initialSupply,
        now,
        ethers.ZeroHash,
        'ipfs://report',
      ),
    ).to.be.revertedWithCustomError(oracle, 'InvalidReportHash');
  });

  it('enforces frequency limits and circuit breakers', async () => {
    const { oracle, publisher, initialSupply } = await loadFixture(deployFixture);
    const firstHash = ethers.keccak256(ethers.toUtf8Bytes('report-v1'));

    await oracle.connect(publisher).publishNAV(
      5_000_000n,
      5_000_000_000_000n,
      initialSupply,
      BigInt(await time.latest()),
      firstHash,
      'ipfs://report-v1',
    );

    await expect(
      oracle.connect(publisher).publishNAV(
        5_100_000n,
        5_100_000_000_000n,
        initialSupply,
        BigInt(await time.latest()),
        ethers.keccak256(ethers.toUtf8Bytes('report-v2')),
        'ipfs://report-v2',
      ),
    ).to.be.revertedWithCustomError(oracle, 'AttestationTooFrequent');

    await time.increase(24 * 60 * 60 + 1);

    await expect(
      oracle.connect(publisher).publishNAV(
        8_000_001n,
        8_000_001_000_000n,
        initialSupply,
        BigInt(await time.latest()),
        ethers.keccak256(ethers.toUtf8Bytes('report-v3')),
        'ipfs://report-v3',
      ),
    ).to.be.revertedWithCustomError(oracle, 'NAVChangeExceedsThreshold');

    await oracle.connect(publisher).publishNAV(
      7_450_000n,
      7_450_000_000_000n,
      initialSupply,
      BigInt(await time.latest()),
      ethers.keccak256(ethers.toUtf8Bytes('report-v4')),
      'ipfs://report-v4',
    );

    const page = await oracle.getAttestations(0, 10);
    expect(page).to.have.length(2);
    expect(page[1].navPerToken).to.equal(7_450_000n);
  });

  it('allows nav admins to update parameters and pause publishing', async () => {
    const { oracle, admin, publisher, initialSupply } = await loadFixture(deployFixture);

    await expect(oracle.connect(admin).updateParameters(7 * 24 * 60 * 60, 2500))
      .to.emit(oracle, 'NAVParametersUpdated')
      .withArgs(7 * 24 * 60 * 60, 2500);

    expect(await oracle.minAttestationInterval()).to.equal(7 * 24 * 60 * 60);
    expect(await oracle.maxNavChangeBps()).to.equal(2500);

    await oracle.connect(admin).pause();
    await expect(
      oracle.connect(publisher).publishNAV(
        5_000_000n,
        5_000_000_000_000n,
        initialSupply,
        BigInt(await time.latest()),
        ethers.keccak256(ethers.toUtf8Bytes('paused-report')),
        'ipfs://paused-report',
      ),
    ).to.be.reverted;

    await oracle.connect(admin).unpause();
    await oracle.connect(publisher).publishNAV(
      5_000_000n,
      5_000_000_000_000n,
      initialSupply,
      BigInt(await time.latest()),
      ethers.keccak256(ethers.toUtf8Bytes('report-after-unpause')),
      'ipfs://report-after-unpause',
    );

    expect(await oracle.attestationCount()).to.equal(1n);
  });
});
