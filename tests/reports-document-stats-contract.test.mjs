import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const page = readFileSync(new URL('../app/dashboard/reportes/page.tsx', import.meta.url), 'utf8');
const service = readFileSync(new URL('../lib/services/document.service.ts', import.meta.url), 'utf8');
test('reports use canonical document totals and refuse invalid data', () => {
  assert.match(service, /total: total\.count \|\| 0/);
  assert.match(page, /validCount\(payload\.total\)/);
  assert.match(page, /validCount\(payload\.pending\)/);
  assert.match(page, /const total = payload\.total as number/);
  assert.doesNotMatch(page, /payload\.totalDocuments/);
});
