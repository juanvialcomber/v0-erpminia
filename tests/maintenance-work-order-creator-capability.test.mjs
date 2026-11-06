import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const access = await readFile(new URL('../lib/maintenance/work-order-create-access.ts', import.meta.url), 'utf8');
const route = await readFile(new URL('../app/api/maintenance/work-orders/route.ts', import.meta.url), 'utf8');
const viewer = await readFile(new URL('../app/api/maintenance/viewer-context/route.ts', import.meta.url), 'utf8');
const org = await readFile(new URL('../lib/api/organization-context.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261005212000_allow_mine_leads_create_work_orders.sql', import.meta.url), 'utf8');

test('OT creation is capability based instead of hard-coded to Ariel or Mauricio', () => {
  assert.match(access, /getModuleAccessLevel/);
  assert.match(access, /MODULE_KEYS\.MANT_OPERACIONES/);
  assert.match(access, /accessLevel === 'ED'/);
  assert.match(access, /jefe de planificación/);
  assert.match(access, /jefe de equipos móviles y estacionarios/);
  assert.match(access, /jefe mina/);
  const normalCreator = access.split('export function isEmergencyWorkOrderCreatorCargo')[0];
  assert.doesNotMatch(normalCreator, /cargo\.startsWith\('jefe de taller mina '\)/);
  assert.doesNotMatch(route, /Solo Ariel López y Mauricio Astudillo/);
  assert.match(route, /getMaintenanceWorkOrderCreationCapability/);
});

test('viewer and creation endpoint share the same creation capability', () => {
  assert.match(viewer, /getMaintenanceWorkOrderCreationCapability/);
  assert.match(viewer, /creationCapability\.canCreate/);
  assert.match(route, /creationCapability\.canCreate/);
});

test('coarse maintenance role gate delegates POST work-order creation to canonical route', () => {
  assert.match(org, /method === 'POST' && path === '\/api\/maintenance\/work-orders'/);
  assert.match(org, /canonical work-order route by cargo/);
});

test('workshop heads remain execution users and may only create self-assigned emergency OT', () => {
  const emergencyCreator = access.split('export function isEmergencyWorkOrderCreatorCargo')[1];
  assert.match(emergencyCreator, /cargo\.startsWith\('jefe de taller mina '\)/);
  assert.match(access, /emergencySelfAssignOnly: canCreateEmergency && !canCreate/);
  assert.match(route, /if \(isEmergencyWork && creationCapability\.emergencySelfAssignOnly\)/);
  assert.match(route, /assignedPersonId = creationCapability\.personId/);

  for (const cargo of [
    'jefe de taller mina don jaime',
    'jefe de taller mina peumo',
    'jefe de taller mina san pedro',
  ]) {
    assert.match(migration.toLowerCase(), new RegExp(cargo));
  }
  assert.match(migration, /'mant_operaciones', 'ED'/);
});
