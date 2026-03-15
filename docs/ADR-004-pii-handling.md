# ADR-004: PII Encryption at Rest, Masked in Transit

## Status
Implemented

## Context
Platform collects sensitive PII for KYC compliance: SSN, government ID, full legal name, date of birth, residential address. This data is subject to regulatory requirements and must be protected against data breaches.

## Decision
1. **Encryption at rest:** AES-256-GCM via `backend/src/services/encryption.ts`
2. **Masked in transit:** SSN shows last 4 digits only in API responses
3. **No PII in emails:** Admin notification emails contain only user ID + link to admin panel
4. **No PII in logs:** All logger calls near PII fields audited and removed
5. **Audit trail:** All admin PII access logged (who, when, which fields)

## Known Gaps
- Single static encryption key — rotation procedure needed
- Key stored in environment variable — no HSM or KMS integration yet

## Consequences
- Database breach exposes only encrypted ciphertext
- Admin must access admin panel to view PII (audit logged)
- Key compromise requires re-encryption of all PII records
