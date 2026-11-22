import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import typescript from 'typescript';

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');
const warehouse = read('app/dashboard/bodega/layout.tsx');
const maintenance = read('app/dashboard/mantenimiento/layout.tsx');
const materials = read('app/dashboard/bodega/materiales-mantenimiento/page.tsx');
const definitions = read('app/dashboard/bodega/acuerdos/page.tsx');

test('warehouse navigation separates operational actions, personal work and definitions', () => {
  assert.match(warehouse, /href: '\/dashboard\/bodega\/verificar-stock', label: 'Conteos'/);
  assert.match(warehouse, /href: '\/dashboard\/bodega\/materiales-mantenimiento', label: 'Materiales de OT'/);
  assert.match(warehouse, /href="\/dashboard\/acciones"/);
  assert.match(warehouse, /href: '\/dashboard\/bodega\/acuerdos', label: 'Definiciones de Bodega'/);
  assert.match(warehouse, /DropdownMenuContent/);
  assert.match(warehouse, /ready && canEdit\('bodega_inventario'\)/);
  assert.match(definitions, /<PageHeaderTitle>Definiciones de Bodega<\/PageHeaderTitle>/);
  assert.match(definitions, /tareas individuales se gestionan en Mi trabajo/);
});

test('maintenance offers personal tasks and Bodega handoff only with Bodega permission', () => {
  assert.match(maintenance, /href: '\/dashboard\/acciones', label: 'Mi trabajo'/);
  assert.match(maintenance, /href: '\/dashboard\/bodega\/materiales-mantenimiento', label: 'Materiales de OT'/);
  assert.match(maintenance, /ready && canView\('bodega_inventario'\)/);
  assert.match(materials, /accessReady && canView\('mant_operaciones'\)/);
  assert.match(materials, /Revisar OT activas/);
});

test('Laudus date-only cutoffs use the calendar date, not Santiago midnight offsets', () => {
  const start = materials.indexOf('function dateLabel(');
  const end = materials.indexOf('\nfunction timeLabel(', start);
  assert.ok(start !== -1 && end > start);
  const functionSource = materials.slice(start, end);
  const transformed = typescript.transpileModule(functionSource + '\nmodule.exports = { dateLabel };', {
    compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  runInNewContext(transformed, { module, Intl, Date });
  const expected = new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date('2026-11-22T00:00:00Z'));
  assert.equal(module.exports.dateLabel('2026-11-22'), expected);
  assert.equal(module.exports.dateLabel(null), 'Sin fecha');
  assert.match(materials, /Compra por revisar/);
});

test('materials never imply historic OT requirements are new requests or stock deductions', () => {
  assert.match(materials, /Las solicitudes registradas corresponden a OT finalizadas|Los materiales registrados pertenecen a OT finalizadas/);
  assert.match(materials, /Esta vista no modifica entregas ni existencias/);
  assert.match(materials, /showHistorical \?/);
  assert.match(materials, /canOpenOrders \?/);
});
