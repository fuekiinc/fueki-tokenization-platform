import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const HOLESKY_RPC_URL =
  "https://holesky.drpc.org";
const PRIVATE_KEY =
  "0c068df4a4470cb73e6704d87c61a0c2718e72381c7b1e971514e5f9c4486f93";

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
    holesky: {
      url: HOLESKY_RPC_URL,
      chainId: 17000,
      accounts: [`0x${PRIVATE_KEY}`],
    },
  },
};

export default config;
