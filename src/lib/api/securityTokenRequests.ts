import apiClient from './client';
import type {
  ListSecurityTokenApprovalRequestsQuery,
  ListSecurityTokenApprovalRequestsResponse,
  SecurityTokenApprovalStatusQuery,
  SecurityTokenApprovalStatusResponse,
  SubmitSecurityTokenApprovalPayload,
  SubmitSecurityTokenApprovalResponse,
} from '../../types/securityTokenApproval';

export async function submitSecurityTokenApprovalRequest(
  payload: SubmitSecurityTokenApprovalPayload,
): Promise<SubmitSecurityTokenApprovalResponse> {
  const formData = new FormData();
  formData.append('tokenName', payload.tokenName);
  formData.append('tokenSymbol', payload.tokenSymbol);
  formData.append('decimals', String(payload.decimals));
  formData.append('totalSupply', payload.totalSupply);
  formData.append('maxTotalSupply', payload.maxTotalSupply);
  formData.append('minTimelockAmount', payload.minTimelockAmount);
  formData.append('maxReleaseDelayDays', String(payload.maxReleaseDelayDays));
  formData.append('originalValue', payload.originalValue);
  formData.append('documentHash', payload.documentHash);
  formData.append('documentType', payload.documentType);
  formData.append('hashSource', payload.hashSource);
  formData.append('chainId', String(payload.chainId));
  formData.append('requesterWalletAddress', payload.requesterWalletAddress);

  if (payload.file) {
    formData.append('document', payload.file);
  }

  const response = await apiClient.post<SubmitSecurityTokenApprovalResponse>(
    '/api/security-token-requests/submit',
    formData,
  );
  return response.data;
}

export async function getSecurityTokenApprovalStatus(
  params: SecurityTokenApprovalStatusQuery,
): Promise<SecurityTokenApprovalStatusResponse> {
  const response = await apiClient.get<SecurityTokenApprovalStatusResponse>(
    '/api/security-token-requests/status',
    { params },
  );
  return response.data;
}

export async function listSecurityTokenApprovalRequests(
  params: ListSecurityTokenApprovalRequestsQuery,
): Promise<ListSecurityTokenApprovalRequestsResponse> {
  const response =
    await apiClient.get<ListSecurityTokenApprovalRequestsResponse>(
      '/api/security-token-requests/list',
      { params },
    );
  return response.data;
}
