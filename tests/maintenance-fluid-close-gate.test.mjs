import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const closeRoute = fs.readFileSync('app/api/maintenance/work-orders/[id]/close/route.ts','utf8');
const closureRoute = fs.readFileSync('app/api/maintenance/work-orders/[id]/fluids/closure/route.ts','utf8');
const fluidRoute = fs.readFileSync('app/api/maintenance/work-orders/[id]/fluids/route.ts','utf8');
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

test('Ariel or Mauricio can review mechanic fluid evidence before approval', () => {
  assert.match(reviewRoute, /new Set\(\['Ariel López', 'Mauricio Astudillo'\]\)/);
  assert.match(reviewRoute, /Ariel López o Mauricio Astudillo deben revisar y aprobar la OT/);
  assert.match(reviewRoute, /fluid_closure_declared/);
  assert.match(reviewRoute, /declared_by_assigned_executor/);
  assert.match(reviewUi, /Aceites y residuos/);
  assert.match(reviewUi, /Registrado por mecánico/);
  assert.match(reviewUi, /Ariel López o Mauricio Astudillo revisan la evidencia, los aceites\/fluidos y el residuo declarado por el mecánico/);
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


test('only assigned mechanic can enter fluid usage while supervisors remain read-only', () => {
  assert.match(fluidRoute, /const execution = await requireAssignedMaintenanceExecution\(context, id\)/);
  assert.match(fluidRoute, /if \(!execution\.ok\) return execution\.response/);
  assert.match(fluidRoute, /canEdit: execution\.ok/);
  assert.doesNotMatch(fluidRoute, /if \(level === 'ED'\) return true/);
});

test('already completed OT can receive an explicit late assigned-mechanic declaration without reopening', () => {
  assert.match(reviewUi, /fluidClosureEvidence\.data\?\.canDeclare/);
  assert.match(reviewUi, /Esta OT ya está cerrada/);
  assert.match(reviewUi, /Confirmar sin uso de aceites/);
  assert.match(reviewUi, /fluidUsedChoice === 'yes' \? \(/);
  assert.match(reviewUi, /<WorkOrderFluidUsagePanel/);
  assert.match(reviewUi, /review\.mutate\(\)/);
  assert.match(closureRoute, /requireAssignedMaintenanceExecution/);
  assert.match(closureRoute, /declaration_post_close: isPostClose/);
  assert.match(closureRoute, /Mecánico declaró que no utilizó aceites\/fluidos posteriormente al cierre/);
  assert.doesNotMatch(closureRoute, /\.update\(\{\s*status:/);
});

test('legacy OT closed before policy READY can be approved by authorized reviewers without invented fluid declaration', () => {
  assert.match(reviewRoute, /FLUID_DECLARATION_REQUIRED_FROM = Date\.parse\('2026-11-04T18:15:53\.252Z'\)/);
  assert.match(reviewRoute, /function isLegacyFluidDeclarationExempt/);
  assert.match(reviewRoute, /order\.status !== 'completed'/);
  assert.match(reviewRoute, /!order\.created_by \|\| !order\.closed_at/);
  assert.match(reviewRoute, /fluidDeclaration \|\| fluidUsageCount !== 0/);
  assert.match(reviewRoute, /closedAt < FLUID_DECLARATION_REQUIRED_FROM/);
  assert.match(reviewRoute, /hasValidFluidDeclaration \|\| legacyFluidDeclarationExemption/);
  assert.match(reviewRoute, /!legacyFluidDeclarationExemption && \(!fluidDeclaration/);
  assert.match(reviewRoute, /Excepción histórica: OT cerrada antes de la obligatoriedad/);
  assert.match(reviewUi, /no equivale a “No”/);
  assert.match(reviewUi, /legacyFluidDeclarationExemption/);
});

test('mechanic work order inbox retains completed and pending-supervisor orders', () => {
  const workOrdersUi = fs.readFileSync('components/maintenance/work-orders-queue.tsx', 'utf8');
  const workOrdersApi = fs.readFileSync('app/api/maintenance/work-orders/route.ts', 'utf8');
  assert.match(workOrdersUi, /viewerContext\.mode === 'execution'\) setViewFilter\('all'\)/);
  assert.match(workOrdersUi, /Tus OT cerradas siguen aquí/);
  assert.match(workOrdersUi, /isExecutorView \? 'Ver cierre' : t\.approval\.review/);
  assert.match(workOrdersUi, /approved \? t\.approval\.record/);
  assert.match(workOrdersUi, /viewFilter === 'all'\s*\? operational/);
  assert.match(workOrdersUi, /pendingApproval = completedOrders\.filter/);
  assert.match(workOrdersUi, /setViewFilter\(isExecutorView \? 'all' : 'active'\)/);
  assert.match(closeUi, /Ver mis órdenes cerradas/);
  assert.match(closeUi, /Las OT que cerraste siguen disponibles/);
  assert.match(workOrdersApi, /query = query\.eq\('assigned_person_id', executionScope\.personId\)/);
  assert.match(workOrdersApi, /approval_status: row\.status === 'completed' \? \(review\?\.status \|\| 'pending'\)/);
  assert.doesNotMatch(workOrdersApi.slice(workOrdersApi.indexOf('export async function GET('),workOrdersApi.indexOf('export async function POST(')), /not\('status', 'in'/);
});
