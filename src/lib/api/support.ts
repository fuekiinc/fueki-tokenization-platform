import apiClient from './client';
import type {
  SupportRequestPayload,
  SupportRequestResponse,
} from '../../types/support';

export async function submitSupportRequest(
  payload: SupportRequestPayload,
): Promise<SupportRequestResponse> {
  const response = await apiClient.post<SupportRequestResponse>(
    '/api/support/request',
    payload,
  );
  return response.data;
}
