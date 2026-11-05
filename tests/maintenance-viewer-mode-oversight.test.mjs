import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const viewerMode = await fs.readFile('lib/maintenance/viewer-mode.ts', 'utf8');
const viewerContext = await fs.readFile('app/api/maintenance/viewer-context/route.ts', 'utf8');

test('cross-functional maintenance viewers resolve to oversight without inventing execution ownership', () => {
  assert.match(viewerMode, /cargo === 'gerente operaciones' \|\| cargo === 'jefe sostenibilidad'\) return 'oversight'/);
  assert.match(viewerMode, /cargo === 'jefe de planificación'\) return 'planning'/);
  assert.match(viewerMode, /cargo === 'jefe departamento de mantenimiento'\) return 'leadership'/);
  assert.match(viewerMode, /cargo\.startsWith\('jefe de taller mina'\)\) return 'planning'/);
  assert.match(viewerMode, /cargo\.startsWith\('mecánico'\)/);
});

test('viewer context preserves canonical cargo name and assigned execution capability', () => {
  assert.match(viewerContext, /cargoName,/);
  assert.match(viewerContext, /hasAssignedOperationalWork/);
  assert.match(viewerContext, /canEdit: authority\.canPlan \|\| hasAssignedOperationalWork/);
  assert.match(viewerContext, /canPlan: authority\.canPlan/);
  assert.doesNotMatch(viewerContext, /mode === 'general' \? null : cargoName/);
});
