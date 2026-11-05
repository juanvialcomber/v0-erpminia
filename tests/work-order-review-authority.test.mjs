import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const accessUrl = new URL('../lib/maintenance/work-order-review-access.ts', import.meta.url);
const inboxUrl = new URL('../lib/maintenance/personal-work-order-inbox.ts', import.meta.url);
const reviewRouteUrl = new URL('../app/api/maintenance/work-orders/[id]/review/route.ts', import.meta.url);

test('OT inbox and approval endpoint share one reviewer authority contract', async () => {
  const [access, inbox, route] = await Promise.all([
    readFile(accessUrl, 'utf8'),
    readFile(inboxUrl, 'utf8'),
    readFile(reviewRouteUrl, 'utf8'),
  ]);

  assert.match(access, /Ariel López/);
  assert.match(access, /Mauricio Astudillo/);
  assert.match(access, /isAuthorizedMaintenanceReviewerName/);
  assert.match(inbox, /isAuthorizedMaintenanceReviewerName/);
  assert.match(route, /isAuthorizedMaintenanceReviewerName/);
  assert.doesNotMatch(route, /String\(data\.full_name \|\| ''\) === 'Ariel López'/);
  assert.match(route, /supervisor autorizado/);
});
