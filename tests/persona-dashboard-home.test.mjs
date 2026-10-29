import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const persona = fs.readFileSync('lib/dashboard/persona-dashboard.ts', 'utf8');
const home = fs.readFileSync('components/dashboard/dashboard-home.tsx', 'utf8');

test('five priority cargos resolve to dedicated dashboard personas', () => {
  assert.match(persona, /jefe de planificacion/);
  assert.match(persona, /jefe de taller mina don jaime/);
  assert.match(persona, /jefe de equipos moviles y estacionarios/);
  assert.match(persona, /gerente de finanzas/);
  assert.match(persona, /gerente de operaciones/);
});

test('persona dashboards are decision-first and share one reusable home', () => {
  assert.match(home, /resolvePersonaDashboard/);
  assert.match(home, /PersonaSummaryStrip/);
  assert.match(home, /Estado de decisiones/);
  assert.match(home, /persona\.primaryAction/);
  assert.match(home, /persona\?\.attentionTitle/);
});

test('persona configuration avoids duplicate page implementations', () => {
  assert.match(persona, /PERSONA_DASHBOARDS/);
  assert.match(persona, /Plan de trabajo y restricciones/);
  assert.match(persona, /Mi turno/);
  assert.match(persona, /Aprobaciones y excepciones/);
  assert.match(persona, /Control financiero/);
  assert.match(persona, /Control operacional/);
});

test('planning and equipment supervision resolve to maintenance data mode', () => {
  assert.match(home, /cargo === 'jefe de planificacion'.*return 'maintenance'/s);
  assert.match(home, /jefe de equipos moviles y estacionarios/);
});

test('existing non-persona management decision priorities remain available', () => {
  assert.match(home, /mode === 'management' && !personaKey/);
});
