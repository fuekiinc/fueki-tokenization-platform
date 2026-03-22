import axios from 'axios';
import apiClient from './client';
import type {
  ContractDeploymentTemplateType,
  DeploymentRecord,
} from '../../types/contractDeployer';
import { dedupeRpcRequest } from '../rpc/requestDedup';

const DEPLOYMENTS_CACHE_TTL_MS = 45_000;
const DEPLOYMENTS_API_PATH = '/api/v1/contracts/deployments';
const deploymentResponseCache = new Map<string, { data: ListDeploymentsResponse; expiresAt: number }>();

function makeDeploymentsCacheKey(params: {
  chainId?: number;
  limit?: number;
  page?: number;
  cursor?: string;
  walletAddress?: string;
  templateType?: ContractDeploymentTemplateType;
}): string {
  return JSON.stringify({
    chainId: params.chainId ?? null,
    limit: params.limit ?? null,
    page: params.page ?? null,
    cursor: params.cursor ?? null,
    walletAddress: params.walletAddress?.toLowerCase() ?? null,
    templateType: params.templateType ?? null,
  });
}

interface DeploymentApiRecord {
  id: string;
  templateId: string;
  templateName: string;
  contractName: string;
  templateType: ContractDeploymentTemplateType;
  contractAddress: string;
  deployerAddress: string;
  walletAddress: string;
  chainId: number;
  txHash: string;
  constructorArgs: Record<string, unknown>;
  abi: unknown[];
  sourceCode: string | null;
  compilationWarnings: string[];
  blockNumber: number | null;
  gasUsed: string | null;
  deployedAt: string;
  createdAt: string;
  updatedAt: string;
}

interface CreateDeploymentPayload {
  templateId: string;
  templateName: string;
  contractName: string;
  templateType: ContractDeploymentTemplateType;
  contractAddress: string;
  deployerAddress: string;
  walletAddress: string;
  chainId: number;
  txHash: string;
  constructorArgs: Record<string, unknown>;
  abi: unknown[];
  sourceCode?: string | null;
  compilationWarnings?: string[] | null;
  blockNumber?: number;
  gasUsed?: string;
  deployedAt?: string;
}

interface DeploymentResponse {
  success: boolean;
  deployment: DeploymentApiRecord;
}

interface ListDeploymentsResponse {
  deployments: DeploymentApiRecord[];
  total: number;
  nextCursor: string | null;
  page: number;
  limit: number;
}

function mapApiRecord(record: DeploymentApiRecord): DeploymentRecord {
  return {
    id: record.id,
    templateId: record.templateId,
    templateName: record.templateName,
    contractName: record.contractName,
    templateType: record.templateType,
    contractAddress: record.contractAddress,
    deployerAddress: record.deployerAddress,
    walletAddress: record.walletAddress,
    chainId: record.chainId,
    txHash: record.txHash,
    constructorArgs: record.constructorArgs,
    abi: Array.isArray(record.abi)
      ? (record.abi as readonly Record<string, unknown>[])
      : [],
    sourceCode: record.sourceCode,
    compilationWarnings: record.compilationWarnings,
    blockNumber: record.blockNumber ?? undefined,
    gasUsed: record.gasUsed ?? undefined,
    deployedAt: record.deployedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function fetchDeploymentByAddressFromBackend(
  contractAddress: string,
  params: { chainId?: number; walletAddress?: string } = {},
): Promise<DeploymentRecord | null> {
  try {
    const response = await apiClient.get<DeploymentResponse>(
      `${DEPLOYMENTS_API_PATH}/by-address/${contractAddress}`,
      {
        params: {
          ...(params.chainId ? { chainId: params.chainId } : {}),
          ...(params.walletAddress ? { walletAddress: params.walletAddress } : {}),
        },
      },
    );
    return mapApiRecord(response.data.deployment);
  } catch {
    return null;
  }
}

export async function saveDeploymentToBackend(
  record: DeploymentRecord,
): Promise<DeploymentRecord | null> {
  try {
    const payload: CreateDeploymentPayload = {
      templateId: record.templateId,
      templateName: record.templateName,
      contractName: record.contractName ?? record.templateName,
      templateType: record.templateType ?? 'CUSTOM',
      contractAddress: record.contractAddress,
      deployerAddress: record.deployerAddress,
      walletAddress: record.walletAddress ?? record.deployerAddress,
      chainId: record.chainId,
      txHash: record.txHash,
      constructorArgs: record.constructorArgs,
      abi: record.abi as unknown[],
      sourceCode: record.sourceCode ?? null,
      compilationWarnings: record.compilationWarnings ?? null,
      blockNumber: record.blockNumber ?? undefined,
      gasUsed: record.gasUsed ?? undefined,
      deployedAt: record.deployedAt,
    };

    const response = await apiClient.post<DeploymentResponse>(DEPLOYMENTS_API_PATH, payload);
    deploymentResponseCache.clear();
    return mapApiRecord(response.data.deployment);
  } catch (error) {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 409 &&
      record.contractAddress
    ) {
      const existing = await fetchDeploymentByAddressFromBackend(record.contractAddress, {
        chainId: record.chainId,
        walletAddress: record.walletAddress ?? record.deployerAddress,
      });
      if (existing) {
        return existing;
      }
    }

    // Backend sync failure should not block local visibility.
    return null;
  }
}

/**
 * Fetch deployments from the backend for syncing.
 */
export async function fetchDeploymentsFromBackend(
  params: {
    chainId?: number;
    limit?: number;
    page?: number;
    cursor?: string;
    walletAddress?: string;
    templateType?: ContractDeploymentTemplateType;
  } = {},
): Promise<ListDeploymentsResponse> {
  const cacheKey = makeDeploymentsCacheKey(params);
  const cached = deploymentResponseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  return dedupeRpcRequest(`deployments:${cacheKey}`, async () => {
    const response = await apiClient.get<ListDeploymentsResponse>(
      DEPLOYMENTS_API_PATH,
      { params },
    );
    deploymentResponseCache.set(cacheKey, {
      data: response.data,
      expiresAt: Date.now() + DEPLOYMENTS_CACHE_TTL_MS,
    });
    return response.data;
  });
}

export async function deleteDeploymentFromBackend(
  id: string,
  walletAddress?: string | null,
): Promise<void> {
  try {
    await apiClient.delete(`${DEPLOYMENTS_API_PATH}/${id}`, {
      params: walletAddress ? { walletAddress } : undefined,
    });
    deploymentResponseCache.clear();
  } catch {
    // Silent failure -- local cache remains available.
  }
}
