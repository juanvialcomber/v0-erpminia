import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { classifyDocumentIntakeFile } from '../lib/documents/intake-triage-policy.mjs';

test('document intake triage rejects active content and system artifacts without execution', () => {
  assert.deepEqual(classifyDocumentIntakeFile('tool.exe', 'application/x-msdownload'), {
    policy: 'quarantine_executable',
    state: 'quarantined',
    reason: 'active_or_executable_content',
  });
  assert.deepEqual(classifyDocumentIntakeFile('~$inventario.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), {
    policy: 'non_source_artifact',
    state: 'rejected_non_source',
    reason: 'temporary_or_system_artifact',
  });
  assert.equal(classifyDocumentIntakeFile('Thumbs.db').state, 'rejected_non_source');
});

test('document intake triage separates passive extraction, media metadata and review-required archives', () => {
  assert.equal(classifyDocumentIntakeFile('existencias.xlsx').state, 'ready_for_extraction');
  assert.equal(classifyDocumentIntakeFile('manual.pdf').state, 'ready_for_extraction');
  assert.equal(classifyDocumentIntakeFile('video.mp4', 'video/mp4').state, 'metadata_only');
  assert.equal(classifyDocumentIntakeFile('catalogos.zip', 'application/zip').state, 'review_required');
  assert.equal(classifyDocumentIntakeFile('legacy.daw').state, 'review_required');
});

test('document intake worker is bounded, cron-protected and does not promote canonical business state', async () => {
  const worker = await readFile(new URL('../lib/documents/intake-triage.ts', import.meta.url), 'utf8');
  const route = await readFile(new URL('../app/api/cron/document-intake-triage/route.ts', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../supabase/migrations/20261108233000_document_intake_triage_v1.sql', import.meta.url), 'utf8');

  assert.match(worker, /MAX_BATCH = 100/);
  assert.match(worker, /document_intake_triage_queue_v1/);
  assert.match(worker, /passive_only: true/);
  assert.doesNotMatch(worker, /maintenance_work_orders|canonical\.products|integration\.laudus_/);
  assert.match(route, /CRON_SECRET/);
  assert.match(route, /triageDocumentIntakeBatch\(100\)/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on public\.document_intake_processing_state from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert, update on public\.document_intake_processing_state to service_role/i);
});
