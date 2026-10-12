# MOTIL Messages — open-source core (MVP)

**Transport:** Next.js route handlers, PostgreSQL (Supabase), SWR client-side refresh, and the MIT-licensed `web-push` library. No paid chat SDK or new proprietary messaging SaaS is required. The Green API WhatsApp bridge is optional and **not** wired into this MVP.

## Conversations

- `General`: shared by all active profiles in one organization.
- `Direct`: deterministic organization + unordered pair of profile IDs, protected by the server.
- Messages are plain text, limited to 2,000 characters, retained in `motil_message_entries`, and use a client-generated UUID to make network retries idempotent.
- Client reads are paginated, with a monotonic per-user read cursor. No chat endpoint accesses another tenant.
- APIs use MOTIL's verified session cookie and the service-role connection; **database RLS is enabled and direct access by anon/authenticated is denied**. Do not remove these explicit server access checks.
- Clients poll authenticated APIs every 4–10 seconds. This avoids exposing raw Postgres Changes via an unauthenticated Realtime JWT. A signed per-user Realtime channel can be added when MOTIL has a secure JWT bridge.

## Phone notification delivery

- Direct messages create a Push outbox row **inside the same database transaction** as the message.
- `after()` attempts prompt delivery; a minute cron drains and retries leased jobs.
- Each device is independently sent a standards-based Web Push notification using the existing VAPID configuration.
- Invalid/expired subscriptions are disabled. A successful Push gateway HTTP response means **provider accepted**, not device displayed or read.
- Notification bodies contain only a generic private-message teaser. Message text stays in MOTIL.
- Routine General-channel messages do not send Push alerts; unread counts remain in-app. Mentions and urgent alerts need separate policy/permission controls.

### Required deployment configuration

The cron endpoint `GET /api/cron/messages-push` requires a random `CRON_SECRET` of at least 24 characters, configured in Vercel **production**. Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` to scheduled cron jobs. Check existing MOTIL cron routes when enabling the variable, since those routes may share it. Without this variable, prompt delivery through `after()` is attempted but scheduled retries will not run.

Keep `WEB_PUSH_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` configured on the relevant Vercel environment. Never expose the private key in client code or logs.

## Release checklist

1. Verify the SQL migration was applied to the canonical MOTIL project (not another tenant/project).
2. Verify RLS and service-only database grants with catalog queries.
3. Verify CI: unique migrations, TypeScript, tests, Next.js build and Playwright.
4. Test User A and User B belonging to the **same** organization; A sends and B receives after refresh.
5. Test User C in a **different** organization cannot list/read/send in A's threads.
6. Simulate a dropped network response and retry the same client UUID. Exactly one message must exist.
7. Test direct-message Push: provider status recorded and at least one device notification received and clicked. Test expired subscription and outbox retry.
8. Confirm that the mobile composer, back navigation, unread badge and message history are usable.
9. Do not describe the module as realtime WebSocket, WhatsApp integrated, or phone-delivery verified until those paths are actually tested.

## Follow-up

- Authorize private Supabase Realtime Broadcast using short-lived application-bound JWTs, with polling fallback.
- Add mentions, restricted team channels, attachments and contextual OT threads.
- Integrate Green API with a separate consent/notification policy, webhook signature validation, replay protection and deduplication.
