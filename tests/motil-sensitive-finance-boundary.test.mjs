import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = new URL(
  '../supabase/migrations/20261123150000_harden_motil_sensitive_finance_surfaces.sql',
  import.meta.url,
);

const financeRoutes = [
  '../app/api/finance/intelligence/route.ts',
  '../app/api/finance/executive/route.ts',
  '../app/api/finance/suppliers/[id]/route.ts',
  '../app/api/finance/event-ledger/route.ts',
  '../app/api/finance/certified/[entity]/[id]/route.ts',
  '../app/api/finance/cost-centers/[id]/route.ts',
];

const sensitiveViews = [
  'laudus_accounts_payable_quality_v1',
  'laudus_accounts_payable_trusted_v1',
  'laudus_accounts_payable_trusted_90d_v1',
  'laudus_inventory_trusted_90d_v1',
  'laudus_area_alert_candidates_v1',
  'laudus_area_alert_candidates_90d_v1',
  'laudus_missing_purchase_invoice_recovery_candidates_v1',
  'laudus_financial_chain_service_v1',
];

test('finance API routes require the canonical finance module permission', async () => {
  for (const routePath of financeRoutes) {
    const source = await readFile(new URL(routePath, import.meta.url), 'utf8');
    assert.match(source, /requireModuleAccess\(request, MODULE_KEYS\.FIN_FINANZAS\)/, routePath);
  }
});

test('sensitive Laudus views are invoker-secured and unavailable to client roles', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  for (const view of sensitiveViews) {
    assert.match(sql, new RegExp(`alter view public\\.${view} set \\(security_invoker = true\\)`, 'i'));
    assert.match(sql, new RegExp(`revoke all on table public\\.${view} from public, anon, authenticated`, 'i'));
    assert.match(sql, new RegExp(`grant select on table public\\.${view} to service_role`, 'i'));
  }
});

test('sensitive Laudus RPCs and supply refresh cannot be called by client roles', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  for (const fn of [
    'motil_get_laudus_invoice_trace_candidates',
    'motil_ingest_laudus_invoice_traces',
    'motil_laudus_finance_review_queue',
    'motil_laudus_invoice_trace_coverage',
    'motil_laudus_supplier_intelligence',
    'refresh_work_order_supply_need',
  ]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}\\(`, 'i'));
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}\\(`, 'i'));
  }
});
