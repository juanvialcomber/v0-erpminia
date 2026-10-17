# MOTIL - Operational WhatsApp evidence boundary

2026-10-16: Activities reported by Planta Patagua are NOT the same as machinery-maintenance work orders.

## Domain routing

| Message context | Destination | Must not do |
| --- | --- | --- |
| Cleaning, chutes, screens, magnets | Plant operational log | Create or close machinery OT |
| Plant intervention: oil, belts, rollers, crusher adjustments | Plant intervention log | Infer maintenance equipment runtime or lifecycle |
| Process readings: grade, recovery, tonnage, pH | Plant process observation | Write certified production KPIs without reconciliation |
| Pending site work | Pending operational observation | Auto-close on similar later text |
| Concentrate dispatch coordination | Dispatch operational log | Create shipments from tentative coordination |
| Explicit machinery OT from equipment maintenance workflow | Separate authenticated machinery OT module | Treat external chat as approval or closure |

The legacy AI label 'maintenance' is not an OT permission: the 2026-10-15 report contains plant activities with that label. Route by original source group and message plus explicit human selection.

## New staging inbox (read-only)

The Admin/WhatsApp page contains a **Bandeja de clasificación** backed by
`GET /api/admin/whatsapp/triage?date=YYYY-MM-DD`. It calls the existing tenant-scoped
`motil_whatsapp_daily_evidence` function and makes no writes.

- Show all source messages of enabled groups, not only AI findings.
- Proposed destination: plant daily activities, plant equipment/interventions, process/metallurgy, dispatch, operational pending, MOTIL software support, or unknown.
- Keep the original group/time/message ID; a suggested destination is **not an authoritative entity mapping**.
- Show differences between report message count and current source count, with a 250-message limit and truncation warning.
- Distinguish text mentioned by AI from text **not extracted**. A quoted source ID does NOT guarantee that all facts in a long message were extracted.
- Separate multimedia without captions from messages with content. Do not guess what a photo says.
- Flag possible repeats (guarderas cinta 3, correas harnero) for manual reconciliation, never merge automatically.
- A message with both completed and PENDIENTE tasks is **mixed**; split it into distinct events before a human confirms or registers any action.
- The current 2026-10-15 report contains 49 eligible source messages, 16 with text, and 15 findings referencing 7 distinct message IDs. Nine text-bearing messages were not cited in AI findings. These counts are a snapshot, not permanent KPIs.

This is a staging and classification layer, not automatic propagation. Domain owners can later promote reviewed evidence to certified KPIs or logs after explicit cross-source reconciliation.

## Source-to-review-to-action

1. GREEN-API preserves exact external message ID, group, timestamp, content and attachments.
2. AI extracts reviewable observations, preserves exact message IDs, and classifies reported_done / pending / planned / unclear.
3. An admin checks original evidence; a confirmed finding means the source was examined, not that physical execution was certified.
4. The admin explicitly chooses operational scope (plant, dispatch, general), category and reported state.
5. An organization-scoped service-role RPC validates source messages and reviewer, then idempotently appends to motil_whatsapp_operational_log.
6. The only operational mutation is this independent log. Do not write to maintenance_work_orders, work_order_events, production_plant_shifts, production_metallurgy_results, HSE, assets, staff, or shifts.
7. Subsequent promotion to official production measurements requires verified site/shift, method, unit, source date and authorized approval.

## Known gaps

- production_operator_activity requires a canonical person and shift; not reliably available in group chat.
- production_plant_shifts is a measured/imported quantity table, not a daily activities journal.
- Existing plants are tagged Faena Mapocho; do not automatically map Planta Patagua to that site.
- Grupo 2 selection must be independently confirmed in production, not inferred from preview.

## Release requirements

- This change remains a PR until green tests, READY preview, authenticated QA and explicit merge approval.
- Apply migration 20261016131500_motil_whatsapp_operational_log.sql before enabling recording.
- Do not create dummy jobs in production to demonstrate the feature.
- WhatsApp vision PR #530 is separate and cost controlled.

## Source-backed live panels (2026-10-17)

**Decision:** video is work evidence, not an inference source. Do not transcribe,
inspect frames or charge vision/STT for video. The text/caption of WhatsApp is
the reported activity. Keep the original stored video and source timestamp.

- `/api/produccion/whatsapp-activity?mode=overview|plant|dispatch|drilling`
  projects source messages from **currently enabled** and non-excluded groups,
  scoped to the same MOTIL organization and module read permission.
- The production overview, Planta/Metalurgia, Perforación and Concentrate Dispatch
  sections display reported updates and **Última actualización informada
  (WhatsApp)** using `occurred_at`. This is distinct from certified production
  data-through/cutoff dates and does not change any KPI.
- If the caption is on the same WhatsApp message as its media, attach that
  evidence directly. If the video arrives separately, a single caption by the
  same sender in the same group within five minutes is only a **temporal
  association**; multiple candidates remain **unassigned evidence of the turn**.
  In composite reports, the attachment proves only its presence in that report,
  never each listed activity.
- Photos with source captions remain original attachments. The image OCR pipeline
  is separate and may continue with human review.
- Source statuses remain `reported_done`, `pending`, `planned` or `unclear`.
  A `PENDIENTE` block must not be marked done from nearby completed text.
- The production evidence endpoint authorizes by tenant, module, active group,
  private storage path and a short-lived signed URL.
- **No writes** to `production_*`, `maintenance_work_orders`, `warehouse_*`,
  assets, HSE or dispatch certification are authorized by this live projection.
  Canonical promotion remains a separate review/reconciliation transaction.
- PR #548 was closed without merge when video transcription was explicitly
  removed from scope; no transcription migration should be applied.
