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
    `Deploying Orbital AMM contracts to ${hre.network.name} (chainId: ${network.chainId})`
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
  //  1. Deploy OrbitalFactory (or reuse existing)
  // ---------------------------------------------------------------
  let orbitalFactoryAddress = existingOrbitalFactoryAddress;
  if (orbitalFactoryAddress) {
    console.log("[1/2] Reusing existing OrbitalFactory...");
    console.log("  OrbitalFactory:", orbitalFactoryAddress);
  } else {
    console.log("[1/2] Deploying OrbitalFactory...");
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
  //  2. Deploy OrbitalRouter (or reuse existing)
  // ---------------------------------------------------------------
  let orbitalRouterAddress = existingOrbitalRouterAddress;
  if (orbitalRouterAddress) {
    console.log("[2/2] Reusing existing OrbitalRouter...");
    console.log("  OrbitalRouter:", orbitalRouterAddress);
  } else {
    console.log("[2/2] Deploying OrbitalRouter...");
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
    `ORBITAL AMM DEPLOYMENT COMPLETE - ${hre.network.name} (chainId: ${network.chainId})`
  );
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
