import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const assistant = fs.readFileSync('lib/intelligence/operational-domain-assistant.ts','utf8');
const financeRoute = fs.readFileSync('app/api/finance/assistant/route.ts','utf8');
const finance = fs.readFileSync('app/dashboard/finanzas/page.tsx','utf8');
const proxy = fs.readFileSync('proxy.ts','utf8');

test('Daniel finance AI is grounded in canonical finance, forecast, aging and Laudus review evidence',()=>{
  assert.match(assistant,/canonical_finance_overview/);
  assert.match(assistant,/canonical_finance_suppliers/);
  assert.match(assistant,/procurement_accounts_payable_aging_summary_v1/);
  assert.match(assistant,/procurement_cash_forecast_summary_v1/);
  assert.match(assistant,/motil_laudus_finance_review_queue/);
  assert.match(assistant,/laudus_purchase_invoice_payment_status_service_v1/);
  assert.match(assistant,/laudus_aging/);
  assert.match(assistant,/laudus_supplier_pressure/);
  assert.match(assistant,/motil_laudus_fixed_asset_review_queue/);
  assert.match(assistant,/maintenance_asset_economic_history_v1/);
  assert.match(assistant,/asset_economics/);
  assert.match(assistant,/asset_reconciliation_opportunities/);
  assert.match(assistant,/blocked_missing_acquisition_cost/);
  assert.match(assistant,/historical_backfill_required/);
  assert.match(assistant,/document_lookup_required/);
  assert.match(assistant,/Laudus es fuente financiera trazable/);
});

test('finance AI keeps contractual forecast separate from statistical prediction',()=>{
  assert.match(assistant,/Forecast contractual basado en CxP y fechas de vencimiento/);
  assert.match(assistant,/No es predicción estadística/);
  assert.match(assistant,/No declarar predicción estadística, anomalía probabilística ni confianza sin modelo validado/);
});

test('finance assistant remains available without duplicating a second copilot inside the summary',()=>{
  assert.match(financeRoute,/MODULE_KEYS\.FIN_FINANZAS/);
  assert.match(financeRoute,/operational-domain-assistant|assistant/i);
  assert.doesNotMatch(finance,/Pregunta sobre caja, proveedores o vencimientos/);
  assert.doesNotMatch(finance,/Qué revisar/);
  assert.doesNotMatch(finance,/Qué viene/);
  assert.doesNotMatch(finance,/Fuera de patrón/);
  assert.match(finance,/LaudusFinanceControlCard/);
  assert.doesNotMatch(proxy,/path === '\/api\/intelligence\/executive-assistant'/);
});

test('finance copilot remains advisory and read only',()=>{
  assert.match(assistant,/No ejecutes compras, reservas, ajustes de stock, recepciones, aprobaciones, cambios de plan, cierres, pagos/);
  assert.match(assistant,/Puedes preparar una recomendación para validación humana/);
  assert.match(assistant,/no presentes a MOTIL como reemplazo contable/);
});
