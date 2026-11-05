import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cancelRouteUrl = new URL('../app/api/maintenance/work-orders/[id]/cancel/route.ts', import.meta.url);
const detailRouteUrl = new URL('../app/api/maintenance/work-orders/[id]/route.ts', import.meta.url);
const detailUiUrl = new URL('../components/maintenance/work-order-detail.tsx', import.meta.url);
const migrationUrl = new URL('../supabase/migrations/20261105182000_canonical_ot_cancellation.sql', import.meta.url);

test('OT cancellation has one reasoned canonical route', async () => {
  const [cancelRoute, detailRoute, ui, sql] = await Promise.all([
    readFile(cancelRouteUrl, 'utf8'),
    readFile(detailRouteUrl, 'utf8'),
    readFile(detailUiUrl, 'utf8'),
    readFile(migrationUrl, 'utf8'),
  ]);

  assert.match(cancelRoute, /requireModuleAccess\(request, MODULE_KEYS\.MANT_OPERACIONES, true\)/);
  assert.match(cancelRoute, /reason\.length < 5/);
  assert.match(cancelRoute, /timer_status/);
  assert.match(cancelRoute, /status: 'cancelled'/);
  assert.match(cancelRoute, /cancellation_reason: reason/);
  assert.match(cancelRoute, /event_type: 'work_order_cancelled'/);
  assert.match(cancelRoute, /payload: \{ reason \}/);

  assert.match(detailRoute, /canonical_cancel_endpoint/);
  assert.match(detailRoute, /Una OT que ya inició no puede volver a abierta/);
  assert.match(detailRoute, /Las OT operacionales no se eliminan/);

  assert.match(ui, /Motivo de la anulación/);
  assert.match(ui, /cancelReason\.trim\(\)\.length < 5/);
  assert.match(ui, /\/cancel/);
  assert.doesNotMatch(ui, /patchOrder\(\{ status: 'open' \}\)/);
  assert.doesNotMatch(ui, /patchOrder\(\{ status: 'cancelled' \}\)/);

  assert.match(sql, /add column if not exists cancellation_reason text/i);
  assert.match(sql, /add column if not exists cancelled_at timestamptz/i);
  assert.match(sql, /Una OT finalizada o anulada no puede cambiar de estado/i);
  assert.match(sql, /Una OT en ejecución no puede volver a abierta/i);
});
