import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const route = await fs.readFile('app/api/maintenance/viewer-context/route.ts', 'utf8');
const viewerMode = await fs.readFile('lib/maintenance/viewer-mode.ts', 'utf8');

test('maintenance viewer context preserves canonical cargo and promotes assigned work to execution mode', () => {
  assert.match(route, /const baseMode = resolveMaintenanceViewerMode\(cargoName\)/);
  assert.match(route, /hasAssignedOperationalWork/);
  assert.match(route, /hasAssignedOperationalWork && !authority\.canPlan \? 'execution' : baseMode/);
  assert.match(route, /canEdit: authority\.canPlan \|\| hasAssignedOperationalWork/);
  assert.match(route, /permissions: \{/);
  assert.match(route, /canPlan: authority\.canPlan/);
  assert.doesNotMatch(route, /cargoName: mode === 'general' \? null : cargoName/);
});

test('maintenance role routing stays explicit for every canonical maintenance cargo family', () => {
  assert.match(viewerMode, /jefe departamento de mantenimiento/);
  assert.match(viewerMode, /jefe de planificación/);
  assert.match(viewerMode, /jefe de equipos móviles y estacionarios/);
  assert.match(viewerMode, /gerente operaciones/);
  assert.match(viewerMode, /jefe sostenibilidad/);
  assert.match(viewerMode, /return 'oversight'/);
  assert.match(viewerMode, /cargo\.startsWith\('mecánico'\)/);
  assert.match(viewerMode, /cargo\.startsWith\('jefe de taller mina'\)\) return 'planning'/);
  assert.match(viewerMode, /encargado de camionetas y camiones/);
  assert.match(viewerMode, /cargo === 'soldador'/);
});
