import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync(new URL('../app/api/produccion/geologia/hole-360/route.ts', import.meta.url), 'utf8');
const card = readFileSync(new URL('../components/production/geologia-hole-360.tsx', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../components/production/geologia-dashboard.tsx', import.meta.url), 'utf8');
const tasks = readFileSync(new URL('../components/production/geologia-immediate-task-queue.tsx', import.meta.url), 'utf8');

test('Geology hole 360 is authorized, read-only and tenant scoped', () => {
  assert.match(api, /requireModuleAccess\(request, MODULE_KEYS\.PROD_GEOLOGIA\)/);
  assert.match(api, /getOrganizationContext\(request\)/);
  assert.match(api, /UUID\.test\(holeId\)/);
  assert.match(api, /eq\('organization_id', context\.organizationId\)/);
  assert.match(api, /\.eq\('id', holeId\)/);
  assert.doesNotMatch(api, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});

test('Every evidence query is bounded and the sample association is explicit', () => {
  for (const table of ['production_drill_holes','production_geology_hole_profile_v1','production_geology_immediate_tasks_2026_v1','production_drilling_source_reports','production_chemistry_samples','production_chemistry_results']) {
    assert.ok(api.includes("from('"+table+"')"),table);
  }
  assert.match(api, /\.eq\('canonical_drill_hole_id', holeId\)/);
  assert.match(api, /\.eq\('drill_hole_id', holeId\)/);
  assert.match(api, /\.limit\(8\)/);
  assert.match(api, /\.limit\(25\)/);
  assert.match(api, /\.limit\(50\)/);
  assert.match(api, /sampleIds\.length/);
});

test('Interpretation boundaries and missing evidence are explicit', () => {
  assert.match(api, /sourceReportsAreFormalLogging: false/);
  assert.match(api, /visualMineralizationIsAssay: false/);
  assert.match(api, /missingDataIsAutomaticTask: false/);
  assert.match(card, /no equivalen a logging geológico formal/);
  assert.match(card, /Sin muestras químicas vinculadas explícitamente/);
  assert.match(card, /No hay tareas inmediatas acreditadas/);
});

test('Immediate tasks open the matching canonical drill hole', () => {
  assert.match(tasks, /encodeURIComponent\(task\.drill_hole_id\)/);
  assert.match(dashboard, /new URLSearchParams\(window\.location\.search\)\.get\('hole'\)/);
  assert.match(dashboard, /<GeologiaHole360 holeId=\{selectedHole\.id\}\/>/);
  assert.match(dashboard, /url\.searchParams\.set\('hole',holeId\)/);
});

test('hole 360 endpoint is off by default before authenticated QA',()=>{
  assert.match(api,/MOTIL_GEOLOGIA_360_ENABLED !== 'true'/);
  assert.match(dashboard,/NEXT_PUBLIC_MOTIL_GEOLOGIA_360_ENABLED === 'true'/);
  assert.match(tasks,/NEXT_PUBLIC_MOTIL_GEOLOGIA_360_ENABLED === 'true'/);
});

test('existing hole selection works even when the new 360 feature is disabled',()=>{
  assert.match(dashboard,/const selectedHole=useMemo\(\(\)=>selectedHoleId \? data\?\.holes\.find/);
  assert.match(dashboard,/setSelectedHoleId\(holeId\);/);
});
