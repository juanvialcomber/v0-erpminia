import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const moduleAccess = readFileSync('lib/api/module-access.ts','utf8');
const accessRoute = readFileSync('app/api/me/access/route.ts','utf8');
const authHook = readFileSync('hooks/use-auth.ts','utf8');
const compras = readFileSync('app/dashboard/compras/page.tsx','utf8');
const proxy = readFileSync('proxy.ts','utf8');

test('access kernel exposes canonical cargo identity with module grants',()=>{
  assert.match(moduleAccess,/cargoId: string \| null/);
  assert.match(moduleAccess,/cargoName: string \| null/);
  assert.match(moduleAccess,/from\('cargos'\)\.select\('name'\)/);
  assert.match(accessRoute,/cargoId/);
  assert.match(accessRoute,/cargoName/);
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
