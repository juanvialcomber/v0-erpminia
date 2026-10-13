import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const productionUrl = new URL('../app/dashboard/produccion/layout.tsx', import.meta.url);
const maintenanceUrl = new URL('../app/dashboard/mantenimiento/layout.tsx', import.meta.url);
const warehouseUrl = new URL('../app/dashboard/bodega/layout.tsx', import.meta.url);
const purchasesUrl = new URL('../app/dashboard/compras/layout.tsx', import.meta.url);
const financeUrl = new URL('../app/dashboard/finanzas/layout.tsx', import.meta.url);
const sustainabilityUrl = new URL('../app/dashboard/sostenibilidad/layout.tsx', import.meta.url);
const hseUrl = new URL('../app/dashboard/sostenibilidad/prevencion-riesgos/layout.tsx', import.meta.url);
const legalUrl = new URL('../app/dashboard/legal/layout.tsx', import.meta.url);

test('operational areas use flow numbering only where a real sequence exists', async () => {
  const [production, maintenance, purchases, warehouse, finance, sustainability, legal] = await Promise.all([
    readFile(productionUrl, 'utf8'),
    readFile(maintenanceUrl, 'utf8'),
    readFile(purchasesUrl, 'utf8'),
    readFile(warehouseUrl, 'utf8'),
    readFile(financeUrl, 'utf8'),
    readFile(sustainabilityUrl, 'utf8'),
    readFile(legalUrl, 'utf8'),
  ]);

  assert.match(production, /step: 1/);
  assert.match(production, /Flujo operacional de Producción/);
  assert.match(production, /Control técnico/);

  assert.match(maintenance, /label: 'Planificar', step: 1/);
  assert.match(maintenance, /label: 'Órdenes', step: 2/);
  assert.match(maintenance, /label: 'Cierre', step: 3/);
  assert.match(maintenance, /label: 'Imputación'/);
  assert.match(maintenance, /Soporte de Mantenimiento/);

  assert.match(purchases, /label: 'Comprar', step: 1/);
  assert.match(purchases, /label: 'Cotizar', step: 2/);
  assert.match(purchases, /label: 'Órdenes', step: 3/);
  assert.match(purchases, /label: 'Facturas', step: 4/);
  assert.match(purchases, /Soporte de Compras/);

  for (const source of [warehouse, finance, sustainability, legal]) {
    assert.doesNotMatch(source, /step:\s*\d/);
  }
});

test('non-sequential areas separate operational context from tools instead of faking a process', async () => {
  const [warehouse, finance, sustainability, legal, hse] = await Promise.all([
    readFile(warehouseUrl, 'utf8'),
    readFile(financeUrl, 'utf8'),
    readFile(sustainabilityUrl, 'utf8'),
    readFile(legalUrl, 'utf8'),
    readFile(hseUrl, 'utf8'),
  ]);

  assert.match(warehouse, /Operación de Bodega/);
  assert.match(warehouse, /Herramientas de Bodega/);
  assert.match(finance, /Operación financiera/);
  assert.match(finance, /Control financiero/);
  assert.match(sustainability, /Ámbitos de Sostenibilidad y HSE/);
  assert.match(sustainability, /Soporte de Sostenibilidad y HSE/);
  assert.doesNotMatch(sustainability, /insideRiskPrevention/);
  assert.match(legal, /Navegación principal de Legal/);
  assert.match(legal, /Más áreas/);
  assert.match(hse, /Controles locales de Seguridad y salud/);
  assert.doesNotMatch(hse, /ArrowLeft/);
});

test('all converted area rails use the compact pescamar-style visual language', async () => {
  const sources = await Promise.all([
    productionUrl,
    maintenanceUrl,
    warehouseUrl,
    purchasesUrl,
    financeUrl,
    sustainabilityUrl,
  ].map((url) => readFile(url, 'utf8')));

  for (const source of sources) {
    assert.match(source, /min-h-12/);
    assert.match(source, /scrollbar-width:none/);
    assert.match(source, /bottom-0 h-0\.5 bg-primary/);
  }
});

test('Legal navigation prioritizes destinations without horizontal overflow', async () => {
 const legal = await readFile(legalUrl, 'utf8');
 assert.match(legal,/flex flex-wrap gap-1/);
 assert.match(legal,/Navegación principal de Legal/);
 assert.match(legal,/href: '\/dashboard\/legal\/contratistas-documentos'/);
});
