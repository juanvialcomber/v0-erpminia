import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync(new URL('../app/api/produccion/geologia/formal-intervals/route.ts',import.meta.url),'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261112112000_production_geology_formal_logging.sql',import.meta.url),'utf8');
const ui = readFileSync(new URL('../components/production/geologia-formal-logging.tsx',import.meta.url),'utf8');
const identity = readFileSync(new URL('../lib/api/organization-context.ts',import.meta.url),'utf8');
const hole = readFileSync(new URL('../components/production/geologia-hole-360.tsx',import.meta.url),'utf8');

test('formal logging uses explicit provenance and not production drill interval storage',()=>{
  assert.match(api,/production_geology_formal_intervals/);
  assert.doesNotMatch(api,/\.from\('production_drill_intervals'\)/);
  assert.match(api,/sourceReference\.length < 3/);
  assert.match(api,/observed_on:observedOn/);
  assert.match(api,/drilled_depth_m/);
  assert.match(ui,/No altera los reportes de perforación/);
  assert.match(ui,/no se enlazan automáticamente/);
  assert.match(migration,/No automatic migration from production_drill_intervals or chemistry samples/);
});

test('all formal intervals endpoints are module-guarded and organization-scoped',()=>{
  assert.match(api,/requireModuleAccess\(request, MODULE_KEYS\.PROD_GEOLOGIA, requireWrite\)/);
  assert.match(identity,/productionSelfServiceMutationPaths/);
  assert.match(identity,/\/api\/produccion\/geologia\/formal-intervals/);
  assert.ok((api.match(/\.eq\('organization_id',context\.organizationId\)/g)||[]).length>=5);
  assert.match(api,/UUID\.test\(holeId\)/);
  assert.match(api,/UUID\.test\(intervalId\)/);
  assert.match(api,/\.eq\('id',intervalId\)\.eq\('status',row\.status\)/);
});

test('independent reviewer and immutable approvals are enforced in route and DB',()=>{
  assert.match(api,/context\.userId === row\.created_by/);
  assert.match(ui,/row\.created_by!==data\.viewerId/);
  assert.match(api,/viewerId:context\.userId/);
  assert.match(api,/comment\.length < 10/);
  assert.match(api,/draft: \['submitted'\]/);
  assert.match(api,/submitted: \['draft','validated','rejected'\]/);
  assert.match(api,/validated: \[\]/);
  assert.match(api,/rejected: \[\]/);
  assert.match(migration,/old\.status = 'validated'/);
  assert.match(migration,/reviewed_by <> created_by/);
  assert.match(migration,/production_geology_formal_interval_events/);
  assert.match(migration,/after insert or update on public\.production_geology_formal_intervals/);
});

test('input ranges and read pagination remain bounded',()=>{
  assert.match(api,/fromM < 0 \|\| toM <= fromM/);
  assert.match(api,/toM > Number\(hole\.data\.drilled_depth_m\)/);
  assert.match(api,/number < 0 \|\| number > 100/);
  assert.match(api,/\.limit\(100\)/);
  assert.match(api,/\.limit\(60\)/);
  assert.match(ui,/GeologiaFormalLogging/);
  assert.match(hole,/<GeologiaFormalLogging key=\{holeId\} holeId=\{holeId\}\/>/);
});

test('tables are not exposed to public authenticated clients',()=>{
  assert.match(migration,/enable row level security/);
  assert.match(migration,/revoke all on public\.production_geology_formal_intervals from public, anon, authenticated/);
  assert.match(migration,/revoke all on public\.production_geology_formal_interval_events from public, anon, authenticated/);
});
