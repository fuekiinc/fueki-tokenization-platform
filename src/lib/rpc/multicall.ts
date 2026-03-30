import type { InterfaceAbi } from 'ethers';
import { getReadOnlyProvider } from '../blockchain/contracts';
import {
  multicall as executeMulticall,
  multicallSameFunction as executeMulticallSameFunction,
  multicallSameTarget as executeMulticallSameTarget,
  type MulticallRequest,
  type MulticallResult,
} from '../blockchain/multicall';
import {
  getOrderedRpcEndpoints,
  isRetryableRpcError,
  reportRpcEndpointFailure,
  reportRpcEndpointSuccess,
} from './endpoints';
import { createReadOnlyRpcProvider } from './providers';

export type RpcCallDescriptor = MulticallRequest;
export type RpcCallResult<T = unknown> = MulticallResult<T>;

const FALLBACK_DELAY_MS = 300;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withFallbackReadProvider<T>(
  chainId: number,
  callback: (provider: ReturnType<typeof getReadOnlyProvider>) => Promise<T>,
): Promise<T> {
  const endpoints = getOrderedRpcEndpoints(chainId);
  if (endpoints.length === 0) {
    return callback(getReadOnlyProvider(chainId));
  }

  const transientProviders: ReturnType<typeof getReadOnlyProvider>[] = [];
  let lastRetryableError: unknown = null;

  try {
    for (let index = 0; index < endpoints.length; index += 1) {
      const endpoint = endpoints[index];
      const provider =
        index === 0
          ? getReadOnlyProvider(chainId)
          : createReadOnlyRpcProvider(endpoint, chainId);

      if (index > 0) {
        transientProviders.push(provider);
      }

      try {
        const result = await callback(provider);
        reportRpcEndpointSuccess(chainId, endpoint);
        return result;
      } catch (error) {
        if (!isRetryableRpcError(error)) {
          throw error;
        }

        lastRetryableError = error;
        reportRpcEndpointFailure(chainId, endpoint);

        if (index < endpoints.length - 1) {
          await sleep(FALLBACK_DELAY_MS);
        }
      }
    }

    throw lastRetryableError ?? new Error(`No healthy read RPC endpoints available for chain ${chainId}`);
  } finally {
    for (const provider of transientProviders) {
      provider.destroy();
    }
  }
}

export async function multicall<T = unknown>(
  chainId: number,
  calls: RpcCallDescriptor[],
): Promise<RpcCallResult<T>[]> {
  return withFallbackReadProvider(chainId, (provider) =>
    executeMulticall<T>(provider, calls),
  );
}

export async function multicallSameFunction<T = unknown>(
  chainId: number,
  addresses: string[],
  abi: InterfaceAbi,
  functionName: string,
  args?: unknown[],
): Promise<RpcCallResult<T>[]> {
  return withFallbackReadProvider(chainId, (provider) =>
    executeMulticallSameFunction<T>(
      provider,
      addresses,
      abi,
      functionName,
      args,
    ),
  );
}

export async function multicallSameTarget<T = unknown>(
  chainId: number,
  target: string,
  abi: InterfaceAbi,
  calls: { functionName: string; args?: unknown[] }[],
): Promise<RpcCallResult<T>[]> {
  return withFallbackReadProvider(chainId, (provider) =>
    executeMulticallSameTarget<T>(
      provider,
      target,
      abi,
      calls,
    ),
  );
}
