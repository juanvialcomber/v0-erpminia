import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const route = await readFile(new URL('../app/api/maintenance/work-orders/route.ts', import.meta.url), 'utf8');
const form = await readFile(new URL('../components/maintenance/create-work-order.tsx', import.meta.url), 'utf8');
const migration = await readFile(
  new URL('../supabase/migrations/20261007211500_add_ot_creation_idempotency.sql', import.meta.url),
  'utf8',
);

test('OT creation has a database-backed idempotency key scoped to organization and creator', () => {
  assert.match(migration, /add column if not exists creation_request_id uuid/);
  assert.match(migration, /maintenance_work_orders_idempotency_key/);
  assert.match(migration, /organization_id, created_by, creation_request_id/);
  assert.match(route, /request\.headers\.get\('idempotency-key'\)/);
  assert.match(route, /\.eq\('creation_request_id', creationRequestId\)/);
  assert.match(route, /creation_request_id: creationRequestId/);
});

test('replayed and concurrent OT create requests resolve to the existing OT', () => {
  assert.match(route, /idempotentReplay: true/);
  assert.match(route, /insertError\.code !== '23505'/);
  assert.match(route, /const \{ data: concurrentOrder/);
  assert.match(route, /idempotentReplay = true/);
  assert.match(route, /status: idempotentReplay \? 200 : 201/);
});

test('the OT create form reuses the same request key across retries and reloads', () => {
  assert.match(form, /CREATE_OT_IDEMPOTENCY_STORAGE_KEY/);
  assert.match(form, /sessionStorage\.getItem/);
  assert.match(form, /stored\.fingerprint === fingerprint/);
  assert.match(form, /'Idempotency-Key': creationRequestId/);
  assert.match(form, /submittingRef\.current/);
  assert.match(form, /clearRequestId\(\)/);
});

test('free-text material request events do not duplicate on an idempotent replay', () => {
  assert.match(route, /event_type', 'material_request_recorded'/);
  assert.match(route, /if \(existingEvent\) return/);
});


test('post-create enrichment failures keep the OT truthful and retryable instead of returning a false create failure', () => {
  assert.match(route, /const creationWarnings:/);
  assert.match(route, /runCreationStep/);
  assert.match(route, /creationComplete: creationWarnings\.length === 0/);
  assert.match(route, /creationWarnings,/);
  assert.match(route, /retrySafe: true/);
  assert.match(route, /work_order_creation_followup_required/);
  assert.match(route, /creationWarnings\.length > 0 && !idempotentReplay/);
});

test('create form keeps the same idempotency key while pending enrichment is retried', () => {
  assert.match(form, /pendingCreatedWorkOrderId/);
  assert.match(form, /payload\?\.creationComplete === false/);
  assert.match(form, /Reintentar completar OT/);
  assert.match(form, /OT creada · faltan pasos por completar/);
  assert.match(form, /clearRequestId\(\)/);
  const incompleteBranch = form.indexOf("payload?.creationComplete === false");
  const clearIndex = form.indexOf("clearRequestId()", incompleteBranch);
  assert.ok(incompleteBranch >= 0 && clearIndex > incompleteBranch, 'request key must only clear after the incomplete branch returns');
});
