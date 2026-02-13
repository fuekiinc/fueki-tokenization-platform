/**
 * Deployment script for Orbital AMM contracts using pre-compiled artifacts.
 * Bypasses full Hardhat compilation (which fails on pre-existing SecurityTokenFactory).
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const HOLESKY_RPC = "https://holesky.drpc.org";
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "REDACTED";

async function main() {
  console.log("=".repeat(60));
  console.log("Deploying Orbital AMM contracts to Holesky testnet");
  console.log("=".repeat(60));

  const provider = new ethers.JsonRpcProvider(HOLESKY_RPC);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("Deployer address:", wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "ETH");
  console.log("");

  // Load artifacts
  const basePath = path.resolve(__dirname, "..", "artifacts", "contracts", "orbital");

  function loadArtifact(contractDir, contractName) {
    const filePath = path.join(basePath, contractDir, contractName + ".json");
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  }

  // ---------------------------------------------------------------
  //  1. Deploy OrbitalFactory
  // ---------------------------------------------------------------
  console.log("[1/2] Deploying OrbitalFactory...");
  const factoryArtifact = loadArtifact("OrbitalFactory.sol", "OrbitalFactory");
  const FactoryFactory = new ethers.ContractFactory(
    factoryArtifact.abi,
    factoryArtifact.bytecode,
    wallet
  );

  const orbitalFactory = await FactoryFactory.deploy(
    wallet.address,   // admin
    wallet.address,   // default fee collector
    4                 // default swap fee: 4 bps (0.04%)
  );
  await orbitalFactory.waitForDeployment();
  const orbitalFactoryAddress = await orbitalFactory.getAddress();
  console.log("  OrbitalFactory deployed to:", orbitalFactoryAddress);

  // ---------------------------------------------------------------
  //  2. Deploy OrbitalRouter
  // ---------------------------------------------------------------
  console.log("[2/2] Deploying OrbitalRouter...");
  const routerArtifact = loadArtifact("OrbitalRouter.sol", "OrbitalRouter");
  const RouterFactory = new ethers.ContractFactory(
    routerArtifact.abi,
    routerArtifact.bytecode,
    wallet
  );

  const orbitalRouter = await RouterFactory.deploy(orbitalFactoryAddress);
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

  const finalBalance = await provider.getBalance(wallet.address);
  console.log("Deployer final balance:", ethers.formatEther(finalBalance), "ETH");
  console.log("Gas spent:", ethers.formatEther(balance - finalBalance), "ETH");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
