# Explicit Data API grants — 21 October 2026

Status: prepared for review; not applied to production.

Supabase's 30 October opt-in change affects new tables and clean rebuilds, including service_role. Existing grants survive. Source: https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically

## Verified repair

Twelve public tables had no explicit table GRANT anywhere in the checked-in Supabase migration chain. Live read-only inspection confirmed RLS enabled and zero policies on all twelve. All consumers use the server service client; no browser table access is required. See `tests/db/data-api-contract.json` for exact operations and source paths.

- Conversations: SELECT/INSERT/UPDATE.
- Messages: SELECT/INSERT.
- User memory: SELECT/INSERT/UPDATE (the existing memory endpoint updates active state).
- Advisory decision cases, applicability and legal reviews: SELECT/INSERT/UPDATE.
- Push subscriptions: SELECT/INSERT/UPDATE/DELETE (existing unsubscribe path).
- EECC version history: SELECT only; the SECURITY DEFINER trigger inserts as its existing owner.
- WhatsApp review decisions: SELECT/INSERT only.

Eight historical CREATE migrations now carry explicit service_role grants, so a reset is reproducible. The new CLI-generated forward migration repeats the same grants for already migrated installations. No policies, RLS settings, default privileges, function permissions, tenant predicates, client grants or operational data change. Existing broader service grants are not revoked; this patch adds only the required grants and does not attempt unrelated ACL cleanup.

## Verification

`node --test tests/data-api-grants-source.test.mjs` — three passing source/contract checks.

`npm ci --ignore-scripts --prefix tests/db && npm test --prefix tests/db` — three passing database scenarios using pinned PGlite 0.5.11:

1. Execute the actual eight CREATE migrations and forward migration twice with no automatic grants. Required service operations work; unneeded operations remain denied.
2. Execute the same SQL with legacy default grants. Existing RLS continues to block direct clients; the patch does not alter policies or their catalog state.
3. Remove a required grant and verify the SQL operation fails with 42501.

The database harness also inserts synthetic review decisions for two organizations, checks service access and rejects authenticated access with a claimed organization. Service_role bypasses RLS by design: organization authorization remains the existing server's responsibility, not a new database isolation guarantee.

Fixtures provide only parent relations needed by the migrations. This is not a full 300-migration reset, HTTP/PostgREST/GraphQL test, production test, or complete server authorization audit. No production schema/data writes were made.

The static guard checks literal CREATE TABLE/GRANT source contracts. Four historical grants live in later migrations. Two unchanged canonical identity tables remain explicitly marked HOLD with file hashes; they are not certified or granted anything. The guard is not a SQL parser and does not prove dynamic DDL safe.

The wider repository suite has eight failures also present on the untouched base (missing dependencies and existing source-contract failures); the dedicated permissions checks pass. Release remains HOLD until normal CI and integration gates pass.

## Deployment and rollback

Before promotion, record exact current table ACLs, policies, owner and RLS state; replay in the existing isolated integration environment and exercise real server flows. Do not enable old automatic defaults or grant to all tables to make tests pass. Review this focused PR before merge.

Apply the forward migration only through the authorized migration release process. Historical edits are for clean replays; do not rerun the full production history. Roll back only actual ACL changes against the recorded pre-migration state; blindly revoking these grants would break existing server consumers. No data rollback is needed.

## Creation procedures

For SQL Editor, CLI, MCP and future migrations: document the consumer role and exact operations, include explicit table grants, keep RLS/policies and organization boundaries, and test with automatic grants absent. Grant sequence USAGE only when an existing sequence-backed insert requires it; these twelve tables use UUID defaults and need no sequence grant.

`lib/db/init.ts` and `lib/db/supabase.ts` contain old dynamic CREATE helpers with no caller found in the checked-in app/scripts. They are not validated provisioning paths and must not be reused for resets. Alternate legacy SQL directories are audit evidence, not a substitute for a complete reproducible baseline.
