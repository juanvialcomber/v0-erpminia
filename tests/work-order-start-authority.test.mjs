import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const detailApiUrl = new URL('../app/api/maintenance/work-orders/[id]/route.ts', import.meta.url);
const detailUiUrl = new URL('../components/maintenance/work-order-detail.tsx', import.meta.url);
const mobileFlowUrl = new URL('../components/maintenance/mobile-work-order-flow.tsx', import.meta.url);

test('only the assigned executor may transition an OT into execution', async () => {
  const [api, ui, mobile] = await Promise.all([
    readFile(detailApiUrl, 'utf8'),
    readFile(detailUiUrl, 'utf8'),
    readFile(mobileFlowUrl, 'utf8'),
  ]);

  assert.match(api, /body\.status === 'in_progress'/);
  assert.match(api, /inicio de la OT debe realizarse desde el cronómetro/);
  assert.match(api, /canonical_start_action: 'play'/);

  assert.doesNotMatch(ui, /patchOrder\(\{ status: 'in_progress' \}\)/);
  assert.match(ui, /Lista para que el responsable inicie/);
  assert.match(ui, /El responsable asignado inicia la OT/);

  assert.doesNotMatch(mobile, /body: JSON\.stringify\(\{ status: 'in_progress' \}\)/);
  assert.match(mobile, /body: JSON\.stringify\(\{ action: 'play' \}\)/);
  assert.match(mobile, /\/timer/);
});
