import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync('components/dashboard/maintenance-home.tsx', 'utf8');
const page = fs.readFileSync('app/dashboard/mantenimiento/lubricacion/page.tsx', 'utf8');
const lubrication = fs.readFileSync('components/maintenance/maintenance-lubrication-intelligence.tsx', 'utf8');

test('Ariel can discover the lubrication section from maintenance home', () => {
  assert.match(home, /\/dashboard\/mantenimiento\/lubricacion/);
  assert.match(home, /Aceites y lubricación/);
  assert.match(home, /mode === 'planning'/);
  assert.match(home, /mode === 'leadership'/);
});

test('lubrication route mounts the existing canonical intelligence component', () => {
  assert.match(page, /MaintenanceLubricationIntelligence/);
  assert.match(lubrication, /Ariel · planificación/);
  assert.match(lubrication, /Lubricación y proyección/);
  assert.match(lubrication, /Stock lubricantes/);
  assert.match(lubrication, /Residuos 30d/);
});
