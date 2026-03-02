import { createThirdwebClient, defineChain } from 'thirdweb';
import {
  arbitrum,
  base,
  ethereum,
  polygon,
  sepolia,
} from 'thirdweb/chains';
import type { Chain } from 'thirdweb/chains';
import { darkTheme } from 'thirdweb/react';
import { createWallet } from 'thirdweb/wallets';
import { getNetworkMetadata } from '../contracts/addresses';
import { getPrimaryRpcUrl, getWalletSwitchRpcUrls } from './rpc/endpoints';

const THIRDWEB_CLIENT_ID =
  import.meta.env.VITE_THIRDWEB_CLIENT_ID?.trim() ||
  '2e0666f968e836ef3adfb480987686c6';
export const THIRDWEB_WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim();

export const isThirdwebConfigured = Boolean(THIRDWEB_CLIENT_ID);

export const thirdwebClient = THIRDWEB_CLIENT_ID
  ? createThirdwebClient({
      clientId: THIRDWEB_CLIENT_ID,
      // Allow moderate batching to reduce total RPC requests while staying
      // within typical free-tier limits.  maxBatchSize=1 (the previous value)
      // sent every call individually, which quickly exhausted rate limits.
      config: {
        rpc: {
          maxBatchSize: 10,
          batchTimeoutMs: 50,
        },
      },
    })
  : null;

function getWalletSwitchPrimaryRpc(chainId: number): string {
  return getWalletSwitchRpcUrls(chainId)[0] ?? getPrimaryRpcUrl(chainId);
}

/** Arbitrum Sepolia with dynamic RPC metadata for wallet_addEthereumChain prompts. */
const arbitrumSepoliaChain = defineChain({
  id: 421614,
  name: 'Arbitrum Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpc: getWalletSwitchPrimaryRpc(421614),
  testnet: true,
  blockExplorers: [
    { name: 'Arbiscan', url: 'https://sepolia.arbiscan.io' },
  ],
});

/** Holesky testnet with dynamic RPC metadata for wallet_addEthereumChain prompts. */
const holesky = defineChain({
  id: 17000,
  name: 'Holesky',
  nativeCurrency: { name: 'Holesky ETH', symbol: 'ETH', decimals: 18 },
  rpc: getWalletSwitchPrimaryRpc(17000),
  testnet: true,
  blockExplorers: [
    { name: 'Blockscout', url: 'https://eth-holesky.blockscout.com' },
  ],
});

/** Base Sepolia metadata (contracts may not be deployed yet). */
const baseSepoliaChain = defineChain({
  id: 84532,
  name: 'Base Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpc: getWalletSwitchPrimaryRpc(84532),
  testnet: true,
  blockExplorers: [
    { name: 'BaseScan', url: 'https://sepolia.basescan.org' },
  ],
});

export const THIRDWEB_SUPPORTED_CHAINS: Chain[] = [
  ethereum,
  arbitrumSepoliaChain,
  holesky,
  sepolia,
  polygon,
  arbitrum,
  base,
  baseSepoliaChain,
  defineChain(31337), // Hardhat local
];

export const THIRDWEB_DEFAULT_CHAIN = ethereum;

const chainById = new Map<number, Chain>(
  THIRDWEB_SUPPORTED_CHAINS.map((chain) => [chain.id, chain]),
);

const KNOWN_TESTNET_CHAINS = new Set<number>([
  17000,
  31337,
  421614,
  84532,
  11155111,
]);

export function getThirdwebChain(chainId: number | null | undefined): Chain | null {
  if (!chainId) return null;
  return chainById.get(chainId) ?? defineChain(chainId);
}

/**
 * Build a chain descriptor for runtime chain switches, optionally pinning a
 * preferred RPC endpoint that was recently health-checked in the browser.
 */
export function getThirdwebChainForSwitch(
  chainId: number,
  preferredRpcUrl?: string | null,
): Chain {
  const walletSwitchPrimaryRpc = getWalletSwitchRpcUrls(chainId)[0];
  const metadata = getNetworkMetadata(chainId);
  if (!metadata) {
    const rpcForSwitch = preferredRpcUrl ?? walletSwitchPrimaryRpc;
    if (!rpcForSwitch) {
      return getThirdwebChain(chainId) ?? defineChain(chainId);
    }
    return defineChain({
      id: chainId,
      rpc: rpcForSwitch,
    });
  }

  const rpcForSwitch = preferredRpcUrl ?? walletSwitchPrimaryRpc ?? metadata.rpcUrl;

  return defineChain({
    id: chainId,
    name: metadata.name,
    nativeCurrency: metadata.nativeCurrency,
    rpc: rpcForSwitch,
    ...(metadata.blockExplorer
      ? {
          blockExplorers: [{ name: 'Explorer', url: metadata.blockExplorer }],
        }
      : {}),
    ...(KNOWN_TESTNET_CHAINS.has(chainId) ? { testnet: true as const } : {}),
  });
}

export const THIRDWEB_WALLETS = [
  createWallet('io.metamask'),
  createWallet('com.coinbase.wallet'),
  createWallet('com.trustwallet.app'),
  createWallet('me.rainbow'),
  createWallet('io.zerion.wallet'),
  createWallet('io.rabby'),
  createWallet('com.okex.wallet'),
  createWallet('app.phantom'),
];

export function getThirdwebAppMetadata() {
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://fueki-tech.com';

  return {
    name: 'Fueki Tokenization Platform',
    url: origin,
    description: 'Enterprise-grade real-world asset tokenization and exchange.',
    logoUrl: `${origin}/fueki-logo.jpg`,
  };
}

export const THIRDWEB_THEME = darkTheme({
  colors: {
    modalBg: '#071724',
    borderColor: 'rgba(123, 162, 184, 0.24)',
    accentButtonBg: '#11b9a5',
    accentButtonText: '#021018',
    primaryButtonBg: '#11b9a5',
    primaryButtonText: '#021018',
    secondaryButtonBg: 'rgba(255, 255, 255, 0.08)',
    secondaryButtonHoverBg: 'rgba(255, 255, 255, 0.16)',
    secondaryText: '#8ba7bd',
    primaryText: '#ecf7ff',
    connectedButtonBg: 'rgba(255, 255, 255, 0.1)',
    connectedButtonBgHover: 'rgba(255, 255, 255, 0.16)',
    accentText: '#67f3dd',
    danger: '#ff5d5d',
    success: '#1dd6a8',
  },
  fontFamily: "'Space Grotesk', 'Manrope', sans-serif",
});
