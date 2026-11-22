import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(process.cwd(),path),'utf8');
const migration = read('supabase/migrations/20261122183000_motil_materials_optional_transition.sql');
const approval = read('components/maintenance/work-order-evidence-and-approval.tsx');
const materials = read('components/maintenance/work-order-material-coverage.tsx');
const original = read('supabase/migrations/20261009141000_defer_material_reconciliation_until_supervisor_approval.sql');

test('transitional supervisor approval does not require confirmation of requested materials', () => {
  assert.match(migration,/if coalesce\(p_confirm_materials_installed, false\) then/);
  assert.doesNotMatch(migration,/raise exception 'Confirma los repuestos instalados antes de aprobar/);
  assert.match(migration,/materials_installation_confirmed/);
  assert.match(migration,/material_reconciliation_deferred/);
  assert.match(migration,/inventory_reconciled', false/);
  assert.match(migration,/v_wo\.created_by is null/);
  assert.match(migration,/v_wo\.status <> 'completed'/);
  assert.match(migration,/pe\.full_name in \('Ariel López', 'Mauricio Astudillo'\)/);
  assert.match(migration,/from public, anon, authenticated/);
  assert.match(migration,/to service_role/);
  assert.doesNotMatch(migration,/update public\.warehouse_stock|insert into public\.stock_movements/);
  assert.match(original,/p_confirm_materials_installed is distinct from true/);
});

test('transitional approval UI does not demand false installation attestations', () => {
  assert.match(approval,/Modo transición: puedes aprobar el trabajo sin confirmar instalaciones/);
  assert.match(approval,/confirmMaterialsInstalled/);
  assert.match(approval,/disabled=\{approving \|\| rejecting\}/);
  assert.doesNotMatch(approval,/materialLines > 0 && !confirmMaterialsInstalled/);
  assert.match(approval,/La aprobación no declarará instalaciones/);
});

test('materials workflow is optional and preserves explicit Bodega execution', () => {
  assert.match(materials,/gestión de Bodega es opcional/);
  assert.match(materials,/esta gestión es opcional y no bloquea/);
  assert.match(materials,/Registrar material \(opcional\)/);
  assert.match(materials,/issueAvailable/);
  assert.match(materials,/sendShortagesToPurchasing/);
});

test('staged main release preserves legacy material approval until migration is live', () => {
  const route = read('app/api/maintenance/work-orders/[id]/review/route.ts');
  assert.match(migration, /create or replace function public\.motil_ot_materials_transition_ready_v1\(\)/);
  assert.match(migration, /to service_role/);
  assert.match(route, /motil_ot_materials_transition_ready_v1/);
  assert.match(route, /!optionalMaterialsError && optionalMaterialsEnabled === true/);
  assert.match(route, /materialsTransitionEnabled,/);
  assert.match(approval, /review\.data\?\.materialsTransitionEnabled === true/);
  assert.match(approval, /materialLines > 0 && !materialsTransitionEnabled && !confirmMaterialsInstalled/);
  assert.match(approval, /La habilitación del modo transición está pendiente/);
});
