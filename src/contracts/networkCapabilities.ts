import { getNetworkMetadata } from './addresses';
import { SUPPORTED_NETWORKS } from './addresses';

const ORBITAL_SUPPORTED_CHAIN_IDS = new Set<number>([1, 17000, 42161, 421614, 8453]);

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

export function getSupportedChainIdsForCapability(
  capability: NetworkCapabilityKey,
): number[] {
  return Object.keys(SUPPORTED_NETWORKS)
    .map((id) => Number(id))
    .filter((id) => {
      const caps = getNetworkCapabilities(id);
      return Boolean(caps?.known && caps[capability]);
    })
    .sort((a, b) => a - b);
}

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
  const hasOrbitalContracts = Boolean(meta.orbitalFactoryAddress && meta.orbitalRouterAddress);
  const orbitalChainAllowed = ORBITAL_SUPPORTED_CHAIN_IDS.has(chainId);

  return {
    chainId,
    known: true,
    name: meta.name,
    mintAsset: hasFactory,
    mintSecurity: hasSecurityFactory,
    portfolio: hasFactory || hasSecurityFactory,
    exchangeOrderbook: hasFactory && hasExchange,
    exchangeAMM: hasFactory && hasExchange && Boolean(meta.ammAddress),
    orbitalAMM: hasFactory && hasOrbitalContracts && orbitalChainAllowed,
    wbtcPairs: Boolean(meta.wbtcAddress),
  };
}
