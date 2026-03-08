/**
 * Shared chain metadata used by API, RPC, and E2E test suites.
 *
 * The list intentionally mirrors the chain IDs currently supported by
 * the frontend network registry in src/contracts/addresses.ts.
 */
export interface ChainFixture {
  chainId: number;
  name: string;
  symbol: string;
  rpcEnv: string;
  explorer: string;
}

export const CHAIN_FIXTURES: ChainFixture[] = [
  { chainId: 1, name: 'Ethereum Mainnet', symbol: 'ETH', rpcEnv: 'MAINNET_RPC_URL', explorer: 'https://etherscan.io' },
  { chainId: 17000, name: 'Holesky', symbol: 'ETH', rpcEnv: 'HOLESKY_RPC_URL', explorer: 'https://eth-holesky.blockscout.com' },
  { chainId: 11155111, name: 'Sepolia', symbol: 'ETH', rpcEnv: 'SEPOLIA_RPC_URL', explorer: 'https://sepolia.etherscan.io' },
  { chainId: 42161, name: 'Arbitrum One', symbol: 'ETH', rpcEnv: 'ARBITRUM_RPC_URL', explorer: 'https://arbiscan.io' },
  { chainId: 421614, name: 'Arbitrum Sepolia', symbol: 'ETH', rpcEnv: 'ARBITRUM_SEPOLIA_RPC_URL', explorer: 'https://sepolia.arbiscan.io' },
  { chainId: 137, name: 'Polygon', symbol: 'MATIC', rpcEnv: 'POLYGON_RPC_URL', explorer: 'https://polygonscan.com' },
  { chainId: 8453, name: 'Base', symbol: 'ETH', rpcEnv: 'BASE_RPC_URL', explorer: 'https://basescan.org' },
  { chainId: 84532, name: 'Base Sepolia', symbol: 'ETH', rpcEnv: 'BASE_SEPOLIA_RPC_URL', explorer: 'https://sepolia.basescan.org' },
  { chainId: 31337, name: 'Hardhat Local', symbol: 'ETH', rpcEnv: 'LOCALHOST_RPC_URL', explorer: '' },
];

export const CHAIN_IDS = CHAIN_FIXTURES.map((chain) => chain.chainId);
