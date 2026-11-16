import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('missing optional freshness view does not fail the whole stock-readiness endpoint', async () => {
 const code=await readFile(new URL('../lib/integrations/laudus/inventory-readiness.ts',import.meta.url),'utf8');
 assert.match(code,/missingFreshnessView/);
 assert.match(code,/freshnessAvailable: freshnessSummary !== null/);
 assert.match(code,/freshMismatches1d: freshnessSummary\?\.fresh_mismatches_1d == null \? null/);
});
test('local negative queue distinguishes warehouse stock from total product and signals partial data', async () => {
 const card=await readFile(new URL('../components/integrations/laudus-inventory-readiness-card.tsx',import.meta.url),'utf8');
 const page=await readFile(new URL('../app/dashboard/bodega/page.tsx',import.meta.url),'utf8');
 assert.match(card,/Saldo bodega/); assert.match(card,/Total producto/);
 assert.match(card,/row.warehouseCode/);assert.match(card,/negativePositionsPartial/);
 assert.match(page,/LaudusNegativeStockQueue/);
});
test('warehouse negative SQL includes local shortfalls despite positive total but excludes noninventory', async () => {
 const sql=await readFile(new URL('../supabase/migrations/20261116223000_laudus_local_negative_stock_and_freshness.sql',import.meta.url),'utf8');
 assert.match(sql,/p\.warehouse_stock < 0/);
 assert.match(sql,/lp\.inventory_eligibility = 'eligible'/);
 assert.doesNotMatch(sql,/r\.laudus_stock < 0/);
 assert.match(sql,/security_invoker = true/);
 assert.match(sql,/laudus_inventory_freshness_summary_service_v1/);
 assert.match(sql,/grant select on public\.laudus_negative_stock_positions_service_v1 to service_role/);
});
