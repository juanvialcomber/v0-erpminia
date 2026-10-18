# MOTIL HSE audit: credential initialization failure

## Verified incident

Run 39130689429, attempt 1, was triggered by a push to main at SHA
8d0d5169f5b2aaf0e0ac3d2e09908a1ed1791234. Both SUPABASE_URL and
SUPABASE_SERVICE_ROLE_KEY were empty in the runner. Initialization failed before
any database query or document download. The uploaded diagnostics file was opened
by shell redirection before initialization; upload success is not extraction evidence.

The repository is a fork of jcv86/v0-erpminia, with traviscomber/motil as source.
Actions secrets are not inherited by forks. This explains a plausible migration
failure, but secret metadata must still be inspected to establish whether the key
is absent, organization-restricted, or defined only in an unselected environment.
This was a push, not a fork pull request or Dependabot event. No environment is
selected by this workflow.

The GitHub connector can read code, run metadata and logs, but excludes secrets
and administration APIs. No claim is made that secret settings were inspected or
repaired. No real extraction was rerun without a usable authorized credential.

## Correction

- Pin the public URL to https://ttlptyheuqeotadtcbaw.supabase.co.
- Keep the existing repository secret name SUPABASE_SERVICE_ROLE_KEY. Do not
  change shared secrets blindly or copy credentials from another project.
- Reject lookalike origins, URL credentials, paths, queries and fragments. Disable
  redirects so credentials cannot follow a redirect to a different host.
- Check legacy JWT project/role/expiry locally, then authenticate a GET against
  the authorized project. Secret API keys are validated by that project's API.
- Run preflight before installing document readers. Errors contain fixed codes,
  not key values, server response bodies, extracted text or reader stderr.
- Remove the staging input, commit-message activation and staging RPC entirely.
  HSE_STAGE_FRAGMENTS other than absent/0 fails closed. All API requests are GET.
- Distinguish configuration (exit 78), initial infrastructure (exit 3), and
  document review/failure (exit 2). Per-source access failures are reported as
  source_access_failed rather than parser failures.
- Preserve source and fragment SHA-256, source ID, format, method and page/section
  references. No fragment text or source file is uploaded. Blank PDF segments and
  textless DOC files require manual review. Nonempty extraction is a preview,
  not a statement of semantic accuracy or permission to persist.
- Remove the fixed expectation of exactly 78 files. Refuse a silently truncated
  listing at the 1000-source cap. Summarize and upload only parseable diagnostics.
- Run synthetic regression tests without credentials on pull requests. The real
  document audit runs only on push/main or manual dispatch, never a PR event.

## Administrative follow-up (not completed)

Inspect Settings > Secrets and variables > Actions for this repository. Check
names and scope only; do not reveal values or paste keys into chat, logs or issues.
If the key is absent, configure the authorized MOTIL server key using a secure
administrative session. If it is environment-only, deliberately bind the protected
environment after reviewing its access rules; do not silently bypass protections.
If it is organization-managed, check this fork is explicitly allowed.

After merging the reviewed fix, dispatch the workflow with no staging inputs.
Inspect preflight first. Then reconcile PDF and DOC counts, source IDs/hashes,
methods, failures, needs_manual_review and empty page references against the
canonical inventory. Review actual document fidelity in an authorized private
session, including OCR and LibreOffice fallback examples. Never treat the synthetic
reader tests as proof that the operational documents have been extracted correctly.

Persistence remains disabled until source integrity, organization ownership,
traceability, idempotency, transaction behavior and server-side permissions have
been independently validated and persistence is explicitly authorized.
