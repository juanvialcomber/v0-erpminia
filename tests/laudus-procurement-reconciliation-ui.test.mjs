import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const card = readFileSync(new URL('../components/integrations/laudus-procurement-reconciliation-card.tsx', import.meta.url), 'utf8');

test('procurement reconciliation UI keeps human authority over deterministic apply', () => {
  assert.match(card, /Vista determinística/);
  assert.match(card, /requiere acción humana/);
  assert.match(card, /nunca sobrescribe valores existentes/);
  assert.match(card, /Aplicar 25 resolubles/);
  assert.match(card, /Cada OC se revalida dentro de la transacción/);
});

test('reconciliation UI surfaces resolvable and unresolved counts', () => {
  assert.match(card, /Completamente resolubles/);
  assert.match(card, /Proveedor sin resolver/);
  assert.match(card, /Centro de costo sin resolver/);
  assert.match(card, /nombre exacto y único/);
  assert.match(card, /consenso \+ código canónico/);
  assert.match(card, /códigos no reconocidos/);
});
