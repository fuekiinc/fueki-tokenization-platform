# Token Digest Migration Notes

## Forward migration

1. Deploy the application code that hashes new tokens before persistence and can look up both hashed rows and pre-migration raw rows.
2. Run the `20260309_hash_tokens_at_rest` migration.
3. Verify new refresh, reset, and approval flows create only 64-character SHA-256 hex digests in the database.

## Compatibility impact

- API contracts do not change.
- Existing raw refresh/reset/action tokens continue working during rollout because the application now looks up both hashed rows and legacy raw rows.
- After the migration runs, existing persisted raw tokens are converted in place to SHA-256 hex digests.

## Rollback

- The migration is one-way because the original bearer tokens cannot be reconstructed from their digests.
- If the application must be rolled back to pre-migration code, delete token-bearing rows before starting the old build so the old code does not attempt raw-token lookups against digests:
  - `Session`
  - `PasswordResetToken`
  - `AdminActionToken`
  - `MintApprovalActionToken`
  - `SecurityTokenApprovalActionToken`
- Operational impact of rollback cleanup:
  - users must log in again
  - outstanding password reset links become invalid
  - outstanding KYC/mint/security-token approval emails must be reissued from the current application
