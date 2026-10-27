import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync(
  new URL('../app/api/finance/cost-centers/apply-approved/route.ts', import.meta.url),
  'utf8',
);

test('approved Laudus cost-center apply route is finance scoped and bounded', () => {
  assert.match(route, /FIN_FINANZAS/);
  assert.match(route, /Math\.max\(1, Math\.min\(/);
  assert.match(route, /motil_apply_approved_laudus_cost_centers/);
  assert.match(route, /p_actor_user_id: context\.userId/);
  assert.doesNotMatch(route, /LAUDUS_PASSWORD|Bearer|api\.laudus\.cl/);
});
