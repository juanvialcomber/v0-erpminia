# PR #318 — permission validation (2026-11-14)

Base reviewed: `9f0252cdd016370dacb9ef1a13ae9a5d4d5023e0`.

The two obsolete query-shape assertions now execute the actual TypeScript access kernel with mocked database/session boundaries. They check canonical cargo identity and effective module access. Existing governance checks remain in place.

The 21 additional behavior tests cover ED/LEC/SR read/write decisions, missing grants, unsigned sessions, the existing three trusted administrator roles, absent profiles/cargos, relationship and database errors including partial data, invalid grants, transport rejection, cargo isolation, immediate revocation, one request per resolution, and comparison with an independent reference calculation for multiple cargos. Transport exceptions propagate rather than producing an authorization; handled database errors deny access.

Validation:

- Full local suite: 2,589 passed, 0 failed, 0 skipped.
- Focused permission suites: 33 passed.
- ESLint: passed.
- Migration version check: 395 unique migration versions passed.
- Secret scan: passed.
- Full build: passed with `NODE_OPTIONS=--max-old-space-size=4096` and the workflow's dummy Supabase configuration. Compilation, TypeScript, 323 static pages, and postbuild tests all passed. The initial default-heap build and separate 3,584 MiB typecheck exhausted their Node heaps; no typechecking was disabled.

## Runtime gate and release restriction

Fixture equivalence does not establish the real PostgREST response or production data equivalence. A read-only production comparison was blocked by automatic approval review because it involved a decrypted production service-role credential and private production tables. No database changes or deployment were performed. Do not use another route to bypass that rejection.

`scripts/verify-module-access-equivalence.mjs` is prepared for a separately approved read-only audit. It executes the optimized production resolver and compares its complete result against independent profile/cargo/matrix reads for every profile, requires coverage of at least two cargos, aborts on read errors or differences, and logs aggregate counts only. It performs SELECTs only, but uses privileged server credentials and therefore must be explicitly approved. The environment flag is an execution guard, not a substitute for user approval.

The optimization remains a draft candidate, not an approved production change. Retain it for release only if the runtime comparison succeeds. Otherwise restore the previous resolver or fix the discrepancy and repeat verification. Obtain the user's separate approval before merging or deploying, after presenting the actual runtime/build results and target commit SHA.
