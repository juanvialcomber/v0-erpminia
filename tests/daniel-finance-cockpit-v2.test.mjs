import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync('app/dashboard/finanzas/page.tsx','utf8');

test('Daniel finance cockpit leads with a clear summary and sections',()=>{
  assert.match(page,/Resumen financiero/);
  assert.match(page,/Exposición, decisiones y evidencia/);
  assert.match(page,/Secciones de Finanzas/);
  assert.match(page,/Ir al detalle/);
  assert.match(page,/LaudusFinanceControlCard/);
});

test('summary page stays intentionally lightweight',()=>{
  assert.doesNotMatch(page,/Herramientas avanzadas/);
  assert.doesNotMatch(page,/Edad del saldo Laudus/);
  assert.doesNotMatch(page,/Economía del activo/);
  assert.doesNotMatch(page,/Conciliación bancaria/);
  assert.doesNotMatch(page,/useSWR|useState|useMemo/);
});

test('summary routes detail into canonical finance sections',()=>{
  assert.match(page,/Pagos.*Proveedores.*Centros de costos.*Trazabilidad/s);
  assert.match(page,/Reportes, fuentes, documentos y calendario/);
  assert.match(page,/dashboard\/finanzas\/pagos/);
  assert.match(page,/dashboard\/finanzas\/proveedores/);
  assert.match(page,/dashboard\/finanzas\/centros/);
  assert.match(page,/dashboard\/finanzas\/trazabilidad/);
});

test('finance summary follows MOTIL visual tokens',()=>{
  assert.match(page,/text-primary/);
  assert.match(page,/bg-primary\/5/);
  assert.match(page,/bg-card/);
  assert.match(page,/bg-border/);
  assert.doesNotMatch(page,/blue-|purple-|violet-|bg-gradient|from-|to-/);
});

test('summary precedes module sections',()=>{
  const summary = page.indexOf('<LaudusFinanceControlCard />');
  const sections = page.indexOf('Secciones de Finanzas');
  assert.ok(summary >= 0);
  assert.ok(sections > summary);
});
