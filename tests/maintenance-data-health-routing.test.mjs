import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const inboxRoute = await readFile(new URL('../app/api/actions/inbox/route.ts', import.meta.url), 'utf8');
const workOrdersQueue = await readFile(new URL('../components/maintenance/work-orders-queue.tsx', import.meta.url), 'utf8');
const dictionaries = await readFile(new URL('../lib/i18n/dictionaries.ts', import.meta.url), 'utf8');

test('maintenance missing-asset data health opens the filtered work-order queue', () => {
  assert.match(inboxRoute, /data_health'.*maintenance.*missing_asset/s);
  assert.match(inboxRoute, /ordenes-trabajo\?dataHealth=missing_asset/);
});

test('work-order queue filters to operational orders without canonical assets when requested', () => {
  assert.match(workOrdersQueue, /searchParams\.get\('dataHealth'\) === 'missing_asset'/);
  assert.match(workOrdersQueue, /order\.record_scope !== 'historical'/);
  assert.match(workOrdersQueue, /!missingAssetOnly \|\| !order\.asset_name/);
  assert.match(dictionaries, /dataHealthBanner: \{/);
  assert.match(dictionaries, /title: 'OT sin equipo asociado'/);
  assert.match(dictionaries, /missingAssetBadge: 'Sin activo'/);
});
