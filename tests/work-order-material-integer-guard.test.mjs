import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route=fs.readFileSync('app/api/maintenance/work-orders/[id]/materials/route.ts','utf8');
const coverage=fs.readFileSync('components/maintenance/work-order-material-coverage.tsx','utf8');

test('OT material capture never silently rounds fractional quantities',()=>{
  assert.match(route,/Number\.isInteger\(Number\(item\.quantityRequired\)\)/);
  assert.match(route,/No se redondean cantidades fraccionarias/);
  assert.match(coverage,/min="1" step="1"/);
  assert.match(coverage,/MOTIL no redondea fracciones automáticamente/);
});