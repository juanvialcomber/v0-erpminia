import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const routesRoot = 'app/api/maintenance/work-orders/[id]';
const mutatingHandler = /export async function (POST|PATCH|PUT|DELETE)\b/;

async function routeFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.isFile() && entry.name === 'route.ts' ? [path] : [];
  }));
  return nested.flat();
}

test('every work-order detail mutation enforces operational scope', async () => {
  const files = await routeFiles(routesRoot);
  const guarded = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (!mutatingHandler.test(source)) continue;
    guarded.push(file);
    assert.match(source, /requireOperationalMaintenanceWorkOrder/, `${file} mutates a work order without the historical read-only guard`);
  }
  assert.ok(guarded.length >= 8, `Expected the canonical work-order mutation surface, found ${guarded.length}`);
});

test('scope guard classifies imported work orders as historical and immutable', async () => {
  const source = await readFile('lib/maintenance/work-order-scope.ts', 'utf8');
  assert.match(source, /select\('id,created_by'\)/);
  assert.match(source, /data\.created_by \? 'operational' : 'historical'/);
  assert.match(source, /histórico importado y es de solo lectura/);
  assert.match(source, /status: 409/);
});

test('work-order detail API and UI expose historical scope without operational controls', async () => {
  const api = await readFile('app/api/maintenance/work-orders/[id]/route.ts', 'utf8');
  const page = await readFile('components/maintenance/work-order-detail.tsx', 'utf8');
  const dictionaries = await readFile('lib/i18n/dictionaries.ts', 'utf8');
  assert.match(api, /record_scope: row\.created_by \? 'operational' : 'historical'/);
  assert.match(api, /canEdit: recordScope === 'operational' && \(canExecuteAssigned \|\| \(accessLevel === 'ED' && !isExecutionRole\)\)/);
  assert.match(page, /!isHistorical \? <>/);
  assert.match(dictionaries, /title: 'Histórico importado · solo lectura'/);
  assert.match(dictionaries, /No puede iniciarse, reabrirse, cerrarse, temporizarse/);
});
