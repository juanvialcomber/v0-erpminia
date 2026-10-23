import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const card = readFileSync(new URL('../components/integrations/laudus-procurement-reconciliation-card.tsx', import.meta.url), 'utf8');

test('procurement reconciliation UI is explicitly preview-only', () => {
  assert.match(card, /Vista previa determinística/);
  assert.match(card, /No modifica cabeceras, proveedores ni centros de costo/);
});

test('reconciliation UI surfaces resolvable and unresolved counts', () => {
  assert.match(card, /Completamente resolubles/);
  assert.match(card, /Proveedor sin resolver/);
  assert.match(card, /Centro de costo sin resolver/);
  assert.match(card, /nombre exacto y único/);
  assert.match(card, /consenso \+ código canónico/);
  assert.match(card, /códigos no reconocidos/);
});
