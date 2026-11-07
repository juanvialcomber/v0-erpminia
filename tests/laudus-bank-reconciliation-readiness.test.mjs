import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../supabase/migrations/20261107194000_add_laudus_bank_reconciliation_readiness.sql', import.meta.url);

test('bank reconciliation readiness never treats deposited flag as bank evidence', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /laudus_bank_reconciliation_readiness_v1/);
  assert.match(sql, /stale_bank_evidence/);
  assert.match(sql, /missing_bank_evidence/);
  assert.match(sql, /GERENTE DE FINANZAS/);
  assert.match(sql, /connect_current_bank_evidence/);
  assert.match(sql, /No considerar deposited=true como conciliación bancaria/);
  assert.match(sql, /'owner'::text as responsibility/);
});
