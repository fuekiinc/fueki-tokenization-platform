import type { KYCStatus } from '../../types/auth';

const VALID_KYC_STATUSES: readonly KYCStatus[] = [
  'not_submitted',
  'pending',
  'approved',
  'rejected',
] as const;

const VALID_KYC_STATUS_SET = new Set<KYCStatus>(VALID_KYC_STATUSES);

/**
 * Normalize a raw KYC status value from API/storage into canonical UI status.
 * Handles historical case/format drift defensively.
 */
export function normalizeKycStatus(raw: unknown): KYCStatus {
  if (typeof raw !== 'string') return 'not_submitted';
  const value = raw.trim().toLowerCase();
  if (VALID_KYC_STATUS_SET.has(value as KYCStatus)) {
    return value as KYCStatus;
  }
  if (value.includes('approve')) return 'approved';
  if (value.includes('verif')) return 'approved';
  if (value.includes('complete')) return 'approved';
  if (value.includes('active')) return 'approved';
  if (value.includes('reject')) return 'rejected';
  if (value.includes('pend')) return 'pending';
  if (value.includes('submit')) return 'not_submitted';
  return 'not_submitted';
}
