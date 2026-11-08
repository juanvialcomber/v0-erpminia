import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../supabase/migrations/20261108224500_motil_source_authority_freshness_v1.sql', import.meta.url);

test('MOTIL source authority v1 registers first-class sources without granting browser access', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const source of ['motil_native','whatsapp_greenapi','gmail_lapatagua','document_intake','production_files']) {
    assert.match(sql, new RegExp(source));
  }
  assert.match(sql, /revoke all on integration\.source_authority_contracts from public, anon, authenticated/i);
  assert.match(sql, /grant select on public\.motil_source_authority_service_v1 to service_role/i);
});

test('MOTIL source authority v1 keeps finance canonical in Laudus while moving operations to MOTIL', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /'maintenance','MOTIL_CANONICAL','motil_native'/);
  assert.match(sql, /'inventory','MOTIL_CANONICAL','motil_native'/);
  assert.match(sql, /'production','MOTIL_CANONICAL','production_files'/);
  assert.match(sql, /'finance_accounting','LAUDUS_CANONICAL','laudus'/);
  assert.match(sql, /'bank_reconciliation','PREPARE','laudus'/);
  assert.doesNotMatch(sql, /update\s+integration\.laudus_/i);
});

test('freshness service separates observed time from source event time and exposes review state', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /observed_at/);
  assert.match(sql, /source_event_at/);
  assert.match(sql, /freshness_kind/);
  assert.match(sql, /business_event/);
  assert.match(sql, /native_activity/);
  assert.match(sql, /effective_freshness_at/);
  assert.match(sql, /freshness_status/);
  assert.match(sql, /requires_review/);
  assert.match(sql, /make_interval\(mins => c\.freshness_sla_minutes\)/);
  assert.match(sql, /'bank_reconciliation','PREPARE','laudus'[\s\S]*?'business_event'/);
});


test('channel health exposes operational backlog instead of treating transport success as health', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /motil_channel_health_service_v1/);
  assert.match(sql, /motil_whatsapp_intake_exceptions_v1/);
  assert.match(sql, /download_state='pending'/);
  assert.match(sql, /pending_classification/);
  assert.match(sql, /when coalesce\(s\.pending_count,0\) > 0 then 'degraded'/);
  assert.match(sql, /source_key='motil_native' then 'healthy'/);
});
