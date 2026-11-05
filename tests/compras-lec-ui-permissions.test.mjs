import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync('app/dashboard/compras/page.tsx','utf8');
const card = readFileSync('components/integrations/laudus-procurement-reconciliation-card.tsx','utf8');
const layout = readFileSync('app/dashboard/compras/layout.tsx','utf8');

test('read-only Compras users do not see reconciliation mutations',()=>{
  assert.match(page,/LaudusProcurementReconciliationCard canEdit=\{data\?\.canEdit === true\}/);
  assert.match(card,/canEdit \? \(/);
  assert.match(card,/Solo lectura/);
});

test('read-only Compras users do not see Importar navigation',()=>{
  assert.match(layout,/useModuleAccess/);
  assert.match(layout,/canEdit\('fin_compras'\)/);
  assert.match(layout,/visibleSupportItems/);
});
