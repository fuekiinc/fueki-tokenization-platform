export type SupportRequestCategory =
  | 'general'
  | 'technical'
  | 'wallet'
  | 'swap'
  | 'compliance'
  | 'billing';

export interface SupportRequestPayload {
  name?: string;
  email?: string;
  subject: string;
  message: string;
  category: SupportRequestCategory;
  route?: string;
}

export interface SupportRequestResponse {
  success: boolean;
  submittedAt: string;
}
