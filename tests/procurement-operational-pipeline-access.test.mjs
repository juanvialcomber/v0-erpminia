import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const routePath = new URL('../app/api/procurement/operational-pipeline/route.ts', import.meta.url);
const boardRoutePath = new URL('../app/api/pipeline/operational/route.ts', import.meta.url);
const operationalUiPath = new URL('../components/procurement/open-supply-needs.tsx', import.meta.url);
const progressiveUiPath = new URL('../components/procurement/progressive-procurement-workflow.tsx', import.meta.url);
const awardEvidenceUiPath = new URL('../components/procurement/award-evidence-panel.tsx', import.meta.url);
const policyMigrationPath = new URL('../supabase/migrations/20260829010000_enforce_operational_quote_policy_v1.sql', import.meta.url);

test('operational procurement pipeline requires compras read access', async () => {
  const source = await readFile(routePath, 'utf8');
  assert.match(source, /requireModuleAccess\(request, MODULE_KEYS\.FIN_COMPRAS\)/);
});

test('operational award is enforced by supplier quote policy in the database', async () => {
  const source = await readFile(policyMigrationPath, 'utf8');
  assert.match(source, /count\(distinct supplier_id\)/i);
  assert.match(source, /status in \('received','awarded'\)/i);
  assert.match(source, /quotation_exception_approved_by is not null/i);
  assert.match(source, /Política de cotizaciones incompleta/);
  assert.ok(source.indexOf('Política de cotizaciones incompleta') < source.indexOf('insert into public.procurement_operational_orders'));
});

test('award controls require an explicit human decision before issuing a purchase order', async () => {
  const operationalUi = await readFile(operationalUiPath, 'utf8');
  const progressiveUi = await readFile(progressiveUiPath, 'utf8');
  const awardEvidenceUi = await readFile(awardEvidenceUiPath, 'utf8');

  assert.match(operationalUi, /¿Adjudicar y emitir la orden de compra\?/);
  assert.match(operationalUi, /Confirmar adjudicación y emitir OC/);
  assert.match(operationalUi, /AlertDialog/);

  assert.match(progressiveUi, /procurement-award-decision/);
  assert.match(progressiveUi, /Revisar adjudicación/);
  assert.doesNotMatch(progressiveUi, /Confirmar adjudicación y emitir OC/);

  assert.match(awardEvidenceUi, /Motivo principal/);
  assert.match(awardEvidenceUi, /primaryReason/);
  assert.match(awardEvidenceUi, /Adjudicar y emitir OC/);
});

test('pipeline normalizes the legacy purchasing route to the canonical flow', async () => {
  const source = await readFile(boardRoutePath, 'utf8');
  assert.match(source, /requireModuleAccess\(request, MODULE_KEYS\.FIN_COMPRAS\)/);
  assert.match(source, /item\.next_action_href === '\/dashboard\/abastecimiento'/);
  assert.match(source, /'\/dashboard\/compras\/flujo'/);
});

test('operational procurement mutations require compras edit access', async () => {
  const source = await readFile(routePath, 'utf8');
  assert.match(source, /requireModuleAccess\(request, MODULE_KEYS\.FIN_COMPRAS, true\)/);
  assert.match(source, /action === 'create_quotation'/);
  assert.match(source, /action === 'award_quotation'/);
  assert.match(source, /action === 'receive_order'/);
});
