import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const routePath = new URL('../app/api/inventory/intelligence/route.ts', import.meta.url);
const pagePath = new URL('../app/dashboard/bodega/page.tsx', import.meta.url);

test('Bodega API exposes operational Laudus resolution without discarding source authority', async () => {
  const route = await readFile(routePath, 'utf8');

  assert.match(route, /bodega_inventory_operational_service_v1/);
  assert.match(route, /operational_resolution/);
  assert.match(route, /operational_quantity/);
  assert.match(route, /legacy_motil_quantity/);
  assert.match(route, /operational_stock_date/);
  assert.match(route, /bodega_stock_source_authority_service_v1/);
  assert.match(route, /laudusIsPrimary/);
});

test('Bodega UI explains reconciled stock states in operational language', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(page, /MOTIL histórico/);
  assert.match(page, /Solo Laudus/);
  assert.match(page, /Laudus · saldo 0/);
  assert.match(page, /Alineado/);
  assert.match(page, /Revisar evidencia/);
  assert.doesNotMatch(page, /operational_resolution === 'legacy_motil_stale'.*Difiere Laudus/);
});
