import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20261024101500_laudus_asset_review_evidence.sql','utf8');
const page=fs.readFileSync('app/dashboard/finanzas/activos/page.tsx','utf8');

test('asset review summary separates deterministic identifier evidence',()=>{
  assert.match(migration,/strong_identifier_candidates/);
  assert.match(migration,/supported_candidates/);
  assert.match(migration,/strong_identifier_candidate/);
});

test('asset review UI explains deterministic evidence',()=>{
  assert.match(page,/Patente exacta/);
  assert.match(page,/Serie exacta/);
  assert.match(page,/Modelo consistente/);
  assert.match(page,/Fabricante consistente/);
  assert.match(page,/canonical_license_plate/);
});
