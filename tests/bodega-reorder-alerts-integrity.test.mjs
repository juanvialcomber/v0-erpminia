import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import typescript from 'typescript';

const routeSource = readFileSync(resolve(process.cwd(), 'app/api/bodega/reorder-alerts/route.ts'), 'utf8');

function makeHarness({ allowed = true } = {}) {
  let contextReads = 0;
  let inventoryReads = 0;
  const module = { exports: {} };
  const compiled = typescript.transpileModule(routeSource, {
    compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS },
    fileName: 'reorder-alerts-route.ts',
    reportDiagnostics: true,
  });
  assert.equal((compiled.diagnostics || []).filter((d) => d.category === typescript.DiagnosticCategory.Error).length, 0);
  const mockedModules = {
    'next/server': {
      NextResponse: { json(body, options = {}) { return { body, status: options.status || 200 }; } },
    },
    '@/lib/api/module-access': {
      MODULE_KEYS: { BODEGA_INVENTARIO: 'bodega_inventario' },
      requireModuleAccess: async (_request, key) => {
        assert.equal(key, 'bodega_inventario');
        return allowed ? { authorized: true, accessLevel: 'LEC' } :
          { authorized: false, response: { status: 403, body: { error: 'Sin acceso' } } };
      },
    },
    '@/lib/api/organization-context': {
      getOrganizationContext: async () => {
        contextReads += 1;
        return { ok: true, organizationId: 'organization-a', supabase: {} };
      },
    },
    '@/lib/api/inventory-stock-alerts': {
      listInventoryStockAlerts: async ({ organizationId }) => {
        inventoryReads += 1;
        assert.equal(organizationId, 'organization-a');
        return {
          items: [{
            id: 'part-1', part_code: 'P-001', part_name: 'Repuesto',
            quantity_on_hand: 12, reorder_level: 20, category: 'Repuestos',
            location_label: 'Bodega Central',
          }],
          dataSource: 'canonical', evaluatedItems: 1,
        };
      },
    },
  };
  runInNewContext(compiled.outputText, {
    module, exports: module.exports, console, Math,
    require(name) {
      assert.ok(mockedModules[name], 'Unexpected dependency: ' + name);
      return mockedModules[name];
    },
  });
  return { GET: module.exports.GET, reads: () => ({ contextReads, inventoryReads }) };
}

test('reorder alerts deny access without Bodega permission before reading inventory', async () => {
  const harness = makeHarness({ allowed: false });
  const response = await harness.GET({});
  assert.equal(response.status, 403);
  assert.equal(harness.reads().contextReads, 0);
  assert.equal(harness.reads().inventoryReads, 0);
});

test('reorder alerts never convert remaining units into days of stock coverage', async () => {
  const harness = makeHarness({ allowed: true });
  const response = await harness.GET({});
  assert.equal(response.status, 200);
  assert.equal(response.body.dataSource, 'canonical');
  const item = response.body.items_below_min_stock[0];
  assert.equal(item.quantity, 12);
  assert.equal(item.days_until_stockout, null);
  assert.equal(item.stockout_forecast_state, 'unavailable_without_consumption_rate');
  assert.equal(item.reorder_approval_required, true);
  assert.equal(response.body.total_alerts, 1);
  assert.equal(harness.reads().inventoryReads, 1);
});
