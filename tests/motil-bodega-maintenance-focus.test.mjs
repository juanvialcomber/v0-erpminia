import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { summarizeMaterialAttention } from '../lib/maintenance/material-attention.mjs';

const read = (file) => readFileSync(resolve(process.cwd(), file), 'utf8');
const sample = (id, priority, scheduled_date = null) => ({
  id,
  priority,
  scheduled_date,
  work_order_number: id,
  title: 'OT sintética ' + id,
  status: 'open',
});

test('materials-review candidates never count an OT with recorded requirements', () => {
  const result = summarizeMaterialAttention([
    sample('critical-1', 'critical'),
    sample('high-2', 'high'),
    sample('normal-3', 'medium'),
  ], new Set(['high-2']));
  assert.equal(result.activeOrdersReviewed, 3);
  assert.equal(result.requirementsRegisteredOrders, 1);
  assert.equal(result.withoutRegisteredRequirements, 2);
  assert.deepEqual(result.reviewCandidates.map((row) => row.workOrderId), ['critical-1', 'normal-3']);
});

test('a zero-material declaration is not fabricated and review order is deterministic', () => {
  const result = summarizeMaterialAttention([
    sample('medium', 'medium', '2026-11-21'),
    sample('urgent', 'critical', '2026-11-25'),
    sample('high-later', 'high', '2026-11-29'),
    sample('high-earlier', 'high', '2026-11-22'),
  ], new Set(), 3);
  assert.equal(result.withoutRegisteredRequirements, 4);
  assert.deepEqual(result.reviewCandidates.map((row) => row.workOrderId), ['urgent', 'high-earlier', 'high-later']);
  assert.equal(result.reviewCandidates.length, 3);
});

test('empty and complete review sets show exact zero counts', () => {
  assert.deepEqual(summarizeMaterialAttention([], new Set()), {
    activeOrdersReviewed: 0,
    requirementsRegisteredOrders: 0,
    withoutRegisteredRequirements: 0,
    reviewCandidates: [],
  });
  const result = summarizeMaterialAttention([sample('ot-1', 'high')], new Set(['ot-1']));
  assert.equal(result.withoutRegisteredRequirements, 0);
  assert.equal(result.requirementsRegisteredOrders, 1);
});

test('Bodega progress is read-only, tenant scoped, count based and does not mutate Laudus', () => {
  const api = read('app/api/bodega/stock-verification/route.ts');
  const page = read('app/dashboard/bodega/verificar-stock/page.tsx');
  assert.match(api, /params\.get\('summary'\) === '1'/);
  assert.match(api, /const states = \['pending', 'matched', 'difference', 'source_changed'\]/);
  assert.match(api, /head: true, count: 'exact'/);
  assert.match(api, /eq\('organization_id', context\.organizationId\)/);
  assert.match(api, /neq\('source_quantity', 0\)/);
  assert.match(api, /query = query\.or\('sku\.ilike\.%'/);
  assert.match(api, /description\.ilike\./);
  assert.match(page, /stock-verification\?summary=1/);
  assert.match(page, /Math\.round\(\(verifiedNow \/ progress\.counts\.total\) \* 100\)/);
  assert.match(page, /progress\.counts\.total > 0/);
  assert.match(page, /mutate\(\), refreshProgress\(\)/);
  assert.match(api, /readOnlyStock: true/);
  assert.doesNotMatch(api.slice(0, api.indexOf('export async function POST')), /\.insert\(|\.update\(|\.delete\(/);
});

test('maintenance attention is restricted to management scope and keeps materials optional', () => {
  const api = read('app/api/maintenance/materials-attention/route.ts');
  const page = read('components/maintenance/materials-attention.tsx');
  const home = read('components/dashboard/maintenance-home.tsx');
  const detail = read('components/maintenance/work-order-detail.tsx');
  assert.match(api, /canBypassAssignedMaintenanceExecution/);
  assert.match(api, /canBypassAssignedMaintenanceExecution\(context, accessLevel\)/);
  assert.match(api, /MODULE_KEYS\.MANT_OPERACIONES/);
  assert.match(api, /eq\('organization_id', context\.organizationId\)/);
  assert.match(api, /neq\('status', 'cancelled'\)/);
  assert.match(api, /limit\(200\)/);
  assert.match(api, /offset \+ 50/);
  assert.match(api, /mandatory: false/);
  assert.doesNotMatch(api, /\.insert\(|\.update\(|\.delete\(/);
  assert.match(home, /showArielCockpit \? <MaintenanceMaterialsAttention/);
  assert.match(page, /Sin requerimiento no significa faltante/);
  assert.match(page, /#materiales-ot/);
  assert.match(detail, /id="materiales-ot"/);
  assert.match(detail, /<WorkOrderMaterialCoverage workOrderId=\{id\}/);
  assert.match(detail, /<WorkOrderEvidenceAndApproval/);
  assert.match(detail, /WorkOrderTimer/);
});

test('the work order closure itself is not changed by the coordination improvements', () => {
  const closeRoute = read('app/api/maintenance/work-orders/[id]/close/route.ts');
  assert.match(closeRoute, /requireAssignedMaintenanceExecution/);
  assert.match(closeRoute, /isFluidClosureDeclarationCurrent/);
  assert.match(closeRoute, /close_work_order_safely/);
  assert.match(closeRoute, /evidenceCount/);
});
