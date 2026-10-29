import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync('app/api/compras/suppliers/route.ts','utf8');

test('supplier API retries one transient 502 before failing closed', () => {
  assert.match(route, /withGatewayRetry/);
  assert.match(route, /\b502\b\|bad gateway\|cloudflare/i);
  assert.match(route, /setTimeout\(resolve, 150\)/);
});

test('persistent gateway failures return a bounded 503 without leaking upstream HTML', () => {
  assert.match(route, /Servicio de datos temporalmente no disponible\. Reintente\./);
  assert.match(route, /status: 503/);
  assert.match(route, /'Retry-After': '2'/);
  assert.doesNotMatch(route, /return NextResponse\.json\(\{ error: message \}, \{ status: 502 \}\)/);
});

test('supplier and performance reads both use the bounded gateway retry', () => {
  const calls = route.match(/withGatewayRetry/g) || [];
  assert.ok(calls.length >= 3);
  assert.match(route, /canonical_suppliers_v1/);
  assert.match(route, /supplier_performance/);
});
