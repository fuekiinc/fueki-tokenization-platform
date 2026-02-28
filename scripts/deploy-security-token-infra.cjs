const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  console.log("=".repeat(64));
  console.log(
    `Deploying security-token infrastructure to ${hre.network.name} (chainId: ${chainId})`
  );
  console.log("=".repeat(64));
  console.log("Deployer address:", deployer.address);

  const initialBalance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", hre.ethers.formatEther(initialBalance), "ETH");

  if (initialBalance === 0n) {
    throw new Error("Deployer has zero balance.");
  }

  console.log("");

  console.log("[1/2] Deploying SecurityTokenDeployer...");
  const SecurityTokenDeployer = await hre.ethers.getContractFactory(
    "SecurityTokenDeployer"
  );
  const securityTokenDeployer = await SecurityTokenDeployer.deploy();
  await securityTokenDeployer.waitForDeployment();
  const securityTokenDeployerAddress = await securityTokenDeployer.getAddress();
  console.log("  SecurityTokenDeployer deployed to:", securityTokenDeployerAddress);

  console.log("[2/2] Deploying SecurityTokenFactory...");
  const SecurityTokenFactory = await hre.ethers.getContractFactory(
    "SecurityTokenFactory"
  );
  const securityTokenFactory = await SecurityTokenFactory.deploy(
    securityTokenDeployerAddress
  );
  await securityTokenFactory.waitForDeployment();
  const securityTokenFactoryAddress = await securityTokenFactory.getAddress();
  console.log("  SecurityTokenFactory deployed to:", securityTokenFactoryAddress);

  const finalBalance = await hre.ethers.provider.getBalance(deployer.address);
  const gasSpent = initialBalance - finalBalance;

  const summary = {
    network: hre.network.name,
    chainId,
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      securityTokenDeployer: securityTokenDeployerAddress,
      securityTokenFactory: securityTokenFactoryAddress,
    },
    cost: {
      initialBalanceWei: initialBalance.toString(),
      finalBalanceWei: finalBalance.toString(),
      gasSpentWei: gasSpent.toString(),
      gasSpentEth: hre.ethers.formatEther(gasSpent),
    },
  };

  const outputPath = path.join(
    __dirname,
    "..",
    `deployments-security-token-${hre.network.name}-${chainId}.json`
  );
  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));

  console.log("");
  console.log("=".repeat(64));
  console.log("SECURITY TOKEN INFRA DEPLOYMENT COMPLETE");
  console.log("=".repeat(64));
  console.log("SecurityTokenDeployer:", securityTokenDeployerAddress);
  console.log("SecurityTokenFactory: ", securityTokenFactoryAddress);
  console.log("Gas spent:", hre.ethers.formatEther(gasSpent), "ETH");
  console.log("Output:", outputPath);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
