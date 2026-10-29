import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../lib/integrations/laudus/openapi-discovery.ts', import.meta.url), 'utf8');

test('Laudus capability discovery inventories paths instead of hardcoding a closed endpoint list', () => {
  assert.match(source, /Object\.entries\(document\.paths \|\| \{\}\)/);
  assert.match(source, /discoverLaudusCapabilities/);
});

test('capabilities classify operational domains and identify write-capable resources', () => {
  for (const domain of ['master_data','inventory','procurement','finance','tax','fixed_assets','hr','sales','unknown']) {
    assert.match(source, new RegExp("'" + domain + "'"));
  }
  assert.match(source, /writeCapable:/);
  assert.match(source, /kardex\|movement\|transfer/);
  assert.match(source, /balance/);
});

test('read-only discovery allows GET and list-query POST only', () => {
  assert.match(source, /method === 'get'/);
  assert.match(source, /method === 'post' && capability\.path\.endsWith\('\/list'\)/);
  assert.doesNotMatch(source, /readOnlyCapabilities[\s\S]*method === 'put'/);
  assert.doesNotMatch(source, /readOnlyCapabilities[\s\S]*method === 'delete'/);
});

test('live spec discovery is bounded to public Swagger candidates and never authenticates', () => {
  assert.match(source, /swagger\/index\.html/);
  assert.match(source, /FALLBACK_SPEC_PATHS/);
  assert.match(source, /loadLaudusOpenApiDocument/);
  assert.doesNotMatch(source, /getLaudusAccessToken|Authorization|LAUDUS_PASSWORD/);
});
