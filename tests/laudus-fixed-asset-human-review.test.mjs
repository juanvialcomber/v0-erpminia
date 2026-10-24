import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20261024093000_laudus_fixed_asset_human_review.sql','utf8');
const route=fs.readFileSync('app/api/finance/assets/laudus-review/route.ts','utf8');
const page=fs.readFileSync('app/dashboard/finanzas/activos/page.tsx','utf8');

test('fixed asset review records human decisions without canonical mutation',()=>{
  assert.match(migration,/confirm_candidate/);
  assert.match(migration,/reject_candidate/);
  assert.match(migration,/defer/);
  assert.doesNotMatch(migration,/update canonical\.assets/i);
  assert.doesNotMatch(migration,/update integration\.laudus_fixed_assets/i);
});

test('fixed asset review requires finance write access for decisions',()=>{
  assert.match(route,/requireModuleAccess\(request, MODULE_KEYS\.FIN_FINANZAS, true\)/);
  assert.match(route,/canonicalMutated:false/);
  assert.match(route,/laudusMutated:false/);
});

test('asset review UI states identity is not auto-promoted',()=>{
  assert.match(page,/no modifica todavía el activo canónico/i);
  assert.match(page,/Confirmar aquí no modifica identidad canónica ni escribe en Laudus/i);
  assert.match(page,/many-to-one/i);
});
