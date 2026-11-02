import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const dashboard=readFileSync(new URL('../components/dashboard/produccion-dashboard.tsx',import.meta.url),'utf8');

test('production meeting summary exposes one fact, one attention signal and one validation queue',()=>{
  assert.match(dashboard,/Qué pasó/);
  assert.match(dashboard,/Qué requiere atención/);
  assert.match(dashboard,/Qué validar/);
  assert.match(dashboard,/reviewTotal/);
  assert.match(dashboard,/La validación sigue siendo humana/);
});

test('production meeting summary keeps source absence honest',()=>{
  assert.match(dashboard,/ausencia de fuente como dato no disponible, no como cero/);
  assert.match(dashboard,/Revisar fuentes/);
});
