import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const financeRoute = new URL('../app/api/integrations/laudus/finance-reconciliation-review/route.ts', import.meta.url);
const inventoryRoute = new URL('../app/api/integrations/laudus/inventory-reconciliation-review/route.ts', import.meta.url);
const leadPage = new URL('../app/dashboard/mantenimiento/laudus/page.tsx', import.meta.url);
const layoutPath = new URL('../app/dashboard/mantenimiento/layout.tsx', import.meta.url);

test('Laudus finance project-lead access uses maintenance ED without granting general finance access', async () => {
  const route = await readFile(financeRoute, 'utf8');

  assert.match(route, /requireModuleAccess\(request, MODULE_KEYS\.FIN_FINANZAS\)/);
  assert.match(route, /requireModuleAccess\(request, MODULE_KEYS\.MANT_OPERACIONES\)/);
  assert.match(route, /!projectLead\.authorized \|\| !projectLead\.canWrite/);
  assert.match(route, /normalize\(access\.cargoName\) !== 'jefe de planificación'/);
  assert.match(route, /Sólo conciliaciones Laudus; no amplía acceso general a Finanzas/);
  assert.match(route, /!access\.canWrite \|\| !authority\.allowed/);
});

test('Laudus Bodega project-lead override preserves normal area write gate', async () => {
  const route = await readFile(inventoryRoute, 'utf8');

  assert.match(route, /cargo === 'jefe bodega' \|\| cargo === 'jefe de planificación'/);
  assert.match(route, /projectLead: cargo === 'jefe de planificación'/);
  assert.match(route, /authority\.allowed && \(access\.canWrite \|\| authority\.projectLead\)/);
  assert.match(route, /!authority\.allowed \|\| \(!access\.canWrite && !authority\.projectLead\)/);
  assert.doesNotMatch(route, /requireModuleAccess\(request, MODULE_KEYS\.BODEGA_INVENTARIO, true\)/);
});

test('maintenance leadership gets a dedicated Laudus control surface', async () => {
  const page = await readFile(leadPage, 'utf8');
  const layout = await readFile(layoutPath, 'utf8');

  assert.match(page, /Control Laudus/);
  assert.match(page, /LaudusFinanceReconciliationQueue/);
  assert.match(page, /Daniel sigue siendo owner del área/);
  assert.match(page, /\/dashboard\/bodega/);
  assert.match(page, /\/dashboard\/mantenimiento\/activos-laudus/);

  assert.match(layout, /href: '\/dashboard\/mantenimiento\/laudus', label: 'Laudus'/);
  assert.match(layout, /leadership:[\s\S]*?support: \[[^\]]*'Laudus'/);
  assert.match(layout, /planning:[\s\S]*?support: \[[^\]]*'Laudus'/);
});
