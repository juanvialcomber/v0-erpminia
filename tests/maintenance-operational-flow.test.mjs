import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../components/dashboard/maintenance-home.tsx', import.meta.url), 'utf8');
const dict = await readFile(new URL('../lib/i18n/dictionaries.ts', import.meta.url), 'utf8');

test('maintenance control center exposes the canonical operational loop', () => {
  assert.match(dict, /Planificar → Preparar → Ejecutar → Validar → Aprender/);
  assert.match(page, /href: '\/dashboard\/planificacion'/);
  assert.match(page, /href: '\/dashboard\/bodega'/);
  assert.match(page, /href: '\/dashboard\/mantenimiento\/ordenes-trabajo'/);
  assert.match(page, /href: '\/dashboard\/mantenimiento\/ordenes-trabajo\/cierre'/);
  assert.match(page, /href: '\/dashboard\/mantenimiento\/decision-intelligence'/);
});

test('cross-module handoffs are explicit without duplicating ownership', () => {
  assert.match(dict, /Producción informa uso y estado/);
  assert.match(dict, /Bodega confirma stock/);
  assert.match(dict, /Compras consigue lo pendiente/);
  assert.match(dict, /Finanzas registra costos/);
  assert.match(dict, /Bodega y Compras preparan recursos/);
});
