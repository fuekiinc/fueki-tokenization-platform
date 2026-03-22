import apiClient from './client';
import type { DeploymentRecord } from '../../types/contractDeployer';
import { dedupeRpcRequest } from '../rpc/requestDedup';

const DEPLOYMENTS_CACHE_TTL_MS = 45_000;
const deploymentResponseCache = new Map<string, { data: ListDeploymentsResponse; expiresAt: number }>();

function makeDeploymentsCacheKey(params: { chainId?: number; limit?: number; offset?: number }): string {
  return JSON.stringify({
    chainId: params.chainId ?? null,
    limit: params.limit ?? null,
    offset: params.offset ?? null,
  });
}

interface CreateDeploymentPayload {
  templateId: string;
  templateName: string;
  contractAddress: string;
  deployerAddress: string;
  chainId: number;
  txHash: string;
  constructorArgs: Record<string, string>;
  abi: unknown[];
  blockNumber?: number;
  gasUsed?: string;
  deployedAt?: string;
}

interface DeploymentResponse {
  success: boolean;
  deployment: {
    id: string;
    templateId: string;
    templateName: string;
    contractAddress: string;
    deployerAddress: string;
    chainId: number;
    txHash: string;
    constructorArgs: Record<string, string>;
    blockNumber: number | null;
    gasUsed: string | null;
    deployedAt: string;
    createdAt: string;
  };
}

interface ListDeploymentsResponse {
  deployments: Array<{
    id: string;
    templateId: string;
    templateName: string;
    contractAddress: string;
    deployerAddress: string;
    chainId: number;
    txHash: string;
    constructorArgs: Record<string, string>;
    blockNumber: number | null;
    gasUsed: string | null;
    deployedAt: string;
    createdAt: string;
  }>;
  total: number;
}

/**
 * Save a deployment record to the backend (fire-and-forget).
 * Silently catches errors -- localStorage is the primary store.
 */
export async function saveDeploymentToBackend(
  record: DeploymentRecord,
): Promise<void> {
  try {
    const payload: CreateDeploymentPayload = {
      templateId: record.templateId,
      templateName: record.templateName,
      contractAddress: record.contractAddress,
      deployerAddress: record.deployerAddress,
      chainId: record.chainId,
      txHash: record.txHash,
      constructorArgs: record.constructorArgs,
      abi: record.abi as unknown[],
      blockNumber: record.blockNumber ?? undefined,
      gasUsed: record.gasUsed ?? undefined,
      deployedAt: record.deployedAt,
    };

    await apiClient.post<DeploymentResponse>('/api/deployments', payload);
    deploymentResponseCache.clear();
  } catch {
    // Silent failure -- localStorage is the primary store.
    // Backend sync is best-effort when the user is authenticated.
  }
}

/**
 * Fetch deployments from the backend for syncing.
 */
export async function fetchDeploymentsFromBackend(
  params: { chainId?: number; limit?: number; offset?: number } = {},
): Promise<ListDeploymentsResponse> {
  const cacheKey = makeDeploymentsCacheKey(params);
  const cached = deploymentResponseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  return dedupeRpcRequest(`deployments:${cacheKey}`, async () => {
    const response = await apiClient.get<ListDeploymentsResponse>(
      '/api/deployments',
      { params },
    );
    deploymentResponseCache.set(cacheKey, {
      data: response.data,
      expiresAt: Date.now() + DEPLOYMENTS_CACHE_TTL_MS,
    });
    return response.data;
  });
}

/**
 * Delete a deployment from the backend.
 */
export async function deleteDeploymentFromBackend(id: string): Promise<void> {
  try {
    await apiClient.delete(`/api/deployments/${id}`);
    deploymentResponseCache.clear();
  } catch {
    // Silent failure -- localStorage is the primary store.
  }
}
