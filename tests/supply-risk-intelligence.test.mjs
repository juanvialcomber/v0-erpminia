import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20261023234500_supply_risk_intelligence.sql','utf8');
const route=fs.readFileSync('app/api/procurement/supply-risk/route.ts','utf8');
const card=fs.readFileSync('components/integrations/supply-risk-card.tsx','utf8');

test('supply risk excludes closed maintenance demand and stays read-only',()=>{
  assert.match(migration,/not in \('completed','cancelled','canceled','closed'/);
  assert.match(migration,/active_required_qty>0/);
  assert.match(migration,/read_only_explainable/);
  assert.match(migration,/revoke all on function/);
  assert.match(migration,/grant execute .* service_role/);
  assert.match(route,/FIN_COMPRAS/);
  assert.match(route,/motil_supply_risk_preview/);
  assert.match(card,/Una señal preventiva no equivale a una compra aprobada/);
});

test('supply risk UI distinguishes coverage from supplier absence',()=>{
  assert.match(card,/Laudus enlazado/);
  assert.match(card,/Proveedor no medido en Laudus/);
  assert.match(card,/Sin OT activa vinculada/);
});
