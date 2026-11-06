import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const skill = await readFile(new URL('../skills/motil-legal-contract-control/SKILL.md', import.meta.url), 'utf8');
const dataModel = await readFile(new URL('../skills/motil-legal-contract-control/references/data-model.md', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../skills/motil-legal-contract-control/references/workflow.md', import.meta.url), 'utf8');
const sourceIntake = await readFile(new URL('../skills/motil-legal-contract-control/references/source-intake.md', import.meta.url), 'utf8');
const catalog = await readFile(new URL('../lib/motil-ai/skills/catalog.ts', import.meta.url), 'utf8');
const router = await readFile(new URL('../lib/motil-ai/skills/router.ts', import.meta.url), 'utf8');
const prompts = await readFile(new URL('../lib/motil-ai/skills/prompt-suggestions.ts', import.meta.url), 'utf8');
const runtime = await readFile(new URL('../lib/motil-ai/skills/runtime-availability.ts', import.meta.url), 'utf8');
const endpoint = await readFile(new URL('../app/api/motil-ai/skills/availability/route.ts', import.meta.url), 'utf8');
const orchestrator = await readFile(new URL('../lib/motil-ai/skills/orchestrator.ts', import.meta.url), 'utf8');

test('MOTIL Legal contract control skill preserves financial truth boundaries', () => {
  assert.match(skill, /No convertir `facturado` en `pagado`/);
  assert.match(skill, /No convertir `% avance` en autorizacion de pago/);
  assert.match(skill, /nunca ejecutar pagos|ejecutar transferencias/i);
  assert.match(dataModel, /laudus_purchase_invoice_payment_status_service_v1/);
  assert.match(dataModel, /proveedor Laudus exacto \+ `doc_number` exacto/);
  assert.match(workflow, /paid_with_retention/);
  assert.match(workflow, /Gerencia\/Finanzas conserva autoridad/);
});

test('MOTIL AI registers and routes the Legal control skill', () => {
  assert.match(catalog, /legal-contract-payment-control/);
  assert.match(catalog, /domain: 'legal'/);
  assert.match(router, /que falta pagar/);
  assert.match(router, /avance contractual/);
  assert.match(prompts, /¿Qué contratos, hitos o pagos requieren atención de Legal hoy\?/);
  assert.match(orchestrator, /legal-contract-payment-control/);
  assert.match(orchestrator, /laudus-source-reconciliation/);
});

test('Legal skill runtime is permission scoped and evidence gated', () => {
  assert.match(runtime, /'legal' \| 'data_health'/);
  assert.match(runtime, /canLegal/);
  assert.match(runtime, /legalContracts/);
  assert.match(runtime, /legalInvoiceEvidence/);
  assert.match(endpoint, /MODULE_KEYS\.LEGAL_MODULO/);
  assert.match(endpoint, /legalAccess\.authorized \? 'legal' : null/);
});

test('Legal skill remains advisory and does not add autonomous payment execution', () => {
  assert.match(skill, /No puede:/);
  assert.match(skill, /ejecutar transferencias/);
  assert.match(skill, /aprobar estados de pago/);
});


test('Legal skill reads fresh Elias email, attachments and meeting evidence before analysis', () => {
  assert.match(skill, /Preflight obligatorio/);
  assert.match(skill, /Gmail de Elías|Gmail: correos enviados\/recibidos/i);
  assert.match(skill, /adjuntos relevantes/i);
  assert.match(skill, /notas de reunión/i);
  assert.match(sourceIntake, /pago está programado para esta semana/);
  assert.match(sourceIntake, /no marcar como pagado/);
  assert.match(sourceIntake, /evidencia más reciente/);
});
