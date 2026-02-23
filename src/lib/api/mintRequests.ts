import apiClient from './client';
import type {
  ListMintApprovalRequestsQuery,
  ListMintApprovalRequestsResponse,
  MintApprovalStatusQuery,
  MintApprovalStatusResponse,
  SubmitMintApprovalPayload,
  SubmitMintApprovalResponse,
} from '../../types/mintApproval';

export async function submitMintApprovalRequest(
  payload: SubmitMintApprovalPayload,
): Promise<SubmitMintApprovalResponse> {
  const formData = new FormData();
  formData.append('document', payload.file);
  formData.append('tokenName', payload.tokenName);
  formData.append('tokenSymbol', payload.tokenSymbol);
  formData.append('mintAmount', payload.mintAmount);
  formData.append('recipient', payload.recipient);
  formData.append('documentHash', payload.documentHash);
  formData.append('documentType', payload.documentType);
  formData.append('originalValue', payload.originalValue);
  formData.append('currency', payload.currency);
  formData.append('chainId', String(payload.chainId));

  const response = await apiClient.post<SubmitMintApprovalResponse>(
    '/api/mint-requests/submit',
    formData,
  );
  return response.data;
}

export async function getMintApprovalStatus(
  params: MintApprovalStatusQuery,
): Promise<MintApprovalStatusResponse> {
  const response = await apiClient.get<MintApprovalStatusResponse>(
    '/api/mint-requests/status',
    { params },
  );
  return response.data;
}

export async function listMintApprovalRequests(
  params: ListMintApprovalRequestsQuery = {},
): Promise<ListMintApprovalRequestsResponse> {
  const response = await apiClient.get<ListMintApprovalRequestsResponse>(
    '/api/mint-requests/list',
    { params },
  );
  return response.data;
}
