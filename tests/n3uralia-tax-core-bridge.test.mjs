import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const client = readFileSync(new URL('../lib/integrations/n3uralia-tax/client.ts', import.meta.url), 'utf8');
const readiness = readFileSync(new URL('../app/api/integrations/n3uralia-tax/readiness/route.ts', import.meta.url), 'utf8');
const validate = readFileSync(new URL('../app/api/integrations/n3uralia-tax/validate/route.ts', import.meta.url), 'utf8');

test('MOTIL delegates SII connectivity to N3uralia Tax Core', () => {
  assert.match(client, /N3URALIA_TAX_CORE_URL/);
  assert.match(client, /N3URALIA_TAX_ADMIN_TOKEN/);
  assert.match(client, /\/api\/health/);
  assert.match(client, /\/api\/v1\/sii\/readiness/);
  assert.match(client, /\/api\/v1\/tax\/validate/);
  assert.doesNotMatch(client, /N3URALIA_SII_PFX_BASE64|N3URALIA_SII_PFX_PASSWORD/);
});

test('bridge is admin-only and explicitly non-writing', () => {
  assert.match(readiness, /resolveDataHealthAccess/);
  assert.match(readiness, /access\.admin/);
  assert.match(readiness, /motilOwnsSiiCredentials: false/);
  assert.match(readiness, /siiWritesRequested: false/);
  assert.match(validate, /resolveDataHealthAccess/);
  assert.match(validate, /validatedOnly: true/);
  assert.match(validate, /siiWritesRequested: false/);
  assert.doesNotMatch(validate, /factura33\/prepare|caf\/upload|certificates\/upload/);
});
