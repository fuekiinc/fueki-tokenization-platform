const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();

  console.log("=".repeat(60));
  console.log(`Deploying TestWBTC to ${hre.network.name} (chainId: ${network.chainId})`);
  console.log("=".repeat(60));
  console.log("Deployer address:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", hre.ethers.formatEther(balance), "ETH");

  if (balance === 0n) {
    console.error("ERROR: Deployer has zero balance. Fund the deployer account before retrying.");
    process.exit(1);
  }

  const decimals = 8n;
  const initialUnits = 21_000_000n;
  const initialSupply = initialUnits * (10n ** decimals);

  console.log(`[1/1] Deploying TestWBTC with initial supply ${initialUnits.toString()} WBTC...`);
  const TestWBTC = await hre.ethers.getContractFactory("TestWBTC");
  const wbtc = await TestWBTC.deploy(initialSupply);
  await wbtc.waitForDeployment();
  const wbtcAddress = await wbtc.getAddress();

  console.log("");
  console.log("=".repeat(60));
  console.log(`TEST WBTC DEPLOYMENT COMPLETE - ${hre.network.name} (chainId: ${network.chainId})`);
  console.log("=".repeat(60));
  console.log("TestWBTC:", wbtcAddress);
  console.log("Initial supply:", initialSupply.toString());
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
