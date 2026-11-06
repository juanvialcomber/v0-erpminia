import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const miningRoute = readFileSync('app/api/legal/mining-property/route.ts','utf8');
const transportRoute = readFileSync('app/api/finance/transport-settlements/route.ts','utf8');
const transportPage = readFileSync('app/dashboard/finanzas/transportistas/page.tsx','utf8');

test('mining property workspace reads promoted property and royalty tables',()=>{
  assert.match(miningRoute,/from\('mining_properties'\)/);
  assert.match(miningRoute,/from\('mining_property_royalties'\)/);
  assert.doesNotMatch(miningRoute,/from\('contracts'\)/);
  assert.match(miningRoute,/no se infieren pagos faltantes/i);
});

test('finance transport workspace reads only canonical promoted settlement projection',()=>{
  assert.match(transportRoute,/from\('transport_settlements_canonical_v1'\)/);
  assert.doesNotMatch(transportRoute,/from\('transport_settlements'\)/);
  assert.match(transportRoute,/566 duplicados legacy/);
});

test('transport UI preserves unresolved identity as an explicit exception',()=>{
  assert.match(transportPage,/RUT explícito siguen sin proveedor canónico/);
  assert.match(transportPage,/no se resuelven por nombre/);
  assert.match(transportPage,/Identidad pendiente/);
});

const legalInbox = readFileSync('app/api/legal/inbox/route.ts','utf8');

test('legal inbox surfaces only explicit mining royalty payment exceptions',()=>{
  assert.match(legalInbox,/from\('mining_property_royalties'\)/);
  assert.match(legalInbox,/\['unpaid', 'partial', 'unknown'\]/);
  assert.match(legalInbox,/due_date: null/);
  assert.match(legalInbox,/No pagada según fuente/);
  assert.match(legalInbox,/Estado de pago no determinado/);
});
