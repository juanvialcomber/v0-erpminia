import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../components/maintenance/work-order-material-coverage.tsx', import.meta.url),
  'utf8',
);

test('material coverage uses line counts instead of adding unlike SKU quantities', () => {
  for (const field of ['reservedLines', 'issuedLines', 'shortageCount', 'procurementLines']) {
    assert.match(source, new RegExp('\\b' + field + '\\b'));
  }
  assert.doesNotMatch(source, /const (?:reservedTotal|issuedTotal|requiredTotal|shortageTotal|procurementTotal)\s*=/);
  assert.match(source, /Líneas requeridas/);
  assert.match(source, /Con reserva/);
  assert.match(source, /Con entrega/);
});

test('a reported no-shortage state does not imply fully issued stock', () => {
  assert.match(source, /const fullyDelivered\s*=\s*rows\.length > 0/);
  assert.match(source, /rows\.every\(\(row\)\s*=>\s*required\(row\) > 0 && issued\(row\) >= required\(row\)\)/);
  assert.match(source, /Revisar cobertura y entrega/);
  assert.match(source, /Pendiente de verificar entrega/);
});

test('only explicit reservations permit the issue action; existing material actions remain available', () => {
  assert.match(source, /const reserved = \(row: MaterialRow\) => Number\(row\.reserved \?\? 0\)/);
  assert.match(source, /reservedLines > 0/);
  assert.match(source, /onClick=\{issueAvailable\}/);
  assert.match(source, /onClick=\{sendShortagesToPurchasing\}/);
  assert.match(source, /onClick=\{addMaterial\}/);
});
