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
  assert.match(access, /jefe de taller mina/);
  assert.match(access, /jefe mina/);
  assert.doesNotMatch(route, /Solo Ariel López y Mauricio Astudillo/);
  assert.match(route, /getMaintenanceWorkOrderCreationCapability/);
});

test('viewer and creation endpoint share the canonical creation capability through OT authority', () => {
  assert.match(viewer, /getMaintenanceActorAuthority/);
  assert.match(viewer, /authority\.canCreateWorkOrder/);
  assert.match(viewer, /authority\.canCreateEmergencyWorkOrder/);
  assert.match(route, /getMaintenanceWorkOrderCreationCapability/);
  assert.match(route, /creationCapability\.canCreate/);
});

test('coarse maintenance role gate delegates POST work-order creation to canonical route', () => {
  assert.match(org, /method === 'POST' && path === '\/api\/maintenance\/work-orders'/);
  assert.match(org, /canonical work-order route by cargo/);
});

test('mine leads receive mant_operaciones edit capability', () => {
  for (const cargo of [
    'jefe mina don jaime',
    'jefe mina peumo',
    'jefe mina san pedro',
    'jefe de taller mina don jaime',
    'jefe de taller mina peumo',
    'jefe de taller mina san pedro',
  ]) {
    assert.match(migration.toLowerCase(), new RegExp(cargo));
  }
  assert.match(migration, /'mant_operaciones', 'ED'/);
});
