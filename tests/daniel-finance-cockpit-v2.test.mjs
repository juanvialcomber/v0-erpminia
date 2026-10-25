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
  assert.match(page,/De dónde viene esta información/);
});

test('pre-payment evidence uses business language and keeps human authority',()=>{
  assert.match(page,/Antes de pagar/);
  assert.match(page,/Información de las facturas/);
  assert.match(page,/La decisión final se registra en MOTIL/);
  assert.match(page,/Hay documentos relacionados en Laudus/);
  assert.match(page,/No hay documentos relacionados/);
  assert.doesNotMatch(page,/OC candidata/);
});

test('empty MOTIL payables do not render a wall of zeros',()=>{
  assert.match(page,/No hay facturas aprobadas pendientes de pago en MOTIL/);
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
