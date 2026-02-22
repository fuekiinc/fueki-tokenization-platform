import { getNetworkMetadata } from './addresses';

export interface NetworkCapabilities {
  chainId: number;
  known: boolean;
  name: string;
  mintAsset: boolean;
  mintSecurity: boolean;
  portfolio: boolean;
  exchangeOrderbook: boolean;
  exchangeAMM: boolean;
  orbitalAMM: boolean;
  wbtcPairs: boolean;
}

export type NetworkCapabilityKey = keyof Omit<NetworkCapabilities, 'chainId' | 'known' | 'name'>;

export function getNetworkCapabilities(
  chainId: number | null | undefined,
): NetworkCapabilities | null {
  if (!chainId) return null;

  const meta = getNetworkMetadata(chainId);
  if (!meta) {
    return {
      chainId,
      known: false,
      name: `Chain ${chainId}`,
      mintAsset: false,
      mintSecurity: false,
      portfolio: false,
      exchangeOrderbook: false,
      exchangeAMM: false,
      orbitalAMM: false,
      wbtcPairs: false,
    };
  }

  const hasFactory = Boolean(meta.factoryAddress);
  const hasExchange = Boolean(meta.exchangeAddress || meta.assetBackedExchangeAddress);
  const hasSecurityFactory = Boolean(meta.securityTokenFactoryAddress);

  return {
    chainId,
    known: true,
    name: meta.name,
    mintAsset: hasFactory,
    mintSecurity: hasSecurityFactory,
    portfolio: hasFactory || hasSecurityFactory,
    exchangeOrderbook: hasFactory && hasExchange,
    exchangeAMM: hasFactory && hasExchange && Boolean(meta.ammAddress),
    orbitalAMM: hasFactory && Boolean(meta.orbitalFactoryAddress && meta.orbitalRouterAddress),
    wbtcPairs: Boolean(meta.wbtcAddress),
  };
}
