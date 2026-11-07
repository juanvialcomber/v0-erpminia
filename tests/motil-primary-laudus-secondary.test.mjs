import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const legal = fs.readFileSync('app/dashboard/legal/page.tsx','utf8');
const procurement = fs.readFileSync('components/procurement/progressive-invoice-workflow.tsx','utf8');
const assets = fs.readFileSync('components/integrations/laudus-fixed-asset-review.tsx','utf8');
const finance = fs.readFileSync('components/integrations/laudus-finance-control-card.tsx','utf8');
const bodega = fs.readFileSync('app/dashboard/bodega/page.tsx','utf8');
const bodegaSource = fs.readFileSync('components/integrations/laudus-inventory-readiness-card.tsx','utf8');

test('MOTIL decision surfaces demote ERP branding to provenance', () => {
  assert.match(legal, /Respaldo financiero/);
  assert.doesNotMatch(legal, /\/dashboard\/legal\/laudus','Evidencia financiera/);

  assert.match(procurement, /Siguiente acción/);
  assert.match(procurement, /Respaldo financiero/);
  assert.doesNotMatch(procurement, /<CardTitle>Facturas Laudus<\/CardTitle>/);

  assert.match(assets, /MOTIL · Conciliación de activos/);
  assert.match(assets, /Revisar identidad de activos/);
  assert.doesNotMatch(assets, />Revisión de activos Laudus</);

  assert.match(finance, /Revisar actualización financiera/);
  assert.match(finance, /Respaldo financiero · sólo lectura/);
  assert.doesNotMatch(finance, /Control Laudus no disponible/);
  assert.doesNotMatch(finance, /Laudus · fuente financiera/);

  assert.match(bodega, /MOTIL tiene una base de stock vigente para decidir/);
  assert.match(bodega, /Respaldo ERP/);
  assert.doesNotMatch(bodega, /Laudus es la fuente primaria de stock/);
  assert.match(bodegaSource, /Control de stock MOTIL/);
  assert.match(bodegaSource, /MOTIL decide disponibilidad usando la mejor evidencia vigente/);
});

test('technical Laudus integration contracts remain intact behind the UI', () => {
  assert.match(procurement, /\/api\/procurement\/laudus-invoices/);
  assert.match(assets, /\/api\/integrations\/laudus\/fixed-asset-review/);
  assert.match(finance, /\/api\/integrations\/laudus\/finance-control/);
});
