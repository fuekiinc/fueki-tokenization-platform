#!/usr/bin/env node
import fs from 'node:fs';
import { JsonRpcProvider, Wallet } from 'ethers';

const WALLET_FIXTURES = [
  {
    label: 'deployer',
    privateKey:
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  },
  {
    label: 'trader',
    privateKey:
      '0x59c6995e998f97a5a0044966f094538f8f7f4f299f4e8f1fbe53c7f6f7f7f7f7',
  },
];

const CHAIN_FIXTURES = [
  {
    chainId: 1,
    name: 'Ethereum Mainnet',
    symbol: 'ETH',
    rpcEnv: 'MAINNET_RPC_URL',
    rpcEnvFallbacks: ['ETHEREUM_RPC_URL', 'VITE_RPC_1_URLS'],
    defaultRpcUrls: ['https://ethereum-rpc.publicnode.com'],
  },
  {
    chainId: 17000,
    name: 'Holesky',
    symbol: 'ETH',
    rpcEnv: 'HOLESKY_RPC_URL',
    rpcEnvFallbacks: ['ETHEREUM_HOLESKY_RPC_URL', 'VITE_RPC_17000_URLS'],
    defaultRpcUrls: ['https://holesky.drpc.org'],
  },
  {
    chainId: 11155111,
    name: 'Sepolia',
    symbol: 'ETH',
    rpcEnv: 'SEPOLIA_RPC_URL',
    rpcEnvFallbacks: ['ETHEREUM_SEPOLIA_RPC_URL', 'VITE_RPC_11155111_URLS'],
    defaultRpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
  },
  {
    chainId: 42161,
    name: 'Arbitrum One',
    symbol: 'ETH',
    rpcEnv: 'ARBITRUM_RPC_URL',
    rpcEnvFallbacks: ['VITE_RPC_42161_URLS'],
    defaultRpcUrls: ['https://arb1.arbitrum.io/rpc'],
  },
  {
    chainId: 421614,
    name: 'Arbitrum Sepolia',
    symbol: 'ETH',
    rpcEnv: 'ARBITRUM_SEPOLIA_RPC_URL',
    rpcEnvFallbacks: ['VITE_RPC_421614_URLS'],
    defaultRpcUrls: ['https://arbitrum-sepolia-rpc.publicnode.com'],
  },
  {
    chainId: 8453,
    name: 'Base',
    symbol: 'ETH',
    rpcEnv: 'BASE_RPC_URL',
    rpcEnvFallbacks: ['VITE_RPC_8453_URLS'],
    defaultRpcUrls: ['https://mainnet.base.org'],
  },
  {
    chainId: 84532,
    name: 'Base Sepolia',
    symbol: 'ETH',
    rpcEnv: 'BASE_SEPOLIA_RPC_URL',
    rpcEnvFallbacks: ['VITE_RPC_84532_URLS'],
    defaultRpcUrls: ['https://sepolia.base.org'],
  },
  {
    chainId: 43114,
    name: 'Avalanche C-Chain',
    symbol: 'AVAX',
    rpcEnv: 'AVALANCHE_RPC_URL',
    rpcEnvFallbacks: ['VITE_RPC_43114_URLS'],
    defaultRpcUrls: ['https://avalanche-c-chain-rpc.publicnode.com'],
  },
];

const report = {
  generatedAt: new Date().toISOString(),
  chains: [],
};

function withTimeout(promise, label, timeoutMs = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

function parseUrls(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function resolveRpcCandidates(chain) {
  const envKeys = [chain.rpcEnv, ...(chain.rpcEnvFallbacks ?? [])];
  const candidates = [];
  const seen = new Set();

  for (const key of envKeys) {
    const urls = parseUrls(process.env[key]);
    for (const url of urls) {
      if (seen.has(url)) continue;
      seen.add(url);
      candidates.push({ url, key });
    }
  }

  for (const url of chain.defaultRpcUrls ?? []) {
    if (seen.has(url)) continue;
    seen.add(url);
    candidates.push({ url, key: 'default' });
  }

  return candidates;
}

for (const chain of CHAIN_FIXTURES) {
  const rpcCandidates = resolveRpcCandidates(chain);
  if (rpcCandidates.length === 0) {
    report.chains.push({
      chainId: chain.chainId,
      name: chain.name,
      skipped: true,
      reason: `Missing RPC env and no defaults available (${[chain.rpcEnv, ...(chain.rpcEnvFallbacks ?? [])].join(', ')})`,
    });
    continue;
  }

  const chainResult = {
    chainId: chain.chainId,
    name: chain.name,
    symbol: chain.symbol,
    rpcSourceEnv: null,
    rpcUrl: null,
    fallbackErrors: [],
    walletBalances: [],
  };

  let provider = null;
  for (const candidate of rpcCandidates) {
    const testProvider = new JsonRpcProvider(
      candidate.url,
      {
        chainId: chain.chainId,
        name: chain.name.toLowerCase().replace(/\s+/g, '-'),
      },
      { staticNetwork: true },
    );

    try {
      await withTimeout(testProvider.getBlockNumber(), `${chain.name} RPC health check`);
      chainResult.rpcSourceEnv = candidate.key;
      chainResult.rpcUrl = candidate.url;
      provider = testProvider;
      break;
    } catch (error) {
      chainResult.fallbackErrors.push({
        source: candidate.key,
        rpcUrl: candidate.url,
        error: error instanceof Error ? error.message : String(error),
      });
      if (typeof testProvider.destroy === 'function') {
        testProvider.destroy();
      }
    }
  }

  if (!provider) {
    chainResult.walletBalances.push({
      label: 'rpc',
      error: `All configured RPC endpoints failed for ${chain.name}`,
    });
    report.chains.push(chainResult);
    continue;
  }

  try {
    for (const walletFixture of WALLET_FIXTURES) {
      const wallet = new Wallet(walletFixture.privateKey, provider);
      try {
        const balance = await withTimeout(
          provider.getBalance(wallet.address),
          `${chain.name} ${walletFixture.label} balance`,
        );
        chainResult.walletBalances.push({
          label: walletFixture.label,
          address: wallet.address,
          balance: balance.toString(),
        });
      } catch (error) {
        chainResult.walletBalances.push({
          label: walletFixture.label,
          address: wallet.address,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } finally {
    if (typeof provider.destroy === 'function') {
      provider.destroy();
    }
  }

  report.chains.push(chainResult);
}

fs.mkdirSync('tests/reports', { recursive: true });
fs.writeFileSync('tests/reports/wallet-simulation.json', JSON.stringify(report, null, 2));
console.log('[wallet-simulation] wrote tests/reports/wallet-simulation.json');
