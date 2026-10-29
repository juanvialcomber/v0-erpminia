import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const routePath = new URL('../app/api/integrations/laudus/fixed-asset-review/route.ts', import.meta.url);
const componentPath = new URL('../components/integrations/laudus-fixed-asset-review.tsx', import.meta.url);
const pagePath = new URL('../app/dashboard/finanzas/activos-laudus/page.tsx', import.meta.url);
const financeCardPath = new URL('../components/integrations/laudus-finance-control-card.tsx', import.meta.url);

test('fixed asset review API reuses canonical review queue and remains read-only', async () => {
  const route = await readFile(routePath, 'utf8');

  assert.match(route, /motil_laudus_fixed_asset_review_queue/);
  assert.match(route, /MODULE_KEYS\.FIN_FINANZAS/);
  assert.match(route, /humanDecisionRequired: true/);
  assert.match(route, /noAutomaticLink: true/);
  assert.match(route, /noCanonicalMutation: true/);
  assert.match(route, /noLaudusMutation: true/);
  assert.match(route, /filter\(\(row\) => !row\.decision\)/);
  assert.match(route, /slice\(0, 50\)/);
  assert.doesNotMatch(route, /\.insert\(/);
  assert.doesNotMatch(route, /\.update\(/);
  assert.doesNotMatch(route, /\.upsert\(/);
  assert.doesNotMatch(route, /\.delete\(/);
});

test('fixed asset review UI exposes evidence and human authority', async () => {
  const component = await readFile(componentPath, 'utf8');

  assert.match(component, /Revisión de activos Laudus/);
  assert.match(component, /Revisión humana requerida/);
  assert.match(component, /Patente exacta/);
  assert.match(component, /Serie exacta/);
  assert.match(component, /no se modifica el activo canónico ni Laudus/i);
  assert.match(component, /\/api\/integrations\/laudus\/fixed-asset-review/);
});

test('Finance routes users to the dedicated Laudus fixed asset review', async () => {
  const page = await readFile(pagePath, 'utf8');
  const financeCard = await readFile(financeCardPath, 'utf8');

  assert.match(page, /LaudusFixedAssetReview/);
  assert.match(financeCard, /\/dashboard\/finanzas\/activos-laudus/);
  assert.match(financeCard, /Revisar activos/);
});
