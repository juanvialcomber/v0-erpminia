import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../app/dashboard/compras/page.tsx',import.meta.url),'utf8');
const route=readFileSync(new URL('../app/api/procurement/overview/route.ts',import.meta.url),'utf8');

test('compras meeting summary shows need execution and validation',()=>{
  assert.match(page,/Resumen para reunión/);
  assert.match(page,/>Necesidad</);
  assert.match(page,/>Ejecución</);
  assert.match(page,/>Validación</);
  assert.match(page,/La decisión final sigue siendo humana/);
});

test('procurement overview exposes open reconciliation exceptions',()=>{
  assert.match(route,/procurement_match_exceptions/);
  assert.match(route,/openMatchExceptions/);
  assert.match(route,/resolved/);
  assert.match(route,/closed/);
});
