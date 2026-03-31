import axios from 'axios';
import apiClient from './client';
import type {
  CurrentNav,
  FinalizeNavAttestationInput,
  NavAttestation,
  NavDraftInput,
  NavHistoryResponse,
  NavHolderValue,
  NavOracleRegistration,
  NavPublisher,
  RegisterNavOracleInput,
  UpsertNavPublisherInput,
} from '../../types/nav';

function isNotFound(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

function navBasePath(tokenAddress: string, chainId: number): string {
  return `/api/v1/nav/${tokenAddress}/${chainId}`;
}

export async function getNavOracleRegistration(
  tokenAddress: string,
  chainId: number,
): Promise<NavOracleRegistration | null> {
  try {
    const response = await apiClient.get<NavOracleRegistration>(
      `${navBasePath(tokenAddress, chainId)}/oracle`,
    );
    return response.data;
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

export async function registerNavOracle(
  tokenAddress: string,
  chainId: number,
  payload: RegisterNavOracleInput,
): Promise<NavOracleRegistration> {
  const response = await apiClient.post<NavOracleRegistration>(
    `${navBasePath(tokenAddress, chainId)}/oracle`,
    payload,
  );
  return response.data;
}

export async function getCurrentNav(
  tokenAddress: string,
  chainId: number,
): Promise<CurrentNav | null> {
  try {
    const response = await apiClient.get<CurrentNav>(
      `${navBasePath(tokenAddress, chainId)}/current`,
    );
    return response.data;
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

export async function getNavHistory(
  tokenAddress: string,
  chainId: number,
  params?: {
    page?: number;
    pageSize?: number;
    from?: string;
    to?: string;
  },
): Promise<NavHistoryResponse> {
  const response = await apiClient.get<NavHistoryResponse>(
    `${navBasePath(tokenAddress, chainId)}/history`,
    { params },
  );
  return response.data;
}

export async function getNavAttestation(
  tokenAddress: string,
  chainId: number,
  attestationIndex: number,
): Promise<NavAttestation | null> {
  try {
    const response = await apiClient.get<NavAttestation>(
      `${navBasePath(tokenAddress, chainId)}/attestation/${attestationIndex}`,
    );
    return response.data;
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

export async function getNavHolderValue(
  tokenAddress: string,
  chainId: number,
  holderAddress: string,
): Promise<NavHolderValue | null> {
  try {
    const response = await apiClient.get<NavHolderValue>(
      `${navBasePath(tokenAddress, chainId)}/holder-value/${holderAddress}`,
    );
    return response.data;
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

export async function listNavPublishers(
  tokenAddress: string,
  chainId: number,
): Promise<NavPublisher[]> {
  const response = await apiClient.get<{ publishers: NavPublisher[] }>(
    `${navBasePath(tokenAddress, chainId)}/publishers`,
  );
  return response.data.publishers;
}

export async function upsertNavPublisher(
  tokenAddress: string,
  chainId: number,
  payload: UpsertNavPublisherInput,
): Promise<NavPublisher> {
  const response = await apiClient.post<NavPublisher>(
    `${navBasePath(tokenAddress, chainId)}/publishers`,
    payload,
  );
  return response.data;
}

export async function removeNavPublisher(
  tokenAddress: string,
  chainId: number,
  walletAddress: string,
): Promise<void> {
  await apiClient.delete(`${navBasePath(tokenAddress, chainId)}/publishers/${walletAddress}`);
}

export async function createNavDraft(
  tokenAddress: string,
  chainId: number,
  payload: NavDraftInput,
): Promise<NavAttestation> {
  const response = await apiClient.post<NavAttestation>(
    `${navBasePath(tokenAddress, chainId)}/attestation/draft`,
    payload,
  );
  return response.data;
}

export async function finalizeNavAttestation(
  tokenAddress: string,
  chainId: number,
  payload: FinalizeNavAttestationInput,
): Promise<NavAttestation> {
  const response = await apiClient.post<NavAttestation>(
    `${navBasePath(tokenAddress, chainId)}/attestation`,
    payload,
  );
  return response.data;
}

export async function updateNavAttestationStatus(
  tokenAddress: string,
  chainId: number,
  attestationIndex: number,
  status: NavAttestation['status'],
): Promise<NavAttestation> {
  const response = await apiClient.patch<NavAttestation>(
    `${navBasePath(tokenAddress, chainId)}/attestation/${attestationIndex}/status`,
    { status },
  );
  return response.data;
}
