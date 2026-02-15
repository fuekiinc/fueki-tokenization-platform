const hre = require("hardhat");

const WRAPPED_ASSET_ADDRESS = "0x94De90993d02e7D5fcd3E406f15494C38e13dc51";

async function main() {
  console.log("=".repeat(60));
  console.log("Verifying WrappedAsset on Etherscan");
  console.log("=".repeat(60));
  console.log("Contract address:", WRAPPED_ASSET_ADDRESS);
  console.log("");

  // Read constructor arguments from the deployed contract
  console.log("Reading constructor arguments from on-chain...");
  const wrappedAsset = await hre.ethers.getContractAt("WrappedAsset", WRAPPED_ASSET_ADDRESS);

  const name = await wrappedAsset.name();
  const symbol = await wrappedAsset.symbol();
  const documentHash = await wrappedAsset.documentHash();
  const documentType = await wrappedAsset.documentType();
  const originalValue = await wrappedAsset.originalValue();

  console.log("  name:          ", name);
  console.log("  symbol:        ", symbol);
  console.log("  documentHash:  ", documentHash);
  console.log("  documentType:  ", documentType);
  console.log("  originalValue: ", originalValue.toString());
  console.log("");

  // Verify the contract
  console.log("Submitting verification to Etherscan...");
  await hre.run("verify:verify", {
    address: WRAPPED_ASSET_ADDRESS,
    constructorArguments: [
      name,
      symbol,
      documentHash,
      documentType,
      originalValue,
    ],
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
