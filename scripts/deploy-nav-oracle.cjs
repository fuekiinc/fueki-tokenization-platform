const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  // The security token address (already deployed on Holesky)
  const TOKEN_ADDRESS = "0xB8BbD6038fBF8b87D4352a448C4679172b715457";

  const NAVOracle = await hre.ethers.getContractFactory("NAVOracle");
  const oracle = await NAVOracle.deploy(
    TOKEN_ADDRESS,           // immutable link to the token
    "USD",                   // base currency
    86400,                   // min 24h between attestations
    5000,                    // max 50% NAV change per update
    deployer.address         // admin (gets DEFAULT_ADMIN_ROLE + NAV_ADMIN_ROLE)
  );

  await oracle.waitForDeployment();
  const oracleAddress = await oracle.getAddress();
  console.log("NAVOracle deployed to:", oracleAddress);

  // Grant yourself the publisher role
  const PUBLISHER_ROLE = await oracle.NAV_PUBLISHER_ROLE();
  const tx = await oracle.grantRole(PUBLISHER_ROLE, deployer.address);
  await tx.wait();
  console.log("Publisher role granted to:", deployer.address);
}

main().catch(console.error);
