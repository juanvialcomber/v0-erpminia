import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const component = await readFile(new URL('../components/maintenance/work-order-evidence-and-approval.tsx', import.meta.url), 'utf8');
const evidenceRoute = await readFile(new URL('../app/api/maintenance/work-orders/[id]/evidence/route.ts', import.meta.url), 'utf8');
const closeQueue = await readFile(new URL('../components/maintenance/progressive-work-order-close-queue.tsx', import.meta.url), 'utf8');
const reviewRoute = await readFile(new URL('../app/api/maintenance/work-orders/[id]/review/route.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261007033500_work_order_supervisor_reviews.sql', import.meta.url), 'utf8');

test('completed OT shows a durable evidence list', () => {
  assert.match(component, /Evidencia fotográfica/);
  assert.match(component, /\/evidence/);
  assert.match(component, /photo\.signed_url/);
  assert.match(component, /photo\.file_name/);
  assert.doesNotMatch(component, /tagLabel/);
  assert.doesNotMatch(component, /evidence_tag/);
});

test('approval is explicitly limited to Ariel or Mauricio', () => {
  assert.match(reviewRoute, /Ariel López/);
  assert.match(reviewRoute, /Mauricio Astudillo/);
  assert.match(reviewRoute, /Solo Ariel López o Mauricio Astudillo pueden aprobar la OT/);
  assert.match(reviewRoute, /approve_work_order_with_material_confirmation_v1/);
  assert.match(reviewRoute, /p_confirm_materials_installed/);
});

test('approval is separate from execution truth and is audited', async () => {
  assert.match(migration, /work_order_supervisor_reviews/);
  assert.match(migration, /unique \(organization_id, work_order_id\)/);
  const approvalMigration = await readFile(new URL('../supabase/migrations/20261009141000_defer_material_reconciliation_until_supervisor_approval.sql', import.meta.url), 'utf8');
  assert.match(approvalMigration, /'supervisor_approved'/);
  assert.match(component, /Pendiente de aprobación/);
});


test('supervisor installation confirmation never mutates warehouse or stock movements', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261009141000_defer_material_reconciliation_until_supervisor_approval.sql', import.meta.url), 'utf8');
  assert.match(sql, /create table if not exists public\.work_order_material_approval_installations/i);
  assert.match(sql, /warehouse_reconciliation_status text not null default 'pending'/);
  assert.match(sql, /p_confirm_materials_installed is distinct from true/);
  assert.match(sql, /on conflict \(organization_id, work_order_id, requirement_id\) do nothing/);
  assert.doesNotMatch(sql, /update public\.warehouse_stock/i);
  assert.doesNotMatch(sql, /insert into public\.stock_movements/i);
  assert.doesNotMatch(sql, /update public\.work_order_supply_needs/i);
  assert.doesNotMatch(sql, /update public\.procurement_operational_orders/i);
});


test('private OT evidence generates browser-safe HEIC previews while preserving originals', () => {
  assert.match(evidenceRoute, /WEB_PREVIEW_TYPES = new Set\(\['image\/heic', 'image\/heif'\]\)/);
  assert.match(evidenceRoute, /SIGNED_URL_TTL_SECONDS = 60 \* 60/);
  assert.match(evidenceRoute, /transform: \{ width: 1600, height: 1600, resize: 'contain', quality: 86 \}/);
  assert.match(evidenceRoute, /transform: \{ width: 320, height: 240, resize: 'cover', quality: 74 \}/);
  assert.match(evidenceRoute, /original_url: originalUrl/);
  assert.match(evidenceRoute, /preview_transformed: needsWebPreview/);
  assert.match(evidenceRoute, /'Cache-Control': 'private, no-store, max-age=0'/);
  assert.doesNotMatch(evidenceRoute, /\.remove\(\[row\.storage_path\]\)/);
});

test('OT evidence UI refreshes expiring private URLs before expiry', () => {
  assert.match(component, /refreshInterval: 10 \* 60 \* 1000/);
  assert.match(component, /revalidateOnFocus: true/);
  assert.match(component, /revalidateOnReconnect: true/);
  assert.match(component, /primaryPhoto\.preview_url \|\| primaryPhoto\.signed_url/);
  assert.match(component, /thumbnail_url/);
  assert.match(component, /HEIC · vista web/);
  assert.match(component, /primaryPhoto\.original_url/);
});

test('progressive close queue uses the same refreshed web-safe previews', () => {
  assert.match(closeQueue, /refreshInterval: 10 \* 60 \* 1000/);
  assert.match(closeQueue, /photo\.thumbnail_url \|\| photo\.preview_url \|\| photo\.signed_url/);
  assert.match(closeQueue, /photo\.preview_url \|\| photo\.signed_url/);
  assert.match(closeQueue, /vista web HEIC/);
});
