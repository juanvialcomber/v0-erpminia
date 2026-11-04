import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync('app/api/maintenance/eam-readiness/route.ts','utf8');
const ui = fs.readFileSync('components/maintenance/maintenance-eam-phase-model.tsx','utf8');
const page = fs.readFileSync('app/dashboard/mantenimiento/eam/page.tsx','utf8');
const home = fs.readFileSync('components/dashboard/maintenance-home.tsx','utf8');

test('EAM phase model derives from canonical maintenance sources without a parallel master', () => {
  assert.match(api,/maintenance_work_orders/);
  assert.match(api,/work_order_close_readiness_v2/);
  assert.match(api,/work_order_supervisor_reviews/);
  assert.match(api,/maintenance_canonical_assets_v1/);
  assert.match(api,/no parallel maintenance master/i);
});

test('EAM workflow exposes professional lifecycle phases and human next action', () => {
  for (const phase of ['backlog','planning','prepared','execution','closeout','approval','history']) {
    assert.match(api,new RegExp(phase));
  }
  assert.match(api,/Ariel revisa y aprueba/);
  assert.match(ui,/Backlog/);
  assert.match(ui,/Planificar/);
  assert.match(ui,/Preparar/);
  assert.match(ui,/Ejecutar/);
  assert.match(ui,/Cerrar/);
  assert.match(ui,/Revisar/);
  assert.match(ui,/Aprender/);
});

test('EAM readiness keeps operational blockers explicit', () => {
  assert.match(api,/open_procurement_orders/);
  assert.match(api,/pending_parts/);
  assert.match(api,/unmet_material_requirements/);
  assert.match(api,/pending_external_services/);
  assert.match(api,/open_labor_entries/);
  assert.match(api,/external_cost_conflict/);
  assert.match(ui,/bloqueo/);
});

test('maintenance home exposes one EAM entry and page mounts canonical model', () => {
  assert.match(home,/href="\/dashboard\/mantenimiento\/eam"/);
  assert.match(home,/Flujo EAM/);
  assert.match(page,/MaintenanceEamPhaseModel/);
  assert.match(page,/Flujo profesional/);
});


test('EAM learning phase links approved history to audited reliability', () => {
  assert.match(ui,/Aprender de cierres aprobados/);
  assert.match(ui,/\/dashboard\/mantenimiento\/confiabilidad/);
  assert.match(ui,/no crea trabajo automáticamente/i);
});


test('preventive plans keep direct navigation to the canonical asset 360', () => {
  const preventive = fs.readFileSync('components/maintenance/preventive-plan-board.tsx','utf8');
  assert.match(preventive,/Ficha 360/);
  assert.match(preventive,/\/dashboard\/mantenimiento\/equipos\//);
  assert.match(preventive,/canonical_asset_id \|\| schedule\.asset_id/);
});


test('audited reliability routes human review back into preventive planning', () => {
  const reliability = fs.readFileSync('app/dashboard/mantenimiento/confiabilidad/page.tsx','utf8');
  assert.match(reliability,/Revisar preventivo/);
  assert.match(reliability,/preventivo-horas\?assetId=/);
  assert.match(reliability,/priorityAssetId/);
});


test('EAM distinguishes execution blockers from closeout pending evidence', () => {
  assert.match(api,/function hasExecutionBlocker/);
  assert.match(api,/function hasCloseoutPending/);
  assert.match(api,/executionGate/);
  assert.match(ui,/bloqueo.*de inicio/i);
  assert.match(ui,/pendiente.*de cierre/i);
  assert.match(ui,/Cierre pendiente/);
});
