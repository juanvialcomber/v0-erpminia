import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const closeRoute = await readFile(
  new URL('../app/api/maintenance/work-orders/[id]/close/route.ts', import.meta.url),
  'utf8',
);

test('first close creates a pending supervisor review without overwriting an existing review', () => {
  assert.match(closeRoute, /from\('work_order_supervisor_reviews'\)/);
  assert.match(closeRoute, /\.upsert\(/);
  assert.match(closeRoute, /status:\s*'pending'/);
  assert.match(closeRoute, /onConflict:\s*'organization_id,work_order_id'/);
  assert.match(closeRoute, /ignoreDuplicates:\s*true/);
  assert.match(closeRoute, /if \(createReviewError\) throw createReviewError/);
});

test('rejected review resubmission remains explicit and preserves the rejection workflow', () => {
  assert.match(closeRoute, /\.update\(\{ status: 'pending', resubmitted_at: reviewNow, updated_at: reviewNow \}\)/);
  assert.match(closeRoute, /\.eq\('status', 'rejected'\)/);
  assert.match(closeRoute, /if \(resubmitReviewError\) throw resubmitReviewError/);
});
