import { ethers } from 'ethers';

/**
 * Public RPCs and managed endpoints can reject oversized JSON-RPC batch payloads
 * with HTTP 413. Keep browser-side read providers conservative so high-cardinality
 * reads do not collapse into a single oversized POST body.
 */
export const READ_ONLY_RPC_PROVIDER_OPTIONS = Object.freeze({
  staticNetwork: true,
  batchMaxCount: 1,
  batchMaxSize: 32_000,
  batchStallTime: 0,
});

export function createReadOnlyRpcProvider(
  rpcUrl: string,
  chainId: number,
): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(
    rpcUrl,
    chainId,
    READ_ONLY_RPC_PROVIDER_OPTIONS,
  );
}

export function getJsonRpcProviderUrl(provider: ethers.Provider): string | null {
  const candidate = provider as ethers.JsonRpcProvider & {
    _getConnection?: () => { url?: string };
  };

  if (typeof candidate._getConnection !== 'function') {
    return null;
  }

  const url = candidate._getConnection()?.url;
  return typeof url === 'string' && url.length > 0 ? url : null;
}
