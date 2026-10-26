# Operational email evidence recovery

This is an operator-run recovery tool, not a Gmail synchronization service or a
new schedule. The deployed `vercel.json` schedules WhatsApp history, media,
vision and daily summaries; it contains no operational Gmail intake job.
Successful WhatsApp summary generation does not establish email coverage.

## Bounded procedure

1. Enumerate relevant verified sender-domain messages in a precise Santiago
   time window using the authorized Gmail connector. Include body-only authority
   messages. Reconcile message IDs and attachments with the source manifest.
2. Download only missing originals using the connector. Keep them and the batch
   JSON outside the public repository. An existing manifest is mandatory; the
   recovery tool does not invent source identities or silently create facts.
3. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in a trusted operator
   environment. The script rejects projects other than MOTIL and other tenants.
   Python 3.10+ and `scripts/requirements-operational-intake.txt` are required.
4. Supply a JSON array with at most ten records:

   ```json
   [{"manifest_id":"<existing UUID>","local_path":"/private/source.xlsx",
     "operational_sheet":"Reporte Diario"}]
   ```

   An explicit source assertion can be supplied as `declared_coverage_date`.
   For production statistics use `report_kind: "production_statistics"` and the
   exact monthly sheet name. Do not supply receipt day as declared coverage.
   Stock workbooks deliberately remain in domain review: their actuals and
   future plan tabs must not be mixed by taking the latest date in the book.
5. Inspect `python scripts/operational-email-evidence.py /private/batch.json`.
   The default performs bounded reads only. Fix source identity/hash exceptions
   before proceeding. Add `--apply` for the explicitly selected originals.
6. Read back the manifest and private storage object. The tool verifies exact
   bytes before recording the storage reference. Run the same batch again to
   verify idempotency when needed; no object is overwritten.

## Validation and authority

- Equipment dates come from the recognized report header, never the receive
  timestamp, filename, historical reading, future plan, or `TODAY()` without a
  cached date. Sheet-name/internal-date conflicts remain explicit.
- Statistics dates come from the recognized printed heading and date cell.
- A late arrival alone is not proof of a wrong date. Preserve receipt lag and
  explicit authority observations separately.
- Inspect every sheet, including hidden ones; preserve originals and formulas.
  The tool does not recalculate or replace source spreadsheet errors with zero.
- Same filename plus different SHA-256 means a different version. Same bytes in
  a different message remain a separate transmission with a link, not a deleted
  manifest. Existing staging identity and canonical facts are left intact.
- Updates use optimistic concurrency on the manifest timestamp and preserve
  unrelated metadata. Storage can precede a conflict; the next bounded run
  verifies and reuses that exact object.
- Extraction is evidence. Date conflicts, official meters and changed MP
  baselines require the responsible maintenance planner's decision. Production
  and stock interpretation remains with the operational area. No approval is
  inferred from a CC or silence.

## Cron verification

Compare deployed SHA/configuration, scheduled invocation and downstream source
IDs, dates, queue status and counts separately. A `200` is insufficient.
History execution logs now expose bounded totals without message text or IDs;
history remains limited to 100 recent provider messages per enabled group.
Truncation must be reported rather than represented as full archive coverage.

When `CRON_SECRET` is unavailable to the operator, do not weaken authentication,
rotate it, deploy a bypass, or start a second poller. Record that provider
reconciliation/manual invocation remains unverified. A current local day need
not have a daily summary yet: the daily summary processes the prior day.

## Verification

```sh
python -m unittest discover -s tests -p 'operational_email_evidence_test.py' -v
node --test tests/greenapi-passive-sync.test.mjs tests/greenapi-media-intake.test.mjs tests/whatsapp-intake-contract.test.mjs
```

No new cron, paid GitHub Actions run, AI request or canonical promotion is
required by this recovery procedure.
