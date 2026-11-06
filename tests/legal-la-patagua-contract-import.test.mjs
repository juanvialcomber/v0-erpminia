import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const importer = fs.readFileSync('app/dashboard/legal/importar/page.tsx', 'utf8');
const contractApi = fs.readFileSync('app/api/legal/contratos/route.ts', 'utf8');
const contractLib = fs.readFileSync('lib/api/contracts.ts', 'utf8');

test('La Patagua contract workbook is recognized by its canonical summary sheet', () => {
  assert.match(importer, /workbook\.SheetNames\.includes\('Resumen'\)/);
  assert.match(importer, /\^\(IO\|EP\)-\\d\+\$/);
  assert.match(importer, /parseLaPataguaContractSummary/);
});

test('spreadsheet observations remain evidence and require human validation', () => {
  assert.match(importer, /status: 'En Revisión'/);
  assert.match(importer, /Requiere validación humana/);
  assert.doesNotMatch(importer, /status:\s*observation/);
});

test('import preserves paid amount and optional execution percentage without inventing zero progress', () => {
  assert.match(importer, /paidAmount: row\.paidAmount/);
  assert.match(contractApi, /optionalNumber\(\['executionPercentage', 'execution_percentage'\]\)/);
  assert.match(contractLib, /execution_percentage: input\.executionPercentage \?\? null/);
});

test('source workbook name is retained as lineage metadata', () => {
  assert.match(importer, /Fuente operativa:/);
  assert.match(importer, /fileName: row\.sourceLabel/);
});
