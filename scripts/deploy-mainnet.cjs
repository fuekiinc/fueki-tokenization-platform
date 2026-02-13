const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("=".repeat(60));
  console.log("Deploying contracts to Ethereum Mainnet");
  console.log("=".repeat(60));
  console.log("Deployer address:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", hre.ethers.formatEther(balance), "ETH");

  if (balance === 0n) {
    console.error("ERROR: Deployer has zero balance. Fund the account with ETH first.");
    process.exit(1);
  }

  console.log("");

  // Already deployed in previous run:
  const wrappedAssetFactoryAddress = "0xf7d3fC3b395b4Add020fF46B7ceA9E4c404ab4dB";
  const assetExchangeAddress = "0xcC54Dd0Af5AAeDfAC3bfD55dAd3884Dc4533130C";
  console.log("Using previously deployed contracts:");
  console.log("  WrappedAssetFactory:", wrappedAssetFactoryAddress);
  console.log("  AssetExchange:     ", assetExchangeAddress);
  console.log("");

  // ---------------------------------------------------------------
  //  3. Deploy AssetBackedExchange
  // ---------------------------------------------------------------
  console.log("[3/4] Deploying AssetBackedExchange...");
  const AssetBackedExchange = await hre.ethers.getContractFactory("AssetBackedExchange");
  const assetBackedExchange = await AssetBackedExchange.deploy();
  await assetBackedExchange.waitForDeployment();
  const assetBackedExchangeAddress = await assetBackedExchange.getAddress();
  console.log("  AssetBackedExchange deployed to:", assetBackedExchangeAddress);

  // ---------------------------------------------------------------
  //  4. Deploy LiquidityPoolAMM
  // ---------------------------------------------------------------
  console.log("[4/4] Deploying LiquidityPoolAMM...");
  const LiquidityPoolAMM = await hre.ethers.getContractFactory("LiquidityPoolAMM");
  const liquidityPoolAMM = await LiquidityPoolAMM.deploy();
  await liquidityPoolAMM.waitForDeployment();
  const liquidityPoolAMMAddress = await liquidityPoolAMM.getAddress();
  console.log("  LiquidityPoolAMM deployed to:", liquidityPoolAMMAddress);

  // ---------------------------------------------------------------
  //  Summary
  // ---------------------------------------------------------------
  console.log("");
  console.log("=".repeat(60));
  console.log("DEPLOYMENT COMPLETE - Ethereum Mainnet (Chain ID: 1)");
  console.log("=".repeat(60));
  console.log("WrappedAssetFactory:      ", wrappedAssetFactoryAddress);
  console.log("AssetExchange:            ", assetExchangeAddress);
  console.log("AssetBackedExchange:      ", assetBackedExchangeAddress);
  console.log("LiquidityPoolAMM:         ", liquidityPoolAMMAddress);
  console.log("=".repeat(60));

  const finalBalance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("");
  console.log("Deployer final balance:", hre.ethers.formatEther(finalBalance), "ETH");
  console.log("Gas spent:", hre.ethers.formatEther(balance - finalBalance), "ETH");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
