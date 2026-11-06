import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const layout = await readFile(new URL('../app/dashboard/legal/layout.tsx', import.meta.url), 'utf8');
const home = await readFile(new URL('../app/dashboard/legal/page.tsx', import.meta.url), 'utf8');
const assistant = await readFile(new URL('../app/dashboard/legal/asistente/page.tsx', import.meta.url), 'utf8');
const skill = await readFile(new URL('../skills/motil-legal-contract-control/SKILL.md', import.meta.url), 'utf8');
const workspace = await readFile(new URL('../skills/motil-legal-contract-control/references/workspace.md', import.meta.url), 'utf8');

test('Elias workspace primary navigation follows daily jobs instead of technical modules', () => {
  assert.match(layout, /label: 'Hoy'/);
  assert.match(layout, /label: 'Contratos y pagos'/);
  assert.match(layout, /label: 'Proveedores'/);
  assert.match(layout, /label: 'Asistente'/);
  assert.match(layout, /label: 'Evidencia Laudus'/);
  assert.match(layout, /Legal \/ Elías/);
});

test('Legal home surfaces the four primary Elias work areas', () => {
  assert.match(home, /Trabajo principal de Legal/);
  assert.match(home, /Contratos y pagos/);
  assert.match(home, /Cumplimiento mensual, documentos y subsanaciones/);
  assert.match(home, /Preguntar qué falta, qué cambió y cuál es la siguiente acción/);
});

test('Legal assistant copy covers contracts payments providers and documents', () => {
  assert.match(assistant, /Asistente de Elías/);
  assert.match(assistant, /Contratos, avances, pagos, proveedores y documentos/);
  assert.match(assistant, /¿Qué contratos requieren atención hoy\?/);
  assert.match(assistant, /¿Qué falta pagar de IO-01\?/);
});

test('Legal skill documents the workspace operating model from the Nov 6 requirements', () => {
  assert.match(skill, /references\/workspace\.md/);
  assert.match(workspace, /cálculo automático de estados de pago y fechas/);
  assert.match(workspace, /semáforo verde\/amarillo\/rojo/);
  assert.match(workspace, /foto, PDF, email, WhatsApp o planilla/);
  assert.match(workspace, /aviso a Gerencia cuando una transferencia\/pago esté listo/);
  assert.match(workspace, /No exponer "Laudus", "staging", "sync", "RLS", "canonical"/);
});
