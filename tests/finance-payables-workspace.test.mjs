import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260827191000_add_supplier_accounts_payable_and_cash_reconciliation_v1.sql','utf8');
const treasuryMigration = fs.readFileSync('supabase/migrations/20260827191500_add_treasury_aging_alerts_and_tenant_safe_rpc_v1.sql','utf8');
const route = fs.readFileSync('app/api/finance/payables/route.ts','utf8');
const page = fs.readFileSync('app/dashboard/finanzas/pagos/page.tsx','utf8');
const layout = fs.readFileSync('app/dashboard/finanzas/layout.tsx','utf8');

test('approved supplier invoices create payable obligations without inventing due dates',()=>{
  assert.match(migration,/status='approved'/);
  assert.match(migration,/awaiting_due_date/);
  assert.match(migration,/due_date date null/);
});

test('payments cannot exceed approved balance and require due date',()=>{
  assert.match(migration,/Defina vencimiento antes de registrar pago/);
  assert.match(migration,/El pago supera el saldo aprobado/);
  assert.match(migration,/partially_paid/);
});

test('bank reconciliation is explicit and does not alter cost recognition',()=>{
  assert.match(migration,/reconciliation_reference/);
  assert.match(migration,/Pago ya conciliado/);
  assert.match(page,/La conciliación no reconoce gasto/);
});

test('finance payables API is finance-authorized and tenant scoped',()=>{
  assert.match(route,/MODULE_KEYS\.FIN_FINANZAS/);
  assert.match(route,/p_organization_id: context\.organizationId/);
  assert.match(route,/record_supplier_payment_v2/);
  assert.match(route,/reconcile_supplier_payment_v2/);
  assert.match(treasuryMigration,/organization_id=p_organization_id/);
  assert.match(treasuryMigration,/revoke execute on function public\.record_supplier_payment_v1/);
});

test('finance navigation exposes the payments workspace with honest empty states',()=>{
  assert.match(layout,/\/dashboard\/finanzas\/pagos/);
  assert.match(page,/No hay cuentas por pagar aprobadas en MOTIL/);
  assert.match(page,/Esto no significa que Laudus no tenga exposición abierta/);
  assert.match(page,/CxP MOTIL pendientes/);
  assert.match(page,/No hay pagos registrados/);
});


test('payables workspace reduces overdue review by supplier concentration',()=>{
  assert.match(page,/Concentración vencida/);
  assert.match(page,/Proveedores que explican la mayor exposición/);
  assert.match(page,/Top 5 concentra/);
  assert.match(page,/Prioriza revisión por proveedor antes de recorrer factura por factura/);
  assert.match(page,/No implica prioridad automática de pago ni evaluación de riesgo del proveedor/);
});


test('treasury exposes Laudus open exposure as read-only evidence without creating actionable MOTIL payables',()=>{
  assert.match(route,/laudus_purchase_invoice_payment_status_service_v1/);
  assert.match(route,/observedPayables/);
  assert.match(route,/readOnly: true/);
  assert.match(route,/No constituye una CxP aprobada en MOTIL ni habilita pagos/);
  assert.match(page,/CxP visible desde Laudus/);
  assert.match(page,/Laudus · sólo lectura/);
  assert.match(page,/No se puede registrar pago desde estas partidas hasta que la obligación sea promovida y aprobada en MOTIL/);
});


test('Laudus observed payables summary reads beyond the default 1000 row cap without expanding UI detail',()=>{
  assert.match(route,/observedPageSize = 1000/);
  assert.match(route,/observedMaxRows = 5000/);
  assert.match(route,/\.range\(from, from \+ observedPageSize - 1\)/);
  assert.match(route,/if \(page\.length < observedPageSize\) break/);
  assert.match(route,/items: observedRows\.slice\(0, 50\)/);
});


test('treasury exposes Laudus overapplied payments as read-only review evidence',()=>{
  assert.match(route,/paymentAnomalies/);
  assert.match(route,/exact_double_total/);
  assert.match(route,/additional_partial_excess/);
  assert.match(route,/MOTIL no corrige ni revierte estos pagos automáticamente/);
  assert.match(page,/Pagos aplicados por sobre factura/);
  assert.match(page,/Duplicado exacto/);
  assert.match(page,/Pago adicional parcial/);
  assert.match(page,/No corregir automáticamente/);
});
