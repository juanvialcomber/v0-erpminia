import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workOrdersApi = fs.readFileSync('app/api/maintenance/work-orders/route.ts', 'utf8');
const controlCenterApi = fs.readFileSync('app/api/maintenance/control-center/route.ts', 'utf8');
const workOrdersPage = fs.readFileSync('components/maintenance/work-orders-queue.tsx', 'utf8');
const dictionaries = fs.readFileSync('lib/i18n/dictionaries.ts', 'utf8');

test('work orders expose an explicit operational versus historical scope without mutating history', () => {
  assert.match(workOrdersApi, /created_by:\s*string \| null/);
  assert.match(workOrdersApi, /record_scope:\s*row\.created_by \? 'operational' : 'historical'/);
  assert.match(workOrdersApi, /scope === 'operational'/);
  assert.match(workOrdersApi, /not\('created_by', 'is', null\)/);
  assert.match(workOrdersApi, /scope === 'historical'/);
  assert.match(workOrdersApi, /is\('created_by', null\)/);
});

test('maintenance action center excludes imported historical work orders from daily operations', () => {
  assert.match(controlCenterApi, /maintenance_work_orders/);
  assert.match(controlCenterApi, /not\('created_by', 'is', null\)/);
  assert.match(controlCenterApi, /operationalWorkOrderIds/);
  assert.match(controlCenterApi, /historicalOpenWorkOrders/);
  assert.match(controlCenterApi, /const closeRows = allCloseRows\.filter/);
});

test('daily work order workspace defaults to Motil operations and keeps history queryable', () => {
  assert.match(workOrdersPage, /useState<'all' \| 'active' \| 'approval' \| 'completed' \| 'historical'>\('active'\)/);
  assert.match(workOrdersPage, /viewFilter === 'all'\s*\? operational/);
  assert.match(workOrdersPage, /operationalWorkOrders/);
  assert.match(workOrdersPage, /historicalWorkOrders/);
  assert.match(workOrdersPage, /record_scope !== 'historical'/);
  assert.match(workOrdersPage, /viewFilter === 'historical'/);
  assert.match(dictionaries, /scope: \{ operational: 'Operación Motil', historical: 'Histórico', all: 'Todo' \}/);
  assert.match(dictionaries, /title: 'Próximas intervenciones · Operación Motil'/);
});
