import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const source = await readFile(new URL('../components/maintenance/work-orders-queue.tsx', import.meta.url), 'utf8');
test('OT list precedes optional indicators', () => {
  assert.ok(source.indexOf('<Card className="overflow-hidden shadow-none">') < source.indexOf('data-testid="ot-more-indicators"'));
  assert.match(source, /data-testid="ot-more-filters"/);
  assert.match(source, /Buscar y filtrar/);
});
test('approval and completed views remain distinct; historical is not operational', () => {
  assert.match(source, /viewFilter === 'approval'/);
  assert.match(source, /viewFilter === 'historical'/);
  assert.match(source, /record_scope !== 'historical'/);
  assert.match(source, /approval_status/);
});

test('each OT row shows only identity, asset, assignee, status and next action', () => {
  const row = source.slice(source.indexOf('{filteredOrders.map((order) => {'), source.indexOf('\n              })}', source.indexOf('{filteredOrders.map((order) => {')));
  assert.match(row, /order.title/);
  assert.match(row, /order.asset_name/);
  assert.match(row, /order.assigned_to_name/);
  assert.match(row, /stateLabel/);
  assert.match(row, /nextAction/);
  assert.doesNotMatch(row, /order.scheduled_date/);
  assert.doesNotMatch(row, /order.completion_date/);
  assert.match(row, /href=\{\`\/dashboard\/mantenimiento\/ordenes-trabajo\/\$\{order.id\}\`\}/);
});
