#!/usr/bin/env node
import { JsonRpcProvider } from 'ethers';

const CHAINS = [
  ['mainnet', process.env.MAINNET_RPC_URL || 'https://ethereum-rpc.publicnode.com', 1],
  ['holesky', process.env.HOLESKY_RPC_URL || 'https://ethereum-holesky-rpc.publicnode.com', 17000],
  ['sepolia', process.env.SEPOLIA_RPC_URL || 'https://1rpc.io/sepolia', 11155111],
  ['arbitrum-one', process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc', 42161],
  ['arbitrum-sepolia', process.env.ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc', 421614],
  ['polygon', process.env.POLYGON_RPC_URL || 'https://polygon-bor-rpc.publicnode.com', 137],
  ['base', process.env.BASE_RPC_URL || 'https://mainnet.base.org', 8453],
  ['base-sepolia', process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org', 84532],
];

const results = [];
for (const [name, url, expectedChainId] of CHAINS) {
  const started = Date.now();
  try {
    const provider = new JsonRpcProvider(url);
    const network = await provider.getNetwork();
    const block = await provider.getBlockNumber();
    const latencyMs = Date.now() - started;
    results.push({
      name,
      url,
      expectedChainId,
      chainId: Number(network.chainId),
      block,
      latencyMs,
      ok: Number(network.chainId) === expectedChainId,
    });
  } catch (error) {
    results.push({
      name,
      url,
      expectedChainId,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - started,
    });
  }
}

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
process.exit(results.some((r) => !r.ok) ? 1 : 0);
