import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const closeRoute = fs.readFileSync('app/api/maintenance/work-orders/[id]/close/route.ts','utf8');
const closureRoute = fs.readFileSync('app/api/maintenance/work-orders/[id]/fluids/closure/route.ts','utf8');
const closeQueue = fs.readFileSync('app/api/maintenance/work-order-close-queue/route.ts','utf8');
const closeUi = fs.readFileSync('components/maintenance/progressive-work-order-close-queue.tsx','utf8');
const reviewRoute = fs.readFileSync('app/api/maintenance/work-orders/[id]/review/route.ts','utf8');
const reviewUi = fs.readFileSync('components/maintenance/work-order-evidence-and-approval.tsx','utf8');
const organizationContext = fs.readFileSync('lib/api/organization-context.ts','utf8');

test('only assigned mechanic can declare and close OT fluid data', () => {
  assert.match(closureRoute, /requireAssignedMaintenanceExecution/);
  assert.match(closureRoute, /if \(!assigned\.ok\) return assigned\.response/);
  assert.match(closeRoute, /requireAssignedMaintenanceExecution/);
  assert.match(closeRoute, /if \(!executionAccess\.ok\) return executionAccess\.response/);
  assert.doesNotMatch(closeRoute, /accessLevel !== 'ED'/);
});

test('fluid declaration is mandatory before close and becomes stale if fluid records change', () => {
  assert.match(closeRoute, /fluid_closure_declared/);
  assert.match(closeRoute, /mecánico asignado debe confirmar los aceites\/fluidos/);
  assert.match(closeRoute, /currentUsageCount !== declaredUsageCount/);
  assert.match(closeQueue, /record_fluid_closure/);
  assert.match(closeQueue, /ready_to_close: Boolean\(row\.ready_to_close\) && hasFluidClosureDeclaration/);
});

test('mechanic must explicitly declare fluid and residue state', () => {
  assert.match(closureRoute, /typeof body\.fluids_used !== 'boolean'/);
  assert.match(closureRoute, /waste_status/);
  assert.match(closureRoute, /none_recovered/);
  assert.match(closureRoute, /not_applicable/);
  assert.match(closureRoute, /linkedWasteCount < 1/);
  assert.match(closeUi, /¿Se utilizaron aceites o fluidos en esta OT\?/);
  assert.match(closeUi, /Residuo recuperado y registrado/);
  assert.match(closeUi, /No se recuperó residuo/);
});

test('Ariel is the reviewer and sees mechanic fluid evidence before approval', () => {
  assert.match(reviewRoute, /String\(data\.full_name \|\| ''\) === 'Ariel López'/);
  assert.match(reviewRoute, /Ariel López debe revisar y aprobar la OT/);
  assert.match(reviewRoute, /fluid_closure_declared/);
  assert.match(reviewRoute, /declared_by_assigned_executor/);
  assert.match(reviewUi, /Aceites y residuos/);
  assert.match(reviewUi, /Registrado por mecánico/);
  assert.match(reviewUi, /Ariel López revisa la evidencia, los aceites\/fluidos y el residuo declarado por el mecánico/);
});


test('oil quantity is requested only when mechanic confirms fluid use', () => {
  assert.match(closeUi, /fluidUsedChoice === 'yes'/);
  assert.match(closeUi, /<WorkOrderFluidUsagePanel/);
  assert.match(closeUi, /Si eliges “No”, no se solicitará cantidad/);
  assert.match(closeUi, /No se utilizaron aceites ni fluidos\. No se requiere registrar litros ni residuos\./);
  assert.match(closeUi, /Confirmar sin uso de aceites/);
  assert.match(closureRoute, /if \(body\.fluids_used && usageCount < 1\)/);
  assert.match(closureRoute, /if \(!body\.fluids_used && usageCount > 0\)/);
});


test('assigned mechanic fluid routes bypass only the coarse maintenance role gate', () => {
  assert.match(organizationContext, /timer\|close\|evidence\|standard-plan\|offline-notes\|fluids/);
  assert.match(organizationContext, /fluids\\\/closure/);
  assert.match(closureRoute, /requireAssignedMaintenanceExecution/);
  assert.match(closureRoute, /if \(!assigned\.ok\) return assigned\.response/);
});
