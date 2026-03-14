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
  // Use exact-match aliases only — substring matching caused privilege
  // escalation (e.g. "unverified" matched "verif" → "approved").
  const ALIAS_MAP: Record<string, KYCStatus> = {
    verified: 'approved',
    completed: 'approved',
    active: 'approved',
    denied: 'rejected',
    declined: 'rejected',
    failed: 'rejected',
    in_review: 'pending',
    under_review: 'pending',
    processing: 'pending',
    submitted: 'pending',
    unverified: 'not_submitted',
    incomplete: 'not_submitted',
    not_started: 'not_submitted',
  };
  return ALIAS_MAP[value] ?? 'not_submitted';
}
