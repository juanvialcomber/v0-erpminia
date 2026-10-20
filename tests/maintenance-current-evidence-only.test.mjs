import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const detailApi = await readFile(new URL('../app/api/maintenance/drilling-reviews/[id]/route.ts', import.meta.url), 'utf8');
const queueApi = await readFile(new URL('../app/api/mining-os/maintenance-review-queue/route.ts', import.meta.url), 'utf8');

test('dismissed drilling evidence cannot reopen the work-order creation flow', () => {
  assert.match(detailApi, /data\.review_status === 'dismissed'/);
  assert.match(detailApi, /Revisión de Sondaje no disponible/);
  assert.match(queueApi, /\.neq\('review_status', 'dismissed'\)/);
});
