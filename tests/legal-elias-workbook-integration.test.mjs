import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const importer = fs.readFileSync('app/dashboard/legal/importar/page.tsx', 'utf8');
const contracts = fs.readFileSync('lib/api/contracts.ts', 'utf8');
const permits = fs.readFileSync('app/dashboard/legal/permisos-licencias/page.tsx', 'utf8');
const supplierMigration = fs.readFileSync('supabase/migrations/20261106164500_contracts_supplier_canonical_bridge.sql', 'utf8');
const dateMigration = fs.readFileSync('supabase/migrations/20261106165500_contracts_optional_dates.sql', 'utf8');

test('Elias contract workbook stays review-first and source-traceable', () => {
  assert.match(importer, /workbook\.SheetNames\.includes\('Resumen'\)/);
  assert.match(importer, /status: 'En Revisión'/);
  assert.match(importer, /Requiere validación humana/);
  assert.match(importer, /Fuente operativa:/);
});

test('contracts bridge to canonical suppliers without requiring the legacy contractor table', () => {
  assert.match(supplierMigration, /alter column contractor_id drop not null/i);
  assert.match(supplierMigration, /add column if not exists supplier_id uuid references public\.suppliers/i);
  assert.match(supplierMigration, /contracts_party_present_check/);
  assert.match(contracts, /\.from\('suppliers'\)/);
  assert.match(contracts, /supplier_id: supplierId/);
  assert.match(contracts, /suppliers\?\.length === 1 \? suppliers\[0\]\.id : null/);
});

test('missing source dates remain missing rather than fabricated', () => {
  assert.match(dateMigration, /alter column start_date drop not null/i);
  assert.match(dateMigration, /alter column end_date drop not null/i);
});

test('verified polvorin events are surfaced from the existing compliance source', () => {
  assert.match(permits, /\/api\/sostenibilidad\/compliance-events\?limit=100/);
  assert.match(permits, /\[POLVORIN\]/);
  assert.match(permits, /Aviso desde/);
});
