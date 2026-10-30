import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const route=read('app/api/maintenance/planning-decisions/route.ts');
const create=read('app/api/maintenance/work-orders/route.ts');
const migration=read('supabase/migrations/20261030200000_ariel_editable_planning_decisions.sql');
const editor=read('components/maintenance/ariel-planning-editor.tsx');
const weekly=read('components/maintenance/official-weekly-work-plan.tsx');
const preventive=read('components/maintenance/weekly-maintenance-planning.tsx');

test('Ariel edits a separate, versioned proposal; source Excel is immutable',()=>{
 assert.match(migration,/maintenance_planning_decisions/);
 assert.match(migration,/UNIQUE\(organization_id, source_kind, source_id\)/);
 assert.match(migration,/revision integer NOT NULL/);
 assert.match(route,/input.revision!==existing.revision/);
 assert.match(editor,/Guardar cambios/);
});
test('approved proposal is required for linked OT, with stable idempotency and unique linkage',()=>{
 assert.match(route,/getMaintenanceWorkOrderCreationCapability/);
 assert.match(route,/Aprobar/);
 assert.match(route,/createWorkOrder\(otRequest\)/);
 assert.match(route,/decision.id/);
 assert.match(create,/approved_by!==context.authUserId/);
 assert.match(create,/planning_decision_id: planningDecisionId/);
 assert.match(migration,/maintenance_work_orders_one_per_planning_decision/);
 assert.match(editor,/Aprobar y generar OT/);
});
test('no automatic OT on GET or preview and completed source does not generate OT',()=>{
 assert.doesNotMatch(read('app/api/maintenance/official-weekly-plan/route.ts'),/export async function POST/);
 assert.match(route,/source_status/);
 assert.match(route,/terminado/);
 assert.match(route,/Existe una OT abierta/);
 assert.match(weekly,/ArielPlanningEditor/);
 assert.match(preventive,/ArielPlanningEditor/);
 assert.doesNotMatch(preventive,/pathname: '\/dashboard\/mantenimiento\/ordenes-trabajo\/create'/);
});
