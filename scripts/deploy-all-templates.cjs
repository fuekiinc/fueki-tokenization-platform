/**
 * Deploy all 16 template contracts to a target network.
 *
 * Usage:
 *   DEPLOYER_PRIVATE_KEY=<key> npx hardhat run scripts/deploy-all-templates.cjs --network arbitrumSepolia
 *   DEPLOYER_PRIVATE_KEY=<key> npx hardhat run scripts/deploy-all-templates.cjs --network holesky
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Artifact mapping: template ID -> Hardhat artifact path
// ---------------------------------------------------------------------------

const TEMPLATE_ARTIFACTS = {
  "simple-token": "contracts/templates/tokens/FixedToken.sol:FixedToken",
  "voting-token": "contracts/templates/tokens/VotingToken.sol:VotingToken",
  "antibot-erc20": "contracts/templates/tokens/AntiBotERC20.sol:AntiBotERC20",
  "buyback-baby-token":
    "contracts/templates/tokens/buyback/BuybackBabyToken.sol:BuybackBabyToken",
  "soulbound-nft": "contracts/templates/nfts/SoulboundNFT.sol:SoulboundNFT",
  "simple-multi-nft":
    "contracts/templates/nfts/SimpleERC1155.sol:SimpleERC1155",
  "simple-staking":
    "contracts/templates/staking/SingleStaking.sol:SingleStaking",
  "token-staking": "contracts/templates/staking/Staking.sol:Staking",
  "nft-staking-rewards":
    "contracts/templates/staking/NFTStakingPerToken.sol:NFTStakingPerToken",
  "linear-vesting":
    "contracts/templates/staking/LinearVesting.sol:LinearVesting",
  "dutch-auction": "contracts/templates/trading/DutchAuction.sol:DutchAuction",
  "presale": "contracts/templates/trading/Presale.sol:Presale",
  "escrow-agent":
    "contracts/templates/utility/EscrowWithAgent.sol:EscrowWithAgent",
  "escrow-dual": "contracts/templates/utility/Escrow.sol:Escrow",
  "royalty-splitter":
    "contracts/templates/utility/PaymentSplitter.sol:PaymentSplitter",
  "lottery": "contracts/templates/utility/Lottery.sol:Lottery",
};

// ---------------------------------------------------------------------------
// Constructor arguments per template (testnet defaults)
// ---------------------------------------------------------------------------

function getConstructorArgs(templateId, deployer) {
  const now = Math.floor(Date.now() / 1000);

  switch (templateId) {
    case "simple-token":
      return ["Fueki Test Token", "FTT", hre.ethers.parseEther("1000000")];

    case "voting-token":
      return ["Fueki Governance", "vFUEKI", hre.ethers.parseEther("10000000")];

    case "antibot-erc20":
      return [];

    case "buyback-baby-token":
      return [
        "BuybackBaby Test",
        "BBT",
        hre.ethers.parseEther("1000000000"),
        deployer, // rewardToken placeholder
        deployer, // router placeholder
        [300n, 300n, 200n, 100n, 100n], // feeSettings
        deployer, // serviceFeeReceiver
        0n, // serviceFee
      ];

    case "soulbound-nft":
      return [
        "Fueki Credentials",
        "FCRED",
        "https://fueki.io/metadata/soulbound/",
        1000n,
      ];

    case "simple-multi-nft":
      return ["https://fueki.io/metadata/erc1155/{id}.json"];

    case "simple-staking":
      return [deployer]; // stakingToken placeholder

    case "token-staking":
      return [
        deployer, // oilerToken placeholder
        50400n, // ~7 days in blocks
        hre.ethers.parseEther("100000"),
        2592000n, // 30 days vesting
        deployer, // owner
      ];

    case "nft-staking-rewards":
      return [
        deployer, // nftAddress placeholder
        deployer, // rewardTokenAddress placeholder
        deployer, // rewardWalletAddress
        10n, // rewardRate
      ];

    case "linear-vesting":
      return [
        deployer, // token placeholder
        BigInt(now + 3600), // start: 1 hour from now
        BigInt(now + 3600 * 24 * 365), // end: 1 year from now
        2592000n, // cliff: 30 days
      ];

    case "dutch-auction":
      return [];

    case "presale":
      return [
        deployer, // token placeholder
        deployer, // priceFeed placeholder
      ];

    case "escrow-agent":
      return [];

    case "escrow-dual":
      return [];

    case "royalty-splitter":
      return [[deployer], [100n]]; // 1 payee with 100 shares

    case "lottery":
      return [1n, deployer]; // midpointID, startpointAddress placeholder

    default:
      throw new Error(`Unknown template: ${templateId}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const balance = await hre.ethers.provider.getBalance(deployer.address);

  console.log("=".repeat(70));
  console.log(`Network:   ${hre.network.name} (Chain ID: ${chainId})`);
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Balance:   ${hre.ethers.formatEther(balance)} ETH`);
  console.log("=".repeat(70));
  console.log("");

  if (balance === 0n) {
    console.error(
      "ERROR: Deployer has zero balance. Fund the deployer account before retrying."
    );
    process.exit(1);
  }

  const results = [];
  const failed = [];

  for (const [templateId, artifactName] of Object.entries(TEMPLATE_ARTIFACTS)) {
    console.log(`\n--- Deploying: ${templateId} ---`);

    try {
      const factory = await hre.ethers.getContractFactory(artifactName);
      const args = getConstructorArgs(templateId, deployer.address);

      console.log(`  Constructor args: ${args.length} params`);

      const contract = await factory.deploy(...args);
      const tx = contract.deploymentTransaction();

      console.log(`  Tx hash:  ${tx?.hash}`);
      console.log("  Waiting for confirmation...");

      await contract.waitForDeployment();
      const address = await contract.getAddress();
      const receipt = await tx?.wait();
      const gasUsed = receipt?.gasUsed?.toString() ?? "unknown";

      console.log(`  Address:  ${address}`);
      console.log(`  Gas used: ${gasUsed}`);

      results.push({
        id: templateId,
        address,
        txHash: tx?.hash ?? "",
        gasUsed,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const shortMsg =
        message.length > 300 ? message.slice(0, 300) + "..." : message;
      console.error(`  FAILED: ${shortMsg}`);
      failed.push({ id: templateId, error: shortMsg });
    }
  }

  // Print summary
  console.log("\n" + "=".repeat(70));
  console.log("DEPLOYMENT SUMMARY");
  console.log("=".repeat(70));
  console.log(`Network:  ${hre.network.name} (Chain ID: ${chainId})`);
  console.log(
    `Deployed: ${results.length}/${Object.keys(TEMPLATE_ARTIFACTS).length}`
  );
  console.log(`Failed:   ${failed.length}`);
  console.log("");

  if (results.length > 0) {
    console.log("Deployed contracts:");
    for (const r of results) {
      console.log(
        `  ${r.id.padEnd(24)} ${r.address}  (gas: ${r.gasUsed})`
      );
    }
  }

  if (failed.length > 0) {
    console.log("\nFailed deployments:");
    for (const f of failed) {
      console.log(`  ${f.id}: ${f.error}`);
    }
  }

  // Save results to JSON
  const outputPath = path.join(
    __dirname,
    "..",
    `deployments-${hre.network.name}-${chainId}.json`
  );
  const output = {
    network: hre.network.name,
    chainId,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: results,
    failures: failed,
  };
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
