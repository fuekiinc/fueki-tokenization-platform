# NAV Oracle Migration Notes

## Forward migration

1. Deploy the application code that adds the NAV oracle contract, backend NAV routes/services, and frontend valuation dashboard.
2. Run the `20260330_add_nav_oracle_system` migration.
3. Register each token's oracle address through the new NAV setup flow before attempting publisher management or attestation publishing.
4. Verify:
   - `GET /api/v1/nav/:tokenAddress/:chainId/current`
   - draft creation / published-attestation sync
   - valuation dashboard rendering for a registered token

## Compatibility impact

- Existing users and token flows remain unchanged until an oracle is registered for a token.
- The new tables are additive and do not mutate existing user, KYC, approval, or deployment records.
- NAV publisher metadata is token-scoped via assignments, while published attestation history remains immutable.

## Rollback

- Roll back the application code before dropping the NAV tables and enum.
- Schema rollback requires removing foreign keys and dropping:
  - `NavPublisherAssignment`
  - `NavAssetSnapshot`
  - `NavAttestation`
  - `NavPublisher`
  - `NavOracleRegistration`
  - `NavAttestationStatus`
