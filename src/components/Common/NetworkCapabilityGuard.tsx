import { AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { getNetworkMetadata } from '../../contracts/addresses';
import {
  type NetworkCapabilityKey,
  getNetworkCapabilities,
} from '../../contracts/networkCapabilities';

const DEFAULT_SWITCH_CHAIN_IDS = [17000, 1, 31337];

interface NetworkCapabilityGuardProps {
  chainId: number | null | undefined;
  requiredCapability: NetworkCapabilityKey;
  switchNetwork: (chainId: number) => Promise<void> | void;
  title?: string;
  description?: string;
  switchChainIds?: number[];
  className?: string;
}

const CAPABILITY_LABELS: Record<NetworkCapabilityKey, string> = {
  mintAsset: 'asset minting',
  mintSecurity: 'security token minting',
  portfolio: 'portfolio views',
  exchangeOrderbook: 'exchange trading',
  exchangeAMM: 'AMM liquidity and swaps',
  orbitalAMM: 'Orbital AMM',
  wbtcPairs: 'WBTC trading pairs',
};

function switchButtonLabel(chainId: number): string {
  const metadata = getNetworkMetadata(chainId);
  if (!metadata) return `Switch to Chain ${chainId}`;
  if (chainId === 31337) return 'Hardhat Local';
  return `Switch to ${metadata.name}`;
}

export default function NetworkCapabilityGuard({
  chainId,
  requiredCapability,
  switchNetwork,
  title,
  description,
  switchChainIds = DEFAULT_SWITCH_CHAIN_IDS,
  className,
}: NetworkCapabilityGuardProps) {
  const capabilities = getNetworkCapabilities(chainId);

  if (capabilities && capabilities[requiredCapability]) {
    return null;
  }

  const currentMetadata = chainId ? getNetworkMetadata(chainId) : null;
  const currentName = currentMetadata?.name ?? (chainId ? `Unknown Network (${chainId})` : 'Unknown Network');

  return (
    <div
      className={clsx(
        'rounded-2xl border border-amber-500/15 bg-amber-500/[0.05] p-6 text-center',
        className,
      )}
      role="alert"
    >
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/20">
        <AlertCircle className="h-8 w-8 text-amber-400" />
      </div>

      <h2 className="mb-3 text-xl font-bold text-white">
        {title ?? 'Network Not Supported'}
      </h2>

      <p className="mx-auto max-w-md text-sm leading-relaxed text-gray-400">
        {description ??
          `Your current network does not support ${CAPABILITY_LABELS[requiredCapability]}. Switch to a supported network to continue.`}
      </p>

      <div className="mt-6 inline-flex items-center gap-2.5 rounded-full bg-amber-500/10 px-5 py-2.5 text-xs font-medium text-amber-400 ring-1 ring-amber-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        Connected to: {currentName}
      </div>

      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        {switchChainIds.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => void switchNetwork(id)}
            className={clsx(
              'inline-flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm transition-all',
              id === 17000
                ? 'border-cyan-500/35 bg-cyan-500/15 font-semibold text-cyan-300 hover:bg-cyan-500/25 hover:text-cyan-200'
                : id === 1
                  ? 'border-indigo-500/25 bg-indigo-500/15 font-semibold text-indigo-300 hover:bg-indigo-500/25 hover:text-indigo-200'
                  : 'border-white/[0.08] bg-white/[0.04] font-medium text-gray-400 hover:bg-white/[0.08] hover:text-gray-300',
            )}
          >
            {switchButtonLabel(id)}
          </button>
        ))}
      </div>
    </div>
  );
}
