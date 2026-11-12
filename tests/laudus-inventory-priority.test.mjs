import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync('app/api/integrations/laudus/inventory-priority/route.ts','utf8');
const component = fs.readFileSync('components/integrations/laudus-inventory-priority-queue.tsx','utf8');
const page = fs.readFileSync('app/dashboard/bodega/page.tsx','utf8');

test('Laudus inventory priority is read only and scoped to Bodega', () => {
  assert.match(route, /MODULE_KEYS\.BODEGA_INVENTARIO/);
  assert.match(route, /getOrganizationContext/);
  assert.match(route, /canonicalMutation: false/);
  assert.doesNotMatch(route, /\.insert\(/);
  assert.doesNotMatch(route, /\.update\(/);
  assert.doesNotMatch(route, /\.delete\(/);
});

test('priority queue suppresses low-materiality inventory noise', () => {
  assert.match(route, /priority >= 70/);
  assert.match(route, /days_since_last_purchase/);
  assert.match(route, /<= 365/);
  assert.match(route, /process_consumable/);
  assert.match(route, /maintenance_supply/);
  assert.match(component, /El backlog menor queda fuera de la cola diaria/);
});

test('Bodega surfaces prioritized Laudus cases before manual reconciliation', () => {
  assert.match(page, /LaudusInventoryPriorityQueue/);
  assert.match(page, /<LaudusInventoryPriorityQueue \/>/);
  assert.match(component, /no corrige stock ni adopta Laudus como conteo físico/);
});
