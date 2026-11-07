import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const routePath = new URL('../app/api/finance/laudus-fixed-assets-review/route.ts', import.meta.url);
const uiPath = new URL('../components/finance/laudus-fixed-assets-review.tsx', import.meta.url);

test('fixed asset UI separates source backlog from real human actions', async () => {
  const route = await readFile(routePath, 'utf8');
  const ui = await readFile(uiPath, 'utf8');

  assert.match(route, /laudus_fixed_asset_triage_v1/);
  assert.match(route, /humanActionsNow/);
  assert.match(route, /classifiedBacklog/);
  assert.match(route, /unowned/);
  assert.match(route, /reviewRows: humanActionRows/);
  assert.match(route, /classifiedRows: classifiedBacklogRows/);
  assert.match(ui, /Acciones humanas/);
  assert.match(ui, /Backlog clasificado/);
  assert.match(ui, /Todos con responsable y próxima acción/);
  assert.match(ui, /no requiere decisión individual ahora/);
});
