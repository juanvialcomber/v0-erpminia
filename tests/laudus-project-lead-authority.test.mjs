import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const financeRoute = new URL('../app/api/integrations/laudus/finance-reconciliation-review/route.ts', import.meta.url);
const inventoryRoute = new URL('../app/api/integrations/laudus/inventory-reconciliation-review/route.ts', import.meta.url);
const leadPage = new URL('../app/dashboard/mantenimiento/laudus/page.tsx', import.meta.url);
const maintenanceLayout = new URL('../app/dashboard/mantenimiento/layout.tsx', import.meta.url);

test('Ariel project-lead override is scoped to Laudus reconciliation APIs', async () => {
  const finance = await readFile(financeRoute, 'utf8');
  const inventory = await readFile(inventoryRoute, 'utf8');

  assert.match(finance, /requireModuleAccess\(request, MODULE_KEYS\.FIN_FINANZAS\)/);
  assert.match(finance, /requireModuleAccess\(request, MODULE_KEYS\.MANT_OPERACIONES\)/);
  assert.match(finance, /normalize\(access\.cargoName\) !== 'jefe de planificación'/);
  assert.match(finance, /scope: 'Sólo conciliaciones Laudus; no amplía acceso general a Finanzas\.'/);
  assert.match(finance, /!access\.canWrite \|\| !authority\.allowed/);

  assert.match(inventory, /cargo === 'jefe bodega' \|\| cargo === 'jefe de planificación'/);
  assert.match(inventory, /authority\.allowed && \(access\.canWrite \|\| authority\.projectLead\)/);
  assert.match(inventory, /!authority\.allowed \|\| \(!access\.canWrite && !authority\.projectLead\)/);

  assert.match(finance, /authority=\\\$\\\{authority\\.projectLead \\? 'project_lead' : 'area_owner'\\\}/);
  assert.match(inventory, /authority=\\\$\\\{authority\\.projectLead \\? 'project_lead' : 'area_owner'\\\}/);
});

test('project lead has a dedicated maintenance Laudus view without opening Finance navigation', async () => {
  const page = await readFile(leadPage, 'utf8');
  const layout = await readFile(maintenanceLayout, 'utf8');

  assert.match(page, /Control Laudus/);
  assert.match(page, /LaudusFinanceReconciliationQueue/);
  assert.match(page, /Daniel sigue siendo owner del área/);
  assert.match(page, /\/dashboard\/bodega/);
  assert.match(page, /\/dashboard\/mantenimiento\/activos-laudus/);

  assert.match(layout, /href: '\/dashboard\/mantenimiento\/laudus', label: 'Laudus'/);
  assert.match(layout, /planning:[\s\S]*support: \[[^\]]*'Laudus'/);
  assert.match(layout, /leadership:[\s\S]*support: \[[^\]]*'Laudus'/);
  assert.doesNotMatch(layout, /execution:[\s\S]*support: \[[^\]]*'Laudus'/);
});
