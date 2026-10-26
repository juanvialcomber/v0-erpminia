import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync('app/dashboard/finanzas/page.tsx','utf8');

test('Daniel finance cockpit leads with a clear summary and sections',()=>{
  assert.match(page,/Resumen financiero/);
  assert.match(page,/Estado, decisiones y exposición en una sola lectura/);
  assert.match(page,/Secciones de Finanzas/);
  assert.match(page,/Ir al detalle/);
  assert.match(page,/Herramientas avanzadas/);
  assert.match(page,/slice\(0, 3\)/);
});

test('technical language is hidden from the normal finance surface',()=>{
  assert.doesNotMatch(page,/sin detalle staged/);
  assert.doesNotMatch(page,/mismo tenant/);
  assert.doesNotMatch(page,/matcher determinístico como candidato/);
  assert.doesNotMatch(page,/contexto financiero canónico/);
  assert.match(page,/Cómo se determinó/);
});

test('pre-payment evidence uses business language and keeps human authority',()=>{
  assert.match(page,/Antes de pagar/);
  assert.match(page,/Evidencia de factura/);
  assert.match(page,/Finanzas mantiene la decisión/);
  assert.match(page,/Traza Laudus disponible/);
  assert.match(page,/Falta evidencia/);
  assert.doesNotMatch(page,/OC candidata/);
});

test('empty MOTIL payables do not render a wall of zeros',()=>{
  assert.match(page,/Sin CxP aprobadas pendientes en MOTIL/);
  assert.match(page,/motilOutstanding > 0 \|\| motilDueSoon > 0 \|\| motilOverdue > 0/);
});

test('primary KPI strip stays executive',()=>{
  assert.match(page,/Saldo abierto/);
  assert.match(page,/Vencido/);
  assert.match(page,/Prioridad inmediata/);
  assert.doesNotMatch(page,/Costo reconocido MOTIL.*Hechos operacionales reconocidos/s);
  assert.doesNotMatch(page,/Compras comprometidas.*Compromisos operacionales/s);
});


test('priority amount respects currency boundaries',()=>{
  assert.match(page,/pendingCurrencies/);
  assert.match(page,/pendingCurrencies\.length === 1/);
  assert.match(page,/currencyMoney\(pendingAttentionAmount, pendingCurrencies\[0\]\)/);
});


test('Daniel sees decision-grade aging and pressure charts instead of decorative finance graphics',()=>{
  assert.match(page,/Edad del saldo Laudus/);
  assert.match(page,/Presión por proveedor/);
  assert.match(page,/Presión si nada cambia/);
  assert.match(page,/No supone pagos ni es una predicción estadística/);
  assert.match(page,/adicionales pasarían a vencido dentro de 60 días si no cambia el estado actual/);
});


test('asset economics stays compact, native to MOTIL and evidence-gated',()=>{
  assert.match(page,/Qué conviene destrabar primero/);
  assert.match(page,/Prioridades de conciliación/);
  assert.match(page,/Readiness de depreciación/);
  assert.match(page,/Depreciación CLP bloqueada/);
  assert.match(page,/MOTIL no reparte montos de factura entre activos sin evidencia/);
  assert.match(page,/Costo histórico por conciliar/);
  assert.match(page,/no es ahorro ni valor libro/);
});

test('asset photos are identification thumbnails, not hero content',()=>{
  assert.match(page,/row\.imageUrl/);
  assert.match(page,/h-10 w-12/);
  assert.match(page,/Fotos referenciales · identificación rápida/);
  assert.doesNotMatch(page,/getEquipmentImage/);
  assert.doesNotMatch(page,/h-44 w-full object-cover/);
});

test('asset economics separates strong matches from reconciliation opportunities',()=>{
  assert.match(page,/Activos Laudus/);
  assert.match(page,/Matches fuertes/);
  assert.match(page,/Por conciliar/);
  assert.match(page,/Identidad requiere revisión humana/);
  assert.match(page,/Vida útil · matches fuertes/);
});

test('finance charts respect Patagua semantic colors',()=>{
  assert.match(page,/var\(--primary\)/);
  assert.match(page,/var\(--secondary\)/);
  assert.match(page,/var\(--destructive\)/);
  assert.doesNotMatch(page,/blue-|purple-|violet-|bg-gradient|from-|to-/);
});


test('summary precedes module sections and advanced tools stay collapsed',()=>{
  const summary = page.indexOf('<LaudusFinanceControlCard />');
  const sections = page.indexOf('Secciones de Finanzas');
  const advanced = page.indexOf('Herramientas avanzadas');
  assert.ok(summary >= 0);
  assert.ok(sections > summary);
  assert.ok(advanced > sections);
  assert.match(page,/Pagos.*Proveedores.*Centros de costos.*Trazabilidad/s);
  assert.match(page,/Reportes, fuentes, documentos y calendario/);
});
