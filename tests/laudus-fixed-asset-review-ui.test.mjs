import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const routePath = new URL('../app/api/integrations/laudus/fixed-asset-review/route.ts', import.meta.url);
const componentPath = new URL('../components/integrations/laudus-fixed-asset-review.tsx', import.meta.url);
const pagePath = new URL('../app/dashboard/finanzas/activos-laudus/page.tsx', import.meta.url);
const financeCardPath = new URL('../components/integrations/laudus-finance-control-card.tsx', import.meta.url);
const maintenancePagePath = new URL('../app/dashboard/mantenimiento/activos-laudus/page.tsx', import.meta.url);
const inboxRoutePath = new URL('../app/api/actions/inbox/route.ts', import.meta.url);

test('fixed asset review GET reuses canonical review queue and remains read-only', async () => {
  const route = await readFile(routePath, 'utf8');

  assert.match(route, /motil_laudus_fixed_asset_review_queue/);
  assert.match(route, /MODULE_KEYS\.FIN_FINANZAS/);
  assert.match(route, /MODULE_KEYS\.MANT_OPERACIONES/);
  assert.match(route, /humanDecisionRequired: true/);
  assert.match(route, /noAutomaticLink: true/);
  assert.match(route, /noCanonicalMutation: true/);
  assert.match(route, /noLaudusMutation: true/);
  assert.match(route, /filter\(\(row\) => !row\.decision\)/);
  assert.match(route, /slice\(0, 50\)/);
  const getBlock = route.slice(route.indexOf('export async function GET'), route.indexOf('type ReviewDecision'));
  assert.doesNotMatch(getBlock, /\.insert\(/);
  assert.doesNotMatch(getBlock, /\.update\(/);
  assert.doesNotMatch(getBlock, /\.upsert\(/);
  assert.doesNotMatch(getBlock, /\.delete\(/);
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


test('fixed asset review records human decisions without canonical mutation', async () => {
  const route = await readFile(new URL('../app/api/integrations/laudus/fixed-asset-review/route.ts', import.meta.url), 'utf8');
  const ui = await readFile(new URL('../components/integrations/laudus-fixed-asset-review.tsx', import.meta.url), 'utf8');
  assert.match(route, /export async function POST/);
  assert.match(route, /review_record_only/);
  assert.match(route, /appliedToCanonical: false/);
  assert.match(route, /laudus_fixed_asset_review_decisions/);
  assert.doesNotMatch(route, /from\('canonical_assets_current'\).*\.update/s);
  assert.match(ui, /Confirmar candidato/);
  assert.match(ui, /Rechazar/);
  assert.match(ui, /Diferir/);
  assert.match(ui, /La identidad operacional la resuelve Mantenimiento/);
  assert.match(ui, /Confirmar no modifica automáticamente el activo canónico/);
});


test('Maintenance owns operational identity review without financial write access', async () => {
  const page = await readFile(maintenancePagePath, 'utf8');
  const route = await readFile(routePath, 'utf8');
  const inbox = await readFile(inboxRoutePath, 'utf8');

  assert.match(page, /LaudusFixedAssetReview area="maintenance"/);
  assert.match(route, /requireReviewReadAccess/);
  assert.match(route, /MODULE_KEYS\.MANT_OPERACIONES/);
  assert.match(route, /requireModuleAccess\(request, MODULE_KEYS\.MANT_OPERACIONES, true\)/);
  assert.match(route, /JEFE DEPARTAMENTO DE MANTENIMIENTO/);
  assert.match(route, /JEFE DE PLANIFICACIÓN/);
  assert.match(route, /canDecideOperationalIdentity/);
  assert.match(route, /canDecide: false/);
  assert.match(route, /data_reconciliation_reviews/);
  assert.match(route, /laudus:fixed_asset_identity:/);
  assert.match(inbox, /kind === 'laudus-fixed-asset'/);
  assert.match(inbox, /\/dashboard\/mantenimiento\/activos-laudus/);
});
