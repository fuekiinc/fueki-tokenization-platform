# ADR-003: Exact-Match KYC Status Normalization

## Status
Implemented (fixed from fuzzy matching)

## Context
Original implementation used `.includes('verif')` for KYC status normalization, which could match "unverified" → "approved" — a privilege escalation vulnerability.

## Decision
Replace fuzzy string matching with exact-match mapping:
```typescript
const KYC_STATUS_MAP: Record<string, KycStatus> = {
  'not_started': 'not_started',
  'pending': 'pending',
  'approved': 'approved',
  'rejected': 'rejected',
};
```

Unknown values default to `'not_started'` (most restrictive).

## Consequences
- Eliminates privilege escalation via status string manipulation
- Any new status values must be explicitly added to the map
- Backend and frontend use the same normalization logic
