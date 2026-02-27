import apiClient from './client';
import type { DeploymentRecord } from '../../types/contractDeployer';

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
  const response = await apiClient.get<ListDeploymentsResponse>(
    '/api/deployments',
    { params },
  );
  return response.data;
}

/**
 * Delete a deployment from the backend.
 */
export async function deleteDeploymentFromBackend(id: string): Promise<void> {
  try {
    await apiClient.delete(`/api/deployments/${id}`);
  } catch {
    // Silent failure -- localStorage is the primary store.
  }
}
