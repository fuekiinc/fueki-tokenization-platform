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
  const existingOrbitalFactoryAddress = readAddressEnv(
    "EXISTING_ORBITAL_FACTORY_ADDRESS"
  );
  const existingOrbitalRouterAddress = readAddressEnv(
    "EXISTING_ORBITAL_ROUTER_ADDRESS"
  );

  let nextNonce = await hre.ethers.provider.getTransactionCount(
    deployer.address,
    "pending"
  );

  console.log("=".repeat(60));
  console.log(
    `Deploying ALL contracts to ${hre.network.name} (chainId: ${network.chainId})`
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
    console.log("[1/8] Reusing existing WrappedAssetFactory...");
    console.log("  WrappedAssetFactory:", wrappedAssetFactoryAddress);
  } else {
    console.log("[1/8] Deploying WrappedAssetFactory...");
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
    console.log("[2/8] Reusing existing AssetExchange...");
    console.log("  AssetExchange:", assetExchangeAddress);
  } else {
    console.log("[2/8] Deploying AssetExchange...");
    const AssetExchange = await hre.ethers.getContractFactory("AssetExchange");
    const assetExchange = await AssetExchange.deploy({ nonce: nextNonce++ });
    await assetExchange.waitForDeployment();
    assetExchangeAddress = await assetExchange.getAddress();
    console.log("  AssetExchange deployed to:", assetExchangeAddress);
  }

  // ---------------------------------------------------------------
  //  3. Deploy SecurityTokenDeployer
  // ---------------------------------------------------------------
  let securityTokenDeployerAddress = existingSecurityTokenDeployerAddress;
  if (securityTokenDeployerAddress) {
    console.log("[3/8] Reusing existing SecurityTokenDeployer...");
    console.log("  SecurityTokenDeployer:", securityTokenDeployerAddress);
  } else {
    console.log("[3/8] Deploying SecurityTokenDeployer...");
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
  //  4. Deploy SecurityTokenFactory
  // ---------------------------------------------------------------
  let securityTokenFactoryAddress = existingSecurityTokenFactoryAddress;
  if (securityTokenFactoryAddress) {
    console.log("[4/8] Reusing existing SecurityTokenFactory...");
    console.log("  SecurityTokenFactory:", securityTokenFactoryAddress);
  } else {
    console.log("[4/8] Deploying SecurityTokenFactory...");
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
    console.log("[5/8] Reusing existing AssetBackedExchange...");
    console.log("  AssetBackedExchange:", assetBackedExchangeAddress);
  } else {
    console.log("[5/8] Deploying AssetBackedExchange...");
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
    console.log("[6/8] Reusing existing LiquidityPoolAMM...");
    console.log("  LiquidityPoolAMM:", liquidityPoolAMMAddress);
  } else {
    console.log("[6/8] Deploying LiquidityPoolAMM...");
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
  //  7. Deploy OrbitalFactory
  // ---------------------------------------------------------------
  let orbitalFactoryAddress = existingOrbitalFactoryAddress;
  if (orbitalFactoryAddress) {
    console.log("[7/8] Reusing existing OrbitalFactory...");
    console.log("  OrbitalFactory:", orbitalFactoryAddress);
  } else {
    console.log("[7/8] Deploying OrbitalFactory...");
    const OrbitalFactory = await hre.ethers.getContractFactory("OrbitalFactory", {
      libraries: {},
    });
    const orbitalFactory = await OrbitalFactory.deploy(
      deployer.address, // admin
      deployer.address, // default fee collector
      4, // default swap fee: 4 bps (0.04%)
      { nonce: nextNonce++ }
    );
    await orbitalFactory.waitForDeployment();
    orbitalFactoryAddress = await orbitalFactory.getAddress();
    console.log("  OrbitalFactory deployed to:", orbitalFactoryAddress);
  }

  // ---------------------------------------------------------------
  //  8. Deploy OrbitalRouter
  // ---------------------------------------------------------------
  let orbitalRouterAddress = existingOrbitalRouterAddress;
  if (orbitalRouterAddress) {
    console.log("[8/8] Reusing existing OrbitalRouter...");
    console.log("  OrbitalRouter:", orbitalRouterAddress);
  } else {
    console.log("[8/8] Deploying OrbitalRouter...");
    const OrbitalRouter = await hre.ethers.getContractFactory("OrbitalRouter");
    const orbitalRouter = await OrbitalRouter.deploy(
      orbitalFactoryAddress,
      deployer.address,
      { nonce: nextNonce++ }
    );
    await orbitalRouter.waitForDeployment();
    orbitalRouterAddress = await orbitalRouter.getAddress();
    console.log("  OrbitalRouter deployed to:", orbitalRouterAddress);
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
  console.log("OrbitalFactory:           ", orbitalFactoryAddress);
  console.log("OrbitalRouter:            ", orbitalRouterAddress);
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
