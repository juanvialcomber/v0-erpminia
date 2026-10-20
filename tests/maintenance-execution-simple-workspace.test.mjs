import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const detail = readFileSync('components/maintenance/work-order-detail.tsx', 'utf8');
const flow = readFileSync('components/maintenance/mobile-work-order-flow.tsx', 'utf8');

test('execution roles stay in the dedicated simple work-order workspace on every viewport', () => {
  assert.match(detail, /if \(isExecution\) \{/);
  assert.match(detail, /<MobileWorkOrderFlow/);
  assert.doesNotMatch(flow, /md:hidden/);
  assert.match(flow, /max-w-xl/);
});

test('execution workspace exposes only job context, timer and controlled finish action', () => {
  assert.match(flow, />Equipo</);
  assert.match(flow, />Qué hacer</);
  assert.match(flow, />Tiempo registrado</);
  assert.match(flow, /Iniciar trabajo/);
  assert.match(flow, /Pausar trabajo/);
  assert.match(flow, /Reanudar trabajo/);
  assert.match(flow, /Terminar y registrar evidencia/);
  assert.match(flow, /causa, acción preventiva, horas reales y evidencia de horómetro/);
});

test('administrative detail remains outside the execution-role early return', () => {
  const executionReturn = detail.indexOf('if (isExecution)');
  const finance = detail.indexOf('{t.financial.title}');
  const materials = detail.indexOf('<WorkOrderMaterialCoverage');
  const parts = detail.indexOf('<WorkOrderPartsPanel');
  const purchasing = detail.indexOf('<WorkOrderPurchasingFlow');
  const timeline = detail.indexOf('<EntityTimeline', executionReturn);

  assert.ok(executionReturn >= 0);
  assert.ok(finance > executionReturn);
  assert.ok(materials > executionReturn);
  assert.ok(parts > executionReturn);
  assert.ok(purchasing > executionReturn);
  assert.ok(timeline > executionReturn);
});
