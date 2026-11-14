import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { loadModuleAccess, responseClient, plain } from './helpers/module-access.mjs';
const accessRoute = readFileSync('app/api/me/access/route.ts','utf8');
const authHook = readFileSync('hooks/use-auth.ts','utf8');
const compras = readFileSync('app/dashboard/compras/page.tsx','utf8');
const proxy = readFileSync('proxy.ts','utf8');

test('access kernel exposes canonical cargo identity with module grants', async () => {
  const { client } = responseClient({ data: { cargo_id: 'cargo-a', cargos: {
    name: 'Supervisor', role_matrix: [{ module_key: 'mant_operaciones', access_level: 'ED' }],
  } }, error: null });
  assert.deepEqual(plain(await loadModuleAccess(client).getUserModuleAccess('user-a')), {
    hasCargo: true, cargoId: 'cargo-a', cargoName: 'Supervisor', access: { mant_operaciones: 'ED' },
  });
  assert.match(accessRoute, /cargoId/);
  assert.match(accessRoute, /cargoName/);
});

test('client auth prefers canonical cargo over user_cargo cookie',()=>{
  assert.match(authHook,/const canonicalCargo = payload\.cargoName \|\| null/);
  assert.match(authHook,/cargo: canonicalCargo \|\| cookieIdentity\.cargo/);
  assert.match(authHook,/user_cargo=\$\{encodeURIComponent\(canonicalCargo\)\}/);
});

test('Compras no longer claims Laudus is awaiting first access when status is unknown',()=>{
  assert.match(compras,/Verificando sincronización del ERP/);
  assert.match(compras,/Sincronización Laudus en curso/);
  assert.match(compras,/Verificando estado del conector Laudus/);
  assert.doesNotMatch(compras,/Esperando acceso y primera sincronización/);
});


test('finance manager cross-area API access follows canonical role_matrix',()=>{
  assert.match(proxy,/financeManagerMatrixAllowed/);
  assert.match(proxy,/path\.startsWith\('\/api\/maintenance\/'\)/);
  assert.match(proxy,/path\.startsWith\('\/api\/bodega\/'\)/);
  assert.match(proxy,/readOnly[\s\S]*access_level === 'ED' \|\| row\.access_level === 'LEC'/);
  assert.match(proxy,/path === '\/api\/me'/);
});
