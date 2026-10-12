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

## Official communications — unread messages and receipt audit

- **Unread badges are recipient-specific.** A person's outgoing messages never count as unread for that same person. For a coworker who has not opened either conversation, one message in General and one direct message produce two unread notifications (one in each channel).
- The global Messages icon, the sidebar badge, and the in-chat unread filter use the same authenticated `/api/messages/unread` endpoint and `motil_message_inbox` SQL function.
- Visiting the Messages page without choosing a conversation **does not mark General as read**. A read acknowledgement requires the selected conversation to be visible. Mobile's hidden pane never acknowledges reads.
- The read cursor is monotonic; `motil_message_read_events` records genuine cursor advances, including the recipient and the latest acknowledged message.
- Authors can see `Awaiting read` or `Read` on direct messages, and `Read by X/Y` for General messages based on eligible, currently active organization members. These are **in-app reads**, not evidence that a phone displayed a notification.
- The append-only `motil_message_transport_events` table records each completed Push attempt with the provider outcome. This is committed transactionally with the retry queue via `motil_message_finish_push`. A 410/404 disables an expired subscription and stops wasteful retries when all devices are expired.
- Recipients with invalid device subscriptions must re-enable notifications on their **own** devices; sending a message cannot silently repair an external Push subscription.

### Green API — future second channel (disabled by default)

`motil_message_provider_settings` stores enablement flags, **not credentials**. `motil_message_external_events` reserves a quarantine/deduplication ledger for future incoming and delivery events; a stable provider event ID prevents replay.

Later integration must use server-only encrypted environment variables for Green API instance ID and token; register a verified webhook and never trust incoming contact identity or file content automatically. Verify webhook origin/secret and deduplicate events before any human-facing message is created. Unmatched contacts remain in quarantine. Outgoing WhatsApp should be opt-in for urgent alerts or ingestion workflows; it must not replace the canonical MOTIL message archive. No Green API HTTP calls or webhooks are enabled in this release.

**Credential note:** Green API screenshots can reveal API tokens. Rotate any token that was exposed in a screenshot before configuring this integration.


## Contextual work-order links (OT) — additive extension

An OT can be associated with an existing or newly opened **direct conversation**
using the official MOTIL chat. No parallel OT chat table is created, no
synthetic message is emitted, and the maintenance work order's status, assigned
employee, timer, evidence and closure remain unchanged.

- Table: public.motil_message_work_order_contexts, unique on
  (organization_id,thread_id,work_order_id).
- A composite FK prevents cross-organization chat-thread references; a
  database insert trigger independently verifies the OT belongs to the same
  organization and the actor is an active participant of a direct thread.
- A server-side guard checks BOTH chat participants can read the actual OT
  (MANT_OPERACIONES role permission OR assigned operational executor) and
  obey workshop-head site restrictions. Every contextual OT title/number
  lookup rechecks the viewer's permission. General channel is excluded.
- An authorized OT page lists only direct conversations where the current
  reader is a participant. Searching a colleague links or reuses the canonical
  unordered-pair DM, then opens /dashboard/mensajes?thread=...&workOrder=...
- Chat displays authorized OT tags that return to the canonical OT detail.
- The link action does NOT mark any message as read or create/alter a message.
  A user must actively send a message in the existing composer for a
  notification and permanent message history.
- Each link has created_by and created_at for audit. Links are not a separate
  communication log, and their deletion is not exposed in the application.

### Validation requirements

Verify user A and B can both read the OT, including workshop head scope,
before allowing a link; user C in another organization and a direct-message
nonparticipant must not see it. Repeated POST must not duplicate rows.
Existing OT timer/close flows and the canonical chat's message count must
remain unchanged during link setup. Run authenticated checks with two
different human sessions; do not use a service-role DB response to claim
browser-level authorization is correct.


## Asset 360 contextual links — extension

Equipment and vehicle 360 fichas can associate a direct MOTIL conversation
with a canonical asset without creating a second chat log.

- Table public.motil_message_asset_contexts stores organization_id, asset_id,
  thread_id, created_by and created_at, not a copy of any messages.
- Asset FK points to canonical.assets(id); a trigger validates SAME tenant for
  asset/thread and checks the actor is an active direct-thread participant.
  Unique (organization_id,thread_id,asset_id) makes it idempotent.
- RLS is enabled; anonymous and authenticated browser roles have no direct
  table permissions. The server uses the privileged client after auth checks.
- BOTH direct-message users must be active same-tenant profiles with
  MANT_OPERACIONES access ED or LEC; matches the operational-360 endpoint.
- GET /api/messages/asset-contexts?assetId=UUID returns only linked DMs
  containing the current user. GET ?threadId=UUID returns only assets the
  current user can still access.
- POST /api/messages/asset-contexts accepts assetId and recipientId; reuses
  the canonical direct conversation. Never creates a synthetic message.
- A compact lazy section is available on equipment AND vehicle fichas;
  the existing chat displays asset tags linked to the canonical 360 ficha.
- A link is a reference, NOT evidence of a discussion, approval or activity.
  Only actual messages create read/audit/Push events.

### Security verification

Never grant asset access based solely on a DM ID or URL. Recheck current
module permission on every asset lookup; when role membership changes,
the contextual asset tag must disappear. Verify a real pair of user
sessions and a denied-role case before declaring end-to-end access tested.
No canonical asset, work-order or message records are seeded by this feature.
