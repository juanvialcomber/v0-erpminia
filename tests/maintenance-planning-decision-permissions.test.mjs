import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const route = await readFile(new URL('../app/api/maintenance/planning-decisions/route.ts', import.meta.url), 'utf8');

test('planning decision reads expose write controls only to authorized OT creator cargos', () => {
  assert.match(route, /getMaintenanceWorkOrderCreationCapability\(context\)/);
  assert.match(route, /canWrite: access\.canWrite && creationCapability\.canCreate/);
});

test('planning decision writes reject execution-only cargos before save or approve', () => {
  assert.match(route, /if\(!creationCapability\.canCreate\)return NextResponse\.json\(\{error:'Tu cargo no puede editar ni aprobar planificación de mantenimiento'\},\{status:403\}\)/);
});
