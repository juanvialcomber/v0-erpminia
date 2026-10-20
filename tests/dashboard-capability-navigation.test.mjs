import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dashboardUrl = new URL('../components/dashboard/dashboard-home.tsx', import.meta.url);
const dictUrl = new URL('../lib/i18n/dictionaries.ts', import.meta.url);

test('dashboard home exposes role-specific operational shortcuts', async () => {
  const dashboard = await readFile(dashboardUrl, 'utf8');
  const dict = await readFile(dictUrl, 'utf8');

  // Shortcut hrefs are code identifiers, keyed independently of locale.
  for (const href of [
    '/dashboard/produccion/planta-metalurgia',
    '/dashboard/mantenimiento/ordenes-trabajo',
    '/dashboard/mantenimiento/disponibilidad',
    '/dashboard/produccion/sondaje',
    '/dashboard/bodega',
    '/dashboard/acciones',
    '/dashboard/produccion',
  ]) {
    assert.match(dashboard, new RegExp(`'${href.replaceAll('/', '\\/')}'`));
  }
  // Their labels live in the dictionary (es locale carries the approved copy).
  for (const label of ['Planta', 'Órdenes de trabajo', 'Disponibilidad', 'Perforación', 'Mis acciones', 'Producción']) {
    assert.match(dict, new RegExp(`label: '${label}'`));
  }

  assert.match(dict, /title: 'Mi Perforación'/);
  assert.doesNotMatch(dict, /title: 'Mi Sondaje'/);
  assert.match(dashboard, /resolveMode\(/);
  assert.match(dashboard, /mode === 'plant'/);
  assert.match(dashboard, /mode === 'maintenance'/);
  assert.match(dashboard, /mode === 'drilling'/);
  assert.match(dashboard, /mode === 'management'/);
  assert.ok(dashboard.includes('jefe man\\.? eq'));
  assert.ok(dashboard.includes('jefe mant'));
  assert.ok(dashboard.includes('planificador.*mant'));
  assert.match(dashboard, /config\.shortcuts\.map/);
});
