# User Access Revocation Migration Notes

## Forward migration

1. Deploy the application code that enforces `User.accessRevokedAt` across login, refresh, authenticated API access, and the admin access-management route.
2. Run the `20260329_add_user_access_revocation_fields` migration.
3. Verify a revoked user can no longer log in, refresh a session, or access protected API routes, and that a restored user can sign in again.

## Compatibility impact

- Existing users remain active by default because the new revocation columns are nullable.
- Revoking access is immediate for refresh-token sessions because the admin action now deletes existing `Session` rows for that user.
- Access tokens issued before revocation are rejected server-side by authenticated middleware because it now checks the live user access state in the database.

## Rollback

- Schema rollback: drop `User.accessRevokedAt`, `User.accessRevokedBy`, and `User.accessRevocationReason` only after rolling back the application code that reads them.
- Operational rollback: if the old application build is restored while the columns still exist, the extra columns are ignored and users with previously revoked access will be able to sign in again.
