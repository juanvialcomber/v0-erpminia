import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const migration=read('supabase/migrations/20261030151000_ariel_weekly_source_planning.sql');
const route=read('app/api/maintenance/official-weekly-plan/route.ts');
const screen=read('components/maintenance/official-weekly-work-plan.tsx');
const planning=read('components/maintenance/weekly-maintenance-planning.tsx');

test('programas semanales tienen una sola version activa por faena y conservan filas originales',()=>{
 assert.match(migration,/planning_weekly_source_one_current_per_mine/);
 assert.match(migration,/unique \(source_id,source_row\)/);
 assert.match(migration,/source_sha256/);
 assert.match(migration,/reconciliation_status/);
 assert.match(migration,/on delete restrict/);
});
test('work program remains evidence and does not create or close OT',()=>{
 assert.match(route,/requireModuleAccess\(request, MODULE_KEYS.MANT_OPERACIONES\)/);
 assert.match(route,/\.eq\('organization_id',context.organizationId\)/);
 assert.match(route,/\.eq\('is_current',true\)/);
 assert.doesNotMatch(route,/\.insert\(|\.upsert\(|\.update\(/);
 assert.match(screen,/no crea ni cierra órdenes automáticamente/i);
 assert.match(screen,/review/);
});
test('official program is in Ariel current planning surface',()=>{
 assert.match(planning,/OfficialWeeklyWorkPlan/);
 assert.match(screen,/Trabajos por faena/);
 assert.match(screen,/Ver fuente/);
});
test('urgencias oficiales preservan filas P1/P2 aunque falte vinculación de equipo',()=>{
 assert.match(route,/officialMaster/);
 assert.match(route,/workbook_priority_raw/);
 assert.match(route,/P1 - VENCIDO/);
 assert.match(route,/P2 - INMEDIATO/);
 assert.match(route,/pending:priorityRows\.filter\(r=>!r\.matched\)/);
 assert.match(screen,/Prioridades del maestro/);
 assert.match(screen,/Pendientes de vincular/);
});
