import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const MAINNET_RPC_URL =
  process.env.MAINNET_RPC_URL || "https://ethereum-rpc.publicnode.com";
const HOLESKY_RPC_URL =
  process.env.HOLESKY_RPC_URL || "https://holesky.drpc.org";
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
    ],
    overrides: {
      "contracts/security-token/SecurityTokenFactory.sol": {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
          },
          viaIR: true,
          metadata: {
            bytecodeHash: "none",
          },
        },
      },
      "contracts/security-token/RestrictedSwap.sol": {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
          },
          viaIR: true,
          metadata: {
            bytecodeHash: "none",
          },
        },
      },
      "contracts/security-token/Dividends.sol": {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
          },
          viaIR: true,
          metadata: {
            bytecodeHash: "none",
          },
        },
      },
      "contracts/security-token/RestrictedLockupToken.sol": {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
          },
          viaIR: true,
          metadata: {
            bytecodeHash: "none",
          },
        },
      },
      "contracts/security-token/TransferRules.sol": {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
          },
          viaIR: true,
          metadata: {
            bytecodeHash: "none",
          },
        },
      },
      "contracts/security-token/EasyAccessControl.sol": {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
          },
          viaIR: true,
          metadata: {
            bytecodeHash: "none",
          },
        },
      },
      "contracts/security-token/SecurityTokenDeployer.sol": {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
          },
          viaIR: true,
          metadata: {
            bytecodeHash: "none",
          },
        },
      },
    },
  },
  paths: {
    sources: "./contracts",
  },
  networks: {
    mainnet: {
      url: MAINNET_RPC_URL,
      chainId: 1,
      accounts: PRIVATE_KEY ? [`0x${PRIVATE_KEY}`] : [],
      gas: 5000000,
      gasPrice: "auto",
    },
    holesky: {
      url: HOLESKY_RPC_URL,
      chainId: 17000,
      accounts: PRIVATE_KEY ? [`0x${PRIVATE_KEY}`] : [],
    },
  },
};

export default config;
