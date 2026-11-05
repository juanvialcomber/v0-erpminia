import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const evidenceUrl = new URL('../app/api/maintenance/work-orders/[id]/evidence/route.ts', import.meta.url);
const detailUrl = new URL('../app/api/maintenance/work-orders/[id]/route.ts', import.meta.url);

test('supervisors may read OT evidence but only the assigned executor may write it', async () => {
  const route = await readFile(evidenceUrl, 'utf8');
  const post = route.slice(route.indexOf('export async function POST'));

  assert.match(route, /if \(accessLevel === 'ED'\) return/);
  assert.match(post, /requireAssignedMaintenanceExecution\(context, id\)/);
  assert.match(post, /if \(!execution\.ok\) return execution\.response/);
});

test('generic OT PATCH never silently changes or accepts lifecycle status', async () => {
  const route = await readFile(detailUrl, 'utf8');

  assert.match(route, /canonical_start_action: 'play'/);
  assert.match(route, /canonical_close_endpoint/);
  assert.match(route, /canonical_cancel_endpoint/);
  assert.match(route, /body\.status !== undefined/);
  assert.match(route, /estado de la OT se administra mediante los flujos canónicos/);
  assert.doesNotMatch(route, /updateData\.status = body\.status/);
});
