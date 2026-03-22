import type { InterfaceAbi } from 'ethers';
import { getReadOnlyProvider } from '../blockchain/contracts';
import {
  multicall as executeMulticall,
  multicallSameFunction as executeMulticallSameFunction,
  multicallSameTarget as executeMulticallSameTarget,
  type MulticallRequest,
  type MulticallResult,
} from '../blockchain/multicall';

export type RpcCallDescriptor = MulticallRequest;
export type RpcCallResult<T = unknown> = MulticallResult<T>;

export async function multicall<T = unknown>(
  chainId: number,
  calls: RpcCallDescriptor[],
): Promise<RpcCallResult<T>[]> {
  return executeMulticall<T>(getReadOnlyProvider(chainId), calls);
}

export async function multicallSameFunction<T = unknown>(
  chainId: number,
  addresses: string[],
  abi: InterfaceAbi,
  functionName: string,
  args?: unknown[],
): Promise<RpcCallResult<T>[]> {
  return executeMulticallSameFunction<T>(
    getReadOnlyProvider(chainId),
    addresses,
    abi,
    functionName,
    args,
  );
}

export async function multicallSameTarget<T = unknown>(
  chainId: number,
  target: string,
  abi: InterfaceAbi,
  calls: { functionName: string; args?: unknown[] }[],
): Promise<RpcCallResult<T>[]> {
  return executeMulticallSameTarget<T>(
    getReadOnlyProvider(chainId),
    target,
    abi,
    calls,
  );
}
