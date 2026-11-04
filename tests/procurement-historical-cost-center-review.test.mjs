import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync('app/api/procurement/cost-center-review/route.ts','utf8');
const card = fs.readFileSync('components/integrations/historical-cost-center-review-card.tsx','utf8');
const page = fs.readFileSync('app/dashboard/compras/page.tsx','utf8');

test('historical cost-center review queue is bounded, tenant scoped and read-only', () => {
  assert.match(route,/MODULE_KEYS\.FIN_COMPRAS/);
  assert.match(route,/purchase_order_reconciliation_preview_service_v1/);
  assert.match(route,/const MAX_ROWS = 50/);
  assert.match(route,/review_only/);
  assert.match(route,/multiLineAllocationIsNotConflict: true/);
  assert.match(route,/sourcePlaceholderIsNotActionable: true/);
  assert.match(route,/canonicalMutationExecuted: false/);
  assert.doesNotMatch(route,/\.insert\(/);
  assert.doesNotMatch(route,/\.update\(/);
  assert.doesNotMatch(route,/\.upsert\(/);
  assert.doesNotMatch(route,/\.delete\(/);
});

test('Compras shows only actionable historical cost-center issues', () => {
  assert.match(card,/Centros de costo históricos/);
  assert.match(card,/Las asignaciones multi-centro válidas no se consideran conflicto/);
  assert.match(card,/Código no reconocido/);
  assert.match(card,/Revisar líneas/);
  assert.match(card,/Sin centro informado/);
  assert.match(page,/HistoricalCostCenterReviewCard/);
});
