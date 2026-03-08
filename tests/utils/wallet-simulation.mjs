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
  { chainId: 1, name: 'Ethereum Mainnet', symbol: 'ETH', rpcEnv: 'MAINNET_RPC_URL' },
  { chainId: 17000, name: 'Holesky', symbol: 'ETH', rpcEnv: 'HOLESKY_RPC_URL' },
  { chainId: 11155111, name: 'Sepolia', symbol: 'ETH', rpcEnv: 'SEPOLIA_RPC_URL' },
  { chainId: 42161, name: 'Arbitrum One', symbol: 'ETH', rpcEnv: 'ARBITRUM_RPC_URL' },
  { chainId: 421614, name: 'Arbitrum Sepolia', symbol: 'ETH', rpcEnv: 'ARBITRUM_SEPOLIA_RPC_URL' },
  { chainId: 8453, name: 'Base', symbol: 'ETH', rpcEnv: 'BASE_RPC_URL' },
  { chainId: 84532, name: 'Base Sepolia', symbol: 'ETH', rpcEnv: 'BASE_SEPOLIA_RPC_URL' },
  { chainId: 43114, name: 'Avalanche C-Chain', symbol: 'AVAX', rpcEnv: 'AVALANCHE_RPC_URL' },
];

const report = {
  generatedAt: new Date().toISOString(),
  chains: [],
};

for (const chain of CHAIN_FIXTURES) {
  const envKey = chain.rpcEnv;
  const rpcUrl = process.env[envKey];
  if (!rpcUrl) {
    report.chains.push({
      chainId: chain.chainId,
      name: chain.name,
      skipped: true,
      reason: `Missing ${envKey}`,
    });
    continue;
  }

  const provider = new JsonRpcProvider(rpcUrl, chain.chainId);
  const chainResult = {
    chainId: chain.chainId,
    name: chain.name,
    symbol: chain.symbol,
    walletBalances: [],
  };

  for (const walletFixture of WALLET_FIXTURES) {
    const wallet = new Wallet(walletFixture.privateKey, provider);
    try {
      const balance = await wallet.getBalance();
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

  report.chains.push(chainResult);
}

fs.mkdirSync('tests/reports', { recursive: true });
fs.writeFileSync('tests/reports/wallet-simulation.json', JSON.stringify(report, null, 2));
console.log('[wallet-simulation] wrote tests/reports/wallet-simulation.json');
