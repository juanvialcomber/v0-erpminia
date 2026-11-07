import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const api = await readFile(new URL('../app/api/legal/inbox/route.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/dashboard/legal/inbox/page.tsx', import.meta.url), 'utf8');

test('Elias inbox derives explicit timing states and only surfaces actionable labels', () => {
  assert.match(api, /if \(daysUntil < 0\) return 'overdue'/);
  assert.match(api, /if \(daysUntil <= 7\) return 'due_soon'/);
  assert.match(api, /return 'on_track'/);
  assert.match(api, /return 'no_due_date'/);
  assert.match(page, />Vencido</);
  assert.match(page, />Esta semana</);
  assert.doesNotMatch(page, />En plazo</);
  assert.doesNotMatch(page, />Sin fecha</);
});
