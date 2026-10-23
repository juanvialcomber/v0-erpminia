import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync('app/dashboard/compras/proveedores-360/page.tsx','utf8');

test('Proveedor 360 turns Laudus economics into explainable supplier intelligence',()=>{
  assert.match(page,/Lectura MOTIL/);
  assert.match(page,/Dependencia operacional activa/);
  assert.match(page,/Concentración de abastecimiento/);
  assert.match(page,/Precios que merecen revisión/);
  assert.match(page,/Relación de compra recurrente/);
  assert.match(page,/Siguiente decisión:/);
});

test('supplier intelligence preserves uncertainty',()=>{
  assert.match(page,/fuente única no implica riesgo por sí sola/i);
  assert.match(page,/antes de interpretar la variación como sobreprecio/i);
});
