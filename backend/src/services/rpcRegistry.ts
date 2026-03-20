export type SupportedChainId =
  | 1
  | 137
  | 17000
  | 42161
  | 421614
  | 8453
  | 84532
  | 11155111
  | 31337;

const RPC_ENV_BY_CHAIN: Record<SupportedChainId, string> = {
  1: 'MAINNET_RPC_URL',
  137: 'POLYGON_RPC_URL',
  17000: 'HOLESKY_RPC_URL',
  42161: 'ARBITRUM_RPC_URL',
  421614: 'ARBITRUM_SEPOLIA_RPC_URL',
  8453: 'BASE_RPC_URL',
  84532: 'BASE_SEPOLIA_RPC_URL',
  11155111: 'SEPOLIA_RPC_URL',
  31337: 'LOCALHOST_RPC_URL',
};

const DEFAULT_RPC_BY_CHAIN: Record<SupportedChainId, string[]> = {
  1: ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org'],
  137: [
    'https://polygon-bor-rpc.publicnode.com',
    'https://polygon.drpc.org',
    'https://1rpc.io/matic',
  ],
  17000: ['https://holesky.drpc.org', 'https://ethereum-holesky-rpc.publicnode.com'],
  42161: ['https://arb1.arbitrum.io/rpc'],
  421614: [
    'https://arbitrum-sepolia-rpc.publicnode.com',
    'https://arbitrum-sepolia.drpc.org',
    'https://sepolia-rollup.arbitrum.io/rpc',
  ],
  8453: ['https://mainnet.base.org'],
  84532: ['https://sepolia.base.org'],
  11155111: [
    'https://1rpc.io/sepolia',
    'https://sepolia.drpc.org',
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://rpc2.sepolia.org',
  ],
  31337: ['http://127.0.0.1:8545'],
};

export function dedupeStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    deduped.push(trimmed);
  }
  return deduped;
}

export function getSupportedChainId(chainId: number): SupportedChainId | null {
  return Object.prototype.hasOwnProperty.call(RPC_ENV_BY_CHAIN, chainId)
    ? (chainId as SupportedChainId)
    : null;
}

export function getRpcEndpoints(chainId: SupportedChainId): string[] {
  return dedupeStrings([
    process.env[RPC_ENV_BY_CHAIN[chainId]],
    ...DEFAULT_RPC_BY_CHAIN[chainId],
  ]);
}
