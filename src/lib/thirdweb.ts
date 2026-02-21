import { createThirdwebClient, defineChain } from 'thirdweb';
import { arbitrum, arbitrumSepolia, base, ethereum, polygon, sepolia } from 'thirdweb/chains';
import type { Chain } from 'thirdweb/chains';
import { darkTheme } from 'thirdweb/react';
import { createWallet } from 'thirdweb/wallets';

const THIRDWEB_CLIENT_ID = import.meta.env.VITE_THIRDWEB_CLIENT_ID?.trim();
export const THIRDWEB_WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim();

export const isThirdwebConfigured = Boolean(THIRDWEB_CLIENT_ID);

export const thirdwebClient = THIRDWEB_CLIENT_ID
  ? createThirdwebClient({ clientId: THIRDWEB_CLIENT_ID })
  : null;

export const THIRDWEB_SUPPORTED_CHAINS: Chain[] = [
  ethereum,
  defineChain(17000), // Holesky
  sepolia,
  polygon,
  arbitrum,
  arbitrumSepolia,
  base,
  defineChain(31337), // Hardhat local
];

export const THIRDWEB_DEFAULT_CHAIN = ethereum;

const chainById = new Map<number, Chain>(
  THIRDWEB_SUPPORTED_CHAINS.map((chain) => [chain.id, chain]),
);

export function getThirdwebChain(chainId: number | null | undefined): Chain | null {
  if (!chainId) return null;
  return chainById.get(chainId) ?? defineChain(chainId);
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
