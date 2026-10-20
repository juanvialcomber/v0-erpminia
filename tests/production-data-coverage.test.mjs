import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const overviewApiUrl = new URL('../app/api/produccion/canonical-overview/route.ts', import.meta.url);
const dashboardUrl = new URL('../components/dashboard/produccion-dashboard.tsx', import.meta.url);
const coverageMigrationUrl = new URL('../supabase/migrations/20260824040000_consolidate_production_overview_counts.sql', import.meta.url);

test('production overview derives coverage from one exact service-role summary', async () => {
  const [api, migration] = await Promise.all([
    readFile(overviewApiUrl, 'utf8'),
    readFile(coverageMigrationUrl, 'utf8'),
  ]);

  assert.match(api, /rpc\('production_data_coverage_summary_v1'/);
  assert.match(migration, /production_import_exceptions[\s\S]*review_status = 'pending'/);
  assert.match(migration, /production_drill_hole_location_review_queue_v1[\s\S]*resolution_state = 'needs_evidence'/);
  assert.match(migration, /production_chemistry_results/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /revoke execute[\s\S]*from public/);
  assert.match(migration, /grant execute[\s\S]*to service_role/);
  assert.doesNotMatch(api, /count: 'exact', head: true/);
  assert.doesNotMatch(
    api,
    /production_normalization_exceptions_v1'[\s\S]*select\('domain,exception_type'\)/,
    'the overview must not count a paginated exception list as if it were complete',
  );
  assert.match(api, /drillingReports: num\(drillingSummary\?\.report_rows\)/);
  assert.match(api, /drillingHoles: num\(drillingSummary\?\.holes\)/);
});

test('production overview preserves the dashboard contract for data and no-data responses', async () => {
  const api = await readFile(overviewApiUrl, 'utf8');
  const [noDataBranch, dataBranch] = api.split('const throughDate =');

  assert.match(api, /const semantics = \{[\s\S]*sourceAbsence: 'Ausencia de una fuente no equivale a valor cero\.'/);
  assert.match(noDataBranch, /currentPeriod: null,[\s\S]*daily: \[\],[\s\S]*intelligence: \[\],[\s\S]*semantics,/);
  assert.match(dataBranch, /intelligence,[\s\S]*semantics,[\s\S]*\}\);/);
});

test('production dashboard distinguishes operational, partial and missing-source areas without making coverage the landing focus', async () => {
  const dashboard = await readFile(dashboardUrl, 'utf8');

  assert.match(dashboard, /label:'Completo'/);
  assert.match(dashboard, /label:'Incompleto'/);
  assert.match(dashboard, /label:'Sin datos'/);
  assert.match(dashboard, /Datos disponibles/);
  assert.match(dashboard, /Muestra qué datos existen/);
  assert.match(dashboard, /Si falta una fuente, no mostramos cero/i);
  assert.doesNotMatch(dashboard, /Cobertura real por área/);
  assert.doesNotMatch(dashboard, /Siguiente capa para evidencia analítica/);
});

test('production coverage exposes every technical area already present in navigation', async () => {
  const dashboard = await readFile(dashboardUrl, 'utf8');

  for (const route of [
    '/dashboard/produccion/transporte-mineral',
    '/dashboard/produccion/planta-metalurgia',
    '/dashboard/produccion/sondaje',
    '/dashboard/produccion/quimica',
    '/dashboard/produccion/geologia',
    '/dashboard/produccion/topografia',
  ]) {
    assert.match(dashboard, new RegExp(route.replaceAll('/', '\\/')));
  }
});
