import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

test('the coarse maintenance role guard delegates offline note POSTs to scoped execution authorization', () => {
  const org = read('lib/api/organization-context.ts');
  const route = read('app/api/maintenance/work-orders/[id]/offline-notes/route.ts');
  assert.match(org, /timer\|switch\|close\|evidence\|standard-plan\|offline-notes/);
  assert.match(route, /requireAssignedMaintenanceExecution/);
  assert.match(route, /requireOperationalMaintenanceWorkOrder/);
  assert.match(route, /getModuleAccessLevel/);
  assert.match(route, /\.eq\('organization_id', organizationId\)/);
});

test('shared device offline drafts and photos are isolated by organization plus signed-in profile', () => {
  const viewer = read('app/api/maintenance/viewer-context/route.ts');
  const page = read('components/maintenance/work-order-detail.tsx');
  const notes = read('components/maintenance/maintenance-offline-draft.tsx');
  const photos = read('components/maintenance/maintenance-offline-photos.tsx');
  assert.match(viewer, /offlineScope: `\$\{context.organizationId\}:\$\{context.userId\}`/);
  assert.match(page, /offlineScope=\{viewer.offlineScope\}/);
  assert.match(notes, /draftId = `\$\{offlineScope\}:\$\{workOrderId\}`/);
  assert.match(notes, /readDraft\(draftId\)/);
  assert.doesNotMatch(notes, /writeDraft\(\{ id: workOrderId/);
  assert.match(photos, /p.scope === offlineScope/);
  assert.match(photos, /scope: offlineScope/);
});

test('idempotent offline notes reject cross-user and cross-OT reuse or changed payloads', () => {
  const route = read('app/api/maintenance/work-orders/[id]/offline-notes/route.ts');
  assert.match(route, /existing.work_order_id !== id/);
  assert.match(route, /existing.actor_id !== userId/);
  assert.match(route, /stored.notes !== notes/);
  assert.match(route, /stored.captured_at !== capturedAt/);
  assert.match(route, /error\?\.code === '23505'/);
  assert.match(route, /findExistingNote\(\)/);
  assert.match(route, /status: 409/);
  assert.match(route, /\^\[0-9a-f\]\{8\}/);
});

test('offline photos carry their actual timestamp and conflict invalid clocks', () => {
  const photos = read('components/maintenance/maintenance-offline-photos.tsx');
  const evidence = read('app/api/maintenance/work-orders/[id]/evidence/route.ts');
  assert.match(photos, /capturedAt: photo.capturedAt/);
  assert.match(evidence, /captured_at: capturedAt \|\| new Date\(\)\.toISOString\(\)/);
  assert.match(evidence, /Fecha de fotografía fuera de rango/);
});

test('queued notes retry when operator returns to the visible OT', () => {
  const notes = read('components/maintenance/maintenance-offline-draft.tsx');
  assert.match(notes, /visibilitychange/);
  assert.match(notes, /document\.visibilityState === 'visible'/);
  assert.match(notes, /navigator\.onLine/);
  assert.match(notes, /await writeDraft\(\{ id: draftId, notes, updatedAt: new Date\(\)\.toISOString\(\), queue: remaining, journal \}\)/);
});

test('pending offline photos are surfaced after reconnect without automatic upload', () => {
  const photos = read('components/maintenance/maintenance-offline-photos.tsx');
  assert.match(photos, /Hay fotografías locales listas para sincronizar/);
  assert.match(photos, /\[online, photos\.length\]/);
  assert.match(photos, /onClick=\{\(\) => void syncPhotos\(\)\}/);
});
