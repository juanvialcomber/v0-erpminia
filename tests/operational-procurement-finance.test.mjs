import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../supabase/migrations/20260827171500_connect_operational_procurement_to_finance_v1.sql', import.meta.url);
const apiPath = new URL('../app/api/finance/executive/route.ts', import.meta.url);
const pagePath = new URL('../app/dashboard/finanzas/page.tsx', import.meta.url);

test('operational finance reduces commitment by quantities already received', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /greatest\(l\.quantity_ordered - l\.quantity_received, 0\) \* l\.unit_cost as amount/);
  assert.match(sql, /'committed'::text as recognition_status/);
});

test('accepted receipts become recognized operational procurement cost', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /rl\.quantity_accepted \* rl\.unit_cost as amount/);
  assert.match(sql, /'recognized'::text as recognition_status/);
  assert.match(sql, /where rl\.quantity_accepted > 0/);
});

test('missing work order cost centers remain explicit exceptions', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /case when pc\.id is null then 'missing' else 'work_order' end/);
  assert.match(sql, /missing_cost_center_events/);
  assert.match(sql, /missing_cost_center_amount/);
});

test('finance executive preserves operational procurement data while cockpit stays decision focused', async () => {
  const api = await readFile(apiPath, 'utf8');
  const page = await readFile(pagePath, 'utf8');
  assert.match(api, /operational_procurement_finance_summary_v1/);
  assert.match(api, /operationalProcurementEvents/);
  assert.match(page, /LaudusFinanceControlCard/);
  assert.match(page, /Estado, decisiones y exposición en una sola lectura/);
  assert.doesNotMatch(page, /Monto sin centro de costo/);
});
