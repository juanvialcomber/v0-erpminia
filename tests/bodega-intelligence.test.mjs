import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route=fs.readFileSync('app/api/inventory/laudus-intelligence/route.ts','utf8');
const component=fs.readFileSync('components/integrations/bodega-intelligence.tsx','utf8');
const page=fs.readFileSync('app/dashboard/bodega/page.tsx','utf8');

test('Bodega intelligence prioritizes evidence instead of min-stock noise',()=>{
  assert.match(route,/MODULE_KEYS\.BODEGA_INVENTARIO/);
  assert.match(route,/motil_supply_risk_preview/);
  assert.match(route,/activeShortage > 0 \|\| activeWorkOrders > 0/);
  assert.match(route,/quantity < 0/);
  assert.match(route,/priceRatio >= 1\.2 && purchaseLines >= 2/);
  assert.match(route,/supplierCount === 1 && purchaseLines >= 3/);
  assert.match(route,/lowMinimumAloneIsUrgent: false/);
  assert.match(component,/Estar bajo mínimo, por sí solo, no convierte un producto en urgente/);
  assert.match(component,/Siguiente decisión:/);
  assert.match(page,/BodegaIntelligence/);
});

test('Bodega intelligence remains advisory and read only',()=>{
  assert.match(route,/noAutomaticReplenishment: true/);
  assert.match(route,/noAutomaticSupplierDecision: true/);
  assert.match(route,/noLaudusWrite: true/);
  assert.match(component,/no ajusta stock/);
  assert.match(component,/no repone automáticamente/);
});
