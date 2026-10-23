import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/migrations/20261024001500_supplier_360_economic_intelligence.sql','utf8');
const route=fs.readFileSync('app/api/procurement/suppliers-360/route.ts','utf8');
const page=fs.readFileSync('app/dashboard/compras/proveedores-360/page.tsx','utf8');

test('supplier economic snapshot uses line evidence and stays read-only',()=>{
  assert.match(sql,/sum\(coalesce\(line_total/);
  assert.match(sql,/spend_basis/);
  assert.match(sql,/revoke all on function/);
  assert.match(sql,/grant execute .*service_role/);
  assert.match(route,/motil_supplier_economic_snapshot/);
});

test('supplier 360 does not overclaim sourcing or price risk',()=>{
  assert.match(page,/Fuente única observada/);
  assert.match(page,/no criticidad operacional por sí sola/);
  assert.match(page,/puede deberse a unidad, marca, especificación o condición distinta/);
  assert.match(page,/Sin dependencia de mantenimiento activa identificada/);
});
