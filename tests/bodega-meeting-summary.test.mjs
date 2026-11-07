import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../app/dashboard/bodega/page.tsx',import.meta.url),'utf8');

test('bodega meeting summary exposes state differences and decision',()=>{
  assert.match(page,/Resumen para reunión/);
  assert.match(page,/>Estado</);
  assert.match(page,/>Diferencias</);
  assert.match(page,/>Decisión</);
  assert.match(page,/MOTIL tiene una base de stock vigente para decidir/);
  assert.match(page,/Sin diferencias operacionales bloqueantes/);
});

test('bodega summary preserves human reconciliation boundary',()=>{
  assert.match(page,/contrastes históricos se conservan como evidencia/);
  assert.match(page,/reconciliationSummary/);
  assert.match(page,/No se reemplaza una conciliación ausente por cero/);
});
