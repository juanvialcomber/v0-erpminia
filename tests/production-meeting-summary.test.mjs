import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const dashboard=readFileSync(new URL('../components/dashboard/produccion-dashboard.tsx',import.meta.url),'utf8');

test('production meeting summary exposes one fact, one attention signal and one validation queue',()=>{
  assert.match(dashboard,/Qué pasó/);
  assert.match(dashboard,/Qué requiere atención/);
  assert.match(dashboard,/Qué validar/);
  assert.match(dashboard,/hasPendingReview/);
  assert.match(dashboard,/áreas con registros por revisar/);
  assert.match(dashboard,/La validación sigue siendo humana/);
});

test('production meeting summary keeps source absence honest',()=>{
  assert.match(dashboard,/ausencia de fuente como dato no disponible, no como cero/);
  assert.match(dashboard,/Revisar fuentes/);
});

test('production meeting summary prioritizes the freshest official source cutoff over stale detailed flow',()=>{
  assert.match(dashboard,/sourceCutoff/);
  assert.match(dashboard,/Corte oficial al/);
  assert.match(dashboard,/Proyección bajo plan mensual|Proyección sobre plan mensual/);
  assert.doesNotMatch(dashboard,/fineExtractedTons\?\?0/);
});

test('source cutoff API exposes monthly plan separately from plan-to-date',()=>{
  const route=readFileSync(new URL('../app/api/produccion/source-cutoff/route.ts',import.meta.url),'utf8');
  assert.match(route,/extraction_month_plan_peumo/);
  assert.match(route,/extraction_month_plan_don_jaime/);
  assert.match(route,/plannedMonthTons/);
});
