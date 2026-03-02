/**
 * Network configuration and contract address registry for the tokenization platform.
 *
 * Supported networks:
 *   - Ethereum Mainnet (chainId: 1) -- partial deployment
 *   - Holesky Testnet (chainId: 17000) -- full deployment (secondary testnet)
 *   - Arbitrum One (chainId: 42161) -- not yet deployed
 *   - Arbitrum Sepolia (chainId: 421614) -- full deployment (primary testnet)
 *   - Base Sepolia (chainId: 84532) -- metadata only, no deployments yet
 *   - Hardhat Local (chainId: 31337) -- local development
 *
 * All contract addresses are EIP-55 checksummed.
 *
 * IMPORTANT: the `getNetworkConfig` helper validates that the requested
 * network's contract addresses are non-empty before returning. Callers that
 * need only network metadata (RPC, explorer) regardless of deployment status
 * should use `getNetworkMetadata` instead.
 */

import { getPrimaryRpcUrl } from '../lib/rpc/endpoints';

function readAddressEnv(name: string, fallback: string): string {
  const raw = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env?.[name];
  if (typeof raw !== 'string') return fallback;
  const candidate = raw.trim();
  if (!candidate) return fallback;
  if (!/^0x[a-fA-F0-9]{40}$/.test(candidate)) return fallback;
  return candidate;
}

function readAddressEnvFirst(names: string[], fallback: string): string {
  for (const name of names) {
    const value = readAddressEnv(name, '');
    if (value) return value;
  }
  return fallback;
}

export interface NetworkConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  /** Block explorer base URL (e.g. https://etherscan.io). */
  blockExplorer: string;
  /** Block explorer API URL for programmatic queries. */
  blockExplorerApi: string;
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

// ---------------------------------------------------------------------------
// Network registry
// ---------------------------------------------------------------------------

export const SUPPORTED_NETWORKS: Record<number, NetworkConfig> = {
  // ---- Ethereum Mainnet ---------------------------------------------------
  1: {
    chainId: 1,
    name: 'Ethereum Mainnet',
    rpcUrl: getPrimaryRpcUrl(1),
    blockExplorer: 'https://etherscan.io',
    blockExplorerApi: 'https://api.etherscan.io/api',
    factoryAddress: '0xf7d3fC3b395b4Add020fF46B7ceA9E4c404ab4dB',
    exchangeAddress: '0xcC54Dd0Af5AAeDfAC3bfD55dAd3884Dc4533130C',
    securityTokenFactoryAddress: '0x40dE51e0Ccf9e67E2064e7f731f5bd771ec19dD5',
    assetBackedExchangeAddress: '0xc722789416B8F22138f93C226Ab8a8497A3deCDa',
    wethAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    wbtcAddress: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    ammAddress: '0x4b34D01CdBB82136A593D0a96434e69a1cFbDCF2',
    orbitalFactoryAddress: readAddressEnvFirst(
      ['VITE_ORBITAL_FACTORY_1', 'VITE_ORBITAL_FACTORY_MAINNET'],
      '0xf35a2232056b4a47C42eeBA1bcBf4076DF67946D',
    ),
    orbitalRouterAddress: readAddressEnvFirst(
      ['VITE_ORBITAL_ROUTER_1', 'VITE_ORBITAL_ROUTER_MAINNET'],
      '0xA7e8a1B8836326Ebb88d911118121304EF2c931d',
    ),
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },

  // ---- Holesky Testnet (secondary testnet) --------------------------------
  17000: {
    chainId: 17000,
    name: 'Holesky',
    rpcUrl: getPrimaryRpcUrl(17000),
    blockExplorer: 'https://eth-holesky.blockscout.com',
    blockExplorerApi: 'https://eth-holesky.blockscout.com/api',
    factoryAddress: '0xCC00D84b5D2448552a238465C4C05A82ac5AB411',
    exchangeAddress: '0x573d253D0826FB6EeECBa3cD430D74d74955A608',
    securityTokenFactoryAddress: '0x117cf62686D23a5478DaFCcBC575c0d833606E61',
    assetBackedExchangeAddress: '0x6C9217850317e61544a3d5bFD3b3C6CA3ADE6660',
    wethAddress: '0x94373a4919B3240D86eA41593D5eBa789FEF3848',
    wbtcAddress: '',
    ammAddress: '0xa9b60375A6433a6697F020F67Dd69851F861DFb8',
    orbitalFactoryAddress: readAddressEnv(
      'VITE_ORBITAL_FACTORY_17000',
      '0xd951A80Efd159B35A7c66f830ca77980476D9305',
    ),
    orbitalRouterAddress: readAddressEnv(
      'VITE_ORBITAL_ROUTER_17000',
      '0xE5A362047CAB14a2A64Bda26a83719Ac33A22087',
    ),
    nativeCurrency: { name: 'Holesky ETH', symbol: 'ETH', decimals: 18 },
  },

  // ---- Arbitrum One -------------------------------------------------------
  42161: {
    chainId: 42161,
    name: 'Arbitrum One',
    rpcUrl: getPrimaryRpcUrl(42161),
    blockExplorer: 'https://arbiscan.io',
    blockExplorerApi: 'https://api.arbiscan.io/api',
    factoryAddress: '0x0ad0bc183acb2f2124A6e8C40216af852d3c1C9b',
    exchangeAddress: '0xd60A930605442226e80f2577e4a4B985e3d56977',
    securityTokenFactoryAddress: '0x8b167fE578F62D317674EA47a3F0Dd3Ce13d747f',
    assetBackedExchangeAddress: '0x099df34B1855C9D54eC232916970db13666b50be',
    wethAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    wbtcAddress: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
    ammAddress: '0xa9b60375A6433a6697F020F67Dd69851F861DFb8',
    orbitalFactoryAddress: readAddressEnv(
      'VITE_ORBITAL_FACTORY_42161',
      '0x95187b0e6A6639083C58932C8841A30C75eE70e8',
    ),
    orbitalRouterAddress: readAddressEnv(
      'VITE_ORBITAL_ROUTER_42161',
      '0xD66b939e2701f61559CB7BccdEb7fbBDe49A35E9',
    ),
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },

  // ---- Arbitrum Sepolia Testnet -------------------------------------------
  421614: {
    chainId: 421614,
    name: 'Arbitrum Sepolia',
    rpcUrl: getPrimaryRpcUrl(421614),
    blockExplorer: 'https://sepolia.arbiscan.io',
    blockExplorerApi: 'https://api-sepolia.arbiscan.io/api',
    factoryAddress: '0x0ad0bc183acb2f2124A6e8C40216af852d3c1C9b',
    exchangeAddress: '0xd60A930605442226e80f2577e4a4B985e3d56977',
    securityTokenFactoryAddress: '0x8b167fE578F62D317674EA47a3F0Dd3Ce13d747f',
    assetBackedExchangeAddress: '0x099df34B1855C9D54eC232916970db13666b50be',
    wethAddress: '0xE591bf0A0CF924A0674d7792db046B23CEbF5f34',
    wbtcAddress: '0x60206E675Bd801cDE1F584aD7e234F3214076839',
    ammAddress: '0xa9b60375A6433a6697F020F67Dd69851F861DFb8',
    orbitalFactoryAddress: readAddressEnv(
      'VITE_ORBITAL_FACTORY_421614',
      '0x95187b0e6A6639083C58932C8841A30C75eE70e8',
    ),
    orbitalRouterAddress: readAddressEnv(
      'VITE_ORBITAL_ROUTER_421614',
      '0xD66b939e2701f61559CB7BccdEb7fbBDe49A35E9',
    ),
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },

  // ---- Sepolia Testnet ----------------------------------------------------
  11155111: {
    chainId: 11155111,
    name: 'Sepolia Testnet',
    rpcUrl: getPrimaryRpcUrl(11155111),
    blockExplorer: 'https://sepolia.etherscan.io',
    blockExplorerApi: 'https://api-sepolia.etherscan.io/api',
    factoryAddress: readAddressEnv(
      'VITE_FACTORY_11155111',
      '0xf7d3fC3b395b4Add020fF46B7ceA9E4c404ab4dB',
    ),
    exchangeAddress: readAddressEnv(
      'VITE_EXCHANGE_11155111',
      '0xcC54Dd0Af5AAeDfAC3bfD55dAd3884Dc4533130C',
    ),
    securityTokenFactoryAddress: readAddressEnv(
      'VITE_SECURITY_TOKEN_FACTORY_11155111',
      '0x4b34D01CdBB82136A593D0a96434e69a1cFbDCF2',
    ),
    assetBackedExchangeAddress: readAddressEnv(
      'VITE_ASSET_BACKED_EXCHANGE_11155111',
      '0xd639DBfeCE1e764E86eb38159C110C9E45718e9e',
    ),
    wethAddress: readAddressEnv(
      'VITE_WETH_11155111',
      '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9',
    ),
    wbtcAddress: '',
    ammAddress: readAddressEnv(
      'VITE_AMM_11155111',
      '0xe8a8CC751a57597637b459060082C4a968185989',
    ),
    orbitalFactoryAddress: readAddressEnv(
      'VITE_ORBITAL_FACTORY_11155111',
      '0xaab9dfeE935B1A7a4F5b99fA9b21a9d339601934',
    ),
    orbitalRouterAddress: readAddressEnv(
      'VITE_ORBITAL_ROUTER_11155111',
      '0x584c3892cE3CFc8ffd86A16b744AC342dAf15b1f',
    ),
    nativeCurrency: { name: 'SepoliaETH', symbol: 'ETH', decimals: 18 },
  },

  // ---- Polygon ------------------------------------------------------------
  137: {
    chainId: 137,
    name: 'Polygon',
    rpcUrl: getPrimaryRpcUrl(137),
    blockExplorer: 'https://polygonscan.com',
    blockExplorerApi: 'https://api.polygonscan.com/api',
    factoryAddress: '0x0ad0bc183acb2f2124A6e8C40216af852d3c1C9b',
    exchangeAddress: '0xd60A930605442226e80f2577e4a4B985e3d56977',
    securityTokenFactoryAddress: '0x8b167fE578F62D317674EA47a3F0Dd3Ce13d747f',
    assetBackedExchangeAddress: '0x099df34B1855C9D54eC232916970db13666b50be',
    wethAddress: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    wbtcAddress: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
    ammAddress: '',
    orbitalFactoryAddress: '',
    orbitalRouterAddress: '',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
  },

  // ---- Base ---------------------------------------------------------------
  8453: {
    chainId: 8453,
    name: 'Base',
    rpcUrl: getPrimaryRpcUrl(8453),
    blockExplorer: 'https://basescan.org',
    blockExplorerApi: 'https://api.basescan.org/api',
    factoryAddress: '0x0ad0bc183acb2f2124A6e8C40216af852d3c1C9b',
    exchangeAddress: '0xd60A930605442226e80f2577e4a4B985e3d56977',
    securityTokenFactoryAddress: '0x8b167fE578F62D317674EA47a3F0Dd3Ce13d747f',
    assetBackedExchangeAddress: '0x099df34B1855C9D54eC232916970db13666b50be',
    wethAddress: '0x4200000000000000000000000000000000000006',
    wbtcAddress: '',
    ammAddress: '0xa9b60375A6433a6697F020F67Dd69851F861DFb8',
    orbitalFactoryAddress: readAddressEnv(
      'VITE_ORBITAL_FACTORY_8453',
      '0x95187b0e6A6639083C58932C8841A30C75eE70e8',
    ),
    orbitalRouterAddress: readAddressEnv(
      'VITE_ORBITAL_ROUTER_8453',
      '0xD66b939e2701f61559CB7BccdEb7fbBDe49A35E9',
    ),
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },

  // ---- Base Sepolia (metadata only, no deployments) -----------------------
  84532: {
    chainId: 84532,
    name: 'Base Sepolia',
    rpcUrl: getPrimaryRpcUrl(84532),
    blockExplorer: 'https://sepolia.basescan.org',
    blockExplorerApi: 'https://api-sepolia.basescan.org/api',
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

  // ---- Hardhat Local (development only) -----------------------------------
  31337: {
    chainId: 31337,
    name: 'Hardhat Local',
    rpcUrl: getPrimaryRpcUrl(31337),
    blockExplorer: '',
    blockExplorerApi: '',
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
 * Preferred switch-network CTA order for capability guards and onboarding.
 * Ethereum Mainnet is surfaced first, then Arbitrum Sepolia, Holesky, Localhost.
 */
export const DEFAULT_SWITCH_CHAIN_IDS: number[] = Array.from(
  new Set([DEFAULT_CHAIN_ID, 11155111, 421614, 17000, 31337]),
);

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

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

/**
 * Build a block-explorer URL for a transaction hash.
 * Returns an empty string if the network has no configured explorer.
 */
export function getExplorerTxUrl(chainId: number, txHash: string): string {
  const config = SUPPORTED_NETWORKS[chainId];
  if (!config?.blockExplorer) return '';
  return `${config.blockExplorer}/tx/${txHash}`;
}

/**
 * Build a block-explorer URL for an address.
 * Returns an empty string if the network has no configured explorer.
 */
export function getExplorerAddressUrl(chainId: number, address: string): string {
  const config = SUPPORTED_NETWORKS[chainId];
  if (!config?.blockExplorer) return '';
  return `${config.blockExplorer}/address/${address}`;
}

/**
 * Return an array of chain IDs where the platform has deployed contracts.
 */
export function getDeployedChainIds(): number[] {
  const deployed = Object.values(SUPPORTED_NETWORKS)
    .filter((c) => c.factoryAddress && c.exchangeAddress)
    .map((c) => c.chainId);

  const orderRank = new Map<number, number>(
    DEFAULT_SWITCH_CHAIN_IDS.map((chainId, idx) => [chainId, idx]),
  );

  return deployed.sort((a, b) => {
    const aRank = orderRank.get(a) ?? Number.MAX_SAFE_INTEGER;
    const bRank = orderRank.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) return aRank - bRank;
    return a - b;
  });
}
