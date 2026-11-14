import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync('app/api/maintenance/work-order-close-queue/route.ts', 'utf8');

test('fluid closure evidence covers the entire queue without truncation at 250 OT', () => {
  assert.match(api, /for \(let offset = 0; offset < rowIds\.length; offset \+= 50\)/);
  assert.match(api, /rowIds\.slice\(offset, offset \+ 50\)/);
  assert.match(api, /\.in\('work_order_id', batch\)/);
  assert.doesNotMatch(api, /rowIds\.slice\(0, 250\)/);
});

test('each batch uses tenant and event filters, and transport errors fail closed', () => {
  assert.match(api, /\.eq\('organization_id', context\.organizationId\)\s*\.eq\('event_type', 'fluid_closure_declared'\)\s*\.in\('work_order_id', batch\)/);
  assert.match(api, /if \(fluidDeclarationError\) throw fluidDeclarationError/);
  assert.match(api, /fluidDeclarationIds\.add\(String\(event\.work_order_id\)\)/);
  assert.match(api, /ready_to_close: Boolean\(row\.ready_to_close\) && hasFluidClosureDeclaration/);
});

test('the route still resolves access via the existing role and site scope', () => {
  assert.match(api, /getOrganizationContext\(request\)/);
  assert.match(api, /getModuleAccessLevel\(context\.userId, context\.role, MODULE_KEYS\.MANT_OPERACIONES\)/);
  assert.match(api, /resolveWorkshopHeadScope\(context\)/);
  assert.match(api, /workshopHeadOrderFilter\(workshopScope\)/);
});
