import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const widgetUrl = new URL('../components/intelligence/senior-assistant-widget.tsx', import.meta.url);
const runtimeUrl = new URL('../lib/intelligence/operational-domain-assistant.ts', import.meta.url);
const inventoryRouteUrl = new URL('../app/api/inventory/assistant/route.ts', import.meta.url);
const procurementRouteUrl = new URL('../app/api/procurement/assistant/route.ts', import.meta.url);
const productionRouteUrl = new URL('../app/api/production/assistant/route.ts', import.meta.url);
const financeRouteUrl = new URL('../app/api/finance/assistant/route.ts', import.meta.url);
const inventoryIntelligenceUrl = new URL('../app/api/inventory/intelligence/route.ts', import.meta.url);

test('inventory procurement production and finance use the shared specialist conversation body', async () => {
  const widget = await readFile(widgetUrl, 'utf8');
  assert.match(widget, /\/api\/inventory\/assistant/);
  assert.match(widget, /\/api\/procurement\/assistant/);
  assert.match(widget, /\/api\/production\/assistant/);
  assert.match(widget, /\/api\/finance\/assistant/);
  assert.match(widget, /SpecialistAssistantBody/);
  assert.match(widget, /inventoryToolCopy/);
  assert.match(widget, /procurementToolCopy/);
  assert.match(widget, /productionToolCopy/);
  assert.match(widget, /financeToolCopy/);
});

test('local module permission is mandatory and cross-domain expansion is permission bounded', async () => {
  const [inventoryRoute, procurementRoute, productionRoute, financeRoute, inventoryIntelligence] = await Promise.all([
    readFile(inventoryRouteUrl, 'utf8'),
    readFile(procurementRouteUrl, 'utf8'),
    readFile(productionRouteUrl, 'utf8'),
    readFile(financeRouteUrl, 'utf8'),
    readFile(inventoryIntelligenceUrl, 'utf8'),
  ]);

  assert.match(inventoryRoute, /MODULE_KEYS\.BODEGA_INVENTARIO/);
  assert.match(inventoryRoute, /MODULE_KEYS\.FIN_COMPRAS/);
  assert.match(inventoryRoute, /procurementAccess\.authorized \? \['inventory', 'procurement'\] : \['inventory'\]/);

  assert.match(procurementRoute, /MODULE_KEYS\.FIN_COMPRAS/);
  assert.match(procurementRoute, /MODULE_KEYS\.BODEGA_INVENTARIO/);
  assert.match(procurementRoute, /inventoryAccess\.authorized \? \['procurement', 'inventory'\] : \['procurement'\]/);

  assert.match(productionRoute, /MODULE_KEYS\.PROD_OPERACIONES/);
  assert.match(productionRoute, /MODULE_KEYS\.BODEGA_INVENTARIO/);
  assert.match(productionRoute, /MODULE_KEYS\.FIN_COMPRAS/);
  assert.match(productionRoute, /allowedDomains\.push\('inventory'\)/);
  assert.match(productionRoute, /allowedDomains\.push\('procurement'\)/);

  assert.match(financeRoute, /MODULE_KEYS\.FIN_FINANZAS/);
  assert.match(financeRoute, /MODULE_KEYS\.BODEGA_INVENTARIO/);
  assert.match(financeRoute, /MODULE_KEYS\.FIN_COMPRAS/);
  assert.match(financeRoute, /MODULE_KEYS\.PROD_OPERACIONES/);
  assert.match(financeRoute, /allowedDomains\.push\('inventory'\)/);
  assert.match(financeRoute, /allowedDomains\.push\('procurement'\)/);
  assert.match(financeRoute, /allowedDomains\.push\('production'\)/);

  assert.match(inventoryIntelligence, /requireModuleAccess\(request, MODULE_KEYS\.BODEGA_INVENTARIO\)/);
});

test('shared runtime stays read-only canonical freshness-aware and module-first', async () => {
  const runtime = await readFile(runtimeUrl, 'utf8');
  assert.match(runtime, /routeOperationalQuery\(message, \{ domain \}\)/);
  assert.match(runtime, /requiresExplicitAuthorization/);
  assert.match(runtime, /READ_ONLY/);
  assert.match(runtime, /canonical_inventory_current/);
  assert.match(runtime, /canonical_purchase_orders_current/);
  assert.match(runtime, /inventory_intelligence_overview_v1/);
  assert.match(runtime, /procurement_overview/);
  assert.match(runtime, /production_fine_copper_daily_v1/);
  assert.match(runtime, /production_fine_flow_daily_v1/);
  assert.match(runtime, /production_metallurgy_deterministic_v2/);
  assert.match(runtime, /production_source_fidelity_exceptions_v1/);
  assert.match(runtime, /finance_overview/);
  assert.match(runtime, /canonical_finance_cost_centers/);
  assert.match(runtime, /canonical_finance_suppliers/);
  assert.match(runtime, /procurement_accounts_payable_aging_summary_v1/);
  assert.match(runtime, /procurement_cash_forecast_summary_v1/);
  assert.match(runtime, /motil_laudus_finance_review_queue/);
  assert.match(runtime, /motil_laudus_fixed_asset_review_queue/);
  assert.match(runtime, /maintenance_asset_economic_history_v1/);
  assert.match(runtime, /maintenance_cost_by_cost_center_v1/);
  assert.match(runtime, /latest_snapshot_date/);
  assert.match(runtime, /latest_order_date/);
  assert.match(runtime, /latest_fine_copper_date/);
  assert.match(runtime, /overview_last_event_at/);
  assert.match(runtime, /latest_cost_center_event_at/);
  assert.match(runtime, /No presentes un snapshot antiguo como tiempo real/);
  assert.match(runtime, /separa valores reportados por fuente de cálculos determinísticos/);
  assert.match(runtime, /No interpretes presupuesto cero\/ausente como presupuesto aprobado igual a cero/);
  assert.match(runtime, /No ejecutes compras, reservas, ajustes de stock, recepciones, aprobaciones, cambios de plan, cierres, pagos/);
  assert.doesNotMatch(runtime, /service_role|SUPABASE_SERVICE_ROLE_KEY/);
});
