const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("=".repeat(60));
  console.log("Deploying Orbital AMM contracts to Holesky testnet");
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
  //  1. Deploy OrbitalFactory
  // ---------------------------------------------------------------
  console.log("[1/2] Deploying OrbitalFactory...");
  const OrbitalFactory = await hre.ethers.getContractFactory("OrbitalFactory", {
    libraries: {},
  });

  const orbitalFactory = await OrbitalFactory.deploy(
    deployer.address,      // admin
    deployer.address,      // default fee collector
    4                      // default swap fee: 4 bps (0.04%)
  );
  await orbitalFactory.waitForDeployment();
  const orbitalFactoryAddress = await orbitalFactory.getAddress();
  console.log("  OrbitalFactory deployed to:", orbitalFactoryAddress);

  // ---------------------------------------------------------------
  //  2. Deploy OrbitalRouter
  // ---------------------------------------------------------------
  console.log("[2/2] Deploying OrbitalRouter...");
  const OrbitalRouter = await hre.ethers.getContractFactory("OrbitalRouter");
  const orbitalRouter = await OrbitalRouter.deploy(orbitalFactoryAddress);
  await orbitalRouter.waitForDeployment();
  const orbitalRouterAddress = await orbitalRouter.getAddress();
  console.log("  OrbitalRouter deployed to:", orbitalRouterAddress);

  // ---------------------------------------------------------------
  //  Summary
  // ---------------------------------------------------------------
  console.log("");
  console.log("=".repeat(60));
  console.log("ORBITAL AMM DEPLOYMENT COMPLETE - Holesky (Chain ID: 17000)");
  console.log("=".repeat(60));
  console.log("OrbitalFactory:  ", orbitalFactoryAddress);
  console.log("OrbitalRouter:   ", orbitalRouterAddress);
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
