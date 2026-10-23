import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route=fs.readFileSync('app/api/intelligence/laudus-brief/route.ts','utf8');
const brief=fs.readFileSync('components/integrations/laudus-intelligence-brief.tsx','utf8');
const compras=fs.readFileSync('app/dashboard/compras/page.tsx','utf8');
const finance=fs.readFileSync('components/dashboard/finance-role-home.tsx','utf8');
const operational=fs.readFileSync('components/integrations/laudus-operational-intelligence-card.tsx','utf8');

test('Laudus intelligence converts ERP evidence into explainable human decisions',()=>{
  assert.match(route,/motil_laudus_procurement_summary/);
  assert.match(route,/motil_laudus_document_match_preview/);
  assert.match(route,/motil_supply_risk_preview/);
  assert.match(route,/noAutomaticPurchase: true/);
  assert.match(route,/noLaudusWrite: true/);
  assert.match(brief,/Qué está diciendo Laudus/);
  assert.match(brief,/Siguiente decisión:/);
  assert.match(brief,/no aprueba pagos/);
  assert.match(compras,/LaudusIntelligenceBrief/);
  assert.match(finance,/LaudusIntelligenceBrief compact/);
});

test('invoice review count uses disjoint document-match buckets',()=>{
  assert.match(operational,/documentMatch\.summary\.ambiguous \+ data\.documentMatch\.summary\.review \+ data\.documentMatch\.summary\.no_order_candidate/);
  assert.doesNotMatch(operational,/invoices\.ambiguous \|\| 0\) \+ \(data\?\.invoices\.price_review/);
});
