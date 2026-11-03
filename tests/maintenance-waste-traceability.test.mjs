import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20261103182000_maintenance_waste_traceability.sql', import.meta.url), 'utf8');
const api = readFileSync(new URL('../app/api/maintenance/work-orders/[id]/waste/route.ts', import.meta.url), 'utf8');
const registerApi = readFileSync(new URL('../app/api/maintenance/waste/route.ts', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../components/maintenance/work-order-waste-panel.tsx', import.meta.url), 'utf8');
const register = readFileSync(new URL('../components/maintenance/maintenance-waste-register.tsx', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../components/maintenance/work-order-detail.tsx', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../app/dashboard/mantenimiento/layout.tsx', import.meta.url), 'utf8');

test('waste records are canonical, tenant isolated and linked to work orders', () => {
  assert.match(migration, /create table if not exists public\.maintenance_waste_records/);
  assert.match(migration, /work_order_id uuid not null references public\.maintenance_work_orders\(id\)/);
  assert.match(migration, /organization_id uuid not null/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /current_application_user_id/);
  assert.match(migration, /does not certify regulatory compliance/);
});

test('waste lifecycle is monotonic and does not claim automatic compliance', () => {
  assert.match(api, /\['generated','stored','removed','closed'\]/);
  assert.match(api, /El estado del residuo no puede retroceder/);
  assert.match(api, /complianceCertified: false/);
  assert.match(registerApi, /complianceCertified: false/);
  assert.doesNotMatch(api, /complianceCertified: true/);
});

test('removal requires storage and destination evidence', () => {
  assert.match(api, /Registra la ubicación de almacenamiento antes de continuar/);
  assert.match(api, /Registra el destino del retiro antes de continuar/);
  assert.match(api, /transfer_document_ref/);
  assert.match(api, /transporter_name/);
});

test('work order UI and central maintenance register expose the same canonical waste flow', () => {
  assert.match(detail, /WorkOrderWastePanel/);
  assert.match(layout, /\/dashboard\/mantenimiento\/residuos/);
  assert.match(panel, /Trazabilidad operacional del residuo generado por esta OT/);
  assert.match(register, /Generados/);
  assert.match(register, /Por retirar/);
  assert.match(register, /Historial/);
});

test('execution registration stays bounded to allowed waste classes and units', () => {
  assert.match(api, /used_oil/);
  assert.match(api, /hydraulic_fluid/);
  assert.match(api, /contaminated_absorbent/);
  assert.match(api, /hazardous/);
  assert.match(api, /non_hazardous/);
  assert.match(api, /to_classify/);
  assert.match(api, /allowedUnits/);
  assert.match(api, /quantity <= 0/);
});
