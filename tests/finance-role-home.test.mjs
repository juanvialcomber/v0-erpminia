import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const home=fs.readFileSync('components/dashboard/finance-role-home.tsx','utf8');
const router=fs.readFileSync('components/dashboard/dashboard-home.tsx','utf8');
const shell=fs.readFileSync('components/layout/dashboard-shell.tsx','utf8');

test('finance manager home leads with cross-module decisions, not generic KPIs',()=>{
  assert.match(home,/Qué requiere atención/);
  assert.match(home,/máximo|Prioridades financieras|impacto operacional/);
  assert.match(home,/Compras comprometidas/);
  assert.match(home,/Valor inventario/);
  assert.match(home,/Compromiso mantenimiento/);
  assert.match(home,/no modifica stock ni órdenes/i);
  assert.match(home,/Edición/);
  assert.match(home,/Consulta/);
  assert.match(router,/FinanceRoleHome/);
  assert.match(shell,/!financeHome/);
});

test('finance role language stays operational and human-readable',()=>{
  for (const forbidden of ['pipeline','endpoint','RBAC','UUID','cron','webhook']) {
    assert.doesNotMatch(home, new RegExp(forbidden,'i'));
  }
});
