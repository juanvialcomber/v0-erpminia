import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync('app/api/maintenance/technical-notices/route.ts', 'utf8');
const page = fs.readFileSync('app/dashboard/mantenimiento/avisos/page.tsx', 'utf8');
const home = fs.readFileSync('components/dashboard/maintenance-home.tsx', 'utf8');

test('technical notices derive from existing maintenance evidence sources', () => {
  assert.match(api, /drilling_maintenance_review_queue_v1/);
  assert.match(api, /maintenance_condition_signal_reviews/);
  assert.match(api, /maintenance_meter_review_queue/);
  assert.match(api, /derivedQueue/);
  assert.match(api, /no crea un maestro paralelo/);
  assert.doesNotMatch(api, /\.insert\(/);
  assert.doesNotMatch(api, /\.upsert\(/);
});

test('technical notices preserve human authority before creating work', () => {
  assert.match(api, /MOTIL no crea una OT desde esta bandeja/);
  assert.match(api, /Un aviso es evidencia por revisar, no diagnóstico ni falla confirmada/);
  assert.match(page, /Un aviso no cambia el equipo ni crea una OT automáticamente/);
  assert.match(page, /evidencia → aviso → decisión humana → OT cuando corresponde/);
});

test('technical notices expose only simple operational states', () => {
  assert.match(page, /Por evaluar/);
  assert.match(page, /Seguir mirando/);
  assert.match(page, /Listo para OT/);
  assert.match(page, /Alta prioridad/);
  assert.doesNotMatch(page, /notification type/i);
  assert.doesNotMatch(page, /maintenance item/i);
});

test('maintenance home links notices without adding global navigation complexity', () => {
  assert.match(home, /\/dashboard\/mantenimiento\/avisos/);
  assert.match(home, /Avisos/);
});
