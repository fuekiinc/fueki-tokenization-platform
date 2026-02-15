const hre = require("hardhat");

const FACTORY_ADDRESS = "0xf7d3fC3b395b4Add020fF46B7ceA9E4c404ab4dB";

async function main() {
  console.log("=".repeat(60));
  console.log("Verifying WrappedAssetFactory on Etherscan");
  console.log("=".repeat(60));
  console.log("Contract address:", FACTORY_ADDRESS);
  console.log("");

  console.log("Submitting verification to Etherscan...");
  await hre.run("verify:verify", {
    address: FACTORY_ADDRESS,
    constructorArguments: [],
  });

  console.log("");
  console.log("Verification complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Verification failed:", error.message || error);
    process.exit(1);
  });
