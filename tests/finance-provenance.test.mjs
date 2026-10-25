import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apiUrl = new URL('../app/api/finance/sources/route.ts', import.meta.url);
const pageUrl = new URL('../app/dashboard/finanzas/fuentes/page.tsx', import.meta.url);
const layoutUrl = new URL('../app/dashboard/finanzas/layout.tsx', import.meta.url);

test('finance provenance is tenant scoped and authorized', async () => {
  const source = await readFile(apiUrl, 'utf8');
  assert.match(source, /MODULE_KEYS\.FIN_FINANZAS/);
  assert.match(source, /canonical_finance_source_audit/);
  assert.match(source, /\.eq\('organization_id', context\.organizationId\)/);
});

test('finance provenance preserves recognized and committed source semantics', async () => {
  const source = await readFile(apiUrl, 'utf8');
  assert.match(source, /canonical\.asset_costs/);
  assert.match(source, /canonical\.purchase_order_lines/);
  assert.match(source, /recognized/);
  assert.match(source, /committed/);
});

test('finance source UI does not invent original files', async () => {
  const source = await readFile(pageUrl, 'utf8');
  assert.match(source, /Los archivos que subas se guardan por separado y no cambian este historial/);
  assert.match(source, /qué registros respaldan los gastos y las órdenes de compra/);
  assert.match(source, /Archivos de Finanzas/);
});

test('finance navigation exposes provenance', async () => {
  const source = await readFile(layoutUrl, 'utf8');
  assert.match(source, /\/dashboard\/finanzas\/fuentes/);
  assert.match(source, /Datos de origen/);
});
