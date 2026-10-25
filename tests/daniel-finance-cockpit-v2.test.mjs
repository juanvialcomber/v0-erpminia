import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync('app/dashboard/finanzas/page.tsx','utf8');

test('Daniel finance cockpit leads with one decision and max three priorities',()=>{
  assert.match(page,/Decisiones financieras/);
  assert.match(page,/Revisar prioridades/);
  assert.match(page,/id="revisar-prioridades"/);
  assert.match(page,/slice\(0, 3\)/);
  assert.match(page,/Las tres prioridades de mayor impacto/);
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
