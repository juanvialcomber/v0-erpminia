import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../app/dashboard/bodega/page.tsx',import.meta.url),'utf8');

test('bodega meeting summary exposes state differences and decision',()=>{
  assert.match(page,/Resumen para reunión/);
  assert.match(page,/>Estado</);
  assert.match(page,/>Diferencias</);
  assert.match(page,/>Decisión</);
  assert.match(page,/Laudus es la fuente primaria de stock/);
  assert.match(page,/saldos negativos por conciliar/);
});

test('bodega summary preserves human reconciliation boundary',()=>{
  assert.match(page,/antes de ajustar stock, comprometer disponibilidad o disparar compras/);
  assert.match(page,/reconciliationSummary/);
  assert.match(page,/No se reemplaza una conciliación ausente por cero/);
});
