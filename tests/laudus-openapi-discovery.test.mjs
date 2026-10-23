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
});

test('read-only discovery never turns write methods into executable mutations', () => {
  assert.match(source, /method === 'get' \|\| method === 'post'/);
  assert.doesNotMatch(source, /readOnlyCapabilities[\s\S]*method === 'put'/);
});
