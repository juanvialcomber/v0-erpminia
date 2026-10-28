import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const home = await readFile(new URL('../components/dashboard/maintenance-home.tsx', import.meta.url), 'utf8');
test('maintenance renders role action queue ahead of optional summaries', () => {
  const queue = home.indexOf('<Card className="shadow-none">', home.indexOf('return <div className="mx-auto'));
  const details = home.indexOf('data-testid="maintenance-more-details"');
  assert.ok(queue > 0 && details > queue);
  assert.ok(home.indexOf('<CanonicalMaintenanceOverview />', details) > details);
  assert.ok(home.indexOf('metrics.map', details) > details);
});
test('execution remains terrain-first and role-controlled', () => {
  assert.match(home, /mode === 'execution'/);
  assert.match(home, /<MobileTerrainPanel\b[^>]*\/>/);
  assert.match(home, /viewer\?\.canCreateWorkOrder/);
  assert.match(home, /actions\.map/);
  assert.match(home, /Ver detalle/);
});

test('maintenance evidence disclosure is not nested inside a navigation link', () => {
  const action = home.slice(home.indexOf('return <div key={action.id}'), home.indexOf(';\n        })}', home.indexOf('return <div key={action.id}')));
  assert.match(action, /<\/Link><details/);
  assert.doesNotMatch(action, /<details[^>]*>.*<\/details><\/Link>/s);
});
