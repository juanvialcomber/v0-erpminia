import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const home = await readFile(new URL('../app/dashboard/legal/page.tsx', import.meta.url), 'utf8');
const assistant = await readFile(new URL('../app/dashboard/legal/asistente/page.tsx', import.meta.url), 'utf8');
const widget = await readFile(new URL('../components/intelligence/senior-assistant-widget.tsx', import.meta.url), 'utf8');
const api = await readFile(new URL('../app/api/legal/asistente/route.ts', import.meta.url), 'utf8');

test('Elias home keeps only daily work as the primary surface', () => {
  assert.match(home, /Qué necesita atención/);
  assert.match(home, /Contratos y pagos/);
  assert.match(home, /Cumplimiento mensual/);
  assert.match(home, /Transportistas/);
  assert.match(home, /Herramientas y áreas de soporte/);
});

test('Elias assistant is floating and context-aware, never a parallel workspace', () => {
  assert.match(assistant, /redirect\('\/dashboard\/legal'\)/);
  assert.match(widget, /Asistente Legal MOTIL/);
  assert.match(widget, /endpoint: '\/api\/legal\/asistente'/);
  assert.match(api, /currentCompliancePeriod/);
  assert.match(api, /legal_powder_magazine_permits/);
  assert.match(api, /mining_property_controls/);
  assert.match(api, /transport_settlements_canonical_v1/);
});

test('Elias assistant prompt enforces a stable operational answer order', () => {
  assert.match(api, /CONCLUSIÓN, SIGUIENTE ACCIÓN, AVANCE\/PAGO si aplica, EVIDENCIA, EXCEPCIÓN/);
  assert.match(api, /una sola acción concreta/);
  assert.match(api, /No cierres con resúmenes repetidos ni explicaciones de infraestructura/);
});
