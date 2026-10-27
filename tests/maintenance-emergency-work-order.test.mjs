import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const access = await readFile(new URL('../lib/maintenance/work-order-create-access.ts', import.meta.url), 'utf8');
const createRoute = await readFile(new URL('../app/api/maintenance/work-orders/route.ts', import.meta.url), 'utf8');
const detailRoute = await readFile(new URL('../app/api/maintenance/work-orders/[id]/route.ts', import.meta.url), 'utf8');
const viewer = await readFile(new URL('../app/api/maintenance/viewer-context/route.ts', import.meta.url), 'utf8');
const createUi = await readFile(new URL('../components/maintenance/create-work-order.tsx', import.meta.url), 'utf8');
const queueUi = await readFile(new URL('../components/maintenance/work-orders-queue.tsx', import.meta.url), 'utf8');
const display = await readFile(new URL('../lib/maintenance/work-order-display.ts', import.meta.url), 'utf8');

test('mechanics may create emergency OTe without gaining normal OT creation', () => {
  assert.match(access, /isEmergencyWorkOrderCreatorCargo/);
  assert.match(access, /cargo\.startsWith\('mecánico'\)/);
  assert.match(access, /canCreateEmergency/);
  assert.match(access, /emergencySelfAssignOnly: canCreateEmergency && !canCreate/);
  assert.match(createRoute, /isEmergencyWork[\s\S]*?creationCapability\.canCreateEmergency/);
  assert.match(createRoute, /: creationCapability\.canCreate/);
});

test('execution profiles are forced to self-assign emergency OTe', () => {
  assert.match(createRoute, /isEmergencyWork && creationCapability\.emergencySelfAssignOnly/);
  assert.match(createRoute, /assignedPersonId = creationCapability\.personId/);
  assert.match(viewer, /emergencySelfAssignOnly/);
  assert.match(createUi, /Autoasignada por tratarse de una OTe creada desde un perfil de ejecución/);
});

test('OTe requires equipment, stays critical and uses its own folio', () => {
  assert.match(createRoute, /Una OTe debe quedar asociada a un equipo/);
  assert.match(createRoute, /isEmergencyWork \? 'critical'/);
  assert.match(createRoute, /isEmergencyWork \? `OTE-\$\{year\}-`/);
  assert.match(detailRoute, /Una OTe no puede convertirse en una OT normal/);
  assert.match(detailRoute, /Una OTe conserva prioridad crítica/);
  assert.match(display, /replace\(\/\^OTE-\/i, 'OTe-'\)/);
});

test('OT inbox exposes emergency creation separately from planned OT creation', () => {
  assert.match(viewer, /canCreateEmergencyWorkOrder/);
  assert.match(queueUi, /canCreateEmergencyWorkOrder/);
  assert.match(queueUi, /create\?mode=emergency/);
  assert.match(queueUi, /OTe emergencia/);
  assert.match(createUi, /Registrar OTe/);
  assert.match(createUi, /workType: emergencyMode \? 'emergency'/);
});


test('OTe requires explicit operator-reported detection time and persists it as evidence', () => {
  assert.match(createUi, /Fecha y hora de detección/);
  assert.match(createUi, /detectedAt: emergencyMode/);
  assert.match(createUi, /MOTIL no inferirá esta hora desde la creación de la OTe/);
  assert.match(createRoute, /Indica cuándo se detectó la emergencia/);
  assert.match(createRoute, /event_type: 'emergency_detected'/);
  assert.match(createRoute, /operator-reported emergency detection time; not inferred from OT creation/);
  assert.match(createRoute, /La detección de la OTe no puede estar en el futuro/);
});


test('OTe detection evidence is append-once and not silently rewritten', () => {
  assert.match(createRoute, /eq\('event_type', 'emergency_detected'\)/);
  assert.match(createRoute, /if \(existing\) return/);
  assert.match(createRoute, /source_record_id: workOrder\.id/);
  assert.doesNotMatch(createRoute, /from\('work_order_events'\)\.update\(/);
});
