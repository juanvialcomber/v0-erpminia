import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { workOrderScopeViolation } from '../lib/maintenance/work-order-scope.mjs';

const ui = await readFile(new URL('../components/maintenance/create-work-order.tsx', import.meta.url), 'utf8');
const route = await readFile(new URL('../app/api/maintenance/work-orders/route.ts', import.meta.url), 'utf8');

test('work-order scope requires explicit and non-contradictory scope', () => {
  assert.equal(workOrderScopeViolation({ canonicalAssetId: 'asset-1', isGeneralWork: true, generalWorkConfirmed: true }), 'GENERAL_WITH_ASSET');
  assert.equal(workOrderScopeViolation({ canonicalAssetId: null, isGeneralWork: true, generalWorkConfirmed: false }), 'GENERAL_NOT_CONFIRMED');
  assert.equal(workOrderScopeViolation({ canonicalAssetId: null, isGeneralWork: false, generalWorkConfirmed: false }), 'ASSET_REQUIRED');
  assert.equal(workOrderScopeViolation({ canonicalAssetId: null, isGeneralWork: true, generalWorkConfirmed: true }), null);
  assert.equal(workOrderScopeViolation({ canonicalAssetId: 'asset-1', isGeneralWork: false, generalWorkConfirmed: false }), null);
});

test('general-work toggle cannot silently clear an already-selected asset', () => {
  const start = ui.indexOf('<Button type="button" variant={generalWork ?');
  const end = ui.indexOf('>Trabajo general del taller</Button>', start);
  assert.ok(start >= 0 && end > start);
  const button = ui.slice(start, end);
  assert.match(button, /if \(canonicalAssetId\)/);
  assert.match(button, /toast\.error\('Quita el equipo seleccionado antes de cambiar a trabajo general del taller'\)/);
  assert.match(button, /setGeneralWorkConfirmed\(true\)/);
  assert.doesNotMatch(button, /setCanonicalAssetId\(''\)/);
  assert.doesNotMatch(button, /setAssetQuery\(''\)/);
  assert.match(ui, /generalWorkConfirmed: generalWork \? generalWorkConfirmed : false/);
  assert.match(ui, /disabled=\{emergencyMode \|\| generalWork\}/);
});

test('server validates scope and records immutable creation context', () => {
  assert.match(route, /const generalWorkConfirmed = body\.generalWorkConfirmed === true/);
  assert.match(route, /workOrderScopeViolation\(\{ canonicalAssetId, isGeneralWork, generalWorkConfirmed \}\)/);
  assert.match(route, /maintenance_ot_create_context/);
  assert.match(route, /canonical_asset_id: workOrder\.canonical_asset_id/);
  assert.match(route, /general_work_confirmed: generalWorkConfirmed/);
  assert.match(route, /creation_request_id: workOrder\.creation_request_id/);
  assert.match(route, /if \(!idempotentReplay\) \{[\s\S]*recordCreationScopeContext\(context, request, createdOrder, generalWorkConfirmed\)/);
});
