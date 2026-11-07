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
  assert.match(route, /blockingReviews/);
  assert.match(route, /legacyMotilStale/);
  assert.match(route, /operational_resolution', 'review'/);
  assert.match(route, /operational_resolution', 'legacy_motil_stale'/);
});

test('Bodega UI explains reconciled stock states in operational language', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(page, /MOTIL histórico/);
  assert.match(page, /Solo ERP/);
  assert.match(page, /ERP · saldo 0/);
  assert.match(page, /Alineado/);
  assert.match(page, /Revisar evidencia/);
  assert.doesNotMatch(page, /operational_resolution === 'legacy_motil_stale'.*Difiere ERP/);
  assert.match(page, /bloqueantes/);
  assert.match(page, /contrastes históricos/);
  assert.match(page, /Sin diferencias operacionales bloqueantes/);
  assert.match(page, /no bloquean la decisión operativa cuando el respaldo ERP vigente pasa el gate de autoridad/);
});


test('Bodega API includes nonzero Laudus-only stock as bounded operational positions', async () => {
  const route = await readFile(routePath, 'utf8');

  assert.match(route, /eq\('reconciliation_state', 'missing_in_motil'\)/);
  assert.match(route, /neq\('operational_quantity', 0\)/);
  assert.match(route, /missingOperationalPositions/);
  assert.match(route, /canonical_product_id/);
  assert.match(route, /effective_source: 'laudus'/);
  assert.match(route, /missingOperationalPositions\]\.slice\(0, 200\)/);
});
