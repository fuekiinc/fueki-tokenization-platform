/**
 * Network configuration and contract address registry for the tokenization platform.
 *
 * Each supported network maps a chain ID to its RPC endpoint, block explorer,
 * and deployed contract addresses. Addresses are left empty for networks where
 * the contracts have not yet been deployed.
 *
 * IMPORTANT: the `getNetworkConfig` helper validates that the requested
 * network's contract addresses are non-empty before returning. Callers that
 * need only network metadata (RPC, explorer) regardless of deployment status
 * should use `getNetworkMetadata` instead.
 */

export interface NetworkConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  blockExplorer: string;
  factoryAddress: string;
  exchangeAddress: string;
  /** ERC-1404 security token factory (front_street integration). */
  securityTokenFactoryAddress: string;
  /** Asset-backed exchange supporting ETH, WBTC, and ERC-20 trading. */
  assetBackedExchangeAddress: string;
  /** WETH contract address for ETH wrapping. */
  wethAddress: string;
  /** WBTC contract address for BTC-pegged trading. */
  wbtcAddress: string;
  /** LiquidityPoolAMM contract address for constant-product AMM swaps. */
  ammAddress: string;
  /** Orbital AMM Factory (superellipse invariant) contract address. */
  orbitalFactoryAddress: string;
  /** Orbital AMM Router contract address. */
  orbitalRouterAddress: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export const SUPPORTED_NETWORKS: Record<number, NetworkConfig> = {
  1: {
    chainId: 1,
    name: 'Ethereum Mainnet',
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
    blockExplorer: 'https://etherscan.io',
    factoryAddress: '0xf7d3fC3b395b4Add020fF46B7ceA9E4c404ab4dB',
    exchangeAddress: '0xcC54Dd0Af5AAeDfAC3bfD55dAd3884Dc4533130C',
    securityTokenFactoryAddress: '',
    assetBackedExchangeAddress: '0xc722789416B8F22138f93C226Ab8a8497A3deCDa',
    wethAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    wbtcAddress: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    ammAddress: '0x4b34D01CdBB82136A593D0a96434e69a1cFbDCF2',
    orbitalFactoryAddress: '',
    orbitalRouterAddress: '',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  11155111: {
    chainId: 11155111,
    name: 'Sepolia Testnet',
    rpcUrl: 'https://rpc.sepolia.org',
    blockExplorer: 'https://sepolia.etherscan.io',
    factoryAddress: '',
    exchangeAddress: '',
    securityTokenFactoryAddress: '',
    assetBackedExchangeAddress: '',
    wethAddress: '',
    wbtcAddress: '',
    ammAddress: '',
    orbitalFactoryAddress: '',
    orbitalRouterAddress: '',
    nativeCurrency: { name: 'SepoliaETH', symbol: 'ETH', decimals: 18 },
  },
  137: {
    chainId: 137,
    name: 'Polygon',
    rpcUrl: 'https://polygon-rpc.com',
    blockExplorer: 'https://polygonscan.com',
    factoryAddress: '',
    exchangeAddress: '',
    securityTokenFactoryAddress: '',
    assetBackedExchangeAddress: '',
    wethAddress: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    wbtcAddress: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
    ammAddress: '',
    orbitalFactoryAddress: '',
    orbitalRouterAddress: '',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
  },
  42161: {
    chainId: 42161,
    name: 'Arbitrum One',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    blockExplorer: 'https://arbiscan.io',
    factoryAddress: '',
    exchangeAddress: '',
    securityTokenFactoryAddress: '',
    assetBackedExchangeAddress: '',
    wethAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    wbtcAddress: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
    ammAddress: '',
    orbitalFactoryAddress: '',
    orbitalRouterAddress: '',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  421614: {
    chainId: 421614,
    name: 'Arbitrum Sepolia',
    rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
    blockExplorer: 'https://sepolia.arbiscan.io',
    factoryAddress: '',
    exchangeAddress: '',
    securityTokenFactoryAddress: '',
    assetBackedExchangeAddress: '',
    wethAddress: '',
    wbtcAddress: '',
    ammAddress: '',
    orbitalFactoryAddress: '',
    orbitalRouterAddress: '',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  8453: {
    chainId: 8453,
    name: 'Base',
    rpcUrl: 'https://mainnet.base.org',
    blockExplorer: 'https://basescan.org',
    factoryAddress: '',
    exchangeAddress: '',
    securityTokenFactoryAddress: '',
    assetBackedExchangeAddress: '',
    wethAddress: '0x4200000000000000000000000000000000000006',
    wbtcAddress: '',
    ammAddress: '',
    orbitalFactoryAddress: '',
    orbitalRouterAddress: '',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  17000: {
    chainId: 17000,
    name: 'Holesky',
    rpcUrl: 'https://ethereum-holesky-rpc.publicnode.com',
    blockExplorer: 'https://holesky.etherscan.io',
    factoryAddress: '0xCC00D84b5D2448552a238465C4C05A82ac5AB411',
    exchangeAddress: '0x573d253D0826FB6EeECBa3cD430D74d74955A608',
    securityTokenFactoryAddress: '0x117cf62686D23a5478DaFCcBC575c0d833606E61',
    assetBackedExchangeAddress: '0x6C9217850317e61544a3d5bFD3b3C6CA3ADE6660',
    wethAddress: '',
    wbtcAddress: '',
    ammAddress: '',
    orbitalFactoryAddress: '0xd951A80Efd159B35A7c66f830ca77980476D9305',
    orbitalRouterAddress: '0xE5A362047CAB14a2A64Bda26a83719Ac33A22087',
    nativeCurrency: { name: 'Holesky ETH', symbol: 'ETH', decimals: 18 },
  },
  31337: {
    chainId: 31337,
    name: 'Hardhat Local',
    rpcUrl: 'http://127.0.0.1:8545',
    blockExplorer: '',
    factoryAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    exchangeAddress: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
    securityTokenFactoryAddress: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
    assetBackedExchangeAddress: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
    wethAddress: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9',
    wbtcAddress: '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707',
    ammAddress: '',
    orbitalFactoryAddress: '',
    orbitalRouterAddress: '',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
};

/** Default chain ID used when no network preference is specified. */
export const DEFAULT_CHAIN_ID = 1;

/**
 * Retrieve network metadata (RPC, explorer, currency) for a given chain ID,
 * regardless of whether contracts have been deployed.
 * Returns undefined when the chain is not in the supported list.
 */
export function getNetworkMetadata(chainId: number): NetworkConfig | undefined {
  return SUPPORTED_NETWORKS[chainId];
}

/**
 * Retrieve the full network configuration for a given chain ID.
 *
 * Returns undefined when:
 * - The chain is not in the supported list, OR
 * - The contracts have not been deployed on that chain (empty addresses).
 *
 * This prevents silent failures where a caller constructs a Contract instance
 * with an empty (zero) address.
 */
export function getNetworkConfig(chainId: number): NetworkConfig | undefined {
  const config = SUPPORTED_NETWORKS[chainId];
  if (!config) {
    return undefined;
  }
  // Guard: the core contract addresses must be populated for the network to
  // be considered fully configured. Returning undefined here forces callers
  // (e.g. ContractService) to throw an explicit "not deployed" error rather
  // than silently sending transactions to the zero address.
  // We check only the original factory + exchange; the security token factory
  // and asset-backed exchange are optional (checked at point of use).
  if (!config.factoryAddress || !config.exchangeAddress) {
    return undefined;
  }
  return config;
}

/**
 * Check whether a chain ID corresponds to a network the platform supports
 * AND has deployed contracts.
 */
export function isNetworkSupported(chainId: number): boolean {
  return getNetworkConfig(chainId) !== undefined;
}

/**
 * Check whether a chain ID is a known network (even if contracts are not
 * yet deployed).
 */
export function isNetworkKnown(chainId: number): boolean {
  return chainId in SUPPORTED_NETWORKS;
}
