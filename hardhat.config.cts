import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const MAINNET_RPC_URL =
  process.env.MAINNET_RPC_URL || "https://ethereum-rpc.publicnode.com";
const HOLESKY_RPC_URL =
  process.env.HOLESKY_RPC_URL || "https://holesky.drpc.org";
const ARBITRUM_RPC_URL =
  process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc";
const ARBITRUM_SEPOLIA_RPC_URL =
  process.env.ARBITRUM_SEPOLIA_RPC_URL ||
  "https://sepolia-rollup.arbitrum.io/rpc";
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const ARBISCAN_API_KEY = process.env.ARBISCAN_API_KEY || "";
const COINMARKETCAP_API_KEY = process.env.COINMARKETCAP_API_KEY || "";

const accounts = PRIVATE_KEY ? [`0x${PRIVATE_KEY}`] : [];

/**
 * Shared optimizer settings for large security-token contracts that exceed
 * the 24 KB Spurious Dragon limit. Low `runs` value minimizes deployment
 * bytecode at the cost of slightly higher per-call gas.
 */
const compactOptimizerSettings = {
  version: "0.8.20" as const,
  settings: {
    optimizer: {
      enabled: true,
      runs: 1,
    },
    viaIR: true,
    metadata: {
      bytecodeHash: "none" as const,
    },
  },
};

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
      "contracts/security-token/SecurityTokenFactory.sol":
        compactOptimizerSettings,
      "contracts/security-token/RestrictedSwap.sol": compactOptimizerSettings,
      "contracts/security-token/Dividends.sol": compactOptimizerSettings,
      "contracts/security-token/RestrictedLockupToken.sol":
        compactOptimizerSettings,
      "contracts/security-token/TransferRules.sol": compactOptimizerSettings,
      "contracts/security-token/EasyAccessControl.sol":
        compactOptimizerSettings,
      "contracts/security-token/SecurityTokenDeployer.sol":
        compactOptimizerSettings,
    },
  },
  paths: {
    sources: "./contracts",
  },
  networks: {
    mainnet: {
      url: MAINNET_RPC_URL,
      chainId: 1,
      accounts,
      gas: 5000000,
      gasPrice: "auto",
    },
    holesky: {
      url: HOLESKY_RPC_URL,
      chainId: 17000,
      accounts,
    },
    arbitrumOne: {
      url: ARBITRUM_RPC_URL,
      chainId: 42161,
      accounts,
    },
    arbitrumSepolia: {
      url: ARBITRUM_SEPOLIA_RPC_URL,
      chainId: 421614,
      accounts,
    },
  },
  etherscan: {
    apiKey: {
      mainnet: ETHERSCAN_API_KEY,
      holesky: ETHERSCAN_API_KEY,
      arbitrumOne: ARBISCAN_API_KEY || ETHERSCAN_API_KEY,
      arbitrumSepolia: ARBISCAN_API_KEY || ETHERSCAN_API_KEY,
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    coinmarketcap: COINMARKETCAP_API_KEY || undefined,
    outputFile: process.env.CI ? "gas-report.txt" : undefined,
    noColors: !!process.env.CI,
  },
};

export default config;
