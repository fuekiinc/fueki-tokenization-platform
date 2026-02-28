import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const MAINNET_RPC_URL =
  process.env.MAINNET_RPC_URL ||
  "https://billowing-rough-moon.quiknode.pro/a3cc003399fc8c72876d87c1f516c0897574e60c/";
const HOLESKY_RPC_URL =
  process.env.HOLESKY_RPC_URL ||
  "https://flashy-crimson-borough.ethereum-holesky.quiknode.pro/f43097bbd32a1c3476c2f3f1ff1d4780361be827/";
const ARBITRUM_RPC_URL =
  process.env.ARBITRUM_RPC_URL ||
  "https://snowy-blue-frost.arbitrum-mainnet.quiknode.pro/a691b5e884e8df719f8ce8ec8ad5e22092d17cdb/";
const ARBITRUM_SEPOLIA_RPC_URL =
  process.env.ARBITRUM_SEPOLIA_RPC_URL ||
  "https://ancient-holy-tent.arbitrum-sepolia.quiknode.pro/53623a401aa412366b43ddea31aa6538ef24d7fd/";
const POLYGON_RPC_URL =
  process.env.POLYGON_RPC_URL || "https://polygon-bor-rpc.publicnode.com";
const BASE_RPC_URL =
  process.env.BASE_RPC_URL ||
  "https://delicate-red-cloud.base-mainnet.quiknode.pro/3ae2b0cd08e640c9c6a3e4c0ca89351dc879e5c8/";
const BASE_SEPOLIA_RPC_URL =
  process.env.BASE_SEPOLIA_RPC_URL ||
  "https://billowing-wandering-yard.base-sepolia.quiknode.pro/70e0d692e7ba902f935ff17774c1aed59a21e0d0/";
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const ARBISCAN_API_KEY = process.env.ARBISCAN_API_KEY || "";
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY || ETHERSCAN_API_KEY;
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || ETHERSCAN_API_KEY;
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
    polygon: {
      url: POLYGON_RPC_URL,
      chainId: 137,
      accounts,
    },
    base: {
      url: BASE_RPC_URL,
      chainId: 8453,
      accounts,
    },
    baseSepolia: {
      url: BASE_SEPOLIA_RPC_URL,
      chainId: 84532,
      accounts,
    },
  },
  etherscan: {
    apiKey: {
      mainnet: ETHERSCAN_API_KEY,
      holesky: ETHERSCAN_API_KEY,
      arbitrumOne: ARBISCAN_API_KEY || ETHERSCAN_API_KEY,
      arbitrumSepolia: ARBISCAN_API_KEY || ETHERSCAN_API_KEY,
      polygon: POLYGONSCAN_API_KEY,
      base: BASESCAN_API_KEY,
      baseSepolia: BASESCAN_API_KEY,
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
