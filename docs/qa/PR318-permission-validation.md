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

After the initial automatic-review rejection, the user explicitly approved the read-only production comparison. The original audit script completed successfully against real Supabase/PostgREST data: 26 profiles, 26 assigned profiles, 23 distinct cargos, and zero differences in complete resolver results (cargo identity, name and effective grant map). This used the actual optimized resolver and independent profile/cargo/matrix reads. No data or permissions were modified. Output contained aggregate counts only.

GitHub Production release gate run 43586835320 also completed successfully for implementation commit `045d404abf8cbf0d81cc3c0a16d9cd3bf7896b6c`: secret checks, migrations, tests and build all passed.

The runtime result demonstrates equivalence for the currently observed production profiles and cargos. Denials, malformed/absent data, partial errors, transport errors, revocation and trusted admin bypasses are additionally covered by local behavior tests; production failures were not injected. This is not a browser-session QA claim.

`scripts/verify-module-access-equivalence.mjs` remains an explicit read-only gate for future audits. It aborts on read errors or differences and requires at least two cargos. Its environment flag is an execution guard, not a substitute for approval to access privileged production data.

The optimization can be retained on the evidence above. The PR remains in draft and has not been merged or deployed. Obtain the user's separate approval before merging or deploying, presenting the target commit and proposed operations. This documentation update changes no application code.

