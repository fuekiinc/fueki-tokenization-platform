const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("=".repeat(60));
  console.log("Deploying contracts to Holesky testnet");
  console.log("=".repeat(60));
  console.log("Deployer address:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", hre.ethers.formatEther(balance), "ETH");

  if (balance === 0n) {
    console.error("ERROR: Deployer has zero balance. Fund the account with Holesky ETH first.");
    process.exit(1);
  }

  console.log("");

  // ---------------------------------------------------------------
  //  1. Deploy WrappedAssetFactory
  // ---------------------------------------------------------------
  console.log("[1/5] Deploying WrappedAssetFactory...");
  const WrappedAssetFactory = await hre.ethers.getContractFactory("WrappedAssetFactory");
  const wrappedAssetFactory = await WrappedAssetFactory.deploy();
  await wrappedAssetFactory.waitForDeployment();
  const wrappedAssetFactoryAddress = await wrappedAssetFactory.getAddress();
  console.log("  WrappedAssetFactory deployed to:", wrappedAssetFactoryAddress);

  // ---------------------------------------------------------------
  //  2. Deploy AssetExchange
  // ---------------------------------------------------------------
  console.log("[2/5] Deploying AssetExchange...");
  const AssetExchange = await hre.ethers.getContractFactory("AssetExchange");
  const assetExchange = await AssetExchange.deploy();
  await assetExchange.waitForDeployment();
  const assetExchangeAddress = await assetExchange.getAddress();
  console.log("  AssetExchange deployed to:", assetExchangeAddress);

  // ---------------------------------------------------------------
  //  3. Deploy SecurityTokenDeployer (helper for SecurityTokenFactory)
  // ---------------------------------------------------------------
  console.log("[3/5] Deploying SecurityTokenDeployer...");
  const SecurityTokenDeployer = await hre.ethers.getContractFactory("SecurityTokenDeployer");
  const securityTokenDeployer = await SecurityTokenDeployer.deploy();
  await securityTokenDeployer.waitForDeployment();
  const securityTokenDeployerAddress = await securityTokenDeployer.getAddress();
  console.log("  SecurityTokenDeployer deployed to:", securityTokenDeployerAddress);

  // ---------------------------------------------------------------
  //  4. Deploy SecurityTokenFactory (with deployer address)
  // ---------------------------------------------------------------
  console.log("[4/5] Deploying SecurityTokenFactory...");
  const SecurityTokenFactory = await hre.ethers.getContractFactory("SecurityTokenFactory");
  const securityTokenFactory = await SecurityTokenFactory.deploy(securityTokenDeployerAddress);
  await securityTokenFactory.waitForDeployment();
  const securityTokenFactoryAddress = await securityTokenFactory.getAddress();
  console.log("  SecurityTokenFactory deployed to:", securityTokenFactoryAddress);

  // ---------------------------------------------------------------
  //  5. Deploy AssetBackedExchange
  // ---------------------------------------------------------------
  console.log("[5/5] Deploying AssetBackedExchange...");
  const AssetBackedExchange = await hre.ethers.getContractFactory("AssetBackedExchange");
  const assetBackedExchange = await AssetBackedExchange.deploy();
  await assetBackedExchange.waitForDeployment();
  const assetBackedExchangeAddress = await assetBackedExchange.getAddress();
  console.log("  AssetBackedExchange deployed to:", assetBackedExchangeAddress);

  // ---------------------------------------------------------------
  //  Summary
  // ---------------------------------------------------------------
  console.log("");
  console.log("=".repeat(60));
  console.log("DEPLOYMENT COMPLETE - Holesky Testnet (Chain ID: 17000)");
  console.log("=".repeat(60));
  console.log("WrappedAssetFactory:      ", wrappedAssetFactoryAddress);
  console.log("AssetExchange:            ", assetExchangeAddress);
  console.log("SecurityTokenDeployer:    ", securityTokenDeployerAddress);
  console.log("SecurityTokenFactory:     ", securityTokenFactoryAddress);
  console.log("AssetBackedExchange:      ", assetBackedExchangeAddress);
  console.log("=".repeat(60));

  const finalBalance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer final balance:", hre.ethers.formatEther(finalBalance), "ETH");
  console.log("Gas spent:", hre.ethers.formatEther(balance - finalBalance), "ETH");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
