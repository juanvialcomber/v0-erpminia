import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sidebar = fs.readFileSync(new URL('../components/layout/sidebar.tsx', import.meta.url), 'utf8');
const financeLayout = fs.readFileSync(new URL('../app/dashboard/finanzas/layout.tsx', import.meta.url), 'utf8');
const financeCostCenters = fs.readFileSync(new URL('../app/dashboard/finanzas/centros/page.tsx', import.meta.url), 'utf8');
const financeReports = fs.readFileSync(new URL('../app/dashboard/finanzas/reportes/page.tsx', import.meta.url), 'utf8');
const performancePage = fs.readFileSync(new URL('../app/dashboard/desempeno/page.tsx', import.meta.url), 'utf8');
const performanceLayout = fs.readFileSync(new URL('../app/dashboard/desempeno/layout.tsx', import.meta.url), 'utf8');
const decisionLayout = fs.readFileSync(new URL('../app/dashboard/decisiones/layout.tsx', import.meta.url), 'utf8');
const dataHealthLayout = fs.readFileSync(new URL('../app/dashboard/calidad-datos/salud/layout.tsx', import.meta.url), 'utf8');
const managementNav = fs.readFileSync(new URL('../components/layout/management-context-nav.tsx', import.meta.url), 'utf8');

test('transversal capabilities do not compete as global sidebar modules', () => {
  assert.doesNotMatch(sidebar, /group:'Transversal'/);
  assert.doesNotMatch(sidebar, /label:'Desempeño'.*group:/);
  assert.doesNotMatch(sidebar, /label:'Reportes'.*group:/);
  assert.doesNotMatch(sidebar, /label:'Centros de costos'.*group:/);
});

test('finance owns the primary navigation for reports and cost centers', () => {
  assert.match(financeLayout, /href: '\/dashboard\/finanzas\/centros'.*moduleKey: 'core_centros_costos'/);
  assert.match(financeLayout, /href: '\/dashboard\/finanzas\/reportes'.*moduleKey: 'fin_reportes'/);
  assert.match(financeLayout, /canView\(item\.moduleKey\)/);
  assert.match(financeCostCenters, /CostCentersPage/);
  assert.match(financeReports, /ReportesPage/);
});

test('performance remains available inside the management context', async () => {
  const dict = fs.readFileSync(new URL('../lib/i18n/dictionaries.ts', import.meta.url), 'utf8');
  assert.match(performancePage, /Desempeño operacional/);
  assert.match(performancePage, /api\/desempeno\/scorecards/);
  assert.match(managementNav, /href: '\/dashboard\/desempeno'/);
  assert.match(managementNav, /href: '\/dashboard\/decisiones'/);
  assert.match(managementNav, /href: '\/dashboard\/calidad-datos\/salud'/);
  assert.match(dict, /executive: 'Resumen'/);
  assert.match(dict, /performance: 'Desempeño'/);
  assert.match(dict, /dataHealth: 'Calidad de datos'/);
  assert.match(performanceLayout, /ManagementContextNav dictionary=\{dictionary\}/);
  assert.match(decisionLayout, /getDictionaryForRequest\(\)/);
  assert.match(dataHealthLayout, /getDictionaryForRequest\(\)/);
});
