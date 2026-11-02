import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const purchaseRoute = readFileSync(new URL('../app/api/integrations/laudus/purchase-documents/route.ts', import.meta.url), 'utf8');
const purchaseCard = readFileSync(new URL('../components/integrations/laudus-purchase-documents.tsx', import.meta.url), 'utf8');
const invoicePage = readFileSync(new URL('../app/dashboard/compras/facturas/page.tsx', import.meta.url), 'utf8');
const accountingRoute = readFileSync(new URL('../app/api/integrations/laudus/accounting-cost-centers/route.ts', import.meta.url), 'utf8');
const centersPage = readFileSync(new URL('../app/dashboard/centros-costos/page.tsx', import.meta.url), 'utf8');
const assetsPage = readFileSync(new URL('../app/dashboard/finanzas/activos/page.tsx', import.meta.url), 'utf8');
const assetEconomics = readFileSync(new URL('../components/integrations/laudus-fixed-asset-economics-card.tsx', import.meta.url), 'utf8');

test('historical Laudus purchase documents remain bounded and read-only', () => {
  assert.match(purchaseRoute, /PAGE_LIMIT = 100/);
  assert.match(purchaseRoute, /laudus_purchase_invoices/);
  assert.match(purchaseRoute, /laudus_waybills/);
  assert.match(purchaseRoute, /noLaudusMutation: true/);
  assert.doesNotMatch(purchaseRoute, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.match(invoicePage, /LaudusPurchaseDocuments/);
  assert.match(purchaseCard, /Sólo lectura/);
});

test('cost center accounting view is bounded and does not claim current balances', () => {
  assert.match(accountingRoute, /MAX_ROWS = 1000/);
  assert.match(accountingRoute, /laudus_accounting_entries/);
  assert.match(accountingRoute, /notCurrentBalance: true/);
  assert.doesNotMatch(accountingRoute, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.match(centersPage, /LaudusAccountingCostCenters/);
});

test('asset economics are visible in Finance without changing identity authority', () => {
  assert.match(assetsPage, /LaudusFixedAssetEconomicsCard/);
  assert.match(assetEconomics, /Sólo lectura/);
  assert.match(assetEconomics, /no modifica ni Laudus ni Ficha 360/i);
});


test('live fixed-asset economics are opt-in to protect the Laudus API budget', () => {
  assert.match(assetEconomics, /enabled \? '\/api\/integrations\/laudus\/fixed-asset-economics' : null/);
  assert.match(assetEconomics, /Consulta bajo demanda/);
});

test('accounting cost-center UI refuses false attribution when line-level center data is absent', () => {
  const accountingCard = readFileSync(new URL('../components/integrations/laudus-accounting-cost-centers.tsx', import.meta.url), 'utf8');
  assert.match(accountingCard, /entriesWithCostCenter === 0/);
  assert.match(accountingCard, /No se atribuyen movimientos a centros por suposición/);
});


test('Treasury can inspect Laudus bank reconciliation without automatic API burn or writes', () => {
  const bankCard = readFileSync(new URL('../components/integrations/laudus-bank-reconciliation-card.tsx', import.meta.url), 'utf8');
  const treasury = readFileSync(new URL('../app/dashboard/finanzas/pagos/page.tsx', import.meta.url), 'utf8');
  assert.match(bankCard, /enabled \? '\/api\/integrations\/laudus\/bank-reconciliation' : null/);
  assert.match(bankCard, /No contabiliza ni concilia automáticamente/);
  assert.match(bankCard, /LaudusSourceMark/);
  assert.match(treasury, /LaudusBankReconciliationCard/);
});
