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
test('official weekly program stays source evidence while import auto-creates eligible OTs',()=>{
 assert.match(route,/requireModuleAccess\(request, MODULE_KEYS.MANT_OPERACIONES\)/);
 assert.match(route,/\.eq\('organization_id',context.organizationId\)/);
 assert.match(route,/\.eq\('is_current',true\)/);
 assert.match(screen,/OT generadas/i);
 assert.match(screen,/cierre y la aprobación siguen siendo humanos/i);
});
test('official program is in Ariel current planning surface',()=>{
 assert.match(planning,/OfficialWeeklyWorkPlan/);
 assert.match(screen,/Programa oficial/);
 assert.match(screen,/Ver fuente/);
 assert.match(screen,/Fuente/);
 assert.match(screen,/Actividades/);
 assert.match(screen,/OT generadas/);
 assert.match(screen,/Excepciones/);
 assert.match(screen,/source\.status==='review_required'/);
 assert.match(screen,/coverageStart/);
 assert.match(screen,/Cobertura/);
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


test('weekly import creates only current/future, matched and assigned OTs with source linkage',()=>{
 const importer=read('app/api/maintenance/official-weekly-plan/import/route.ts');
 assert.match(importer,/item\.planned_date<today/);
 assert.match(importer,/reconciliation_status!=='matched'/);
 assert.match(importer,/peopleByName/);
 assert.match(importer,/historicalByLabel/);
 assert.match(importer,/programas semanales oficiales previamente conciliados/);
 assert.match(importer,/idempotency-key',item\.id/);
 assert.match(importer,/linked_work_order_id/);
 assert.match(importer,/official_weekly_program_imported/);
 assert.match(importer,/source_sha256:sha256/);
 assert.match(importer,/status\.includes\('terminado'\)/);
});


test('weekly import uses Chile date and the recognized program sheet for idempotency',()=>{
 const importer=read('app/api/maintenance/official-weekly-plan/import/route.ts');
 assert.match(importer,/chileTodayDateKey\(\)/);
 assert.match(importer,/return \{sheetName,mine,weekStart,weekEnd/);
 assert.match(importer,/\.eq\('source_sheet',program\.sheetName\)/);
 assert.match(importer,/source_sheet:program\.sheetName/);
 assert.doesNotMatch(importer,/const today=new Date\(\)\.toISOString\(\)\.slice\(0,10\)/);
 assert.doesNotMatch(importer,/workbook\.SheetNames\[0\]/);
});


test('weekly import preserves priority semantics and fails closed on unknown work type',()=>{
 const importer=read('app/api/maintenance/official-weekly-plan/import/route.ts');
 assert.match(importer,/priorityRaw\.includes\('crit'\)\?'critical'/);
 assert.match(importer,/priorityRaw\.includes\('baja'\)\?'low'/);
 assert.match(importer,/workTypeRaw\.includes\('predict'\)\?'predictive':null/);
 assert.match(importer,/skippedClassification\+=1/);
 assert.match(importer,/clasificación de trabajo no reconocida/);
 assert.doesNotMatch(importer,/includes\('prevent'\)\?'preventive':'corrective'/);
});
