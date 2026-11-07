import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const sync = fs.readFileSync('lib/integrations/laudus/procurement-sync.ts','utf8');
const policy = fs.readFileSync('lib/integrations/laudus/sync-policy.ts','utf8');
const migration = fs.readFileSync('supabase/migrations/20261029212000_laudus_procurement_sync_domains.sql','utf8');
const budgetMigration = fs.readFileSync('supabase/migrations/20261029224000_laudus_budget_headroom_v3.sql','utf8');
const missingRecoveryMigration = fs.readFileSync('supabase/migrations/20261107170000_laudus_missing_invoice_recovery_candidates.sql','utf8');
const evidenceMigration = fs.readFileSync('supabase/migrations/20261107152500_persist_laudus_90d_inconsistency_evidence.sql','utf8');
const invoiceTotalPayloadMigration = fs.readFileSync('supabase/migrations/20261107194500_laudus_invoice_total_from_source_payload.sql','utf8');
const invoiceMetadataMigration = fs.readFileSync('supabase/migrations/20261107200000_laudus_invoice_metadata_refresh.sql','utf8');
const missingRecoveryRoute = fs.readFileSync('app/api/integrations/laudus/missing-invoices-recovery/route.ts','utf8');
const missingRecoveryPage = fs.readFileSync('app/admin/laudus/missing-invoices-recovery/page.tsx','utf8');
const vercel = JSON.parse(fs.readFileSync('vercel.json','utf8'));
const procurementRoute = fs.readFileSync('app/api/cron/laudus-procurement-daily/route.ts','utf8');
const coreRoute = fs.readFileSync('app/api/cron/laudus-core-daily/route.ts','utf8');
const supplierRoute = fs.readFileSync('app/api/cron/laudus-suppliers-weekly/route.ts','utf8');

test('procurement sync uses verified Laudus v2 list endpoints',()=>{
  assert.match(sync,/\/purchases\/suppliers\/list/);
  assert.match(sync,/\/purchases\/orders\/list/);
  assert.match(sync,/\/purchases\/invoices\/list/);
  assert.match(sync,/\/purchases\/payments\/list/);
});

test('transaction sync is bounded projected and supplier scan is weekly-bounded',()=>{
  assert.match(sync,/PURCHASE_ORDER_FIELDS/);
  assert.match(sync,/PURCHASE_INVOICE_FIELDS/);
  assert.match(sync,/SUPPLIER_FIELDS/);
  assert.match(sync,/for \(let page = 0; page < 25; page \+= 1\)/);
  assert.match(sync,/limit: 100/);
});

test('Laudus procurement remains staging-only and derives AP only from verified payments',()=>{
  assert.match(sync,/motil_ingest_laudus_suppliers/);
  assert.match(sync,/motil_ingest_laudus_procurement_documents/);
  assert.match(sync,/motil_ingest_laudus_purchase_payments/);
  assert.match(sync,/motil_refresh_laudus_financial_staging/);
  assert.match(sync,/paymentCoverage: 'verified_v2_list'/);
  assert.match(sync,/accountsPayableDerived: true/);
  assert.doesNotMatch(sync,/\.from\('canonical_/);
  assert.doesNotMatch(sync,/insert\(|update\(|delete\(/);
});

test('sync control knows supplier and procurement domains',()=>{
  assert.match(policy,/suppliers/);
  assert.match(policy,/procurement/);
  assert.match(migration,/p_domain not in \('products','stock','financial_masters','suppliers','procurement'\)/);
  assert.match(migration,/weekly_full/);
  assert.match(migration,/latest_200_per_entity/);
});

test('core and weekly crons are staggered to avoid Laudus overlap',()=>{
  const byPath = new Map(vercel.crons.map((cron) => [cron.path, cron.schedule]));
  assert.equal(byPath.get('/api/cron/laudus-core-daily'), '20 5 * * *');
  assert.equal(byPath.get('/api/cron/laudus-suppliers-weekly'), '20 6 * * 0');
});

test('changed rows are not overstated when RPCs only report staged rows',()=>{
  const changedClaims = [...sync.matchAll(/changed:\s*(\w+)/g)].map((match) => match[1]);
  assert.ok(changedClaims.length >= 2);
  assert.ok(changedClaims.every((value) => value === '0'));
});

test('Laudus cron entrypoints participate in exact API usage tracking',()=>{
  assert.match(procurementRoute,/withLaudusApiUsageTracking/);
  assert.match(coreRoute,/withLaudusApiUsageTracking/);
  assert.match(coreRoute,/syncLaudusProcurement/);
  assert.match(supplierRoute,/withLaudusApiUsageTracking/);
});

test('procurement extension preserves the budget-aware product cadence inside the consolidated daily run',()=>{
  const byPath = new Map(vercel.crons.map((cron) => [cron.path, cron.schedule]));
  assert.equal(byPath.get('/api/cron/laudus-core-daily'), '20 5 * * *');
  assert.match(coreRoute,/syncLaudusProducts/);
  assert.match(budgetMigration,/when p_domain='products' then v_now \+ interval '24 hours'/);
});


test('supplier full scan avoids unsupported supplierId ordering while staying bounded',()=>{
  const block = sync.slice(sync.indexOf('async function listAllSuppliers()'), sync.indexOf('async function ingestChunks('));
  assert.doesNotMatch(block,/orderBy/);
  assert.match(block,/for \(let page = 0; page < 25; page \+= 1\)/);
  assert.match(block,/limit: 100/);
});


test('recuperacion de facturas faltantes es puntual y respeta presupuesto Laudus',()=>{
  assert.match(sync,/MAX_MISSING_INVOICE_RECOVERY_PER_RUN = 12/);
  assert.match(sync,/MIN_LAUDUS_API_BUDGET_RESERVE = 200/);
  assert.match(sync,/laudus_api_budget_service_v1/);
  assert.match(sync,/laudus_missing_purchase_invoice_recovery_candidates_v1/);
  assert.match(sync,/getLaudusReadOnly\('\/purchases\/invoices\/' \+ externalId\)/);
  assert.match(sync,/motil_ingest_laudus_invoice_rows/);
  assert.doesNotMatch(sync,/MAX_MISSING_INVOICE_RECOVERY_PER_RUN = (?:[3-9][0-9]|[1-9][0-9]{2,})/);
});

test('cola de recuperacion prioriza huecos del rango cargado sin excluir historia anterior',()=>{
  assert.match(missingRecoveryMigration,/faltante_dentro_rango/);
  assert.match(missingRecoveryMigration,/historia_anterior_backfill/);
  assert.match(missingRecoveryMigration,/recovery_priority/);
  assert.match(missingRecoveryMigration,/left join integration\.laudus_purchase_invoices/);
});


test('evidencia de asignaciones de pago usa un entity_type permitido por la bandeja',()=>{
  assert.match(evidenceMigration,/laudus:asignacion_pago_factura_no_resuelta:/);
  assert.match(evidenceMigration,/\n\s*'invoice',\n\s*null,\n\s*case/);
  assert.doesNotMatch(evidenceMigration,/\n\s*'payment',\n\s*null,\n\s*case/);
});


test('accion manual de recuperacion exige compras con escritura y conserva limites',()=>{
  assert.match(missingRecoveryRoute,/MODULE_KEYS\.FIN_COMPRAS/);
  assert.match(missingRecoveryRoute,/if \(!access\.canWrite\)/);
  assert.match(missingRecoveryRoute,/recoverMissingPurchaseInvoices/);
  assert.match(missingRecoveryRoute,/maxPerRun:\s*12/);
  assert.match(missingRecoveryRoute,/minimumApiReserve:\s*200/);
  assert.match(missingRecoveryRoute,/laudusWriteBack:\s*false/);
  assert.match(missingRecoveryRoute,/canonicalMutationExecuted:\s*false/);
});

test('ejecutor interno usa POST same-origin y no incorpora secretos',()=>{
  assert.match(missingRecoveryPage,/method:\s*'POST'/);
  assert.match(missingRecoveryPage,/credentials:\s*'same-origin'/);
  assert.doesNotMatch(missingRecoveryPage,/CRON_SECRET|LAUDUS_PASSWORD|Authorization:/);
});


test('recuperacion server-to-server usa token sensible y falla cerrado por organizacion',()=>{
  assert.match(missingRecoveryRoute,/MOTIL_LAUDUS_RECOVERY_TOKEN/);
  assert.match(missingRecoveryRoute,/timingSafeEqual/);
  assert.match(missingRecoveryRoute,/getSupabaseServerClient/);
  assert.match(missingRecoveryRoute,/organizationIds\.length !== 1/);
  assert.match(missingRecoveryRoute,/organizationFromRequest:\s*false/);
  assert.doesNotMatch(missingRecoveryRoute,/body\.organizationId|organization_id\s*:\s*body/);
});


test('recuperacion puntual de factura preserva el monto total fuente',()=>{
  assert.match(sync,/totals_total: detail\.totals\?\.total \?\? detail\.totals_total \?\? detail\.totalAmount \?\? null/);
});

test('trazabilidad de facturas abiertas prioriza montos realmente desconocidos',()=>{
  const traceLib=fs.readFileSync('lib/integrations/laudus/native-invoice-trace.ts','utf8');
  assert.match(traceLib,/aUnknownUnpaid = a\.total_amount == null && num\(a\.paid_amount\) <= 0 \? 1 : 0/);
  assert.match(traceLib,/bUnknownUnpaid = b\.total_amount == null && num\(b\.paid_amount\) <= 0 \? 1 : 0/);
  assert.match(traceLib,/totals_total: detail\.totals\?\.total \?\? detail\.totalAmount \?\? null/);
});


test('monto desconocido sin pagos se repara aunque la traza figure completa',()=>{
  const traceLib=fs.readFileSync('lib/integrations/laudus/native-invoice-trace.ts','utf8');
  assert.match(traceLib,/missingTotal \|\| !complete\.has/);
  assert.match(traceLib,/missingTotal && hasPayments\) return false/);
  assert.match(traceLib,/aUnknownUnpaid/);
});


test('monto de factura se normaliza desde evidencia Laudus ya preservada',()=>{
  assert.match(invoiceTotalPayloadMigration,/source_payload->>'totals_total'/);
  assert.match(invoiceTotalPayloadMigration,/new\.total_amount := v_total_text::numeric/);
  assert.match(invoiceTotalPayloadMigration,/where total_amount is null/);
  assert.doesNotMatch(invoiceTotalPayloadMigration,/canonical\./);
});


test('refresh reciente de facturas preserva lineas y solo actualiza cabecera',()=>{
  assert.match(sync,/export async function refreshRecentPurchaseInvoiceMetadata/);
  assert.match(sync,/motil_refresh_laudus_purchase_invoice_metadata/);
  assert.match(sync,/invoiceLinesPreserved: true/);
  assert.match(sync,/MIN_LAUDUS_API_BUDGET_RESERVE/);
  assert.match(invoiceMetadataMigration,/invoice_lines_preserved/);
  assert.doesNotMatch(invoiceMetadataMigration,/delete from integration\.laudus_purchase_invoice_lines/i);
  assert.doesNotMatch(invoiceMetadataMigration,/canonical\./);
});
