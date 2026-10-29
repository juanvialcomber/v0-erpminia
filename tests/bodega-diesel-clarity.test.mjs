import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const routePath = new URL('../app/api/inventory/intelligence/route.ts', import.meta.url);
const pagePath = new URL('../app/dashboard/bodega/page.tsx', import.meta.url);

test('inventory API exposes tenant-scoped diesel evidence from MOTIL and Laudus', async () => {
  const route = await readFile(routePath, 'utf8');
  assert.match(route, /\.eq\('organization_id', organizationId\)/);
  assert.match(route, /\.eq\('product_code', 'Combustible001'\)/);
  assert.match(route, /laudus_inventory_reconciliation_service_v1/);
  assert.match(route, /hasConflict: hasDieselConflict/);
  assert.doesNotMatch(route, /export async function POST/);
});

test('bodega makes conflicting diesel evidence explicit and blocks false certainty', async () => {
  const page = await readFile(pagePath, 'utf8');
  assert.match(page, /Petróleo Diesel/);
  assert.match(page, /Difiere de Laudus/);
  assert.match(page, /MOTIL · saldo operativo/);
  assert.match(page, /Laudus · stock ERP/);
  assert.match(page, /Δ MOTIL − Laudus/);
  assert.match(page, /No usar una cifra única para compra, consumo ni valorización hasta conciliar la diferencia/);
});

test('conflicted diesel cannot contaminate trusted inventory valuation in the UI', async () => {
  const page = await readFile(pagePath, 'utf8');
  assert.match(page, /const valuationTrusted = !diesel\?\.hasConflict/);
  assert.match(page, /valuationTrusted \? money\(overview\.total_stock_value\) : 'En conciliación'/);
  assert.match(page, /Petróleo impide una valorización confiable hasta conciliar fuentes/);
  assert.match(page, /conflictedDiesel \? 'En conciliación'/);
  assert.match(page, /Difiere Laudus/);
});

test('bodega is an operational workspace with visible ERP comparison', async () => {
  const page = await readFile(pagePath, 'utf8');
  assert.match(page, /Qué requiere atención hoy/);
  assert.match(page, /Saldos negativos/);
  assert.match(page, /Sin stock/);
  assert.match(page, /Por reponer/);
  assert.match(page, /Posición de inventario/);
  assert.match(page, /<span>Laudus ERP<\/span>/);
  assert.match(page, /<span>Bodega<\/span>/);
  assert.match(page, /<span>Evidencia<\/span>/);
  assert.doesNotMatch(page, /<span>Reservado<\/span>/);
  assert.match(page, /Busca por producto o código y abre la posición para revisar su evidencia/);
});
