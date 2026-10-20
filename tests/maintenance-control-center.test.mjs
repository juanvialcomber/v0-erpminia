import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync('app/api/maintenance/control-center/route.ts','utf8');
const page = fs.readFileSync('components/dashboard/maintenance-home.tsx','utf8');
const dict = fs.readFileSync('lib/i18n/dictionaries.ts','utf8');

test('maintenance control center is maintenance-authorized and tenant scoped',()=>{
  assert.match(api,/MODULE_KEYS\.MANT_OPERACIONES/);
  assert.match(api,/eq\('organization_id', context\.organizationId\)/);
  assert.match(api,/work_order_close_readiness_v2/);
  assert.match(api,/preventive_maintenance_hour_status_v1/);
  assert.match(api,/maintenance_reliability_by_asset_v1/);
  assert.match(api,/drilling_maintenance_review_queue_v1/);
});

test('maintenance control center prioritizes factual action classes',()=>{
  assert.match(api,/operational_review/);
  assert.match(api,/preventive_overdue/);
  assert.match(api,/operational_blocker/);
  assert.match(api,/plan_step/);
  assert.match(api,/ready_to_close/);
  assert.match(api,/closure_evidence/);
  assert.match(api,/reliability/);
  assert.match(api,/actions\.sort/);
});

test('pending drilling observations become human review actions without auto-creating work orders',()=>{
  assert.match(api,/eq\('review_status', 'pending'\)/);
  assert.match(api,/eq\('has_linked_work_order', false\)/);
  assert.match(api,/pendingOperationalReviews/);
  assert.match(api,/outOfServiceOperationalReviews/);
  assert.match(api,/Equipo fuera de servicio/);
  assert.match(api,/ordenes-trabajo\/create/);
  assert.doesNotMatch(api,/plan_due_hour_preventive_work_order_v1/);
});

test('overdue preventive creates a planning action only while no work order exists',()=>{
  assert.match(api,/row\.hour_status === 'overdue' && !row\.generated_work_order_id/);
  assert.match(api,/unplannedOverdueHourSchedules/);
  assert.match(api,/plannedOverdueHourSchedules/);
  assert.doesNotMatch(api,/preventive_planned/);
  assert.doesNotMatch(api,/Continuar OT preventiva/);
});

test('control center excludes historical work orders from operational actions',()=>{
  assert.match(api,/maintenance_work_orders/);
  assert.match(api,/not\('created_by', 'is', null\)/);
  assert.match(api,/operationalWorkOrderIds/);
  assert.match(api,/historicalOpenWorkOrders/);
});

test('maintenance home stays role-aware while preserving direct factual routes',()=>{
  assert.match(dict,/Qué debo dejar listo hoy/);
  assert.match(dict,/Qué debo decidir hoy/);
  assert.match(dict,/Equipos y trabajos a seguir/);
  assert.match(dict,/Mantenimiento/);
  assert.match(dict,/Fuera de servicio/);
  assert.match(dict,/equipo\(s\) fuera de servicio requieren revisión humana/);
  assert.match(dict,/Preventivos pendientes/);
  assert.match(dict,/OT abiertas/);
  assert.match(dict,/Decisiones/);
  assert.match(page,/preventivo-horas/);
  assert.match(page,/ordenes-trabajo\/cierre/);
  assert.match(page,/horometros/);
  assert.match(page,/confiabilidad/);
});


test('Autopilot prepares actions but preserves human authority',()=>{
  assert.match(api,/autopilotPreparation/);
  assert.match(api,/requiresHumanDecision: true/);
  assert.match(api,/Supervisor valida la señal y decide si crea la OT/);
  assert.match(api,/Planificador confirma ventana, alcance y recursos/);
  assert.match(api,/Responsable autorizado revisa y ejecuta el cierre/);
  assert.match(page,/MOTIL prepara:/);
  assert.match(page,/Debe decidir:/);
});


test('maintenance control tower rotates six read-only views and is in navigation',()=>{
  const tower = fs.readFileSync('components/maintenance/maintenance-control-tower.tsx','utf8');
  const layout = fs.readFileSync('app/dashboard/mantenimiento/layout.tsx','utf8');
  const page = fs.readFileSync('app/dashboard/mantenimiento/torre-control/page.tsx','utf8');
  assert.match(tower,/Torre de control/);
  assert.match(tower,/Información para la oficina · actualización automática/);
  assert.match(tower,/const VIEWS = \[/);
  assert.match(tower,/setViewIndex\(\(index\) => \(index \+ 1\) % VIEWS\.length\)/);
  assert.match(tower,/requestFullscreen/);
  assert.match(tower,/\/api\/maintenance\/equipment/);
  assert.match(tower,/\/api\/maintenance\/preventive-hours/);
  assert.match(tower,/\/api\/maintenance\/work-orders\?scope=operational&limit=100/);
  assert.match(tower,/\/api\/maintenance\/runtime-readings/);
  assert.match(tower,/\/api\/maintenance\/equipment-costs/);
  assert.match(tower,/\/api\/maintenance\/sources/);
  assert.match(tower,/Control general de flota/);
  assert.match(tower,/Indicadores de gestión/);
  assert.match(tower,/Equipos detenidos/);
  assert.match(tower,/filter\(\(action\) => action\.kind !== 'operational_review'\)/);
  assert.match(layout,/\/dashboard\/mantenimiento\/torre-control/);
  assert.match(layout,/Torre de control/);
  assert.match(page,/MaintenanceControlTower/);
});


test('control tower follows Ariel six-screen structure without illustrative values',()=>{
  const tower = fs.readFileSync('components/maintenance/maintenance-control-tower.tsx','utf8');
  assert.match(tower,/Análisis operativo/);
  assert.match(tower,/Indicadores de gestión/);
  assert.match(tower,/Mantenimientos preventivos/);
  assert.match(tower,/Programación de trabajos/);
  assert.match(tower,/Control general de flota/);
  assert.match(tower,/Equipos detenidos/);
  assert.match(tower,/No hay equipos con detención validada en la fuente actual/);
  assert.match(tower,/Los equipos sin estado explícito no se presentan como detenidos/);
  assert.match(tower,/No se inventan vencimientos cuando la fuente no entrega una pauta activa/);
});
