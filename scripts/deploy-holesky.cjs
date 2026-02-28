const hre = require("hardhat");

function readAddressEnv(name) {
  const value = (process.env[name] || "").trim();
  if (!value) return "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`Invalid address in ${name}: ${value}`);
  }
  return value;
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();

  const existingWrappedAssetFactoryAddress = readAddressEnv(
    "EXISTING_WRAPPED_ASSET_FACTORY_ADDRESS"
  );
  const existingAssetExchangeAddress = readAddressEnv(
    "EXISTING_ASSET_EXCHANGE_ADDRESS"
  );
  const existingSecurityTokenDeployerAddress = readAddressEnv(
    "EXISTING_SECURITY_TOKEN_DEPLOYER_ADDRESS"
  );
  const existingSecurityTokenFactoryAddress = readAddressEnv(
    "EXISTING_SECURITY_TOKEN_FACTORY_ADDRESS"
  );
  const existingAssetBackedExchangeAddress = readAddressEnv(
    "EXISTING_ASSET_BACKED_EXCHANGE_ADDRESS"
  );
  const existingLiquidityPoolAMMAddress = readAddressEnv(
    "EXISTING_LIQUIDITY_POOL_AMM_ADDRESS"
  );

  let nextNonce = await hre.ethers.provider.getTransactionCount(
    deployer.address,
    "pending"
  );

  console.log("=".repeat(60));
  console.log(
    `Deploying contracts to ${hre.network.name} (chainId: ${network.chainId})`
  );
  console.log("=".repeat(60));
  console.log("Deployer address:", deployer.address);
  console.log("Starting nonce:", nextNonce);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", hre.ethers.formatEther(balance), "ETH");

  if (balance === 0n) {
    console.error(
      "ERROR: Deployer has zero balance. Fund the deployer account before retrying."
    );
    process.exit(1);
  }

  console.log("");

  // ---------------------------------------------------------------
  //  1. Deploy WrappedAssetFactory
  // ---------------------------------------------------------------
  let wrappedAssetFactoryAddress = existingWrappedAssetFactoryAddress;
  if (wrappedAssetFactoryAddress) {
    console.log("[1/6] Reusing existing WrappedAssetFactory...");
    console.log("  WrappedAssetFactory:", wrappedAssetFactoryAddress);
  } else {
    console.log("[1/6] Deploying WrappedAssetFactory...");
    const WrappedAssetFactory = await hre.ethers.getContractFactory(
      "WrappedAssetFactory"
    );
    const wrappedAssetFactory = await WrappedAssetFactory.deploy({
      nonce: nextNonce++,
    });
    await wrappedAssetFactory.waitForDeployment();
    wrappedAssetFactoryAddress = await wrappedAssetFactory.getAddress();
    console.log("  WrappedAssetFactory deployed to:", wrappedAssetFactoryAddress);
  }

  // ---------------------------------------------------------------
  //  2. Deploy AssetExchange
  // ---------------------------------------------------------------
  let assetExchangeAddress = existingAssetExchangeAddress;
  if (assetExchangeAddress) {
    console.log("[2/6] Reusing existing AssetExchange...");
    console.log("  AssetExchange:", assetExchangeAddress);
  } else {
    console.log("[2/6] Deploying AssetExchange...");
    const AssetExchange = await hre.ethers.getContractFactory("AssetExchange");
    const assetExchange = await AssetExchange.deploy({ nonce: nextNonce++ });
    await assetExchange.waitForDeployment();
    assetExchangeAddress = await assetExchange.getAddress();
    console.log("  AssetExchange deployed to:", assetExchangeAddress);
  }

  // ---------------------------------------------------------------
  //  3. Deploy SecurityTokenDeployer (helper for SecurityTokenFactory)
  // ---------------------------------------------------------------
  let securityTokenDeployerAddress = existingSecurityTokenDeployerAddress;
  if (securityTokenDeployerAddress) {
    console.log("[3/6] Reusing existing SecurityTokenDeployer...");
    console.log("  SecurityTokenDeployer:", securityTokenDeployerAddress);
  } else {
    console.log("[3/6] Deploying SecurityTokenDeployer...");
    const SecurityTokenDeployer = await hre.ethers.getContractFactory(
      "SecurityTokenDeployer"
    );
    const securityTokenDeployer = await SecurityTokenDeployer.deploy({
      nonce: nextNonce++,
    });
    await securityTokenDeployer.waitForDeployment();
    securityTokenDeployerAddress = await securityTokenDeployer.getAddress();
    console.log(
      "  SecurityTokenDeployer deployed to:",
      securityTokenDeployerAddress
    );
  }

  // ---------------------------------------------------------------
  //  4. Deploy SecurityTokenFactory (with deployer address)
  // ---------------------------------------------------------------
  let securityTokenFactoryAddress = existingSecurityTokenFactoryAddress;
  if (securityTokenFactoryAddress) {
    console.log("[4/6] Reusing existing SecurityTokenFactory...");
    console.log("  SecurityTokenFactory:", securityTokenFactoryAddress);
  } else {
    console.log("[4/6] Deploying SecurityTokenFactory...");
    const SecurityTokenFactory = await hre.ethers.getContractFactory(
      "SecurityTokenFactory"
    );
    const securityTokenFactory = await SecurityTokenFactory.deploy(
      securityTokenDeployerAddress,
      { nonce: nextNonce++ }
    );
    await securityTokenFactory.waitForDeployment();
    securityTokenFactoryAddress = await securityTokenFactory.getAddress();
    console.log("  SecurityTokenFactory deployed to:", securityTokenFactoryAddress);
  }

  // ---------------------------------------------------------------
  //  5. Deploy AssetBackedExchange
  // ---------------------------------------------------------------
  let assetBackedExchangeAddress = existingAssetBackedExchangeAddress;
  if (assetBackedExchangeAddress) {
    console.log("[5/6] Reusing existing AssetBackedExchange...");
    console.log("  AssetBackedExchange:", assetBackedExchangeAddress);
  } else {
    console.log("[5/6] Deploying AssetBackedExchange...");
    const AssetBackedExchange = await hre.ethers.getContractFactory(
      "AssetBackedExchange"
    );
    const assetBackedExchange = await AssetBackedExchange.deploy(
      deployer.address,
      { nonce: nextNonce++ }
    );
    await assetBackedExchange.waitForDeployment();
    assetBackedExchangeAddress = await assetBackedExchange.getAddress();
    console.log("  AssetBackedExchange deployed to:", assetBackedExchangeAddress);
  }

  // ---------------------------------------------------------------
  //  6. Deploy LiquidityPoolAMM
  // ---------------------------------------------------------------
  let liquidityPoolAMMAddress = existingLiquidityPoolAMMAddress;
  if (liquidityPoolAMMAddress) {
    console.log("[6/6] Reusing existing LiquidityPoolAMM...");
    console.log("  LiquidityPoolAMM:", liquidityPoolAMMAddress);
  } else {
    console.log("[6/6] Deploying LiquidityPoolAMM...");
    const LiquidityPoolAMM = await hre.ethers.getContractFactory(
      "LiquidityPoolAMM"
    );
    const liquidityPoolAMM = await LiquidityPoolAMM.deploy(deployer.address, {
      nonce: nextNonce++,
    });
    await liquidityPoolAMM.waitForDeployment();
    liquidityPoolAMMAddress = await liquidityPoolAMM.getAddress();
    console.log("  LiquidityPoolAMM deployed to:", liquidityPoolAMMAddress);
  }

  // ---------------------------------------------------------------
  //  Summary
  // ---------------------------------------------------------------
  console.log("");
  console.log("=".repeat(60));
  console.log(
    `DEPLOYMENT COMPLETE - ${hre.network.name} (chainId: ${network.chainId})`
  );
  console.log("=".repeat(60));
  console.log("WrappedAssetFactory:      ", wrappedAssetFactoryAddress);
  console.log("AssetExchange:            ", assetExchangeAddress);
  console.log("SecurityTokenDeployer:    ", securityTokenDeployerAddress);
  console.log("SecurityTokenFactory:     ", securityTokenFactoryAddress);
  console.log("AssetBackedExchange:      ", assetBackedExchangeAddress);
  console.log("LiquidityPoolAMM:         ", liquidityPoolAMMAddress);
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
