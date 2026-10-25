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

test('pre-payment control uses business language and keeps human authority',()=>{
  assert.match(page,/Antes de pagar/);
  assert.match(page,/Cruce factura \/ OC/);
  assert.match(page,/La decisión sigue siendo de Finanzas/);
  assert.match(page,/Confirmado por Laudus/);
  assert.match(page,/Alta coincidencia/);
  assert.match(page,/MOTIL no propone una OC sin detalle suficiente/);
});

test('empty MOTIL payables do not render a wall of zeros',()=>{
  assert.match(page,/Sin CxP aprobadas pendientes en MOTIL/);
  assert.match(page,/motilOutstanding > 0 \|\| motilDueSoon > 0 \|\| motilOverdue > 0/);
});

test('primary KPI strip stays executive',()=>{
  assert.match(page,/Saldo abierto/);
  assert.match(page,/Vencido/);
  assert.match(page,/Compras comprometidas/);
  assert.doesNotMatch(page,/Costo reconocido MOTIL.*Hechos operacionales reconocidos/s);
});
