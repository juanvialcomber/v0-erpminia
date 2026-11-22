import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const api = readFileSync(resolve(process.cwd(), 'app/api/bodega/maintenance-supply/route.ts'), 'utf8');
const ui = readFileSync(resolve(process.cwd(), 'app/dashboard/bodega/materiales-mantenimiento/page.tsx'), 'utf8');

test('Bodega can see supervisor declarations without treating them as physical stock movements', () => {
  assert.match(api, /work_order_material_approval_installations/);
  assert.match(api, /reportedInstalledQuantity/);
  assert.match(api, /installationReconciliationStatus/);
  assert.match(api, /installationQuantityMeaning/);
  assert.match(api, /No representa retiro, vale ni descuento de inventario/);
  assert.match(ui, /Supervisión declaró/);
  assert.match(ui, /Pendiente de conciliar con Bodega/);
  assert.match(ui, /Esto no es una entrega verificada ni descuenta existencias/);
});

test('Installation declarations are tenant-scoped, bounded and read only', () => {
  assert.match(api, /requireModuleAccess\(request, MODULE_KEYS\.BODEGA_INVENTARIO\)/);
  assert.match(api, /eq\('organization_id', context\.organizationId\)/);
  assert.match(api, /requirementIds\.slice\(offset, offset \+ 50\)/);
  assert.match(api, /\.limit\(50\)/);
  assert.match(api, /readOnly: true/);
  assert.doesNotMatch(api, /\.insert\(/);
  assert.doesNotMatch(api, /\.update\(/);
  assert.doesNotMatch(api, /\.delete\(/);
});

test('Unconfirmed materials do not appear as physically installed', () => {
  assert.match(api, /declaration \? Number\(declaration\.installed_quantity\) : null/);
  assert.match(ui, /row\.reportedInstalledQuantity !== null/);
  assert.match(ui, /installationReconciliationStatus === 'reconciled'/);
  assert.match(ui, /Requerimiento asociado a una OT histórica/);
});
