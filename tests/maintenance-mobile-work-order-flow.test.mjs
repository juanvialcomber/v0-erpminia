import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../components/maintenance/work-order-detail.tsx', import.meta.url), 'utf8');
const flow = await readFile(new URL('../components/maintenance/mobile-work-order-flow.tsx', import.meta.url), 'utf8');

test('only execution maintenance profiles receive the condensed work-order workspace', () => {
  assert.match(page, /viewer\?\.mode === 'execution'/);
  assert.match(page, /if \(isExecution\)/);
  assert.match(page, /<MobileWorkOrderFlow/);
  assert.match(page, /assetName=\{workOrder\.asset_name \|\| workOrder\.asset_code\}/);
  assert.match(page, /description=\{workOrder\.description\}/);
  assert.match(page, /assignedPersonId=\{workOrder\.assigned_person_id\}/);
  assert.doesNotMatch(page, /isExecutionMobile \? 'hidden md:block' : undefined/);
});

test('the terrain flow blocks start before a canonical person is assigned', () => {
  assert.match(flow, /hasCanonicalAssignee = Boolean\(assignedPersonId\)/);
  assert.match(flow, /Falta asignar responsable/);
  assert.match(flow, /vinculada a una persona operativa/);
  assert.match(flow, /canEdit && hasCanonicalAssignee && status !== 'completed'/);
});

test('the terrain flow preserves the start pause resume and evidence-gated close sequence', () => {
  assert.match(flow, /Iniciar trabajo/);
  assert.match(flow, /Pausar trabajo/);
  assert.match(flow, /Reanudar trabajo/);
  assert.match(flow, /Terminar y registrar evidencia/);
  assert.match(flow, /Fotos de la OT/);
  assert.match(flow, /Agregar fotos/);
  assert.match(flow, /multiple/);
  assert.doesNotMatch(flow, /capture="environment"/);
  assert.match(flow, /fallbackForm = new FormData\(\)/);
  assert.match(flow, /fallbackForm\.append\('file', file\)/);
  assert.doesNotMatch(flow, /Tag de evidencia/);
  assert.doesNotMatch(flow, /evidenceTag/);
  assert.match(flow, /ordenes-trabajo\/cierre\?workOrderId=/);
  assert.match(flow, /causa, acción preventiva, horas reales y evidencia de horómetro/);
  assert.doesNotMatch(flow, /status:\s*'completed'/);
});
