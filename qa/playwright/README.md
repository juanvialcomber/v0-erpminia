# MOTIL browser QA

Playwright runs independently from the Next.js / pnpm dependency tree.

Local setup:

```bash
npm install --prefix qa/playwright
./qa/playwright/node_modules/.bin/playwright install chromium
MOTIL_QA_URL=https://motil.app node qa/playwright/smoke.cjs
```

Read-only smoke: login rendering on desktop/mobile and denial of unauthenticated HSE–OT access. No authenticated tests, OT closure, HSE mutations, or production writes. This suite does **not** replace role-based QA. GitHub Actions supports manual `target_url` for a preview URL. Screenshots are collected as workflow artifacts.

## Authorized read-only QA

A separate GitHub Actions job supports login verification on `main` only. Configure environment `motil-qa` with protected secrets `MOTIL_QA_EMAIL` and `MOTIL_QA_PASSWORD` in GitHub Settings. Enable required reviewers on that environment, then manually run **Playwright browser QA** and check `run_authenticated`. The authenticated job uses the fixed origin `https://motil.app`, reads `/api/me/access`, and never writes application data, exports session state, or uploads authenticated screenshots. It will fail safely when secrets are absent.

Do not store real passwords in Git history, workflow inputs, screenshots or logs. Rotate any password previously pasted into a chat. The automated test verifies authentication only; completing or approving real OTs requires separate controlled QA.
