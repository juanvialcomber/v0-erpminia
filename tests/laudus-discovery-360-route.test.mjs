import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync(new URL('../app/api/integrations/laudus/discovery-360/route.ts', import.meta.url), 'utf8');

test('Laudus discovery endpoint is admin scoped and non-persistent', () => {
  assert.match(route, /resolveDataHealthAccess/);
  assert.match(route, /access\.admin/);
  assert.match(route, /persisted: false/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test('Laudus discovery returns only grouped public-spec capability metadata', () => {
  assert.match(route, /loadLaudusOpenApiDocument/);
  assert.match(route, /summarizeLaudusCapabilities/);
  assert.match(route, /specUrl: discovery\.specUrl/);
  assert.match(route, /capabilityCount/);
});
